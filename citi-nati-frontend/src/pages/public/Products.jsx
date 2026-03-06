import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import PromotionBanner from '../../components/common/PromotionBanner.jsx';
import Pagination from '../../components/ui/Pagination.jsx';
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
  const [searchInput, setSearchInput] = useState(''); // User typing (instant)
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const { isAuthenticated, logout } = useAuth();
  const { updateCartCount } = useCart();
  const { modal, closeModal, showError, showSuccess } = useModal();
  
  // Refs for predictive search with caching and cancellation
  const searchCacheRef = useRef(new Map()); // Cache previous search results
  const abortControllerRef = useRef(null); // Cancel previous requests
  const debounceTimerRef = useRef(null); // Debounce timer
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
   */
  const handlePredictiveSearch = (query) => {
    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Check cache first - return instantly if cached
    if (query && searchCacheRef.current.has(query)) {
      console.log(`[SEARCH CACHE HIT] "${query}"`);
      const cachedResults = searchCacheRef.current.get(query);
      setFilteredProducts(cachedResults);
      return;
    }

    // Debounce the API call (200ms)
    debounceTimerRef.current = setTimeout(() => {
      if (!query.trim()) {
        // No search term - show all products
        const visible = productsRef.current.filter(p => !p.hideFromProductsPage);
        setFilteredProducts(visible);
        return;
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new controller for this request
      abortControllerRef.current = new AbortController();

      // Silent fetch - no loading state changes
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
          // Ignore abort errors - those are intentional cancellations
          if (err.name !== 'AbortError') {
            console.error('[SEARCH ERROR]', err.message);
            setError(err.message);
          }
        }
      })();
    }, 200); // 200ms debounce
  };

  /**
   * Fetch products for pagination and category filtering
   * Separate from search - handles normal browsing
   */
  const fetchProducts = async (page = 1) => {
    try {
      // Only show loading spinner for initial page load
      if (products.length === 0) {
        setLoading(true);
      }
      setError(null);

      const pageSize = 20;
      const params = new URLSearchParams();
      params.append('page', page);
      params.append('pageSize', pageSize);
      
      if (selectedCategory) params.append('category', selectedCategory);
      if (onSaleOnly) params.append('onSale', 'true');

      const response = await api.get(`/products?${params.toString()}`);
      const data = response.data;

      if (!data.products || !Array.isArray(data.products)) {
        throw new Error('Invalid response schema: expected { products: [...] }');
      }

      console.log(`[PRODUCTS FETCH] Page ${page}/${data.pagination?.totalPages || 1} | Total: ${data.pagination?.total || 0} | Category: ${selectedCategory || 'all'}`);
      
      const fetchedProducts = data.products;
      setProducts(fetchedProducts);
      
      // Update pagination state
      if (data.pagination) {
        setCurrentPage(data.pagination.currentPage);
        setTotalPages(data.pagination.totalPages);
        setTotalProducts(data.pagination.total);
      }
      
      // Update URL
      const newParams = new URLSearchParams(searchParams);
      newParams.set('page', page);
      setSearchParams(newParams);

      // Clear search when browsing
      setSearchInput('');
      searchCacheRef.current.clear();
    } catch (err) {
      console.error('❌ Error fetching products:', err.message);
      setError(err.message);
      if (products.length === 0) {
        setProducts([]);
      }
    } finally {
      setLoading(false);
    }
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
    const page = parseInt(searchParams.get('page')) || 1;
    fetchProducts(page);
  }, [selectedCategory, onSaleOnly]);

  // Fetch on pagination change
  useEffect(() => {
    const page = parseInt(searchParams.get('page')) || 1;
    if (page !== currentPage) {
      fetchProducts(page);
    }
  }, [searchParams]);

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
                  category: updatedProduct.category,
                  image: updatedProduct.image,
                  expiryDate: updatedProduct.expiryDate,
                  expiryStatus: updatedProduct.expiryStatus,
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
            updated[matched] = {
              ...updated[matched],
              stock: syncedProduct.stock,
              price: syncedProduct.price,
              finalPrice: syncedProduct.price,
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
   * Handle page change
   */
  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', newPage);
    setSearchParams(params);
    fetchProducts(newPage);
  };

  /**
   * Handle Add to Cart
   */
  const handleAddToCart = async (product) => {
    if (!isAuthenticated) {
      showError('Authentication Required', 'Please log in to add items to your cart');
      return;
    }

    if (product.stock <= 0) {
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

  // Loading state
  if (loading) {
    return (
      <div className="page products-page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Our Products</h1>
          <p style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>Loading products...</p>
        </Container>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="page products-page">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Our Products</h1>
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
      {/* Promotion Banner - Appears at top if global or category promotion is active */}
      <PromotionBanner category={selectedCategory || null} />

      {/* PRODUCTS GRID - FULL WIDTH SECTION */}
      <div className="products-grid-wrapper">
        {/* Header Section */}
        <div className="products-header">
          {/* Left: Title and Description */}
          <div className="products-header__left">
            <h1 style={{ 
              marginBottom: '0.5rem', 
              fontSize: 'clamp(1.5rem, 4vw, 2rem)', 
              color: '#5B4B8A' 
            }}>Our Products</h1>
            <p style={{ 
              color: '#666', 
              margin: 0,
              fontSize: 'clamp(0.9rem, 3vw, 1rem)'
            }}>
              Browse our selection of fresh groceries and essentials
            </p>
          </div>

          {/* Right: FILTERS SECTION */}
          <div style={{
            backgroundColor: '#fff',
            padding: '1rem',
            borderRadius: '8px',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            flexWrap: 'nowrap',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            paddingBottom: '0.5rem'
          }}
          className="products-filters"
          >
            {/* Search Input */}
            <div style={{ 
              flex: '0 0 auto',
              maxWidth: '300px',
              minWidth: '160px'
            }}>
              <input
                type="text"
                placeholder="Search products..."
                value={searchInput}
                onChange={handleSearchChange}
                style={{
                  width: '100%',
                  padding: '0.6rem 1rem',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                  backgroundColor: '#f5f5f5',
                  transition: 'box-shadow 0.3s ease, background-color 0.3s ease'
                }}
                onFocus={(e) => {
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
                }}
                onBlur={(e) => {
                  e.target.style.backgroundColor = '#f5f5f5';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={handleCategoryChange}
              style={{
                padding: '0.6rem 0.75rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.95rem',
                backgroundColor: '#f5f5f5',
                cursor: 'pointer',
                flex: '0 0 auto',
                minWidth: '140px',
                transition: 'box-shadow 0.3s ease, background-color 0.3s ease'
              }}
              onFocus={(e) => {
                e.target.style.backgroundColor = '#fff';
                e.target.style.boxShadow = '0 4px 12px rgba(91, 75, 138, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.backgroundColor = '#f5f5f5';
                e.target.style.boxShadow = 'none';
              }}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Clear Filters Button */}
            {(searchInput || selectedCategory || onSaleOnly) && (
              <button
                onClick={() => {
                  setSearchInput('');
                  if (selectedCategory || onSaleOnly) {
                    const newParams = new URLSearchParams();
                    newParams.set('page', '1');
                    setSearchParams(newParams);
                  }
                }}
                style={{
                  padding: '0.6rem 1rem',
                  backgroundColor: '#f0f0f0',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  color: '#333',
                  whiteSpace: 'nowrap',
                  flex: '0 0 auto',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#e0e0e0'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#f0f0f0'}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '2rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px'
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
          <div className="products-grid">
            {filteredProducts.map((product) => {
              // Calculate discount percentage if on sale
              const discountPercent = product.isOnSale && product.originalPrice
                ? calculateDiscount(product.originalPrice, product.finalPrice)
                : 0;

              return (
                <div key={product.id} className="product-card" style={{ position: 'relative' }}>
                  {/* Sale Badge */}
                  {product.isOnSale && (
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
                      {product.isOnSale && product.originalPrice ? (
                        <div>
                          {/* Original Price (Crossed Out) */}
                          <div style={{
                            fontSize: window.innerWidth <= 480 ? '0.8rem' : '0.95rem',
                            color: '#666',
                            textDecoration: 'line-through',
                            marginBottom: '0.25rem',
                            fontWeight: '500'
                          }}>
                            {formatMWK(product.originalPrice)}
                          </div>
                          {/* Discount Price (Primary) */}
                          <div className="product-card__price" style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: window.innerWidth <= 480 ? '1rem' : '1.2rem' }}>
                            {formatMWK(product.finalPrice)}
                          </div>
                        </div>
                      ) : (
                        <div className="product-card__price">
                          {formatMWK(product.finalPrice)}
                        </div>
                      )}
                    </div>

                    {/* Stock Status */}
                    <div style={{
                      fontSize: '0.85rem',
                      color: product.stock > 0 ? '#28a745' : '#dc3545',
                      marginBottom: '1rem'
                    }}>
                      {product.stock > 0 ? `In Stock (${product.stock})` : 'Out of Stock'}
                    </div>

                    {/* Add to Cart Button */}
                    <button
                      className="product-card__button"
                      onClick={() => handleAddToCart(product)}
                      disabled={product.stock <= 0}
                      style={{
                        opacity: product.stock <= 0 ? 0.6 : 1,
                        cursor: product.stock <= 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Pagination Component */}
      <Pagination 
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        total={totalProducts}
      />
      
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
    </div>
  );
};

export default Products;
