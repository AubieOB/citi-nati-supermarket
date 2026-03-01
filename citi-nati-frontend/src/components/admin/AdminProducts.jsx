import React, { useState, useEffect, useRef } from 'react';
import Button from '../ui/Button.jsx';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/**
 * 📦 ADMIN PRODUCTS MANAGEMENT - ENHANCED
 * 
 * Features:
 * - Create, Read, Update, Delete products
 * - Pricing tiers: base price, original price, discount price
 * - Expiry date tracking with smart alerts
 * - Automated discount suggestions for expiring products
 * - Sale status management
 */

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const formSectionRef = useRef(null);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    originalPrice: '',
    discountPrice: '',
    stock: '',
    category: '',
    expiryDate: '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter and search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('products'); // 'products' or 'expiry-alerts'
  const { modal, closeModal, showConfirm, showError, showSuccess } = useModal();

  // Fetch products on mount
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/products');
      
      // Sort by expiry status for visibility
      const sorted = (response.data.products || []).sort((a, b) => {
        if (!a.expiryStatus && !b.expiryStatus) return 0;
        if (!a.expiryStatus) return 1;
        if (!b.expiryStatus) return -1;
        
        const statusPriority = {
          expired: 0,
          '1_week_warning': 1,
          '2_weeks_warning': 2,
          '1_month_warning': 3,
          '2_months_warning': 4,
          null: 5
        };
        
        return (statusPriority[a.expiryStatus.status] || 5) - (statusPriority[b.expiryStatus.status] || 5);
      });
      
      setProducts(sorted);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError(err.response?.data?.error || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  // Filter products based on search and filters
  const filteredProducts = products.filter(product => {
    // Search filter (AND logic - all search terms must match)
    const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/).filter(t => t);
    const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => 
      product.name.toLowerCase().includes(term) || 
      product.category.toLowerCase().includes(term)
    );

    // Category filter
    const matchesCategory = !selectedCategory || product.category === selectedCategory;

    // Sale filter
    const matchesSale = !onSaleOnly || product.isOnSale;

    return matchesSearch && matchesCategory && matchesSale;
  });

  // Get unique categories for filter dropdown
  const categories = [...new Set(products.map(p => p.category))].sort();

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (formError) setFormError('');
  };

  const handleImageChange = (e) => {
    setImageFile(e.target.files[0]);
  };

  const validateForm = () => {
    if (!formData.name?.trim()) return 'Product name is required';
    if (!formData.price || isNaN(parseFloat(formData.price)) || parseFloat(formData.price) < 0) 
      return 'Valid price is required';
    if (!formData.stock === undefined || isNaN(parseInt(formData.stock)) || parseInt(formData.stock) < 0) 
      return 'Valid stock quantity is required';
    if (!formData.category?.trim()) return 'Category is required';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    // Show confirmation modal
    const action = editingId ? 'update' : 'create';
    const productName = formData.name.trim();
    
    showConfirm(
      `${editingId ? 'Update' : 'Create'} Product?`,
      `Are you sure you want to ${editingId ? 'update' : 'create'} the product "${productName}"?`,
      () => {
        // Perform the actual submission when confirmed
        submitProduct();
      }
    );
  };

  const submitProduct = async () => {
    try {
      setIsSubmitting(true);
      setFormError('');

      const formPayload = new FormData();
      formPayload.append('name', formData.name.trim());
      formPayload.append('price', String(parseFloat(formData.price)));
      formPayload.append('stock', String(parseInt(formData.stock)));
      formPayload.append('category', formData.category.trim());
      
      console.log('[ADMIN PRODUCTS] 📋 Submitting product form:', {
        name: formData.name.trim(),
        hasImage: !!imageFile,
        fileName: imageFile?.name,
        fileSize: imageFile?.size
      });
      
      // Optional: expiry date
      if (formData.expiryDate) {
        formPayload.append('expiryDate', formData.expiryDate);
      }
      
      // Optional: original price (for promotions display)
      if (formData.originalPrice) {
        formPayload.append('originalPrice', String(parseFloat(formData.originalPrice)));
      }
      
      // Always send discount price (empty string clears it on backend)
      formPayload.append('discountPrice', formData.discountPrice || '');
      
      if (imageFile) {
        formPayload.append('image', imageFile);
        console.log('[ADMIN PRODUCTS] 📸 Image included:', {
          size: imageFile.size,
          type: imageFile.type,
          name: imageFile.name
        });
      } else {
        console.log('[ADMIN PRODUCTS] ⚠️ No image provided - using existing or creating without');
      }

      if (editingId) {
        console.log('[ADMIN PRODUCTS] ✏️ Updating product:', editingId);
        await api.put(`/products/${editingId}`, formPayload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showSuccess('Success', `Product "${formData.name.trim()}" updated successfully`);
      } else {
        console.log('[ADMIN PRODUCTS] ➕ Creating new product');
        await api.post('/products', formPayload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        showSuccess('Success', `Product "${formData.name.trim()}" created successfully`);
      }

      console.log('[ADMIN PRODUCTS] ✅ Product saved successfully');
      await fetchProducts();
      resetForm();
    } catch (err) {
      console.error('[ADMIN PRODUCTS] ❌ Error saving product:', err);
      setFormError(err.response?.data?.error || 'Failed to save product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (product) => {
    setFormData({
      name: product.name,
      price: product.price.toString(),
      originalPrice: product.originalPrice?.toString() || '',
      discountPrice: product.discountPrice?.toString() || '',
      stock: String(parseInt(product.stock, 10)),
      category: product.category,
      expiryDate: product.expiryDate ? product.expiryDate.split('T')[0] : '',
    });
    setEditingId(product.id);
    setShowForm(true);
    // Scroll to edit form on next render
    setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleDelete = async (id) => {
    showConfirm(
      'Delete Product?',
      'Are you sure you want to delete this product? This action cannot be undone.',
      async () => {
        try {
          await api.delete(`/products/${id}`);
          await fetchProducts();
          showSuccess('Success', 'Product deleted successfully');
        } catch (err) {
          console.error('Error deleting product:', err);
          showError('Error', err.response?.data?.error || 'Failed to delete product');
        }
      }
    );
  };

  const resetForm = () => {
    setFormData({
      name: '',
      price: '',
      originalPrice: '',
      discountPrice: '',
      stock: '',
      category: '',
      expiryDate: '',
    });
    setImageFile(null);
    setEditingId(null);
    setShowForm(false);
    setFormError('');
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Create/Edit Form */}
      {showForm && (
        <div
          ref={formSectionRef}
          style={{
            backgroundColor: '#f8f9fa',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            borderLeft: '4px solid #5B4B8A',
          }}
        >
          <h3 style={{ marginBottom: '1rem', color: '#5B4B8A' }}>
            {editingId ? 'Edit Product' : 'Create New Product'}
          </h3>

          {formError && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '1rem',
              borderRadius: '4px',
              marginBottom: '1rem',
            }}>
              {formError}
            </div>
          )}

          <form 
            onSubmit={handleSubmit} 
            onKeyDown={(e) => {
              // Support Enter key on large screens
              if (e.key === 'Enter' && window.innerWidth >= 768) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            style={{ display: 'grid', gap: '1rem' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="e.g., Organic Apples"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Category *
                </label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleFormChange}
                  placeholder="e.g., Fruits"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  Base Price (MWK) *
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleFormChange}
                  placeholder="5000"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  Original Price (Optional)
                </label>
                <input
                  type="number"
                  name="originalPrice"
                  value={formData.originalPrice}
                  onChange={handleFormChange}
                  placeholder="For display"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                  Discount Price (Optional)
                </label>
                <input
                  type="number"
                  name="discountPrice"
                  value={formData.discountPrice}
                  onChange={handleFormChange}
                  placeholder="Enables sale"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Stock Quantity *
                </label>
                <input
                  type="number"
                  name="stock"
                  value={formData.stock}
                  onChange={handleFormChange}
                  placeholder="50"
                  min="0"
                  step="1"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Expiry Date (Optional - for perishables)
                </label>
                <input
                  type="date"
                  name="expiryDate"
                  value={formData.expiryDate}
                  onChange={handleFormChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Product Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                />
                {imageFile && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                    Selected: {imageFile.name}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                style={{ flex: 1 }}
              >
                {isSubmitting ? 'Saving...' : editingId ? 'Update Product' : 'Create Product'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {!showForm && (
        <Button
          variant="primary"
          onClick={() => setShowForm(true)}
          style={{ marginBottom: '2rem' }}
        >
          + Create New Product
        </Button>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '1rem',
          borderRadius: '4px',
          marginBottom: '2rem',
        }}>
          {error}
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        borderBottom: '2px solid #eee',
      }}>
        <button
          onClick={() => setActiveSubTab('products')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: activeSubTab === 'products' ? '#5B4B8A' : 'transparent',
            color: activeSubTab === 'products' ? '#fff' : '#666',
            fontWeight: activeSubTab === 'products' ? '600' : '500',
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s ease',
            borderBottom: activeSubTab === 'products' ? '3px solid #2D8659' : 'none',
            marginBottom: '-2px',
          }}
        >
          <i className="fas fa-box" style={{ marginRight: '0.5rem' }}></i>
          Products
        </button>
        <button
          onClick={() => setActiveSubTab('expiry-alerts')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: activeSubTab === 'expiry-alerts' ? '#5B4B8A' : 'transparent',
            color: activeSubTab === 'expiry-alerts' ? '#fff' : '#666',
            fontWeight: activeSubTab === 'expiry-alerts' ? '600' : '500',
            cursor: 'pointer',
            fontSize: '0.95rem',
            transition: 'all 0.2s ease',
            borderBottom: activeSubTab === 'expiry-alerts' ? '3px solid #2D8659' : 'none',
            marginBottom: '-2px',
            position: 'relative',
          }}
        >
          <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.5rem' }}></i>
          Expiry Alerts
          {products.some(p => p.expiryStatus && p.expiryStatus.status) && (
            <span style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              backgroundColor: '#f44336',
              color: '#fff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 'bold',
            }}>
              {products.filter(p => p.expiryStatus && p.expiryStatus.status).length}
            </span>
          )}
        </button>
      </div>

      {/* Expiry Alert Panel - Now under sub-tab */}
      {activeSubTab === 'expiry-alerts' && (
        products.some(p => p.expiryStatus && p.expiryStatus.status) ? (
          <div style={{
            backgroundColor: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '2rem',
          }}>
            <h3 style={{ color: '#856404', marginTop: 0, marginBottom: '1rem' }}>
              <i className="fas fa-exclamation-triangle" style={{marginRight: '0.5rem'}}></i>Expiry Alerts ({products.filter(p => p.expiryStatus && p.expiryStatus.status).length})
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
              {products
                .filter(p => p.expiryStatus && p.expiryStatus.status)
                .sort((a, b) => {
                  const statusOrder = { expired: 0, '1_week_warning': 1, '2_weeks_warning': 2, '1_month_warning': 3 };
                  return (statusOrder[a.expiryStatus?.status] || 999) - (statusOrder[b.expiryStatus?.status] || 999);
                })
                .map((product) => {
                  const isExpired = product.expiryStatus.status === 'expired';
                  const isUrgent = product.expiryStatus.status === '1_week_warning' || product.expiryStatus.status === '2_weeks_warning';
                  
                  return (
                    <div
                      key={product.id}
                      style={{
                        padding: '1rem',
                        borderRadius: '6px',
                        backgroundColor: isExpired ? '#f8d7da' : isUrgent ? '#ffe5b4' : '#fff',
                        border: `2px solid ${isExpired ? '#f5c6cb' : isUrgent ? '#ffc107' : '#ddd'}`,
                      }}
                    >
                      <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                        {product.expiryStatus.message}
                      </div>
                      <button
                        onClick={() => {
                          handleEdit(product);
                          setActiveSubTab('products');
                        }}
                        style={{
                          padding: '0.4rem 0.8rem',
                          backgroundColor: isExpired ? '#dc3545' : '#ffc107',
                          color: isExpired ? '#fff' : '#000',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                        }}
                      >
                        {isExpired ? 'Remove' : 'Apply Discount'}
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#999',
          }}>
            <i className="fas fa-check-circle" style={{ fontSize: '2rem', marginBottom: '1rem', display: 'block', color: '#4caf50' }}></i>
            <p style={{ fontSize: '1rem', margin: 0 }}>No expiry alerts - all products are fresh!</p>
          </div>
        )
      )}

      {/* Search and Filter Bar - Only show in Products tab */}
      {activeSubTab === 'products' && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          flexWrap: 'wrap',
        }}>
          {/* Search Input */}
          <input
            type="text"
            placeholder="Search by name or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
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

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '0.75rem',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              minWidth: '150px',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* On Sale Filter */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            padding: '0.5rem 1rem',
            backgroundColor: onSaleOnly ? '#e7f3ff' : 'transparent',
            borderRadius: '4px',
            border: onSaleOnly ? '1px solid #007bff' : '1px solid transparent',
          }}>
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => setOnSaleOnly(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontWeight: onSaleOnly ? '600' : '400' }}>Promotions</span>
          </label>

          {/* Results Count */}
          <div style={{
            marginLeft: 'auto',
            fontSize: '0.9rem',
            color: '#666',
            minWidth: '100px',
            textAlign: 'right',
          }}>
            {filteredProducts.length} / {products.length} products
          </div>
        </div>
      )}

      {/* Products Table - Only show in Products tab */}
      {activeSubTab === 'products' && (
        products.length === 0 ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}>
            No products yet. Create your first product!
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#666',
          }}>
            No products match your search or filter criteria.
          </div>
        ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#fff',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}>
            <thead style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #ddd' }}>
              <tr>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>ID</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Name</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Category</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Pricing</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.9rem' }}>Stock</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.9rem' }}>Expiry Status</th>
                <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.9rem' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const finalPrice = product.isOnSale && product.discountPrice ? product.discountPrice : product.price;
                const discountPct = product.originalPrice && product.discountPrice 
                  ? Math.round(((product.originalPrice - product.discountPrice) / product.originalPrice) * 100)
                  : null;
                
                return (
                  <tr 
                    key={product.id} 
                    style={{ 
                      borderBottom: '1px solid #eee',
                      backgroundColor: product.expiryStatus?.status === 'expired' ? '#ffebee' : product.expiryStatus?.status === '1_week_warning' ? '#fff3e0' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '1rem', fontSize: '0.9rem' }}>#{product.id}</td>
                    <td style={{ padding: '1rem', fontWeight: '500' }}>{product.name}</td>
                    <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#666' }}>{product.category}</td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {product.isOnSale && product.discountPrice && product.originalPrice && (
                          <span style={{ textDecoration: 'line-through', color: '#666', fontWeight: '500', fontSize: '0.8rem' }}>
                            {formatMWK(product.originalPrice)}
                          </span>
                        )}
                        <span style={{ 
                          color: product.isOnSale ? '#ff6b6b' : '#2D8659', 
                          fontWeight: '600',
                          fontSize: '0.95rem'
                        }}>
                          {formatMWK(finalPrice)}
                        </span>
                        {discountPct && (
                          <span style={{ 
                            padding: '0.2rem 0.5rem',
                            backgroundColor: '#ff6b6b',
                            color: '#fff',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            whiteSpace: 'nowrap'
                          }}>
                            {discountPct}% off
                          </span>
                        )}
                      </div>
                      {product.isOnSale && (
                        <div style={{ fontSize: '0.75rem', color: '#ff6b6b', marginTop: '0.25rem' }}>
                          🏷 On Sale
                        </div>
                      )}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      color: product.stock > 20 ? '#4caf50' : product.stock > 0 ? '#ff9800' : '#f44336',
                      fontWeight: '600',
                    }}>
                      {product.stock}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                      {product.expiryStatus?.status ? (
                        <span style={{
                          padding: '0.4rem 0.6rem',
                          borderRadius: '4px',
                          backgroundColor: product.expiryStatus.status === 'expired' ? '#f8d7da' : '#fff3cd',
                          color: product.expiryStatus.status === 'expired' ? '#721c24' : '#856404',
                          fontSize: '0.85rem',
                        }}>
                          {product.expiryStatus.status === 'expired' ? 
                            <><i className="fas fa-times-circle"></i> Expired</> : 
                            <><i className="fas fa-exclamation-triangle"></i> {product.expiryStatus.daysRemaining}d left</>
                          }
                        </span>
                      ) : (
                        <span style={{ color: '#999' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', minWidth: '160px' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleEdit(product)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            backgroundColor: '#007bff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '500',
                            flex: '1',
                            minWidth: '60px',
                          }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          style={{
                            padding: '0.4rem 0.6rem',
                            backgroundColor: '#dc3545',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '500',
                            flex: '1',
                            minWidth: '60px',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )
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
    </div>
  );
};

export default AdminProducts;
