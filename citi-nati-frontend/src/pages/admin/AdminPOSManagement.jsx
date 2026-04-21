import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { formatMWK } from '../../utils/currency.js';
import Pagination from '../../components/ui/Pagination.jsx';
import { getSocket } from '../../utils/socket.js';
import { filterProductsForOperationalLocation } from '../../utils/operationalScope.js';
import '../../styles/global.css';

/**
 * AdminPOSManagement - Professional POS Products Management Panel
 * 
 * Features:
 * - View all POS synced products with pagination
 * - Search products by name, sourceCode, or category
 * - Filter by category with visual pills
 * - Toggle visibility (hide/show from products page)
 * - Bulk actions: hide/unhide, delete selected products
 * - Delete all POS products at once
 * - Real-time updates via Socket.io
 * - Professional responsive design with icons
 * - Stats cards showing product overview
 */

const AdminPOSManagement = ({
  selectedLocationCode = 'BT',
  cachedProducts = [],
  cachedProductsMeta = {},
  onRefreshProductsCache,
}) => {
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const searchTimeoutRef = useRef(null);
  const filterBarRef = useRef(null);
  const fetchRequestIdRef = useRef(null);
  const { modal, closeModal, showError, showSuccess, showConfirm } = useModal();

  const applyCategoryFilter = (items, categoryFilter = 'all') => {
    if (!categoryFilter || categoryFilter === 'all') {
      return items;
    }
    return items.filter((item) => item.category === categoryFilter);
  };

  const hasSharedProductsCache = Array.isArray(cachedProducts) && (
    cachedProducts.length > 0
    || Boolean(cachedProductsMeta?.lastLoadedAt)
    || Boolean(cachedProductsMeta?.isLoading)
    || Boolean(cachedProductsMeta?.isBackgroundLoading)
  );

  /**
   * Fetch POS products with search and pagination
   */
  const fetchProducts = async (searchValue = '', pageNum = 1, categoryFilter = 'all') => {
    const requestId = Date.now();
    fetchRequestIdRef.current = requestId;

    try {
      // only show spinner if we have no data yet
      if (products.length === 0) setLoading(true);
      setError(null);
      setSelectedProducts(new Set());
      setPage(pageNum);

      const perPage = 100;
      const fetchProductsPage = async (pageNumber) => {
        const params = new URLSearchParams();
        if (searchValue) params.append('search', searchValue);
        params.append('page', String(pageNumber));
        params.append('limit', String(perPage));
        if (selectedLocationCode) {
          params.append('locationCode', selectedLocationCode);
        }
        return api.get(`/admin/pos-products?${params.toString()}`);
      };

      const syncLocalState = (allItems) => {
        const scopedItems = filterProductsForOperationalLocation(allItems, selectedLocationCode);
        const uniqueCategories = [...new Set(scopedItems.map((p) => p.category).filter(Boolean))];
        setCategories(uniqueCategories.sort());

        const filteredItems = applyCategoryFilter(scopedItems, categoryFilter);
        const nextTotalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));

        setProducts(filteredItems);
        setTotal(filteredItems.length);
        setTotalPages(nextTotalPages);
        setPage((prevPage) => Math.min(prevPage, nextTotalPages));
      };

      if (hasSharedProductsCache) {
        const normalizedSearch = String(searchValue || '').trim().toLowerCase();
        const posScopedCachedProducts = cachedProducts.filter((product) => {
          const sourceCode = String(product?.sourceCode || product?.productCode || '').trim();
          return Boolean(sourceCode);
        });
        const allItems = normalizedSearch
          ? posScopedCachedProducts.filter((product) => {
              const name = String(product?.name || '').toLowerCase();
              const code = String(product?.sourceCode || product?.productCode || '').toLowerCase();
              const category = String(product?.category || '').toLowerCase();
              return name.includes(normalizedSearch) || code.includes(normalizedSearch) || category.includes(normalizedSearch);
            })
          : posScopedCachedProducts;

        if (fetchRequestIdRef.current !== requestId) {
          return;
        }

        syncLocalState(allItems);
        setError(cachedProductsMeta?.error || null);
        setLoading(Boolean(cachedProductsMeta?.isLoading && allItems.length === 0));
        return;
      }

      const firstResponse = await fetchProductsPage(1);
      if (!firstResponse?.data?.success) {
        setProducts([]);
        setCategories([]);
        setTotal(0);
        setTotalPages(1);
        return;
      }

      let allItems = filterProductsForOperationalLocation(
        Array.isArray(firstResponse.data.products) ? firstResponse.data.products : [],
        selectedLocationCode
      );
      if (fetchRequestIdRef.current !== requestId) {
        return;
      }

      syncLocalState(allItems);
      setLoading(false);

      const knownTotal = Number(firstResponse.data.total || 0);
      if (allItems.length >= perPage && knownTotal > allItems.length) {
        (async () => {
          try {
            let nextPage = 2;
            while (true) {
              const response = await fetchProductsPage(nextPage);
              if (!response?.data?.success) {
                break;
              }

              const pageItems = Array.isArray(response.data.products) ? response.data.products : [];
              if (pageItems.length === 0) {
                break;
              }

              allItems = filterProductsForOperationalLocation(allItems.concat(pageItems), selectedLocationCode);
              if (fetchRequestIdRef.current !== requestId) {
                return;
              }

              syncLocalState(allItems);

              if (pageItems.length < perPage) {
                break;
              }

              nextPage += 1;
            }
          } catch (bgErr) {
            console.warn('[AdminPOS] Background products loading error:', bgErr.message);
          }
        })();
      }
    } catch (err) {
      console.error('Error fetching POS products:', err);
      setError(err.message);
      setProducts([]);
      setCategories([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Real-time socket updates for product visibility changes
   */
  useEffect(() => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[AdminPOS] Socket not initialized');
        return;
      }

      const handleProductUpdate = (updatedProduct) => {
        // Update product in list if visibility changed
        setProducts(prevProducts =>
          prevProducts.map(p =>
            p.id === updatedProduct.id
              ? { ...p, hideFromProductsPage: updatedProduct.hideFromProductsPage }
              : p
          )
        );
      };

      socket.on('product_updated', handleProductUpdate);
      console.log('[AdminPOS] Socket listener attached');

      return () => {
        socket.off('product_updated', handleProductUpdate);
      };
    } catch (err) {
      console.error('[AdminPOS] Socket setup error:', err);
    }
  }, []);

  // Handle search with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setPage(1);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce the search by 300ms (no delay for clearing)
    if (value === '') {
      fetchProducts('', 1, selectedCategory);
    } else {
      searchTimeoutRef.current = setTimeout(() => {
        fetchProducts(value, 1, selectedCategory);
      }, 300);
    }
  };

  const clearSearch = () => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearchTerm('');
    setPage(1);
    fetchProducts('', 1, selectedCategory);
  };

  useEffect(() => {
    const handleRightCtrlClear = (event) => {
      if (event.repeat) return;
      const isLeftCtrl = event.code === 'ControlLeft' || (event.key === 'Control' && event.location === 1);
      if (!isLeftCtrl) return;
      if (!searchTerm) return;

      event.preventDefault();
      clearSearch();
    };

    window.addEventListener('keydown', handleRightCtrlClear);

    return () => {
      window.removeEventListener('keydown', handleRightCtrlClear);
    };
  }, [searchTerm, selectedCategory]);

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

  // Handle category filter
  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    setPage(1);
    fetchProducts(searchTerm, 1, category);
  };

  // Initial fetch
  useEffect(() => {
    fetchProducts('', 1, 'all');
  }, [selectedLocationCode]);

  useEffect(() => {
    if (!hasSharedProductsCache) return;
    fetchProducts(searchTerm, 1, selectedCategory);
  }, [cachedProducts, cachedProductsMeta, hasSharedProductsCache]);

  // Handle pagination
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  // Toggle product selection
  const toggleProduct = (productId) => {
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Toggle all products on current page
  const toggleAllProducts = () => {
    const selectedOnPageCount = paginatedProducts.filter((product) => selectedProducts.has(product.id)).length;

    if (selectedOnPageCount === paginatedProducts.length && paginatedProducts.length > 0) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(paginatedProducts.map((p) => p.id)));
    }
  };

  /**
   * Bulk hide/unhide all selected products
   */
  const handleBulkVisibilityChange = async (hideFromProducts) => {
    if (selectedProducts.size === 0) {
      showError('No products selected');
      return;
    }

    const action = hideFromProducts ? 'hide' : 'unhide';
    const title = hideFromProducts ? '🙈 Hide Products?' : '👁️ Show Products?';
    const message = `${hideFromProducts ? 'Hide' : 'Show'} ${selectedProducts.size} product(s)? This will ${action} them from the products page.`;

    showConfirm(
      title,
      message,
      async () => {
        try {
          setLoading(true);
          // Update each product individually
          for (const productId of selectedProducts) {
            const product = products.find(p => p.id === productId);
            if (product) {
              await api.put(`/admin/pos-products/${productId}/visibility`, {
                hideFromProductsPage: hideFromProducts,
                locationCode: selectedLocationCode,
              }, {
                params: { locationCode: selectedLocationCode },
              });
            }
          }

          // Update local state
          setProducts(prev => prev.map(p =>
            selectedProducts.has(p.id)
              ? { ...p, hideFromProductsPage: hideFromProducts }
              : p
          ));

          showSuccess(`Successfully ${action}d ${selectedProducts.size} product(s)`);
          setSelectedProducts(new Set());
        } catch (err) {
          console.error(`Error updating visibility:`, err);
          showError(err.response?.data?.error || `Failed to ${action} products`);
        } finally {
          setLoading(false);
        }
      }
    );
  };

  /**
   * Toggle product visibility (hide/show from products page)
   */
  const handleToggleVisibility = async (productId, hideFromProductsPage) => {
    try {
      const response = await api.put(`/admin/pos-products/${productId}/visibility`, {
        hideFromProductsPage: !hideFromProductsPage,
        locationCode: selectedLocationCode,
      }, {
        params: { locationCode: selectedLocationCode },
      });

      if (response.data.success) {
        // Update local state
        setProducts(prev => prev.map(p => 
          p.id === productId 
            ? { ...p, hideFromProductsPage: !hideFromProductsPage }
            : p
        ));
        showSuccess(response.data.message);
      }
    } catch (err) {
      console.error('Error updating visibility:', err);
      showError(err.response?.data?.error || 'Failed to update visibility');
    }
  };



  /**
   * Delete selected products
   */
  const handleDeleteSelected = async () => {
    if (selectedProducts.size === 0) {
      showError('No products selected');
      return;
    }

    const title = '⚠️ Delete Selected Products?';
    const message = `Delete ${selectedProducts.size} product(s)? This cannot be undone.`;

    showConfirm(title, message, async () => {
      try {
        setLoading(true);
        const response = await api.delete('/admin/pos-products/delete-selected', {
          params: { locationCode: selectedLocationCode },
          data: { productIds: Array.from(selectedProducts) },
        });

        if (response.data.success) {
          showSuccess(`Deleted ${response.data.deletedCount} products`);
          setSelectedProducts(new Set());
          if (typeof onRefreshProductsCache === 'function') {
            await onRefreshProductsCache();
          }
          fetchProducts(searchTerm, page, selectedCategory);
        }
      } catch (err) {
        console.error('Error deleting products:', err);
        showError(err.response?.data?.error || 'Failed to delete products');
      } finally {
        setLoading(false);
      }
    });
  };

  /**
   * Delete all POS products
   */
  const handleDeleteAll = async () => {
    const title = '🚨 Delete All POS Products?';
    const message = `Are you sure? This will delete ALL ${total} POS products from the website. They will re-sync the next time the POS Agent runs.\n\nThis CANNOT be undone.`;

    showConfirm(title, message, async () => {
      try {
        setLoading(true);
        const response = await api.delete('/admin/pos-products/delete-all', {
          params: { locationCode: selectedLocationCode },
          data: { locationCode: selectedLocationCode },
        });

        if (response.data.success) {
          showSuccess(`Deleted all ${response.data.deletedCount} POS products`);
          setSelectedProducts(new Set());
          setPage(1);
          if (typeof onRefreshProductsCache === 'function') {
            await onRefreshProductsCache();
          }
          fetchProducts('', 1, selectedCategory);
        }
      } catch (err) {
        console.error('Error deleting all products:', err);
        showError(err.response?.data?.error || 'Failed to delete all products');
      } finally {
        setLoading(false);
      }
    });
  };

  // Calculate stats
  const paginatedProducts = products.slice((page - 1) * pageSize, page * pageSize);
  const hiddenCount = products.filter(p => p.hideFromProductsPage).length;
  const visibleCount = products.length - hiddenCount;
  const hasActiveFilters = Boolean(searchTerm) || selectedCategory !== 'all';

  return (
    <div className="admin-pos-management" style={{ width: '100%' }}>
      <div style={styles.container}>
        {/* Error Alert */}
        {error && (
          <div style={styles.errorAlert}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.75rem' }}></i>
            <span>{error}</span>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && products.length === 0 && (
          <div style={styles.loadingContainer}>
            <i className="fas fa-spinner fa-spin" style={styles.spinnerIcon}></i>
            <p>Loading POS products...</p>
          </div>
        )}

        {products.length === 0 && !loading && !hasActiveFilters ? (
          <div style={styles.emptyState}>
            <i className="fas fa-inbox" style={styles.emptyIcon}></i>
            <p style={styles.emptyText}>No POS products found</p>
          </div>
        ) : (
          <>
            {/* Search and Category Filters */}
            <div
              ref={filterBarRef}
              style={{
                ...styles.filterSection,
                position: 'fixed',
                top: `${filterBarLayout.top}px`,
                left: `${filterBarLayout.left}px`,
                width: `${filterBarLayout.width}px`,
                zIndex: 80,
                backgroundColor: '#fff',
                border: '1px solid #eee',
                borderRadius: '8px',
                padding: '1rem',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                boxSizing: 'border-box',
                marginBottom: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                <div>
                  <h1 style={{ margin: 0, color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem', fontWeight: '800' }}>
                    <i className="fas fa-boxes" style={{ color: '#5B4B8A' }}></i>
                    POS Products Management
                  </h1>
                  <p style={{ margin: '0.35rem 0 0 0', color: '#666', display: 'flex', alignItems: 'center', fontSize: '0.92rem' }}>
                    <i className="fas fa-info-circle" style={{ marginRight: '0.5rem' }}></i>
                    Manage which POS synced products appear on your website
                  </p>
                </div>
              </div>
              <div style={{display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap'}}>
                {/* Search Box */}
                <div style={styles.searchBoxWrapper}>
                  <i className="fas fa-search" style={styles.searchIcon}></i>
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    style={styles.searchInput}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      title="Clear search (Left Ctrl)"
                      aria-label="Clear search"
                      style={styles.clearSearchButton}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>

                {/* Category Dropdown */}
                {categories.length > 0 && (
                  <div style={styles.categoryDropdownWrapper}>
                    <label style={styles.categoryDropdownLabel}>
                      <i className="fas fa-filter" style={{ marginRight: '0.5rem' }}></i>
                      Category:
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      style={styles.categoryDropdown}
                    >
                      <option value="all">All Categories</option>
                      {categories.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: `${Math.max(filterBarHeight - 8, 0)}px` }}></div>

            {/* Stats Cards */}
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={{...styles.statIcon, backgroundColor: '#2196F3'}}>
                  <i className="fas fa-cube"></i>
                </div>
                <div>
                  <p style={styles.statLabel}>Total Products</p>
                  <h3 style={styles.statValue}>{total}</h3>
                </div>
              </div>
              <div style={styles.statCard}>
                <div style={{...styles.statIcon, backgroundColor: '#28a745'}}>
                  <i className="fas fa-eye"></i>
                </div>
                <div>
                  <p style={styles.statLabel}>Visible</p>
                  <h3 style={styles.statValue}>{visibleCount}</h3>
                </div>
              </div>
              <div style={styles.statCard}>
                <div style={{...styles.statIcon, backgroundColor: '#ffc107'}}>
                  <i className="fas fa-eye-slash"></i>
                </div>
                <div>
                  <p style={styles.statLabel}>Hidden</p>
                  <h3 style={styles.statValue}>{hiddenCount}</h3>
                </div>
              </div>
              <div style={styles.statCard}>
                <div style={{...styles.statIcon, backgroundColor: '#6f42c1'}}>
                  <i className="fas fa-check"></i>
                </div>
                <div>
                  <p style={styles.statLabel}>Selected</p>
                  <h3 style={styles.statValue}>{selectedProducts.size}</h3>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={styles.actionButtons}>
              {selectedProducts.size > 0 && (
                <>
                  <button
                    onClick={() => handleBulkVisibilityChange(true)}
                    style={{
                      ...styles.actionButton,
                      ...styles.hideButton,
                    }}
                  >
                    <i className="fas fa-eye-slash" style={{ marginRight: '0.5rem' }}></i>
                    Hide Selected ({selectedProducts.size})
                  </button>
                  <button
                    onClick={() => handleBulkVisibilityChange(false)}
                    style={{
                      ...styles.actionButton,
                      ...styles.showButton,
                    }}
                  >
                    <i className="fas fa-eye" style={{ marginRight: '0.5rem' }}></i>
                    Show Selected ({selectedProducts.size})
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    style={{
                      ...styles.actionButton,
                      ...styles.deleteButton,
                    }}
                  >
                    <i className="fas fa-trash" style={{ marginRight: '0.5rem' }}></i>
                    Delete Selected ({selectedProducts.size})
                  </button>
                </>
              )}
              <button
                onClick={handleDeleteAll}
                style={{
                  ...styles.actionButton,
                  ...styles.deleteAllButton,
                }}
              >
                <i className="fas fa-nuclear" style={{ marginRight: '0.5rem' }}></i>
                Delete All ({total})
              </button>
            </div>

            {/* Table */}
            {products.length === 0 ? (
              <div style={styles.emptyState}>
                <i className="fas fa-search" style={styles.emptyIcon}></i>
                <p style={styles.emptyText}>No products match your current search or filters</p>
              </div>
            ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr style={styles.headerRow}>
                    <th style={{ ...styles.cell, ...styles.checkboxCell }}>
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === products.length && products.length > 0}
                        onChange={toggleAllProducts}
                        style={styles.checkbox}
                        title="Select all products on this page"
                      />
                    </th>
                    <th style={{ ...styles.cell, ...styles.nameCell }}>
                      <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>
                      Product Name
                    </th>
                    <th style={{ ...styles.cell, ...styles.sourceCodeCell }}>
                      <i className="fas fa-barcode" style={{ marginRight: '0.5rem' }}></i>
                      Source Code
                    </th>
                    <th style={{ ...styles.cell, ...styles.categoryCell }}>
                      <i className="fas fa-tag" style={{ marginRight: '0.5rem' }}></i>
                      Category
                    </th>
                    <th style={{ ...styles.cell, ...styles.priceCell }}>
                      <i className="fas fa-dollar-sign" style={{ marginRight: '0.5rem' }}></i>
                      Price
                    </th>
                    <th style={{ ...styles.cell, ...styles.stockCell }}>
                      <i className="fas fa-warehouse" style={{ marginRight: '0.5rem' }}></i>
                      Stock
                    </th>
                    <th style={{ ...styles.cell, ...styles.visibilityCell }}>
                      <i className="fas fa-eye" style={{ marginRight: '0.5rem' }}></i>
                      Visibility
                    </th>
                    <th style={{ ...styles.cell, ...styles.actionsHeaderCell }}>
                      <i className="fas fa-cog" style={{ marginRight: '0.5rem' }}></i>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProducts.map((product) => (
                    <tr key={product.id} style={{
                      ...styles.bodyRow,
                      backgroundColor: selectedProducts.has(product.id) ? '#f0f8ff' : 'transparent',
                    }}>
                      <td style={{ ...styles.cell, ...styles.checkboxCell }}>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => toggleProduct(product.id)}
                          style={styles.checkbox}
                        />
                      </td>
                      <td style={{ ...styles.cell, ...styles.nameCell }}>
                        <div style={styles.productName}>
                          <i className="fas fa-box" style={{ marginRight: '0.5rem', color: '#5B4B8A' }}></i>
                          {product.name}
                        </div>
                      </td>
                      <td style={{ ...styles.cell, ...styles.sourceCodeCell }}>
                        <code style={styles.sourceCode}>{product.sourceCode}</code>
                      </td>
                      <td style={{ ...styles.cell, ...styles.categoryCell }}>
                        <span style={styles.categoryBadge}>
                          <i className="fas fa-tag" style={{ marginRight: '0.3rem' }}></i>
                          {product.category || 'N/A'}
                        </span>
                      </td>
                      <td style={{ ...styles.cell, ...styles.priceCell }}>
                        <span style={styles.priceValue}>{formatMWK(product.price)}</span>
                      </td>
                      <td style={{ ...styles.cell, ...styles.stockCell }}>
                        <span style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          backgroundColor: product.stock > 10 ? '#d4edda' : product.stock > 0 ? '#fff3cd' : '#f8d7da',
                          color: product.stock > 10 ? '#155724' : product.stock > 0 ? '#856404' : '#721c24',
                          fontWeight: '600',
                          fontSize: '0.82rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}>
                          <i className={`fas ${product.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {product.stock} units
                        </span>
                      </td>
                      <td style={{ ...styles.cell, ...styles.visibilityCell }}>
                        <span style={{
                          padding: '0.3rem 0.6rem',
                          borderRadius: '6px',
                          backgroundColor: product.hideFromProductsPage ? '#ffe5e5' : '#e5f5e5',
                          color: product.hideFromProductsPage ? '#c41e3a' : '#28a745',
                          fontWeight: '600',
                          fontSize: '0.82rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}>
                          <i className={`fas ${product.hideFromProductsPage ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                          {product.hideFromProductsPage ? 'HIDDEN' : 'VISIBLE'}
                        </span>
                      </td>
                      <td style={{ ...styles.cell, ...styles.actionsCell }}>
                        <div style={styles.actionCell}>
                          <button
                            onClick={() => handleToggleVisibility(product.id, product.hideFromProductsPage)}
                            title={product.hideFromProductsPage ? 'Show on products page' : 'Hide from products page'}
                            style={{
                              ...styles.iconButton,
                              backgroundColor: product.hideFromProductsPage ? '#28a745' : '#ffc107',
                              borderColor: product.hideFromProductsPage ? '#218838' : '#e0a800',
                            }}
                          >
                            <i className={`fas ${product.hideFromProductsPage ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            {/* Pagination */}
            <div style={styles.pagination}>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                style={{ ...styles.paginationButton, opacity: page === 1 ? 0.5 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                <i className="fas fa-chevron-left" style={{ marginRight: '0.5rem' }}></i>
                Previous
              </button>

              <div style={styles.pageInfo}>
                <i className="fas fa-file-alt" style={{ marginRight: '0.5rem' }}></i>
                Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total products)
              </div>

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                style={{ ...styles.paginationButton, opacity: page === totalPages ? 0.5 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
                <i className="fas fa-chevron-right" style={{ marginLeft: '0.5rem' }}></i>
              </button>
            </div>
          </>
        )}
      </div>
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

const styles = {
  container: {
    padding: '1rem',
    maxWidth: 'none',
    width: '100%',
    margin: 0,
  },
  header: {
    marginBottom: '2.5rem',
  },
  headerTop: {
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: '800',
    margin: '0 0 0.75rem 0',
    color: '#2c3e50',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  titleIcon: {
    color: '#5B4B8A',
    fontSize: '2.2rem',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#666',
    margin: '0',
    display: 'flex',
    alignItems: 'center',
  },
  errorAlert: {
    padding: '1rem 1.25rem',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.95rem',
  },
  loadingContainer: {
    padding: '3rem 2rem',
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '2rem',
  },
  spinnerIcon: {
    fontSize: '2.5rem',
    color: '#5B4B8A',
    marginBottom: '1rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1.5rem',
    marginBottom: '2.5rem',
  },
  statCard: {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    padding: '1.5rem',
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'all 0.3s ease',
  },
  statIcon: {
    width: '60px',
    height: '60px',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    color: '#fff',
  },
  statLabel: {
    margin: '0',
    fontSize: '0.9rem',
    color: '#666',
    fontWeight: '500',
  },
  statValue: {
    margin: '0.25rem 0 0 0',
    fontSize: '2rem',
    fontWeight: '800',
    color: '#2c3e50',
  },
  filterSection: {
    marginBottom: '2rem',
  },
  searchBoxWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: '0 0 350px',
  },
  searchIcon: {
    position: 'absolute',
    left: '1rem',
    color: '#999',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '0.75rem 2.75rem 0.75rem 2.75rem',
    fontSize: '0.95rem',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
    backgroundColor: '#fff',
  },
  clearSearchButton: {
    position: 'absolute',
    right: '0.6rem',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#f1f3f5',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    padding: 0,
  },
  categoryDropdownWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: '0 0 auto',
  },
  categoryDropdownLabel: {
    fontWeight: '600',
    color: '#333',
    fontSize: '0.95rem',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    margin: '0',
  },
  categoryDropdown: {
    padding: '0.75rem 1rem',
    fontSize: '0.95rem',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: '500',
    transition: 'all 0.3s ease',
    minWidth: '200px',
  },
  actionButtons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
    marginBottom: '2rem',
  },
  actionButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  },
  hideButton: {
    backgroundColor: '#ffc107',
    borderColor: '#e0a800',
  },
  showButton: {
    backgroundColor: '#28a745',
    borderColor: '#1e7e34',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    borderColor: '#bd2130',
  },
  deleteAllButton: {
    backgroundColor: '#6f42c1',
    borderColor: '#5a32a3',
  },
  emptyState: {
    padding: '3rem 2rem',
    textAlign: 'center',
    color: '#999',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  emptyIcon: {
    fontSize: '3rem',
    color: '#ddd',
    marginBottom: '1rem',
    display: 'block',
  },
  emptyText: {
    fontSize: '1.1rem',
    margin: '0',
  },
  tableWrapper: {
    overflowX: 'auto',
    marginBottom: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    position: 'relative',
    width: '100%',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#fff',
    tableLayout: 'auto',
  },
  headerRow: {
    backgroundColor: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
  },
  bodyRow: {
    borderBottom: '1px solid #dee2e6',
    transition: 'background-color 0.2s ease',
  },
  cell: {
    padding: '0.9rem 0.75rem',
    textAlign: 'left',
    fontSize: '0.9rem',
    color: '#333',
    verticalAlign: 'middle',
  },
  checkboxCell: {
    width: '42px',
    padding: '0.9rem 0.5rem',
    textAlign: 'center',
  },
  checkbox: {
    cursor: 'pointer',
    width: '20px',
    height: '20px',
  },
  productName: {
    fontWeight: '600',
    color: '#2c3e50',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  },
  nameCell: {
    maxWidth: '220px',
    whiteSpace: 'nowrap',
  },
  sourceCodeCell: {
    whiteSpace: 'nowrap',
    width: '1%',
  },
  categoryCell: {
    whiteSpace: 'nowrap',
  },
  priceCell: {
    whiteSpace: 'nowrap',
  },
  stockCell: {
    whiteSpace: 'nowrap',
  },
  visibilityCell: {
    whiteSpace: 'nowrap',
  },
  actionsHeaderCell: {
    position: 'sticky',
    right: 0,
    backgroundColor: '#f8f9fa',
    zIndex: 2,
    whiteSpace: 'nowrap',
    width: '1%',
  },
  sourceCode: {
    backgroundColor: '#f0f0f0',
    padding: '0.2rem 0.45rem',
    borderRadius: '4px',
    fontSize: '0.78rem',
    fontFamily: 'monospace',
    color: '#555',
  },
  categoryBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.3rem 0.55rem',
    backgroundColor: '#e8f4f8',
    color: '#0277bd',
    borderRadius: '6px',
    fontSize: '0.82rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  priceValue: {
    fontWeight: '700',
    color: '#28a745',
    fontSize: '0.92rem',
  },
  actionCell: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
  },
  actionsCell: {
    position: 'sticky',
    right: 0,
    backgroundColor: '#fff',
    zIndex: 1,
    whiteSpace: 'nowrap',
    boxShadow: '-6px 0 8px -8px rgba(0,0,0,0.25)',
  },
  iconButton: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    border: '2px solid',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    transition: 'all 0.3s ease',
    fontWeight: '600',
    color: '#fff',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '2rem',
    padding: '2rem 1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    flexWrap: 'wrap',
  },
  paginationButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.95rem',
    border: '2px solid #dee2e6',
    borderRadius: '8px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontWeight: '600',
    color: '#333',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  pageInfo: {
    fontSize: '0.95rem',
    color: '#666',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  },
};

export default AdminPOSManagement;
