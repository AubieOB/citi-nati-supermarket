import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { notifySuccess, notifyError } from '../../utils/notifications.js';

/**
 * 📊 ADMIN STOCKS MANAGEMENT
 * 
 * Manage product inventory:
 * - View all product stocks
 * - Add/subtract stock
 * - View stock history
 * - Set low stock alerts
 */

const AdminStocks = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [stockAction, setStockAction] = useState('');
  const [stockQuantity, setStockQuantity] = useState(0);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState('add'); // 'add' or 'subtract'
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await api.get('/products');
      setProducts(response.data.products || []);
      
      // Extract unique categories
      const uniqueCategories = [...new Set(response.data.products.map(p => p.category))];
      setCategories(uniqueCategories.filter(Boolean));
    } catch (err) {
      console.error('Error fetching products:', err);
      notifyError('Failed to load products', 3000);
    } finally {
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
        stock: newStock
      });

      // Update local state
      setProducts(prev => 
        prev.map(p => 
          p.id === selectedProduct.id 
            ? { ...p, stock: newStock }
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

  const getStockStatus = (stock) => {
    if (stock === 0) return { color: '#d32f2f', label: 'Out of Stock', icon: '🔴' };
    if (stock <= lowStockThreshold) return { color: '#f57c00', label: 'Low Stock', icon: '🟡' };
    return { color: '#388e3c', label: 'In Stock', icon: '🟢' };
  };

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Separate products by stock status
  const outOfStock = filteredProducts.filter(p => p.stock === 0);
  const lowStock = filteredProducts.filter(p => p.stock > 0 && p.stock <= lowStockThreshold);
  const goodStock = filteredProducts.filter(p => p.stock > lowStockThreshold);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Loading products...</div>;
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '2rem',
        gap: '0.75rem',
      }}>
        <i className="fas fa-warehouse" style={{ fontSize: '1.5rem', color: '#5B4B8A' }}></i>
        <h1 style={{ margin: 0, color: '#333' }}>Stock Management</h1>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #2196F3',
        }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem' }}>Total Products</p>
          <h3 style={{ margin: 0, color: '#2196F3', fontSize: '2rem' }}>{products.length}</h3>
        </div>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #388e3c',
        }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem' }}>In Stock</p>
          <h3 style={{ margin: 0, color: '#388e3c', fontSize: '2rem' }}>{goodStock.length}</h3>
        </div>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #f57c00',
        }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem' }}>Low Stock</p>
          <h3 style={{ margin: 0, color: '#f57c00', fontSize: '2rem' }}>{lowStock.length}</h3>
        </div>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #d32f2f',
        }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#666', fontSize: '0.9rem' }}>Out of Stock</p>
          <h3 style={{ margin: 0, color: '#d32f2f', fontSize: '2rem' }}>{outOfStock.length}</h3>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#333' }}>Filters</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
        }}>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
            }}>
              Search Product
            </label>
            <input
              type="text"
              placeholder="Search by product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem',
              }}
            />
          </div>
          <div>
            <label style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
            }}>
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem',
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
              display: 'block',
              marginBottom: '0.5rem',
              fontWeight: '600',
              color: '#333',
              fontSize: '0.9rem',
            }}>
              Low Stock Threshold
            </label>
            <input
              type="number"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Math.max(1, parseInt(e.target.value) || 5))}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '4px',
                border: '1px solid #ddd',
                fontSize: '1rem',
              }}
              min="1"
            />
          </div>
        </div>
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
                Category
              </th>
              <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.95rem' }}>
                Current Stock
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
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => {
                const status = getStockStatus(product.stock);
                return (
                  <tr
                    key={product.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: product.stock === 0 ? '#ffebee' : product.stock <= lowStockThreshold ? '#fff3e0' : '#fff',
                    }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <strong>{product.name}</strong>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
                      {product.category}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      fontWeight: '600',
                      fontSize: '1.1rem',
                      color: '#333',
                    }}>
                      {product.stock}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '20px',
                        backgroundColor: status.color + '20',
                        color: status.color,
                        fontWeight: '600',
                        fontSize: '0.85rem',
                      }}>
                        {status.icon} {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        justifyContent: 'center',
                      }}>
                        <button
                          onClick={() => openStockModal(product, 'add')}
                          title="Add Stock"
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#4CAF50',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseOver={(e) => e.target.style.opacity = '0.8'}
                          onMouseOut={(e) => e.target.style.opacity = '1'}
                        >
                          + Add
                        </button>
                        <button
                          onClick={() => openStockModal(product, 'subtract')}
                          title="Remove Stock"
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#f44336',
                            color: '#fff',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.85rem',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseOver={(e) => e.target.style.opacity = '0.8'}
                          onMouseOut={(e) => e.target.style.opacity = '1'}
                        >
                          − Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                  No products found matching your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
            <h2 style={{ margin: '0 0 1rem 0', color: '#333' }}>
              {actionType === 'add' ? '➕ Add Stock' : '➖ Remove Stock'}
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
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#eee'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#f5f5f5'}
              >
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
                }}
                onMouseOver={(e) => e.target.style.opacity = '0.9'}
                onMouseOut={(e) => e.target.style.opacity = '1'}
              >
                {actionType === 'add' ? '✓ Add Stock' : '✓ Remove Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStocks;
