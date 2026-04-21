import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { notifySuccess, notifyError, notifyInfo } from '../../utils/notifications.js';
import Pagination from '../ui/Pagination.jsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../../assets/citi-nati-logo.png.png';
import {
  enrichProductStock,
  resolveEffectiveStock,
  resolveLowStockThreshold,
  resolveStockStatus,
} from '../../utils/stockResolver.js';
import { filterProductsForOperationalLocation } from '../../utils/operationalScope.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSION_KEYS, hasPermission } from '../../utils/permissions.js';
import '../../css/admin-responsive-filters.css';

/**
 * 📊 ADMIN STOCKS MANAGEMENT
 * 
 * Manage product inventory:
 * - View all product stocks
 * - Add/subtract stock
 * - View stock history
 * - Set low stock alerts
 */

const AdminStocks = ({
  selectedLocationCode = 'BT',
  cachedProducts = [],
  cachedProductsMeta = {},
  onRefreshProductsCache,
}) => {
  const { user: loggedInUser } = useAuth();
  // `products` is deprecated; we now rely on `allProducts` for everything.
  // previously products was only used in stats cards which caused counts to be wrong
  const [allProducts, setAllProducts] = useState([]); // Store all products for client-side filtering
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stockAction, setStockAction] = useState('');
  const [stockQuantity, setStockQuantity] = useState(0);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('add'); // 'add' or 'subtract'
  // Stock override state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideProduct, setOverrideProduct] = useState(null);
  const [pendingOverrideActive, setPendingOverrideActive] = useState(false);
  const [pendingOverrideStock, setPendingOverrideStock] = useState('');
  const [pendingOverrideReason, setPendingOverrideReason] = useState('');
  const [pendingLowStockThreshold, setPendingLowStockThreshold] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const pageSize = 20;
  const searchTimeoutRef = useRef(null);
  const filterBarRef = useRef(null);
  const fetchRequestIdRef = useRef(0);
  const silentRefreshGuardRef = useRef(0);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const canManageStocks = hasPermission(loggedInUser, PERMISSION_KEYS.ADMIN_STOCKS_MANAGE);

  // Reset filters and search ONLY when the operational location changes.
  useEffect(() => {
    setSearchTerm('');
    setFilterCategory('all');
    setStockStatusFilter('all');
    setCurrentPage(1);
    const cleanup = setupSocketListeners();
    return cleanup;
  }, [selectedLocationCode]);

  // Sync product list from shared cache whenever it changes — never touches search/filter state.
  useEffect(() => {
    if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
      const scopedCachedProducts = filterProductsForOperationalLocation(cachedProducts, selectedLocationCode);
      const nextProducts = scopedCachedProducts.map((product) => enrichProductStock(product));
      const nextCategories = [...new Set(nextProducts.map((product) => product.category).filter(Boolean))];
      setAllProducts(nextProducts);
      setCategories(nextCategories);
      setLoading(Boolean(cachedProductsMeta?.isLoading));
    } else if (cachedProductsMeta?.lastLoadedAt) {
      setAllProducts([]);
      setCategories([]);
      setLoading(false);
    } else if (cachedProductsMeta?.isLoading || cachedProductsMeta?.isBackgroundLoading) {
      setAllProducts([]);
      setCategories([]);
      setLoading(true);
    } else {
      setAllProducts([]);
      setCategories([]);
      fetchProducts();
    }
  }, [selectedLocationCode, cachedProducts, cachedProductsMeta]);

  useEffect(() => {
    if (!Array.isArray(cachedProducts)) return;
    const scopedCachedProducts = filterProductsForOperationalLocation(cachedProducts, selectedLocationCode);
    const nextProducts = scopedCachedProducts.map((product) => enrichProductStock(product));
    const nextCategories = [...new Set(nextProducts.map((product) => product.category).filter(Boolean))];
    setAllProducts(nextProducts);
    setCategories(nextCategories);
    if (cachedProductsMeta?.isLoading || cachedProductsMeta?.isBackgroundLoading) {
      setLoading(cachedProducts.length === 0);
    }
  }, [cachedProducts, cachedProductsMeta]);

  /**
   * Real-time stock updates via Socket.io
   */
  const setupSocketListeners = () => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[AdminStocks] Socket not initialized');
        return;
      }

      const handleStockUpdate = (updatedProduct) => {
        console.log('[AdminStocks] Stock updated via Socket.io:', updatedProduct.id);
        
        setAllProducts(prevProducts =>
          prevProducts.map((product) => {
            if (product.id !== updatedProduct.id) return product;

            const previousStock = Number(resolveEffectiveStock(product) || 0);
            const nextProduct = enrichProductStock({ ...product, ...updatedProduct });
            const nextStock = Number(resolveEffectiveStock(nextProduct) || 0);
            const nextThreshold = resolveLowStockThreshold(nextProduct);

            if (previousStock > 0 && nextStock === 0) {
              notifyError(
                `🔴 ${updatedProduct.name} is now out of stock`,
                5000,
                `Out of stock alert. ${updatedProduct.name} is now out of stock.`
              );
            } else if (previousStock > nextThreshold && nextStock > 0 && nextStock <= nextThreshold) {
              notifyInfo(
                `🟡 Low stock alert: ${updatedProduct.name} has ${nextStock} left`,
                5000,
                `Low stock alert. ${updatedProduct.name} has ${nextStock} items left (threshold ${nextThreshold}).`
              );
            }

            return nextProduct;
          })
        );
      };

      const handleProductUpdate = (updatedProduct) => {
        const updatedLocationCode = String(updatedProduct?.locationCode || '').trim().toUpperCase();
        const currentLocationCode = String(selectedLocationCode || '').trim().toUpperCase();
        if (updatedLocationCode && currentLocationCode && updatedLocationCode !== currentLocationCode) {
          return;
        }

        console.log('[AdminStocks] Product updated via Socket.io:', updatedProduct.id);
        
        // Update product details
        setAllProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === updatedProduct.id 
              ? enrichProductStock({ ...p, ...updatedProduct })
              : p
          )
        );
      };

      const scheduleSilentRefresh = () => {
        if (typeof onRefreshProductsCache !== 'function') return;
        const now = Date.now();
        if ((now - silentRefreshGuardRef.current) < 8000) {
          return;
        }
        silentRefreshGuardRef.current = now;
        void onRefreshProductsCache();
      };

      const handlePosProductUpdated = (updatedProduct) => {
        const updatedLocationCode = String(updatedProduct?.locationCode || '').trim().toUpperCase();
        const currentLocationCode = String(selectedLocationCode || '').trim().toUpperCase();
        if (updatedLocationCode && currentLocationCode && updatedLocationCode !== currentLocationCode) {
          return;
        }
        scheduleSilentRefresh();
      };

      const handlePosProductsSynced = (payload = {}) => {
        const affectedLocations = Array.isArray(payload?.affectedLocations)
          ? payload.affectedLocations.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
          : [];
        const currentLocationCode = String(selectedLocationCode || '').trim().toUpperCase();
        if (affectedLocations.length > 0 && currentLocationCode && !affectedLocations.includes(currentLocationCode)) {
          return;
        }
        scheduleSilentRefresh();
      };

      socket.on('stock_update', handleStockUpdate);
      socket.on('product_updated', handleProductUpdate);
      socket.on('pos-product-updated', handlePosProductUpdated);
      socket.on('pos-products-synced', handlePosProductsSynced);
      console.log('[AdminStocks] Socket.io listeners registered');

      return () => {
        socket.off('stock_update', handleStockUpdate);
        socket.off('product_updated', handleProductUpdate);
        socket.off('pos-product-updated', handlePosProductUpdated);
        socket.off('pos-products-synced', handlePosProductsSynced);
      };
    } catch (err) {
      console.error('[AdminStocks] Socket.io setup error:', err);
    }
  };

  // fetch all pages from the backend (pageSize max is 100 on the server).
  // Load first page immediately to show UI, then fetch remaining pages in background
  const fetchProducts = async () => {
    const requestId = Date.now();
    fetchRequestIdRef.current = requestId;

    try {
      setLoading(true);

      // Load first page immediately
      const firstParams = new URLSearchParams({ page: '1', pageSize: '100' });
      if (selectedLocationCode) {
        firstParams.append('locationCode', selectedLocationCode);
      }
      const res1 = await api.get(`/products?${firstParams.toString()}`);
      const firstBatch = filterProductsForOperationalLocation(res1.data.products || [], selectedLocationCode)
        .map((product) => enrichProductStock(product));

      if (fetchRequestIdRef.current !== requestId) {
        return;
      }

      setAllProducts(firstBatch);

      // Extract categories from first batch
      const uniqueCategories = [...new Set(firstBatch.map(p => p.category))];
      setCategories(uniqueCategories.filter(Boolean));

      setCurrentPage(1);
      setLoading(false); // UI renders after first page

      // Load remaining pages in background (non-blocking)
      const collectRemaining = async () => {
        try {
          let collected = [...firstBatch];
          let page = 2;
          const perPage = 100;

          while (true) {
            const params = new URLSearchParams({ page: String(page), pageSize: String(perPage) });
            if (selectedLocationCode) {
              params.append('locationCode', selectedLocationCode);
            }
            const res = await api.get(`/products?${params.toString()}`);
            const items = res.data.products || [];
            if (items.length === 0) break;
            collected = filterProductsForOperationalLocation(
              collected.concat(items.map((product) => enrichProductStock(product))),
              selectedLocationCode
            );
            if (items.length < perPage) break;
            page += 1;
          }

          if (fetchRequestIdRef.current !== requestId) {
            return;
          }

          setAllProducts(collected);
          const allCategories = [...new Set(collected.map(p => p.category))];
          setCategories(allCategories.filter(Boolean));
          console.log('[AdminStocks] fetched', collected.length, 'products in total');
        } catch (err) {
          console.error('[AdminStocks] Error loading remaining pages:', err);
        }
      };

      // Start background load if there are more pages
      if (firstBatch.length === 100) {
        collectRemaining();
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      notifyError('Failed to load products', 3000);
      setLoading(false);
    }
  };

  const handleStockAction = async () => {
    if (!selectedProduct || !stockQuantity) {
      notifyError('Please select a product and enter a quantity', 3000);
      return;
    }

    try {
      const newStock = actionType === 'add'
        ? selectedProduct.stock + stockQuantity
        : Math.max(0, selectedProduct.stock - stockQuantity);

      const response = await api.put(`/products/${selectedProduct.id}`, {
        stock: newStock,
        locationCode: selectedLocationCode,
      });

      // Update local state (allProducts list used for filtering/pagination)
      setAllProducts(prev => 
        prev.map(p => 
          p.id === selectedProduct.id 
            ? enrichProductStock({ ...p, stock: newStock })
            : p
        )
      );

      const action = actionType === 'add' ? 'added' : 'removed';
      notifySuccess(`✅ ${stockQuantity} units ${action} to ${selectedProduct.name}!`, 3000);

      setShowActionModal(false);
      setStockQuantity(0);
      setSelectedProduct(null);
    } catch (err) {
      console.error('Error updating stock:', err);
      notifyError(`Failed to update stock: ${err.response?.data?.error || 'Unknown error'}`, 4000);
    }
  };

  const openStockModal = (product, type) => {
    setSelectedProduct(product);
    setActionType(type);
    setStockQuantity(0);
    setShowActionModal(true);
  };

  const closeStockModal = () => {
    setShowActionModal(false);
    setSelectedProduct(null);
    setStockQuantity(0);
  };

  const openOverrideModal = (product) => {
    setOverrideProduct(product);
    setPendingOverrideActive(product.overrideActive || false);
    setPendingOverrideStock(product.overrideStock != null ? String(product.overrideStock) : '');
    setPendingOverrideReason(product.overrideReason || '');
    setPendingLowStockThreshold(String(resolveLowStockThreshold(product)));
    setShowOverrideModal(true);
  };

  const closeOverrideModal = () => {
    setShowOverrideModal(false);
    setOverrideProduct(null);
  };

  const handleSaveOverride = async () => {
    if (!overrideProduct) return;
    if (pendingOverrideActive && (pendingOverrideStock === '' || parseInt(pendingOverrideStock) < 0)) {
      notifyError('Please enter a valid non-negative override stock quantity', 3000);
      return;
    }
    if (pendingLowStockThreshold === '' || parseInt(pendingLowStockThreshold, 10) < 0 || Number.isNaN(parseInt(pendingLowStockThreshold, 10))) {
      notifyError('Please enter a valid non-negative low stock threshold', 3000);
      return;
    }
    try {
      setIsSubmittingOverride(true);
      const response = await api.put(`/admin/inventory/stock-override/${overrideProduct.id}`, {
        overrideActive: pendingOverrideActive,
        overrideStock: pendingOverrideActive ? parseInt(pendingOverrideStock, 10) : null,
        overrideReason: pendingOverrideReason.trim() || null,
      });

      const thresholdResponse = await api.patch(`/products/${overrideProduct.id}/stock-threshold`, {
        low_stock_threshold: parseInt(pendingLowStockThreshold, 10),
      });

      const updatedProduct = thresholdResponse?.data?.product || response.data.product;
      setAllProducts(prev =>
        prev.map(p => p.id === overrideProduct.id ? enrichProductStock({ ...p, ...updatedProduct }) : p)
      );
      if (pendingOverrideActive) {
        notifySuccess(`✅ Website stock override enabled: ${overrideProduct.name} → ${pendingOverrideStock} units`, 3000);
      } else {
        notifySuccess(`✅ Override cleared for ${overrideProduct.name} — POS stock is now used`, 3000);
      }
      closeOverrideModal();
    } catch (err) {
      notifyError(`Failed to save override: ${err.response?.data?.error || 'Unknown error'}`, 4000);
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const getStockStatus = (product) => {
    const status = resolveStockStatus(product);
    if (status === 'out_of_stock') return { color: '#d32f2f', label: 'Out of Stock', icon: '🔴' };
    if (status === 'low_stock') return { color: '#f57c00', label: 'Low Stock', icon: '🟡' };
    return { color: '#388e3c', label: 'In Stock', icon: '🟢' };
  };

  // Effective stock for display/filtering: override wins when active
  const getEffectiveStock = (product) => {
    return resolveEffectiveStock(product);
  };

  // Filter products with debounced search
  const filteredProducts = allProducts
    .filter(product => {
      const term = searchTerm.toLowerCase();
      const searchableProductCode = String(product.productCode || product.sourceCode || product.code || '').toLowerCase();
      const matchesSearch = !searchTerm ||
        product.name.toLowerCase().includes(term) ||
        searchableProductCode.includes(term);
      const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
      const matchesStockStatus =
        stockStatusFilter === 'all' ||
        (stockStatusFilter === 'instock' && resolveStockStatus(product) === 'in_stock') ||
        (stockStatusFilter === 'lowstock' && resolveStockStatus(product) === 'low_stock') ||
        (stockStatusFilter === 'outofstock' && resolveStockStatus(product) === 'out_of_stock');
      return matchesSearch && matchesCategory && matchesStockStatus;
    });

  // Paginate filtered results
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Handle search with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on search
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce the search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      // Search is now applied via filteredProducts
    }, 300);
  };

  const clearSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearchTerm('');
    setCurrentPage(1);
  };

  // Download filtered products as PDF
  const downloadStocksPDF = () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // Add logo
      const img = new Image();
      img.onload = () => {
        const logoMaxWidth = 34;
        const logoMaxHeight = 28;
        const imageRatio = img.width && img.height ? img.width / img.height : 1;
        let logoWidth = logoMaxWidth;
        let logoHeight = logoWidth / imageRatio;

        if (logoHeight > logoMaxHeight) {
          logoHeight = logoMaxHeight;
          logoWidth = logoHeight * imageRatio;
        }

        const logoX = 14;
        const logoY = 8 + ((logoMaxHeight - logoHeight) / 2);
        pdf.addImage(img, 'PNG', logoX, logoY, logoWidth, logoHeight);

        const centerX = pageWidth / 2;
        
        // Add company name
        pdf.setFontSize(14);
        pdf.setFont(undefined, 'bold');
        const brandLeft = 'Citi-';
        const brandRight = 'Nati Supermarket';
        const brandLeftWidth = pdf.getTextWidth(brandLeft);
        const brandRightWidth = pdf.getTextWidth(brandRight);
        const brandStartX = centerX - ((brandLeftWidth + brandRightWidth) / 2);

        pdf.setTextColor(91, 75, 138);
        pdf.text(brandLeft, brandStartX, 12);
        pdf.setTextColor(56, 142, 60);
        pdf.text(brandRight, brandStartX + brandLeftWidth, 12);
        
        // Add title
        const statusLabel = stockStatusFilter === 'all' ? 'All Products' 
          : stockStatusFilter === 'instock' ? 'In Stock Products'
          : stockStatusFilter === 'lowstock' ? 'Low Stock Products'
          : 'Out of Stock Products';
        
        pdf.setFontSize(12);
        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0);
        pdf.text('Stock Management Report', centerX, 21, { align: 'center' });
        
        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(`Status: ${statusLabel}`, centerX, 28, { align: 'center' });
        pdf.text(`Generated: ${new Date().toLocaleString()}`, centerX, 33, { align: 'center' });
        pdf.setTextColor(0);

        // Prepare table data - exclude Actions column
        const tableData = filteredProducts.map(product => {
          const status = getStockStatus(product);
          const effStock = getEffectiveStock(product);
          const productCode = product.productCode || product.sourceCode || product.code || '-';
          return [
            product.name,
            productCode,
            product.category,
            effStock,
            status.label,
          ];
        });

        // Generate table
        autoTable(pdf, {
          startY: 40,
          head: [['Product Name', 'Product Code', 'Category', 'Current Stock', 'Status']],
          body: tableData,
          theme: 'grid',
          headStyles: {
            fillColor: [91, 75, 138],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center',
            padding: 8,
          },
          bodyStyles: {
            textColor: 50,
            padding: 7,
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245],
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 'auto' },
            1: { halign: 'center', cellWidth: 30 },
            2: { halign: 'center', cellWidth: 30 },
            3: { halign: 'center', cellWidth: 25 },
            4: { halign: 'center', cellWidth: 25 },
          },
          margin: { left: 14, right: 14 },
        });

        // Add page numbers to all pages
        const pageCount = pdf.internal.pages.length - 1;
        for (let i = 1; i <= pageCount; i++) {
          pdf.setPage(i);
          pdf.setFontSize(10);
          pdf.setTextColor(150);
          pdf.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        }

        // Generate filename with date
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `stocks-${statusLabel.toLowerCase().replace(/\s+/g, '-')}-${dateStr}.pdf`;
        
        pdf.save(filename);
        notifySuccess(`📥 Stock report downloaded: ${filename}`, 3000);
      };
      img.src = logo;
    } catch (err) {
      console.error('Error generating PDF:', err);
      notifyError('Failed to generate PDF', 3000);
    }
  };

  useEffect(() => {
    const handleLeftCtrlClear = (event) => {
      if (event.repeat) return;

      const isLeftCtrl = event.code === 'ControlLeft' || (event.key === 'Control' && event.location === 1);
      if (!isLeftCtrl) return;
      if (!searchTerm) return;

      event.preventDefault();
      clearSearch();
    };

    window.addEventListener('keydown', handleLeftCtrlClear);

    return () => {
      window.removeEventListener('keydown', handleLeftCtrlClear);
    };
  }, [searchTerm]);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // Handle category change
  const handleCategoryChange = (category) => {
    setFilterCategory(category);
    setCurrentPage(1); // Reset to page 1
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Loading Indicator */}
      {loading && allProducts.length === 0 && (
        <div style={{backgroundColor: '#e7f3ff', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <i className="fas fa-spinner fa-spin"></i>
          <span>Loading products...</span>
        </div>
      )}

      {/* Filters */}
      <div
        ref={filterBarRef}
        style={{
        backgroundColor: '#fff',
        position: 'fixed',
        top: `${filterBarLayout.top}px`,
        left: `${filterBarLayout.left}px`,
        width: `${filterBarLayout.width}px`,
        zIndex: 80,
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        border: '1px solid #eee',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <i className="fas fa-warehouse" style={{ color: '#5B4B8A' }}></i>
            Stock Management
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {canManageStocks && (
              <button
                onClick={downloadStocksPDF}
                title="Download stocks as PDF"
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#5B4B8A',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => e.target.style.opacity = '0.8'}
                onMouseOut={(e) => e.target.style.opacity = '1'}
              >
                <i className="fas fa-file-pdf"></i>
                Download PDF
              </button>
            )}
            <span style={{ color: '#666', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fas fa-filter" style={{ color: '#5B4B8A' }}></i>
              Filters
            </span>
          </div>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
        }}>
          <div>
            <label style={{
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <i className="fas fa-search" style={{ color: '#5B4B8A' }}></i>
              Search Product
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search by product name or code..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="admin-filter-input"
                style={{
                  width: '100%',
                  padding: '0.55rem 2.25rem 0.55rem 0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  title="Clear search (Left Ctrl)"
                  aria-label="Clear search"
                  style={{
                    position: 'absolute',
                    right: '0.45rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#e9ecef',
                    color: '#555',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.85rem',
                    padding: 0,
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <i className="fas fa-folder" style={{ color: '#5B4B8A' }}></i>
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="admin-filter-select"
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <i className="fas fa-bell" style={{ color: '#5B4B8A' }}></i>
              Low Stock Rule
            </label>
            <div
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '0.9rem',
                color: '#666',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              Per-product threshold. Edit via each row's Override button.
            </div>
          </div>
          <div>
            <label style={{
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <i className="fas fa-layer-group" style={{ color: '#5B4B8A' }}></i>
              Stock Status
            </label>
            <select
              value={stockStatusFilter}
              onChange={(e) => {
                setStockStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="admin-filter-select"
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Stock Status</option>
              <option value="instock">In Stock</option>
              <option value="lowstock">Low Stock</option>
              <option value="outofstock">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ height: `${Math.max(filterBarHeight - 16, 0)}px` }}></div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        {(() => {
          // use filteredProducts (all results matching current filters) instead
          // of just the current page; otherwise the stats cards showed only 20
          // items at a time and the total count was always "0" because `products`
          // state was never set.
          const { outOfStock, lowStock, inStock } = (() => {
            const source = filteredProducts; // includes any search/category filters
            return {
              outOfStock: source.filter(p => resolveStockStatus(p) === 'out_of_stock'),
              lowStock: source.filter(p => resolveStockStatus(p) === 'low_stock'),
              inStock: source.filter(p => resolveStockStatus(p) === 'in_stock'),
            };
          })();
          return (
            <>
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                borderLeft: '4px solid #2196F3',
              }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fas fa-cubes" style={{ color: '#2196F3' }}></i>
                  Total Products
                </p>
                <h3 style={{ margin: 0, color: '#2196F3', fontSize: '2rem' }}>{filteredProducts.length}</h3>
              </div>
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                borderLeft: '4px solid #388e3c',
              }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fas fa-check-circle" style={{ color: '#388e3c' }}></i>
                  In Stock
                </p>
                <h3 style={{ margin: 0, color: '#388e3c', fontSize: '2rem' }}>{inStock.length}</h3>
              </div>
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                borderLeft: '4px solid #f57c00',
              }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fas fa-exclamation-circle" style={{ color: '#f57c00' }}></i>
                  Low Stock
                </p>
                <h3 style={{ margin: 0, color: '#f57c00', fontSize: '2rem' }}>{lowStock.length}</h3>
              </div>
              <div style={{
                backgroundColor: '#fff',
                borderRadius: '8px',
                padding: '1.5rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                borderLeft: '4px solid #d32f2f',
              }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <i className="fas fa-ban" style={{ color: '#d32f2f' }}></i>
                  Out of Stock
                </p>
                <h3 style={{ margin: 0, color: '#d32f2f', fontSize: '2rem' }}>{outOfStock.length}</h3>
              </div>
            </>
          );
        })()}
      </div>

      {/* Products Table */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        overflowX: 'auto',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
            <tr>
              <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.95rem' }}>
                Product Name
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                Product Code
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                Category
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                POS Stock
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                Effective Stock
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                Status
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map((product) => {
                const effStock = getEffectiveStock(product);
                const posStockVal = product.posStock != null ? product.posStock : product.stock;
                const status = getStockStatus(product);
                const productCode = product.productCode || product.sourceCode || product.code;
                const hasOverride = product.overrideActive && product.overrideStock != null;
                const threshold = resolveLowStockThreshold(product);
                const rowTheme = (() => {
                  if (!isAdminDarkTheme) {
                    return {
                      backgroundColor:
                        status.label === 'Out of Stock'
                          ? '#ffebee'
                          : status.label === 'Low Stock'
                            ? '#fff3e0'
                            : '#fff',
                      textColor: '#111827',
                      mutedTextColor: '#666',
                      codeBackground: '#f5f5f5',
                    };
                  }

                  return {
                    backgroundColor:
                      status.label === 'Out of Stock'
                        ? '#271818'
                        : status.label === 'Low Stock'
                          ? '#272218'
                          : '#1e1e1e',
                    textColor: '#f8fafc',
                    mutedTextColor: '#cbd5e1',
                    codeBackground: '#252525',
                  };
                })();
                return (
                  <tr
                    key={product.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: rowTheme.backgroundColor,
                      color: rowTheme.textColor,
                    }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <strong style={{ color: rowTheme.textColor }}>{product.name}</strong>
                      {hasOverride && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '10px', backgroundColor: '#e8d5ff', color: '#5B4B8A', fontWeight: '700', verticalAlign: 'middle' }}>OVERRIDE</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: rowTheme.mutedTextColor, fontSize: '0.9rem' }}>
                      {productCode ? (
                        <span style={{
                          backgroundColor: rowTheme.codeBackground,
                          color: rowTheme.mutedTextColor,
                          borderRadius: '4px',
                          padding: '0.2rem 0.4rem',
                          fontFamily: 'monospace',
                          fontSize: '0.82rem',
                        }}>
                          {productCode}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: rowTheme.mutedTextColor, fontSize: '0.9rem' }}>
                      {product.category}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      fontWeight: '600',
                      fontSize: '1rem',
                      color: rowTheme.mutedTextColor,
                    }}>
                      {posStockVal}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      fontWeight: '700',
                      fontSize: '1.1rem',
                      color: hasOverride ? '#5B4B8A' : rowTheme.textColor,
                    }}>
                      {effStock}
                      {hasOverride && (
                        <div style={{ fontSize: '0.72rem', color: '#5B4B8A', fontWeight: '500' }}>override</div>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '20px',
                        backgroundColor: status.color + '20',
                        color: status.color,
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        justifyContent: 'center',
                      }}>
                        <i className={`fas ${
                          status.label === 'Out of Stock' ? 'fa-ban' :
                          status.label === 'Low Stock' ? 'fa-exclamation-circle' :
                          'fa-check-circle'
                        }`}></i>
                        {status.label}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: rowTheme.mutedTextColor, marginTop: '0.35rem' }}>
                        Threshold: {threshold}
                      </div>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                      }}>
                        {canManageStocks && (
                          <button
                            onClick={() => openOverrideModal(product)}
                            title="Set Website Stock Override"
                            style={{
                              padding: '0.35rem 0.6rem',
                              borderRadius: '4px',
                              border: hasOverride ? '2px solid #5B4B8A' : '1px solid #5B4B8A',
                              backgroundColor: hasOverride ? '#5B4B8A' : '#fff',
                              color: hasOverride ? '#fff' : '#5B4B8A',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <i className="fas fa-sliders-h"></i>
                            Override
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                  No products found matching your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* Stock Action Modal */}
      {showActionModal && selectedProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            padding: '2rem',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}>
            <h2 style={{ margin: '0 0 1rem 0', color: '#333', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className={`fas ${actionType === 'add' ? 'fa-plus' : 'fa-minus'}`} style={{ color: actionType === 'add' ? '#4CAF50' : '#f44336' }}></i>
              {actionType === 'add' ? 'Add Stock' : 'Remove Stock'}
            </h2>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ margin: '0 0 0.5rem 0', color: '#666' }}>
                <strong>Product:</strong> {selectedProduct.name}
              </p>
              <p style={{ margin: '0 0 1rem 0', color: '#666' }}>
                <strong>Current Stock:</strong> {selectedProduct.stock} units
              </p>

              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '600',
                color: '#333',
              }}>
                Quantity
              </label>
              <input
                type="number"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '1rem',
                  marginBottom: '1rem',
                }}
                min="0"
                placeholder="Enter quantity"
                autoFocus
              />

              {actionType === 'subtract' && (
                <p style={{
                  margin: '0.5rem 0 0 0',
                  color: '#f57c00',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}>
                  New stock: {Math.max(0, selectedProduct.stock - stockQuantity)}
                </p>
              )}
              {actionType === 'add' && (
                <p style={{
                  margin: '0.5rem 0 0 0',
                  color: '#4CAF50',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                }}>
                  New stock: {selectedProduct.stock + stockQuantity}
                </p>
              )}
            </div>

            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={closeStockModal}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#eee'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              >
                <i className="fas fa-x"></i>
                Cancel
              </button>
              <button
                onClick={handleStockAction}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: actionType === 'add' ? '#4CAF50' : '#f44336',
                  color: '#fff',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseOver={(e) => e.target.style.opacity = '0.9'}
                onMouseOut={(e) => e.target.style.opacity = '1'}
              >
                <i className={`fas ${actionType === 'add' ? 'fa-check' : 'fa-check'}`}></i>
                {actionType === 'add' ? 'Add Stock' : 'Remove Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Website Stock Override Modal */}
      {showOverrideModal && overrideProduct && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '10px',
            padding: '2rem',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          }}>
            <h2 style={{ margin: '0 0 0.25rem 0', color: '#5B4B8A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className="fas fa-sliders-h"></i>
              Website Stock Override
            </h2>
            <p style={{ margin: '0 0 1.25rem 0', color: '#888', fontSize: '0.88rem' }}>
              POS stock is read-only and will continue syncing. This override only affects what customers see and can order online.
            </p>

            {/* Info row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem',
              marginBottom: '1.25rem',
            }}>
              <div style={{ backgroundColor: '#f5f5f5', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.2rem' }}>Product</div>
                <div style={{ fontWeight: '700', color: '#333', fontSize: '0.9rem' }}>{overrideProduct.name}</div>
              </div>
              <div style={{ backgroundColor: '#e8f5e9', borderRadius: '6px', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.2rem' }}>POS Stock (read-only)</div>
                <div style={{ fontWeight: '700', color: '#2e7d32', fontSize: '1.1rem' }}>
                  {overrideProduct.posStock != null ? overrideProduct.posStock : overrideProduct.stock}
                </div>
              </div>
            </div>

            {/* Override Active Toggle */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontWeight: '600', color: '#333', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={pendingOverrideActive}
                  onChange={(e) => {
                    setPendingOverrideActive(e.target.checked);
                    if (!e.target.checked) setPendingOverrideStock('');
                  }}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#5B4B8A' }}
                />
                Override Active
                <span style={{
                  padding: '0.15rem 0.6rem',
                  borderRadius: '10px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  backgroundColor: pendingOverrideActive ? '#5B4B8A' : '#eee',
                  color: pendingOverrideActive ? '#fff' : '#888',
                }}>
                  {pendingOverrideActive ? 'ON' : 'OFF'}
                </span>
              </label>
              {!pendingOverrideActive && (
                <p style={{ margin: '0.4rem 0 0 0', color: '#888', fontSize: '0.82rem' }}>
                  When off, the storefront uses POS Stock ({overrideProduct.posStock != null ? overrideProduct.posStock : overrideProduct.stock} units) directly.
                </p>
              )}
            </div>

            {/* Override Stock Input (only shown when active) */}
            {pendingOverrideActive && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontWeight: '600', color: '#333', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                  Website Stock Override
                </label>
                <input
                  type="number"
                  min="0"
                  value={pendingOverrideStock}
                  onChange={(e) => setPendingOverrideStock(e.target.value)}
                  placeholder="Enter override quantity"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '4px',
                    border: '2px solid #5B4B8A',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    color: '#5B4B8A',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ margin: '0.4rem 0 0 0', color: '#888', fontSize: '0.82rem' }}>
                  Customers will see this as the available quantity. Must be ≥ 0.
                </p>
              </div>
            )}

            {/* Override Reason */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#333', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Override Reason <span style={{ color: '#aaa', fontWeight: '400' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={pendingOverrideReason}
                onChange={(e) => setPendingOverrideReason(e.target.value)}
                placeholder="e.g. reserved for pre-orders, damaged batch excluded"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '0.95rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Effective Stock Preview */}
            <div style={{
              backgroundColor: pendingOverrideActive ? '#ede7f6' : '#e8f5e9',
              border: `1px solid ${pendingOverrideActive ? '#5B4B8A' : '#388e3c'}`,
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>Effective Website Stock</span>
              <span style={{ fontWeight: '800', fontSize: '1.4rem', color: pendingOverrideActive ? '#5B4B8A' : '#2e7d32' }}>
                {pendingOverrideActive && pendingOverrideStock !== ''
                  ? parseInt(pendingOverrideStock) >= 0 ? parseInt(pendingOverrideStock) : '—'
                  : (overrideProduct.posStock != null ? overrideProduct.posStock : overrideProduct.stock)
                }
              </span>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontWeight: '600', color: '#333', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                Low Stock Threshold
              </label>
              <input
                type="number"
                min="0"
                value={pendingLowStockThreshold}
                onChange={(e) => setPendingLowStockThreshold(e.target.value)}
                placeholder="Enter product threshold"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '1rem',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ margin: '0.4rem 0 0 0', color: '#888', fontSize: '0.82rem' }}>
                Low stock status triggers when Effective Website Stock is less than or equal to this threshold.
              </p>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={closeOverrideModal}
                disabled={isSubmittingOverride}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOverride}
                disabled={
                  isSubmittingOverride
                  || (pendingOverrideActive && (pendingOverrideStock === '' || parseInt(pendingOverrideStock, 10) < 0))
                  || pendingLowStockThreshold === ''
                  || Number.isNaN(parseInt(pendingLowStockThreshold, 10))
                  || parseInt(pendingLowStockThreshold, 10) < 0
                }
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#5B4B8A',
                  color: '#fff',
                  fontWeight: '700',
                  cursor: isSubmittingOverride ? 'not-allowed' : 'pointer',
                  opacity: isSubmittingOverride ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <i className="fas fa-save"></i>
                {isSubmittingOverride ? 'Saving...' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStocks;
