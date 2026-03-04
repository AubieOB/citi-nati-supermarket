/**
 * 📦 POS Products Component Example
 * 
 * This is a complete working example of integrating the POS Sync Agent.
 * Copy this component or use it as a reference for your own components.
 * 
 * Usage:
 *   import POSProductsExample from './components/examples/POSProductsExample.jsx';
 *   <POSProductsExample />
 */

import React, { useState } from 'react';
import { usePOSProducts } from '../../hooks/usePOSProducts.js';
import toast from 'react-hot-toast';

export default function POSProductsExample() {
  const { products, loading, error, refetch, lastFetch } = usePOSProducts({
    autoFetch: true,
    refreshInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState([]);

  /**
   * Add product to cart
   */
  const handleAddToCart = (product) => {
    if (product.QuantityAvailable <= 0) {
      toast.error('Out of stock');
      return;
    }

    const existingItem = cart.find(item => item.ProductCode === product.ProductCode);

    if (existingItem) {
      if (existingItem.quantity >= product.QuantityAvailable) {
        toast.error('Not enough stock');
        return;
      }
      setCart(
        cart.map(item =>
          item.ProductCode === product.ProductCode
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }

    toast.success(`${product.ProductName} added to cart`);
  };

  /**
   * Remove from cart
   */
  const handleRemoveFromCart = (productCode) => {
    setCart(cart.filter(item => item.ProductCode !== productCode));
    toast.success('Removed from cart');
  };

  /**
   * Update quantity
   */
  const handleUpdateQuantity = (productCode, newQuantity) => {
    if (newQuantity <= 0) {
      handleRemoveFromCart(productCode);
      return;
    }

    const product = products.find(p => p.ProductCode === productCode);
    if (newQuantity > product.QuantityAvailable) {
      toast.error('Not enough stock');
      return;
    }

    setCart(
      cart.map(item =>
        item.ProductCode === productCode ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  /**
   * Calculate totals
   */
  const cartTotal = cart.reduce((sum, item) => sum + item.SellingPrice * item.quantity, 0);
  const cartItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Format last fetch time
  const lastFetchTime = lastFetch ? new Date(lastFetch).toLocaleTimeString() : 'Never';

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>🛍️ POS Products Integration Example</h1>
        <div style={styles.status}>
          <span>Products: {products.length}</span>
          <span>Last updated: {lastFetchTime}</span>
          <button onClick={refetch} disabled={loading} style={styles.refreshBtn}>
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div style={styles.error}>
          <h3>⚠️ Error Loading Products</h3>
          <p>{error}</p>
          <button onClick={refetch} style={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      <div style={styles.content}>
        {/* Products Grid */}
        <div style={styles.productsSection}>
          <h2>Products</h2>

          {loading && products.length === 0 ? (
            <div style={styles.loading}>Loading products...</div>
          ) : products.length === 0 ? (
            <div style={styles.empty}>No products available</div>
          ) : (
            <div style={styles.grid}>
              {products.map(product => (
                <div
                  key={product.ProductCode}
                  style={{
                    ...styles.productCard,
                    opacity: product.QuantityAvailable === 0 ? 0.6 : 1,
                    cursor: product.QuantityAvailable === 0 ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => setSelectedProduct(product)}
                >
                  <div style={styles.productCode}>{product.ProductCode}</div>
                  <h3 style={styles.productName}>{product.ProductName}</h3>
                  <p style={styles.barcode}>📦 {product.Barcode}</p>
                  <p style={styles.price}>${product.SellingPrice.toFixed(2)}</p>

                  <p
                    style={{
                      ...styles.stock,
                      color:
                        product.QuantityAvailable > 10
                          ? 'green'
                          : product.QuantityAvailable > 0
                          ? 'orange'
                          : 'red',
                    }}
                  >
                    {product.QuantityAvailable > 0
                      ? `${product.QuantityAvailable} in stock`
                      : 'Out of stock'}
                  </p>

                  <button
                    style={styles.addBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToCart(product);
                    }}
                    disabled={product.QuantityAvailable === 0}
                  >
                    {product.QuantityAvailable === 0 ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Section */}
        <div style={styles.cartSection}>
          <h2>Shopping Cart ({cartItems})</h2>

          {cart.length === 0 ? (
            <div style={styles.emptyCart}>Your cart is empty</div>
          ) : (
            <>
              <div style={styles.cartItems}>
                {cart.map(item => (
                  <div key={item.ProductCode} style={styles.cartItem}>
                    <div style={styles.itemInfo}>
                      <div style={styles.itemName}>{item.ProductName}</div>
                      <div style={styles.itemCode}>{item.ProductCode}</div>
                    </div>

                    <div style={styles.itemQty}>
                      <button
                        onClick={() => handleUpdateQuantity(item.ProductCode, item.quantity - 1)}
                        style={styles.qtyBtn}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          handleUpdateQuantity(item.ProductCode, parseInt(e.target.value) || 1)
                        }
                        style={styles.qtyInput}
                      />
                      <button
                        onClick={() => handleUpdateQuantity(item.ProductCode, item.quantity + 1)}
                        style={styles.qtyBtn}
                        disabled={item.quantity >= item.QuantityAvailable}
                      >
                        +
                      </button>
                    </div>

                    <div style={styles.itemPrice}>
                      ${(item.SellingPrice * item.quantity).toFixed(2)}
                    </div>

                    <button
                      onClick={() => handleRemoveFromCart(item.ProductCode)}
                      style={styles.removeBtn}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div style={styles.cartTotal}>
                <div style={styles.totalLabel}>Total:</div>
                <div style={styles.totalAmount}>${cartTotal.toFixed(2)}</div>
              </div>

              <button style={styles.checkoutBtn}>Proceed to Checkout</button>
            </>
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div style={styles.modal} onClick={() => setSelectedProduct(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedProduct(null)}
              style={styles.closeBtn}
            >
              ✕
            </button>

            <h2>{selectedProduct.ProductName}</h2>
            <div style={styles.detailGrid}>
              <div>
                <strong>Product Code:</strong>
                <p>{selectedProduct.ProductCode}</p>
              </div>
              <div>
                <strong>Barcode:</strong>
                <p>{selectedProduct.Barcode}</p>
              </div>
              <div>
                <strong>Price:</strong>
                <p>${selectedProduct.SellingPrice.toFixed(2)}</p>
              </div>
              <div>
                <strong>Available Stock:</strong>
                <p>{selectedProduct.QuantityAvailable}</p>
              </div>
            </div>

            <button
              onClick={() => {
                handleAddToCart(selectedProduct);
                setSelectedProduct(null);
              }}
              style={styles.addBtnLarge}
              disabled={selectedProduct.QuantityAvailable === 0}
            >
              Add to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Inline Styles
 */
const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  header: {
    marginBottom: '30px',
    borderBottom: '2px solid #ddd',
    paddingBottom: '20px',
  },
  status: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
    marginTop: '10px',
    fontSize: '14px',
    color: '#666',
  },
  refreshBtn: {
    padding: '8px 16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  error: {
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '4px',
    padding: '20px',
    marginBottom: '20px',
    color: '#c33',
  },
  retryBtn: {
    marginTop: '10px',
    padding: '8px 16px',
    backgroundColor: '#c33',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  content: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '30px',
  },
  productsSection: {
    flex: 1,
  },
  loading: {
    padding: '40px',
    textAlign: 'center',
    color: '#666',
    fontSize: '16px',
  },
  empty: {
    padding: '40px',
    textAlign: 'center',
    color: '#999',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  productCard: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    backgroundColor: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    transition: 'all 0.3s',
  },
  productCode: {
    fontSize: '12px',
    color: '#999',
    marginBottom: '8px',
  },
  productName: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: '8px 0',
  },
  barcode: {
    fontSize: '12px',
    color: '#666',
    margin: '4px 0',
  },
  price: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#2ecc71',
    margin: '8px 0',
  },
  stock: {
    fontSize: '12px',
    margin: '8px 0',
    fontWeight: 'bold',
  },
  addBtn: {
    width: '100%',
    padding: '10px',
    marginTop: '12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  cartSection: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
    height: 'fit-content',
    position: 'sticky',
    top: '20px',
  },
  emptyCart: {
    padding: '20px',
    textAlign: 'center',
    color: '#999',
  },
  cartItems: {
    backgroundColor: 'white',
    borderRadius: '4px',
    marginBottom: '20px',
  },
  cartItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderBottom: '1px solid #eee',
    fontSize: '14px',
  },
  itemInfo: {
    flex: 2,
  },
  itemName: {
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  itemCode: {
    fontSize: '12px',
    color: '#999',
  },
  itemQty: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  qtyBtn: {
    width: '28px',
    height: '28px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    backgroundColor: 'white',
    fontSize: '14px',
  },
  qtyInput: {
    width: '40px',
    textAlign: 'center',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '4px',
  },
  itemPrice: {
    fontWeight: 'bold',
    minWidth: '70px',
    textAlign: 'right',
  },
  removeBtn: {
    width: '28px',
    height: '28px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#fee',
    color: '#c33',
    cursor: 'pointer',
    fontSize: '16px',
  },
  cartTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '4px',
    marginBottom: '16px',
    fontWeight: 'bold',
    fontSize: '18px',
  },
  totalLabel: {
    color: '#666',
  },
  totalAmount: {
    color: '#2ecc71',
    fontSize: '24px',
  },
  checkoutBtn: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#2ecc71',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    maxWidth: '500px',
    width: '90%',
    position: 'relative',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  closeBtn: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: '#f0f0f0',
    cursor: 'pointer',
    fontSize: '20px',
  },
  detailGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    margin: '20px 0',
  },
  addBtnLarge: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 'bold',
  },
};
