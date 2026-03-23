import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import MobileBottomNav from '../../components/common/MobileBottomNav.jsx';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { formatMWK } from '../../utils/currency.js';
import { productValidation, cartValidation } from '../../utils/backendAlignment.js';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import '../../styles/global.css';

/**
 * HELPER FUNCTIONS - Defined before component
 */

/**
 * Calculate discount percentage
 */
function calculateDiscount(originalPrice, finalPrice) {
  if (!originalPrice || !finalPrice) return 0;
  const discount = ((originalPrice - finalPrice) / originalPrice) * 100;
  return Math.round(discount);
}

function getEffectiveStock(product) {
  if (!product) return 0;
  if (product.overrideActive === true && product.overrideStock != null) {
    return Number(product.overrideStock || 0);
  }
  if (product.effectiveStock != null) {
    return Number(product.effectiveStock || 0);
  }
  return Number(product.stock || 0);
}

/**
 * Products Page - Enhanced with Search, Filters, and Promotions
 * 
 * Features:
 * - Search by product name (query param: ?search=)
 * - Filter by category (query param: ?category=)
 * - Filter by sale status (query param: ?onSale=true)
 * - Display discount badges and crossed-out original prices
 * - Smart pricing: Shows finalPrice (discount if on sale)
 */

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0); // Offset-based pagination
  const [limit] = useState(20); // 20 products per load
  const [hasMoreProducts, setHasMoreProducts] = useState(true); // Are there more products to load?
  const [isLoadingMore, setIsLoadingMore] = useState(false); // Loading state for Load More button
  const [totalSystemProducts, setTotalSystemProducts] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [showAccountPopup, setShowAccountPopup] = useState(false);
  const { isAuthenticated, logout, user } = useAuth();
  const { cartCount, updateCartCount } = useCart();
  const { modal, closeModal, showError, showSuccess, showConfirm } = useModal();
  const navigate = useNavigate();
  
  // Refs for predictive search with caching and cancellation
  const searchCacheRef = useRef(new Map()); // Cache previous search results
  const productsCacheRef = useRef(new Map()); // Cache product pages (key: "page_1_category_all")
  const abortControllerRef = useRef(null); // Cancel previous requests
  const debounceTimerRef = useRef(null); // Debounce timer for product search
  const selectedCategoryRef = useRef(''); // Track selected category in socket handlers
  const productsRef = useRef([]); // Keep products in ref for search callback
  const selectedCategorySearchRef = useRef(''); // Keep category for search callback
  const onSaleOnlyRef = useRef(false); // Keep sale filter for search callback

  // Filter state from URL params (category and promotion only, not search)
  const selectedCategory = searchParams.get('category') || '';
  const onSaleOnly = searchParams.get('onSale') === 'true';

  /**
   * Predictive search like Amazon/Alibaba
   * - Silent background fetching
   * - Results cached in memory
   * - Previous requests cancelled
   * - Products remain visible
   * - No loading UI
   * - INSTANT: Clearing search shows all products immediately (no debounce)
   */
  const handlePredictiveSearch = (query) => {
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // INSTANT: If query is empty, show all products immediately (no debounce)
    if (!query.trim()) {
      const visible = productsRef.current.filter(p => !p.hideFromProductsPage);
      setFilteredProducts(visible);
      console.log(`[SEARCH CLEARED] Showing all ${visible.length} products`);
      return;
    }
  
    // Check cache first - return instantly if cached
    if (searchCacheRef.current.has(query)) {
      console.log(`[SEARCH CACHE HIT] "${query}"`);
      const cachedResults = searchCacheRef.current.get(query);
      setFilteredProducts(cachedResults);
      return;
    }

    // Debounce the API call (200ms) only for actual search queries
    debounceTimerRef.current = setTimeout(() => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new controller for this request
      abortControllerRef.current = new AbortController();

      // Silent fetch - no loading state changes, NO error display
      (async () => {
        try {
          const pageSize = 50; // Search returns more results
          const params = new URLSearchParams();
          params.append('page', '1');
          params.append('pageSize', pageSize);
          params.append('search', query);
          if (selectedCategorySearchRef.current) params.append('category', selectedCategorySearchRef.current);
          if (onSaleOnlyRef.current) params.append('onSale', 'true');

          const response = await api.get(`/products?${params.toString()}`, {
            signal: abortControllerRef.current.signal
          });

          const data = response.data;
          const results = data.products || [];

          // Filter out hidden products
          const visibleResults = results.filter(p => !p.hideFromProductsPage);

          // Cache the results
          searchCacheRef.current.set(query, visibleResults);

          // Update display silently
          setFilteredProducts(visibleResults);

          console.log(`[SEARCH API] Found ${visibleResults.length} results for "${query}"`);
        } catch (err) {
          // For search: silently ignore ALL errors including network errors
          // This includes AbortError and any other errors
          // Products remain visible - search just fails silently
          if (err.name === 'AbortError') {
            console.log(`[SEARCH CANCELLED] Request for "${query}" was cancelled`);
          } else {
            console.warn(`[SEARCH SILENT FAIL] Request for "${query}" failed:`, err.message);
            // Don't show error page - products stay visible
          }
        }
      })();
    }, 200); // 200ms debounce
  };

  /**
   * Fetch products - supports both initial load and "Load More"
   * isLoadMore=true → append products (Load More)
   * isLoadMore=false → replace products (reset on filter/search change)
   */
  const fetchProducts = async (isLoadMore = false) => {
    try {
      // Show loading state
      if (isLoadMore) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
        setOffset(0); // Reset offset for new filters
      }
      setError(null);

      // Calculate offset based on current products
      const currentOffset = isLoadMore ? offset + limit : 0;
      
      // Create cache key
      const cacheKey = `offset_${currentOffset}_category_${selectedCategory || 'all'}_sale_${onSaleOnly}`;

      // Check cache (only for initial loads, not Load More to ensure fresh data)
      if (!isLoadMore && productsCacheRef.current.has(cacheKey)) {
        console.log(`[CACHE HIT] Loading from cache (offset: ${currentOffset})`);
        const cachedData = productsCacheRef.current.get(cacheKey);
        setProducts(cachedData.products);
        setHasMoreProducts(cachedData.hasMore);
        setOffset(currentOffset);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('offset', currentOffset);
      if (selectedCategory) params.append('category', selectedCategory);
      if (onSaleOnly) params.append('onSale', 'true');

      console.log(`[PRODUCTS FETCH] ${isLoadMore ? 'Load More' : 'Initial'} | Offset: ${currentOffset} | Limit: ${limit} | Category: ${selectedCategory || 'all'}`);
      
      const response = await api.get(`/products?${params.toString()}`);
      const data = response.data;

      if (!data.products || !Array.isArray(data.products)) {
        throw new Error('Invalid response schema');
      }

      const fetchedProducts = data.products;
      
      // Filter out hidden products
      const visibleProducts = fetchedProducts.filter(p => !p.hideFromProductsPage);
      
      // Determine if there are more products
      const hasMore = fetchedProducts.length === limit;
      
      // Cache the data
      productsCacheRef.current.set(cacheKey, {
        products: visibleProducts,
        hasMore: hasMore
      });

      // If Load More, append; otherwise replace
      if (isLoadMore) {
        setProducts(prev => [...prev, ...visibleProducts]);
      } else {
        setProducts(visibleProducts);
      }
      
      setHasMoreProducts(hasMore);
      setOffset(currentOffset);

      // Clear search when browsing
      if (!isLoadMore) {
        setSearchInput('');
        searchCacheRef.current.clear();
      }
      
      console.log(`[PRODUCTS LOADED] ${isLoadMore ? 'Appended' : 'Loaded'} ${visibleProducts.length} products | Has more: ${hasMore}`);
    } catch (err) {
      console.error('❌ Error fetching products:', err.message);
      // Only show error if we have no products
      if (products.length === 0) {
        setError(err.message);
        setProducts([]);
      } else {
        console.warn('[LOAD MORE SILENT FAIL] Keeping current products visible');
      }
    } finally {
      setIsLoadingMore(false);
      setLoading(false);
    }
  };

  /**
   * Handle Load More button click
   * Appends next batch of products without clearing search results
   */
  const handleLoadMore = async () => {
    if (!hasMoreProducts || isLoadingMore) {
      return; // Prevent multiple concurrent requests
    }
    
    // Append mode: Load More
    await fetchProducts(true);
  };

  // Fetch categories on component mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/products/categories');
        if (response.data.categories) {
          setCategories(response.data.categories);
          console.log('[PRODUCTS] Categories loaded:', response.data.categories);
        }
      } catch (err) {
        console.warn('[PRODUCTS] Error fetching categories:', err.message);
        // Continue without categories - not critical
      }
    };
    
    fetchCategories();
  }, []);

  // Cleanup on unmount - cancel pending requests
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);


  // Update refs whenever state changes (for use in search callback closures)
  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
    selectedCategorySearchRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    onSaleOnlyRef.current = onSaleOnly;
  }, [onSaleOnly]);

  // Initial product load on category/filter change
  useEffect(() => {
    // Reset to initial state when filters change
    setProducts([]);
    setOffset(0);
    setHasMoreProducts(true);
    
    // Load initial products with new filters
    fetchProducts(false); // isLoadMore = false to replace products
  }, [selectedCategory, onSaleOnly]);

  // Scroll event listener for back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch total system product count on mount (all enabled products)
  useEffect(() => {
    const fetchTotalCount = async () => {
      try {
        // Fetch first page with pageSize 1 to get total count without loading all products
        const response = await api.get('/products', {
          params: {
            page: 1,
            pageSize: 1
          }
        });
        
        // Extract total count from pagination metadata
        const count = response.data.pagination?.total || 0;
        setTotalSystemProducts(count);
        console.log(`[PRODUCT COUNT] Total enabled products: ${count}`);
      } catch (err) {
        console.warn('[PRODUCT COUNT] Failed to fetch total count:', err.message);
        // Fail silently - don't show error, just use 0
        setTotalSystemProducts(0);
      }
    };

    fetchTotalCount();
  }, []);

  /**
   * Update displayed products based on current products
   * Filtered products stay visible during search
   */
  useEffect(() => {
    // If no search, show all products from current fetch
    if (!searchInput) {
      const visible = products.filter(p => !p.hideFromProductsPage);
      setFilteredProducts(visible);
    }
  }, [products, searchInput]);

  /**
   * Listen for real-time product updates (stock, price, promotions, name, etc)
   * Updates product details immediately when admin makes changes
   */
  useEffect(() => {
    try {
      const socket = getSocket();
      
      if (!socket) {
        console.log('[PRODUCTS] Socket not available yet');
        return;
      }

      const handleStockUpdate = ({ productId, newStock, newPrice }) => {
        console.log('[PRODUCTS] 📊 Stock update received:', { productId, newStock, newPrice });
        
        // Update the products list with new stock
        setProducts(prevProducts =>
          prevProducts.map(product =>
            product.id === productId
              ? {
                  ...product,
                  stock: newStock,
                    effectiveStock: product.overrideActive && product.overrideStock != null
                      ? product.overrideStock
                      : newStock,
                  ...(newPrice !== null && { price: newPrice }),
                }
              : product
          )
        );

        // Also update filtered products to ensure UI reflects changes
        setFilteredProducts(prevFiltered =>
          prevFiltered.map(product =>
            product.id === productId
              ? {
                  ...product,
                  stock: newStock,
                    effectiveStock: product.overrideActive && product.overrideStock != null
                      ? product.overrideStock
                      : newStock,
                  ...(newPrice !== null && { price: newPrice }),
                }
              : product
          )
        );
      };

      const handleProductUpdate = (updatedProduct) => {
        console.log('[PRODUCTS] 🔄 Product update received:', updatedProduct.name);
        
        // If a category filter is active, only update products from that category
        if (selectedCategoryRef.current && updatedProduct.category !== selectedCategoryRef.current) {
          console.log('[PRODUCTS] ⏭️ SKIPPING update - Product category mismatch:', updatedProduct.category, 'vs selected:', selectedCategoryRef.current);
          return; // Skip products from other categories when filter is active
        }
        
        // Check if product visibility has changed
        if (updatedProduct.hideFromProductsPage) {
          // Product is now hidden - remove it from display
          console.log('[PRODUCTS] 🙈 Product hidden:', updatedProduct.name);
          setProducts(prevProducts =>
            prevProducts.filter(product => product.id !== updatedProduct.id)
          );
          setFilteredProducts(prevFiltered =>
            prevFiltered.filter(product => product.id !== updatedProduct.id)
          );
          return;
        }
        
        // Update the products list with complete product details
        setProducts(prevProducts =>
          prevProducts.map(product =>
            product.id === updatedProduct.id
              ? {
                  ...product,
                  name: updatedProduct.name,
                  price: updatedProduct.price,
                  originalPrice: updatedProduct.originalPrice,
                  discountPrice: updatedProduct.discountPrice,
                  finalPrice: updatedProduct.finalPrice,
                  isOnSale: updatedProduct.isOnSale,
                  stock: updatedProduct.stock,
                  posStock: updatedProduct.posStock,
                  effectiveStock: updatedProduct.effectiveStock,
                  overrideActive: updatedProduct.overrideActive,
                  overrideStock: updatedProduct.overrideStock,
                  category: updatedProduct.category,
                  image: updatedProduct.image,
                  expiryDate: updatedProduct.expiryDate,
                  expiryStatus: updatedProduct.expiryStatus,
                  hideFromProductsPage: updatedProduct.hideFromProductsPage || false,
                  updatedAt: updatedProduct.updatedAt,
                }
              : product
          )
        );

        // Also update filtered products to ensure UI reflects changes
        setFilteredProducts(prevFiltered =>
          prevFiltered.map(product =>
            product.id === updatedProduct.id
              ? {
                  ...product,
                  name: updatedProduct.name,
                  price: updatedProduct.price,
                  originalPrice: updatedProduct.originalPrice,
                  discountPrice: updatedProduct.discountPrice,
                  finalPrice: updatedProduct.finalPrice,
                  isOnSale: updatedProduct.isOnSale,
                  stock: updatedProduct.stock,
                  posStock: updatedProduct.posStock,
                  effectiveStock: updatedProduct.effectiveStock,
                  overrideActive: updatedProduct.overrideActive,
                  overrideStock: updatedProduct.overrideStock,
                  category: updatedProduct.category,
                  image: updatedProduct.image,
                  expiryDate: updatedProduct.expiryDate,
                  expiryStatus: updatedProduct.expiryStatus,
                  updatedAt: updatedProduct.updatedAt,
                }
              : product
          )
        );
      };

      const handlePOSProductUpdate = (syncedProduct) => {
        console.log('[PRODUCTS] 📦 POS product update:', { id: syncedProduct.id, name: syncedProduct.name, sourceCode: syncedProduct.sourceCode, category: syncedProduct.category });
        
        // If a category filter is active, only update products from that category
        if (selectedCategoryRef.current && syncedProduct.category !== selectedCategoryRef.current) {
          console.log('[PRODUCTS] ⏭️ SKIPPING POS update - Product category mismatch:', syncedProduct.category, 'vs selected:', selectedCategoryRef.current);
          return; // Skip products from other categories when filter is active
        }
        
        setProducts(prevProducts => {
          // Try matching by ID first (most reliable)
          let matched = prevProducts.findIndex(p => p.id === syncedProduct.id);
          
          // Fallback: try sourceCode if they both exist
          if (matched === -1 && syncedProduct.sourceCode && prevProducts.some(p => p.sourceCode)) {
            matched = prevProducts.findIndex(p => p.sourceCode === syncedProduct.sourceCode);
          }
          
          // Fallback: try matching by exact name (but only if no sourceCode collision)
          if (matched === -1 && syncedProduct.name) {
            const nameMatch = prevProducts.findIndex(p => p.name === syncedProduct.name && !p.sourceCode);
            if (nameMatch >= 0) {
              matched = nameMatch;
            }
          }
          
          if (matched >= 0) {
            // Update existing product - only update stock/price to avoid breaking pagination
            console.log('[PRODUCTS] ✅ UPDATED:', syncedProduct.name, 'ID:', syncedProduct.id);
            const updated = [...prevProducts];
            const mergedProduct = {
              ...updated[matched],
              stock: syncedProduct.stock,
              price: syncedProduct.price,
              finalPrice: syncedProduct.price,
            };
            updated[matched] = {
              ...mergedProduct,
              effectiveStock: getEffectiveStock(mergedProduct),
            };
            return updated;
          } else {
            // New product detected during sync - silently skip it
            // The full list will be refreshed via pagination or category change
            console.log('[PRODUCTS] ⏭️ Skipping new product to avoid pagination issues:', syncedProduct.name);
            return prevProducts; // Don't add locally and don't refetch
          }
        });
      };

      const handlePromotionUpdated = (promotion) => {
        console.log('[PRODUCTS] 🎯 Promotion updated:', promotion.type);
        // Refetch all products to get updated discount prices
        fetchProducts();
      };

      const handlePOSSync = (syncData) => {
        console.log('[PRODUCTS] 🔄 POS Sync triggered:', syncData);
        // Individual product updates will arrive via 'pos-product-updated' events
        // No need to refetch - updates happen in real-time as products sync
      };

      // Listen for stock updates, product updates, promotion changes, and POS product updates
      socket.on('stock_update', handleStockUpdate);
      socket.on('product_updated', handleProductUpdate);
      socket.on('pos-product-updated', handlePOSProductUpdate);
      socket.on('promotionUpdated', handlePromotionUpdated);
      socket.on('pos-products-synced', handlePOSSync);
      console.log('[PRODUCTS] 🔌 Socket listeners attached for real-time POS updates');

      // Cleanup: remove listeners on component unmount
      return () => {
        socket.off('stock_update', handleStockUpdate);
        socket.off('product_updated', handleProductUpdate);
        socket.off('pos-product-updated', handlePOSProductUpdate);
        socket.off('promotionUpdated', handlePromotionUpdated);
        socket.off('pos-products-synced', handlePOSSync);
        console.log('[PRODUCTS] 🔌 Socket listeners removed');
      };
    } catch (err) {
      console.warn('[PRODUCTS] Error setting up update listeners:', err.message);
    }
  }, []);

  /**
   * Handle search input change
   * Triggers predictive search with caching and request cancellation
   * Products remain visible during silent background fetch
   */
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchInput(value);
    handlePredictiveSearch(value);
    console.log(`[PRODUCTS SEARCH] User typing: "${value}"`);
  };

  const clearSearch = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setSearchInput('');
    handlePredictiveSearch('');
  };

  useEffect(() => {
    const handleLeftCtrlClear = (event) => {
      if (event.repeat) return;

      const isLeftCtrl = event.code === 'ControlLeft' || (event.key === 'Control' && event.location === 1);
      if (!isLeftCtrl) return;
      if (!searchInput) return;

      event.preventDefault();
      clearSearch();
    };

    window.addEventListener('keydown', handleLeftCtrlClear);

    return () => {
      window.removeEventListener('keydown', handleLeftCtrlClear);
    };
  }, [searchInput]);

  /**
   * Handle category filter change
   */
  const handleCategoryChange = (e) => {
    const value = e.target.value;
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('category', value);
    } else {
      newParams.delete('category');
    }
    newParams.set('page', '1'); // Reset to page 1 when changing category
    setSearchParams(newParams);
  };

  /**
   * Handle sale filter toggle
   */
  const handleSaleFilterToggle = () => {
    const newParams = new URLSearchParams(searchParams);
    if (onSaleOnly) {
      newParams.delete('onSale');
    } else {
      newParams.set('onSale', 'true');
    }
    newParams.set('page', '1'); // Reset to page 1 when changing filters
    setSearchParams(newParams);
  };

  /**
   * Scroll to top with smooth animation
   */
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  /**
   * Handle Add to Cart
   */
  const handleAddToCart = async (product) => {
    if (!isAuthenticated) {
      showError('Authentication Required', 'Please log in to add items to your cart');
      return;
    }

    const availableStock = getEffectiveStock(product);

    if (availableStock <= 0) {
      showError('Out of Stock', `${product.name} is out of stock`);
      return;
    }

    try {
      const validation = cartValidation.validateAddToCart({
        productId: product.id,
        quantity: 1
      });

      if (!validation.isValid) {
        showError('Invalid Request', 'Invalid cart request:\n' + validation.errors.join('\n'));
        return;
      }

      // Use finalPrice from backend (already calculated considering discount)
      const response = await api.post('/cart', {
        productId: product.id,
        quantity: 1
      });

      showSuccess('Added to Cart', `${product.name} added to cart!`);
      await updateCartCount();
    } catch (err) {
      if (err.response?.status === 401) {
        showError('Session Expired', 'Session expired. Please log in again.');
        logout();
        return;
      }

      const errorMsg = err.response?.data?.error;
      showError('Error', `Error adding to cart: ${errorMsg || 'Unknown error'}`);
      console.error('❌ Error adding to cart:', err.message);
    }
  };

  /**
   * Handle cart click from navigation
   */
  const handleNavCartClick = () => {
    navigate('/cart');
  };

  /**
   * Handle account/login click from navigation
   */
  const handleNavAccountClick = () => {
    if (isAuthenticated) {
      setShowAccountPopup(!showAccountPopup);
    } else {
      navigate('/login');
    }
  };

  /**
   * Handle logout from popup
   */
  const handleNavLogout = () => {
    showConfirm(
      'Confirm Logout',
      'Are you sure you want to log out?',
      () => {
        logout();
        setShowAccountPopup(false);
        navigate('/login');
      }
    );
  };

  // Loading state - ONLY show for initial page load (when there's no data at all)
  const isInitialLoading = loading && products.length === 0 && filteredProducts.length === 0;

  if (isInitialLoading) {
    return (
      <div className="page products-page">
        <Container>
          <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>Loading products...</p>
        </Container>
      </div>
    );
  }

  // Error state - ONLY show for initial load errors (when there's no data at all)
  const isInitialError = error && products.length === 0 && filteredProducts.length === 0;

  if (isInitialError) {
    return (
      <div className="page products-page">
        <Container>
          <div style={{
            backgroundColor: '#f8d7da',
            color: '#721c24',
            padding: '1.5rem',
            borderRadius: '4px',
            marginTop: '1rem'
          }}>
            <h3>Error Loading Products</h3>
            <p>{error}</p>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="page products-page">
      {/* FIXED FILTER BAR - Single tier with filters left, buttons right */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: 'white',
        borderBottom: '1px solid #eee',
        boxShadow: scrollY > 0 ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
        transition: 'box-shadow 0.3s ease',
        display: 'flex',
        justifyContent: 'center',
        padding: window.innerWidth <= 480 ? '0.75rem' : '0.75rem 1.5rem'
      }}>
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'nowrap'
        }}>
          {/* LEFT SECTION - Filters */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flex: '1 1 auto',
            minWidth: 0
          }}>
            {/* SEARCH BAR */}
            <div style={{
              position: 'relative',
              flex: '1 1 auto',
              minWidth: window.innerWidth <= 768 ? '120px' : '180px',
              maxWidth: window.innerWidth > 768 ? '450px' : '600px',
            }}>
              <input
                type="text"
                placeholder={`Search products (${totalSystemProducts})`}
                value={searchInput}
                onChange={handleSearchChange}
                style={{
                  width: '100%',
                  padding: '0.5rem 2.1rem 0.5rem 0.9rem',
                  border: '1px solid #d0d0d0',
                  borderRadius: '6px',
                  fontSize: window.innerWidth <= 480 ? '0.85rem' : '0.95rem',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                  transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.boxShadow = '0 2px 8px rgba(91, 75, 138, 0.15)';
                  e.target.style.borderColor = '#5B4B8A';
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none';
                  e.target.style.borderColor = '#d0d0d0';
                }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  title="Clear search (Left Ctrl)"
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: '0.35rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#eef0f2',
                    color: '#555',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    padding: 0,
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>

            {/* CATEGORY FILTER */}
            <select
              value={selectedCategory}
              onChange={handleCategoryChange}
              style={{
                flex: '0 1 auto',
                minWidth: window.innerWidth <= 480 ? '130px' : '160px',
                padding: '0.5rem 0.65rem',
                border: '1px solid #d0d0d0',
                borderRadius: '6px',
                fontSize: window.innerWidth <= 480 ? '0.85rem' : '0.95rem',
                backgroundColor: '#fff',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#5B4B8A';
                e.target.style.boxShadow = '0 2px 8px rgba(91, 75, 138, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d0d0d0';
                e.target.style.boxShadow = 'none';
              }}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* RIGHT SECTION - Home and Cart buttons (desktop only) */}
          {window.innerWidth > 768 && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              flex: 'none',
              marginLeft: '1rem'
            }}>
              {/* Home Button */}
              <button
                onClick={() => navigate('/')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '32px',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  color: '#666',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = '#5B4B8A';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#666';
                }}
                title="Go to Home"
              >
                Home
              </button>

              {/* Cart Button */}
              <button
                onClick={handleNavCartClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '32px',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  color: '#666',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.target.style.color = '#5B4B8A';
                }}
                onMouseLeave={(e) => {
                  e.target.style.color = '#666';
                }}
                title="View Cart"
              >
                <i className="fas fa-shopping-cart" style={{ marginRight: '0.4rem' }}></i>
                Cart
                {cartCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    backgroundColor: '#ff3860',
                    color: 'white',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: '700'
                  }}>
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ACCOUNT POPUP FOR MOBILE/DESKTOP */}
      {showAccountPopup && isAuthenticated && (
        <div style={{
          position: 'fixed',
          top: window.innerWidth > 768 ? '60px' : 'auto',
          bottom: window.innerWidth <= 768 ? '70px' : 'auto',
          right: '1rem',
          left: window.innerWidth <= 768 ? '1rem' : 'auto',
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '1rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1001,
          maxWidth: '300px',
          animation: 'slideIn 0.3s ease',
          backdropFilter: 'blur(0px)'
        }}>
          {/* User Name */}
          <div style={{
            fontSize: '16px',
            fontWeight: '600',
            color: '#333',
            marginBottom: '8px'
          }}>
            {user?.name}
          </div>

          {/* Email */}
          <div style={{
            fontSize: '13px',
            color: '#666',
            marginBottom: '12px',
            wordBreak: 'break-word'
          }}>
            {user?.email}
          </div>

          {/* Logout Button */}
          <button
            onClick={handleNavLogout}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: '#ff3860',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#e82860';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#ff3860';
            }}
          >
            Logout
          </button>
        </div>
      )}

      {/* CLOSE POPUP ON OUTSIDE CLICK */}
      {showAccountPopup && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 60,
            zIndex: 999,
            backgroundColor: 'transparent'
          }}
          onClick={() => setShowAccountPopup(false)}
        />
      )}

      {/* PRODUCTS GRID SECTION - Account for fixed header height */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        marginTop: window.innerWidth > 768 ? '2.25rem' : '2rem',
        paddingBottom: window.innerWidth <= 768 ? '80px' : '0',
        paddingTop: '0'
      }}>
        {/* SCROLLABLE PRODUCTS SECTION */}
        <div style={{
          flex: 1,
          overflowY: 'auto'
        }}>
          {filteredProducts.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2rem',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              margin: '1rem'
            }}>
              <i className="fas fa-inbox" style={{ fontSize: '3rem', color: '#ccc', marginBottom: '1rem' }}></i>
              <p style={{ color: '#666', fontSize: '1.1rem' }}>
                {searchInput || selectedCategory || onSaleOnly 
                  ? 'No products match your filters. Try adjusting your search.'
                  : 'No products available at the moment.'
                }
              </p>
            </div>
          ) : (
            <div className="products-grid" style={{ padding: '1rem', marginTop: '2.5rem' }}>
              {filteredProducts.map((product) => {
                const availableStock = getEffectiveStock(product);
                const originalPrice = Number(product.originalPrice || 0);
                const finalPrice = Number(product.finalPrice || product.price || 0);
                const discountPercent = product.isOnSale && originalPrice > 0 && finalPrice > 0 && finalPrice < originalPrice
                  ? calculateDiscount(originalPrice, finalPrice)
                  : 0;
                const hasValidDiscount = discountPercent > 0;

                return (
                  <div key={product.id} className="product-card" style={{ position: 'relative' }}>
                    {/* Sale Badge */}
                    {hasValidDiscount && (
                      <div style={{
                        position: 'absolute',
                        top: window.innerWidth <= 480 ? '5px' : '10px',
                        right: window.innerWidth <= 480 ? '5px' : '10px',
                        backgroundColor: '#ff6b6b',
                        color: 'white',
                        padding: window.innerWidth <= 480 ? '0.35rem 0.5rem' : '0.5rem 0.75rem',
                        borderRadius: '4px',
                        fontSize: window.innerWidth <= 480 ? '0.75rem' : '0.85rem',
                        fontWeight: 'bold',
                        zIndex: 10,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}>
                        {discountPercent}% off
                      </div>
                    )}

                    {/* Product Image */}
                    <div className="product-card__image">
                      {product.imageUrl ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          crossOrigin="anonymous"
                          onLoad={() => console.log(`[PRODUCT IMAGE] ✅ Loaded: ${product.name}`)}
                          onError={(e) => {
                            console.error(`[PRODUCT IMAGE] ❌ Failed to load image for ${product.name}:`, product.imageUrl);
                            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f0f0f0" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-family="Arial"%3EImage Error%3C/text%3E%3C/svg%3E';
                          }}
                        />
                      ) : (
                        <div style={{ 
                          width: '100%', 
                          height: '100%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          backgroundColor: '#f0f0f0',
                          color: '#999'
                        }}>
                          <i className="fas fa-image" style={{ fontSize: '2rem', color: '#ccc' }}></i>
                        </div>
                      )}
                    </div>

                    <div className="product-card__content">
                      {/* Product Name */}
                      <h3 className="product-card__title">{product.name}</h3>

                      {/* Category */}
                      <p style={{ fontSize: '0.85rem', color: '#999', marginBottom: '0.5rem' }}>
                        {product.category}
                      </p>

                      {/* Pricing Section */}
                      <div style={{ marginBottom: '1rem' }}>
                        {hasValidDiscount ? (
                          <div>
                            {/* Original Price (Crossed Out) */}
                            <div style={{
                              fontSize: window.innerWidth <= 480 ? '0.8rem' : '0.95rem',
                              color: '#666',
                              textDecoration: 'line-through',
                              marginBottom: '0.25rem',
                              fontWeight: '500'
                            }}>
                              {formatMWK(originalPrice)}
                            </div>
                            {/* Discount Price (Primary) */}
                            <div className="product-card__price" style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: window.innerWidth <= 480 ? '1rem' : '1.2rem' }}>
                              {formatMWK(finalPrice)}
                            </div>
                          </div>
                        ) : (
                          <div className="product-card__price">
                            {formatMWK(finalPrice)}
                          </div>
                        )}
                      </div>

                      {/* Stock Status */}
                      <div style={{
                        fontSize: '0.85rem',
                        color: availableStock > 0 ? '#28a745' : '#dc3545',
                        marginBottom: '1rem'
                      }}>
                        {availableStock > 0 ? `In Stock (${availableStock})` : 'Out of Stock'}
                      </div>

                      {/* Add to Cart Button */}
                      <button
                        className="product-card__button"
                        onClick={() => handleAddToCart(product)}
                        disabled={availableStock <= 0}
                        style={{
                          opacity: availableStock <= 0 ? 0.6 : 1,
                          cursor: availableStock <= 0 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {availableStock > 0 ? 'Add to Cart' : 'Out of Stock'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* LOAD MORE BUTTON - Show when there are more products to load */}
        {hasMoreProducts && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '2rem 1rem',
            borderTop: '1px solid #eee'
          }}>
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              style={{
                padding: '0.75rem 2.5rem',
                backgroundColor: isLoadingMore ? '#cfcfcf' : '#5B4B8A',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                opacity: isLoadingMore ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!isLoadingMore) {
                  e.target.style.backgroundColor = '#4A3A7A';
                  e.target.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isLoadingMore) {
                  e.target.style.backgroundColor = '#5B4B8A';
                  e.target.style.transform = 'translateY(0)';
                }
              }}
            >
              {isLoadingMore ? (
                <>
                  <i className="fas fa-spinner" style={{ animation: 'spin 1s linear infinite', marginRight: '0.5rem' }}></i>
                  Loading more...
                </>
              ) : (
                'Load More Products'
              )}
            </button>
          </div>
        )}

        {/* "NO MORE PRODUCTS" MESSAGE - Show when all products loaded */}
        {!hasMoreProducts && filteredProducts.length > 0 && (
          <div style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            color: '#999',
            fontSize: '0.95rem',
            borderTop: '1px solid #eee'
          }}>
            No more products to load
          </div>
        )}
      </div>

      {/* FLOATING BACK-TO-TOP BUTTON */}
      {scrollY > 600 && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: window.innerWidth <= 768 ? '90px' : '20px',
            right: '20px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: '#5b4b8a',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            boxShadow: '0 4px 12px rgba(91, 75, 138, 0.4)',
            zIndex: 50,
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            animation: 'fadeIn 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'scale(1.1)';
            e.target.style.boxShadow = '0 6px 16px rgba(91, 75, 138, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.4)';
          }}
          title="Back to top"
        >
          <i className="fas fa-arrow-up"></i>
        </button>
      )}
      
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
      />

      {/* MOBILE BOTTOM NAVIGATION - Only visible on mobile */}
      <MobileBottomNav 
        onCartClick={handleNavCartClick}
        onAccountClick={handleNavAccountClick}
      />
    </div>
  );
};

export default Products;
