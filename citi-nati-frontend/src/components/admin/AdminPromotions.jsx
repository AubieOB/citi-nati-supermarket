import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { getSocket } from '../../utils/socket.js';
import { notifySuccess, notifyError } from '../../utils/notifications.js';

/**
 * 🎯 ADMIN PROMOTIONS MANAGEMENT
 * 
 * Manage promotions for:
 * 1. All products globally
 * 2. Specific product categories
 * 3. Randomly selected products
 */

function createDefaultPromotionsState() {
  return {
    global: { enabled: false, percentage: 10 },
    category: { enabled: false, percentage: 10, categoryId: null },
    selective: { enabled: false, percentage: 10, selectedProducts: [] },
  };
}

const AdminPromotions = ({ selectedLocationCode = 'BT' }) => {
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [promotions, setPromotions] = useState(createDefaultPromotionsState);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('global');
  const [previewProducts, setPreviewProducts] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);
  const catalogRequestIdRef = useRef(null);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const textPrimary = isAdminDarkTheme ? '#f8fafc' : '#333';
  const textSecondary = isAdminDarkTheme ? '#cbd5e1' : '#666';
  const selectedLocationLabel = selectedLocationCode === 'ZA' ? 'Zomba' : 'Blantyre';

  const clearSearch = () => {
    setSearchTerm('');
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
    const cleanupSocket = setupSocketListeners();
    return () => {
      if (typeof cleanupSocket === 'function') {
        cleanupSocket();
      }
    };
  }, []);

  useEffect(() => {
    setSearchTerm('');
    setShowPreview(false);
    setPreviewProducts([]);
    setPromotions(createDefaultPromotionsState());
    fetchPromotionCatalog();
    fetchCurrentPromotions();
  }, [selectedLocationCode]);

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

  // Re-measure bar height after each render to account for content wrapping
  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  /**
   * Real-time promotion updates via Socket.io
   */
  const setupSocketListeners = () => {
    try {
      const socket = getSocket();
      if (!socket) {
        console.warn('[AdminPromotions] Socket not initialized');
        return;
      }

      const handlePromotionUpdated = (updatedPromotion) => {
        console.log('[AdminPromotions] Promotion updated via Socket.io:', updatedPromotion.type);
        setPromotions(prev => ({
          ...prev,
          [updatedPromotion.type]: updatedPromotion
        }));
      };

      socket.on('promotionUpdated', handlePromotionUpdated);
      console.log('[AdminPromotions] Socket.io listener registered for promotionUpdated');

      return () => {
        socket.off('promotionUpdated', handlePromotionUpdated);
      };
    } catch (err) {
      console.error('[AdminPromotions] Socket.io setup error:', err);
    }
  };

  const fetchPromotionCatalog = async () => {
    const requestId = Date.now();
    catalogRequestIdRef.current = requestId;

    try {
      const perPage = 100;
      const fetchProductsPage = async (pageNumber) => {
        return api.get(`/products?page=${pageNumber}&pageSize=${perPage}&locationCode=${encodeURIComponent(selectedLocationCode)}`);
      };

      const syncCatalogState = (items) => {
        const uniqueCategories = [...new Set(items.map((p) => p.category).filter(Boolean))].sort();
        setAllProducts(items);
        setCategories(uniqueCategories);
      };

      const firstResponse = await fetchProductsPage(1);
      let all = Array.isArray(firstResponse?.data?.products) ? firstResponse.data.products : [];

      if (catalogRequestIdRef.current !== requestId) {
        return;
      }

      syncCatalogState(all);

      if (all.length === perPage) {
        (async () => {
          try {
            let page = 2;
            while (true) {
              const response = await fetchProductsPage(page);
              const items = Array.isArray(response?.data?.products) ? response.data.products : [];
              if (items.length === 0) {
                break;
              }

              all = all.concat(items);
              if (catalogRequestIdRef.current !== requestId) {
                return;
              }

              syncCatalogState(all);

              if (items.length < perPage) {
                break;
              }

              page += 1;
            }
          } catch (bgErr) {
            console.warn('[AdminPromotions] Background catalog loading error:', bgErr.message);
          }
        })();
      }
    } catch (err) {
      console.error('Error fetching promotions catalog:', err);
      notifyError('Failed to load products for promotions', 3000);
    }
  };

  const fetchCurrentPromotions = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/admin/promotions?locationCode=${encodeURIComponent(selectedLocationCode)}`);
      if (response.data.promotions) {
        setPromotions(response.data.promotions);
      }
    } catch (err) {
      console.error('Error fetching promotions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePercentageChange = (type, value) => {
    const newValue = Math.max(0, Math.min(100, value));
    setPromotions(prev => ({
      ...prev,
      [type]: { ...prev[type], percentage: newValue }
    }));
  };

  const handleRandomCountChange = (value) => {
    const newValue = Math.max(1, value);
    setPromotions(prev => ({
      ...prev,
      selective: { ...prev.selective, productCount: newValue }
    }));
  };

  const handleSelectProduct = (productId) => {
    setPromotions(prev => {
      const currentSelected = prev.selective.selectedProducts || [];
      const isSelected = currentSelected.includes(productId);
      
      return {
        ...prev,
        selective: {
          ...prev.selective,
          selectedProducts: isSelected 
            ? currentSelected.filter(id => id !== productId)
            : [...currentSelected, productId]
        }
      };
    });
  };

  const handleTogglePromotion = async (type) => {
    try {
      const newPromotion = {
        ...promotions[type],
        enabled: !promotions[type].enabled
      };

      // For selective promotions, check if products are selected
      if (type === 'selective' && newPromotion.enabled && (!newPromotion.selectedProducts || newPromotion.selectedProducts.length === 0)) {
        notifyError('Please select at least one product', 3000);
        return;
      }

      // Apply promotion via API
      const response = await api.post(`/admin/promotions/${type}`, {
        ...newPromotion,
        locationCode: selectedLocationCode,
      });
      
      setPromotions(prev => ({
        ...prev,
        [type]: response.data.promotion || newPromotion
      }));

      if (newPromotion.enabled) {
        notifySuccess(`✅ Promotion activated! Prices updating...`, 3000);
      } else {
        notifySuccess(`❌ Promotion deactivated`, 3000);
      }
    } catch (err) {
      console.error('Error updating promotion:', err);
      notifyError(`Failed to update promotion: ${err.response?.data?.error || 'Unknown error'}`, 4000);
    }
  };

  const previewPromotion = async (type) => {
    try {
      const payload = {
        ...promotions[type],
        locationCode: selectedLocationCode,
      };
      
      // For selective, pass selected product IDs
      if (type === 'selective' && (!payload.selectedProducts || payload.selectedProducts.length === 0)) {
        notifyError('Please select at least one product to preview', 3000);
        return;
      }

      const response = await api.post(`/admin/promotions/${type}/preview`, payload);
      setPreviewProducts(response.data.products || []);
      setShowPreview(true);
    } catch (err) {
      console.error('Error fetching preview:', err);
      notifyError('Failed to preview products', 3000);
    }
  };

  const renderPromotionCard = (type, label, description, icon) => {
    const promo = promotions[type];
    const isActive = promo.enabled;
    const query = searchTerm.toLowerCase().trim();
    const filteredProducts = allProducts.filter((p) => {
      if (!query) return true;
      const productCode = String(p.productCode || p.sourceCode || p.code || '').toLowerCase();
      const productName = String(p.name || '').toLowerCase();
      const category = String(p.category || '').toLowerCase();
      return (
        productName.includes(query)
        || productCode.includes(query)
        || category.includes(query)
      );
    });
    const selectedCount = (promo.selectedProducts || []).length;

    return (
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        border: isActive ? '2px solid #4CAF50' : '2px solid #ddd',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}>
          <div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: textPrimary, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <i className={`fas ${icon}`} style={{ color: '#5B4B8A' }}></i>
              {label}
            </h3>
            <p style={{ margin: 0, color: textSecondary, fontSize: '0.9rem' }}>
              {description}
            </p>
          </div>
          <button
            onClick={() => handleTogglePromotion(type)}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: isActive ? '#4CAF50' : '#ccc',
              color: '#fff',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              fontSize: '0.9rem',
            }}
            onMouseOver={(e) => {
              e.target.style.opacity = '0.9';
            }}
            onMouseOut={(e) => {
              e.target.style.opacity = '1';
            }}
          >
            {isActive ? '✓ Active' : 'Inactive'}
          </button>
        </div>

        {/* Main Controls */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: '600',
            color: textPrimary,
          }}>
            <i className="fas fa-percent" style={{ marginRight: '0.5rem', color: '#5B4B8A' }}></i>
            Discount Percentage
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <button
              onClick={() => handlePercentageChange(type, promo.percentage - 1)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: '#f5f5f5',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1.2rem',
              }}
            >
              −
            </button>
            <input
              type="number"
              value={promo.percentage}
              onChange={(e) => handlePercentageChange(type, parseInt(e.target.value) || 0)}
              style={{
                width: '80px',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                textAlign: 'center',
                fontSize: '1rem',
                fontWeight: '600',
              }}
              min="0"
              max="100"
            />
            <span style={{ fontWeight: '600', color: '#5B4B8A' }}>%</span>
            <button
              onClick={() => handlePercentageChange(type, promo.percentage + 1)}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: '#f5f5f5',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1.2rem',
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Category selector for category promotions */}
        {type === 'category' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: textPrimary,
            }}>
              <i className="fas fa-folder" style={{ marginRight: '0.5rem', color: '#5B4B8A' }}></i>
              Select Category
            </label>
            <select
              value={promo.categoryId || ''}
              onChange={(e) => {
                setPromotions(prev => ({
                  ...prev,
                  category: { ...prev.category, categoryId: e.target.value }
                }));
              }}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              <option value="">-- Select Category --</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Product selector for selective promotions */}
        {type === 'selective' && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: textPrimary,
            }}>
              <i className="fas fa-search" style={{ marginRight: '0.5rem', color: '#5B4B8A' }}></i>
              Search & Select Products ({selectedCount} selected)
            </label>
            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
              <input
                type="text"
                placeholder="Search products to promote..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem 2.25rem 0.75rem 0.75rem',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '0.95rem',
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
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              border: '1px solid #ddd',
              borderRadius: '4px',
              padding: '0.5rem',
              backgroundColor: '#fafafa',
            }}>
              {filteredProducts.length > 0 ? (
                filteredProducts.map(product => (
                  <div
                    key={product.id}
                    onClick={() => handleSelectProduct(product.id)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '4px',
                      marginBottom: '0.5rem',
                      cursor: 'pointer',
                      backgroundColor: (promo.selectedProducts || []).includes(product.id) ? '#e8f5e9' : '#fff',
                      border: (promo.selectedProducts || []).includes(product.id) ? '2px solid #4CAF50' : '1px solid #ddd',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.backgroundColor = (promo.selectedProducts || []).includes(product.id) ? '#e8f5e9' : '#fff';
                    }}
                  >
                    {(promo.selectedProducts || []).includes(product.id) && (
                      <i className="fas fa-check-circle" style={{ color: '#4CAF50' }}></i>
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{product.name}</strong>
                      <div style={{ fontSize: '0.8rem', color: textSecondary }}>
                        {product.productCode || product.sourceCode || 'No Code'}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: textSecondary }}>
                        {formatMWK(product.price)} → {formatMWK(product.price - (product.price * promo.percentage) / 100)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', color: '#999', padding: '1rem' }}>
                  No products found
                </p>
              )}
            </div>
          </div>
        )}

        {/* Preview and Apply buttons */}
        <div style={{
          display: 'flex',
          gap: '0.75rem',
        }}>
          <button
            onClick={() => previewPromotion(type)}
            disabled={(type === 'category' && !promo.categoryId) || (type === 'selective' && (!promo.selectedProducts || promo.selectedProducts.length === 0))}
            style={{
              flex: 1,
              padding: '0.75rem 1.5rem',
              borderRadius: '4px',
              border: '1px solid #5B4B8A',
              backgroundColor: '#fff',
              color: '#5B4B8A',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#f5f5f5';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#fff';
            }}
          >
            <i className="fas fa-eye" style={{ marginRight: '0.5rem' }}></i>
            Preview
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading promotions...</div>;
  }

  const promotionTabs = [
    { id: 'global', label: 'Global Promotion', icon: 'fa-globe' },
    { id: 'category', label: 'Category Promotion', icon: 'fa-box' },
    { id: 'selective', label: 'Selective Promotion', icon: 'fa-hand-pointer' },
  ];

  const promotionsFilterSpacerHeight = filterBarHeight > 0 ? filterBarHeight + 8 : 0;

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          backgroundColor: '#fff',
          border: '1px solid #eee',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '0.75rem 1rem',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <i className="fas fa-tags" style={{ fontSize: '1.2rem', color: '#5B4B8A' }}></i>
            <h1 style={{ margin: 0, color: textPrimary, fontSize: '1.15rem' }}>Promotions Management</h1>
          </div>
          <div style={{ color: textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>
            Scope: {selectedLocationLabel} ({selectedLocationCode}) | Catalog: {allProducts.length} products | {categories.length} categories
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {promotionTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`admin-tab-button${activeTab === tab.id ? ' active' : ''}`}
            >
              <i className={`fas ${tab.icon} admin-tab-icon`}></i>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: `${promotionsFilterSpacerHeight}px` }}></div>

      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '1rem',
      }}>
        {/* Info Box */}
        <div style={{
          backgroundColor: '#e3f2fd',
          borderLeft: '4px solid #2196F3',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '1rem',
          color: '#1565c0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <i className="fas fa-lightbulb" style={{ fontSize: '1.2rem' }}></i>
          <p style={{ margin: 0 }}>
            <strong>Tip:</strong> Use promotions to boost sales. Preview products before activating to ensure correct targeting.
          </p>
        </div>

        <div style={{ maxWidth: '900px' }}>
          {activeTab === 'global' && renderPromotionCard(
            'global',
            'Global Promotion',
            'Apply discount to all products in store',
            'fa-globe'
          )}
          {activeTab === 'category' && renderPromotionCard(
            'category',
            'Category Promotion',
            'Apply discount to all products in a selected category',
            'fa-box'
          )}
          {activeTab === 'selective' && renderPromotionCard(
            'selective',
            'Selective Promotion',
            'Apply discount to specific products you choose',
            'fa-hand-pointer'
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
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
            maxWidth: '800px',
            maxHeight: '80vh',
            overflowY: 'auto',
            width: '100%',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
            }}>
              <h2 style={{ margin: 0, color: textPrimary }}>Preview Products</h2>
              <button
                onClick={() => setShowPreview(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: textSecondary,
                }}
              >
                ✕
              </button>
            </div>

            {previewProducts.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1rem',
              }}>
                {previewProducts.map(product => (
                  <div
                    key={product.id}
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '1rem',
                      textAlign: 'center',
                      backgroundColor: '#f9f9f9',
                    }}
                  >
                    <div style={{
                      height: '150px',
                      backgroundColor: '#e0e0e0',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '0.75rem',
                      color: textSecondary,
                      fontSize: '0.9rem',
                    }}>
                      {product.image ? (
                        <img
                          src={product.image}
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }}
                        />
                      ) : (
                        'No Image'
                      )}
                    </div>
                    <h4 style={{ margin: '0.5rem 0', color: textPrimary }}>{product.name}</h4>
                    <p style={{ margin: '0.25rem 0', color: textSecondary, fontSize: '0.9rem' }}>
                      {product.category}
                    </p>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      marginTop: '0.75rem',
                    }}>
                      <span style={{
                        color: '#999',
                        textDecoration: 'line-through',
                        fontSize: '0.9rem',
                      }}>
                        {formatMWK(product.price)}
                      </span>
                      <span style={{
                        color: '#4CAF50',
                        fontWeight: '600',
                      }}>
                        {formatMWK(product.finalPrice)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: textSecondary }}>
                No products match the current promotion criteria
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPromotions;
