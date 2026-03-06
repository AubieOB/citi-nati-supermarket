import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api.js';
import Button from '../../components/ui/Button.jsx';
import Container from '../../components/ui/Container.jsx';
import { useModal } from '../../hooks/useModal.js';
import { formatMWK } from '../../utils/currency.js';
import Pagination from '../../components/ui/Pagination.jsx';
import '../../styles/global.css';

/**
 * AdminPOSManagement - POS Products Management Panel
 * 
 * Features:
 * - View all POS synced products with pagination
 * - Search products by name, sourceCode, or category
 * - Toggle visibility (hide/show from products page)
 * - Delete selected products
 * - Delete all POS products at once
 * - Real-time updates
 */

const AdminPOSManagement = () => {
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [limit] = useState(5000);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const searchTimeoutRef = useRef(null);
  const { modal, closeModal, showError, showSuccess } = useModal();

  /**
   * Fetch POS products with search and pagination
   */
  const fetchProducts = async (searchValue = '', pageNum = 1) => {
    try {
      // only show spinner if we have no data yet
      if (products.length === 0) setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchValue) params.append('search', searchValue);
      params.append('page', pageNum);
      params.append('limit', limit);

      const response = await api.get(`/admin/pos-products?${params.toString()}`);
      
      if (response.data.success) {
        setProducts(response.data.products);
        setTotal(response.data.total);
        setTotalPages(response.data.totalPages);
      }
    } catch (err) {
      console.error('Error fetching POS products:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle search with debounce
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setPage(1);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce the search by 500ms
    searchTimeoutRef.current = setTimeout(() => {
      fetchProducts(value, 1);
    }, 500);
  };

  // Initial fetch
  useEffect(() => {
    fetchProducts('', 1);
  }, []);

  // Handle pagination
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      fetchProducts(searchTerm, newPage);
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
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  /**
   * Toggle product visibility (hide/show from products page)
   */
  const handleToggleVisibility = async (productId, hideFromProductsPage) => {
    try {
      const response = await api.put(`/admin/pos-products/${productId}/visibility`, {
        hideFromProductsPage: !hideFromProductsPage,
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

    if (!window.confirm(`Delete ${selectedProducts.size} product(s)? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await api.delete('/admin/pos-products/delete-selected', {
        data: { productIds: Array.from(selectedProducts) },
      });

      if (response.data.success) {
        showSuccess(`Deleted ${response.data.deletedCount} products`);
        setSelectedProducts(new Set());
        fetchProducts(searchTerm, page);
      }
    } catch (err) {
      console.error('Error deleting products:', err);
      showError(err.response?.data?.error || 'Failed to delete products');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Delete all POS products
   */
  const handleDeleteAll = async () => {
    if (!window.confirm(`Are you sure? This will delete ALL ${total} POS products from the website. They will re-sync the next time the POS Agent runs.\n\nThis CANNOT be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await api.delete('/admin/pos-products/delete-all');

      if (response.data.success) {
        showSuccess(`Deleted all ${response.data.deletedCount} POS products`);
        setSelectedProducts(new Set());
        setPage(1);
        fetchProducts('', 1);
      }
    } catch (err) {
      console.error('Error deleting all products:', err);
      showError(err.response?.data?.error || 'Failed to delete all products');
    } finally {
      setLoading(false);
    }
  };

  if (loading && products.length === 0) {
    return (
      <Container>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p>Loading POS products...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>POS Products Management</h1>
          <p style={styles.description}>
            Manage which POS synced products appear on your website
          </p>
        </div>

        {error && (
          <div style={styles.errorAlert}>
            <p>{error}</p>
          </div>
        )}

        <div style={styles.controls}>
          <div style={styles.searchBox}>
            <input
              type="text"
              placeholder="Search by product name, code, or category..."
              value={searchTerm}
              onChange={handleSearchChange}
              style={styles.searchInput}
            />
          </div>

          <div style={styles.actionButtons}>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedProducts.size === 0}
              style={{
                ...styles.button,
                ...styles.deleteSelectedBtn,
                opacity: selectedProducts.size === 0 ? 0.5 : 1,
                cursor: selectedProducts.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              🗑️ Delete Selected ({selectedProducts.size})
            </button>

            <button
              onClick={handleDeleteAll}
              style={{ ...styles.button, ...styles.deleteAllBtn }}
            >
              ⚠️ Delete All POS Products ({total})
            </button>
          </div>
        </div>

        {products.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No POS products found</p>
          </div>
        ) : (
          <>
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
                      />
                    </th>
                    <th style={styles.cell}>Product Name</th>
                    <th style={styles.cell}>Source Code</th>
                    <th style={styles.cell}>Category</th>
                    <th style={styles.cell}>Price</th>
                    <th style={styles.cell}>Stock</th>
                    <th style={styles.cell}>Availability</th>
                    <th style={styles.cell}>Visibility</th>
                    <th style={styles.cell}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} style={styles.bodyRow}>
                      <td style={{ ...styles.cell, ...styles.checkboxCell }}>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => toggleProduct(product.id)}
                          style={styles.checkbox}
                        />
                      </td>
                      <td style={styles.cell}>
                        <div style={styles.productName}>{product.name}</div>
                      </td>
                      <td style={styles.cell}>
                        <code style={styles.sourceCode}>{product.sourceCode}</code>
                      </td>
                      <td style={styles.cell}>{product.category || '-'}</td>
                      <td style={styles.cell}>{formatMWK(product.price)}</td>
                      <td style={styles.cell}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: product.stock > 0 ? '#d4edda' : '#f8d7da',
                          color: product.stock > 0 ? '#155724' : '#721c24',
                          fontWeight: 'bold',
                        }}>
                          {product.stock}
                        </span>
                      </td>
                      <td style={styles.cell}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          backgroundColor: product.hideFromProductsPage ? '#fff3cd' : '#d4edda',
                          color: product.hideFromProductsPage ? '#856404' : '#155724',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}>
                          <i style={{ marginRight: '6px' }} className={product.hideFromProductsPage ? 'fas fa-eye-slash' : 'fas fa-eye'} />
                          {product.hideFromProductsPage ? 'HIDDEN' : 'VISIBLE'}
                        </span>
                      </td>
                      <td style={styles.cell}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleToggleVisibility(product.id, product.hideFromProductsPage)}
                            title={product.hideFromProductsPage ? 'Show on products page' : 'Hide from products page'}
                            style={{
                              ...styles.toggleButton,
                              backgroundColor: product.hideFromProductsPage ? '#28a745' : '#ffc107',
                              padding: '5px 10px',
                              fontSize: '11px',
                            }}
                          >
                            {product.hideFromProductsPage ? 'Show' : 'Hide'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={styles.pagination}>
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                style={{ ...styles.paginationButton, opacity: page === 1 ? 0.5 : 1 }}
              >
                Previous
              </button>

              <div style={styles.pageInfo}>
                Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                {' '}
                ({total} total products)
              </div>

              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
                style={{ ...styles.paginationButton, opacity: page === totalPages ? 0.5 : 1 }}
              >
                Next
              </button>
            </div>
          </>
        )}

        {modal.isOpen && (
          <div style={styles.modalOverlay} onClick={closeModal}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
              <h2 style={styles.modalTitle}>
                <i style={{ marginRight: '8px' }} className={modal.type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'} />
                {modal.title}
              </h2>
              <p style={styles.modalMessage}>{modal.message}</p>
              <button onClick={closeModal} style={styles.modalButton}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
};

const styles = {
  container: {
    padding: '40px 20px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '40px',
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    margin: '0 0 10px 0',
  },
  description: {
    fontSize: '16px',
    color: '#666',
    margin: '0',
  },
  errorAlert: {
    padding: '12px 16px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  controls: {
    marginBottom: '30px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  searchBox: {
    flex: 1,
  },
  searchInput: {
    width: '100%',
    padding: '10px 15px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  actionButtons: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  deleteSelectedBtn: {
    backgroundColor: '#dc3545',
    color: 'white',
  },
  deleteAllBtn: {
    backgroundColor: '#6f42c1',
    color: 'white',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#999',
  },
  tableWrapper: {
    overflowX: 'auto',
    marginBottom: '30px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  headerRow: {
    backgroundColor: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
  },
  bodyRow: {
    borderBottom: '1px solid #dee2e6',
  },
  cell: {
    padding: '12px 15px',
    textAlign: 'left',
    fontSize: '14px',
  },
  checkboxCell: {
    width: '40px',
    padding: '12px 8px',
    textAlign: 'center',
  },
  checkbox: {
    cursor: 'pointer',
    width: '18px',
    height: '18px',
  },
  productName: {
    fontWeight: '500',
    color: '#333',
    maxWidth: '250px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sourceCode: {
    backgroundColor: '#f0f0f0',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '12px',
  },
  toggleButton: {
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    color: 'white',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '20px',
    padding: '20px',
  },
  paginationButton: {
    padding: '8px 16px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#666',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    maxWidth: '500px',
    width: '90%',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginTop: 0,
    marginBottom: '10px',
  },
  modalMessage: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '20px',
  },
  modalButton: {
    padding: '10px 20px',
    fontSize: '14px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
};

export default AdminPOSManagement;
