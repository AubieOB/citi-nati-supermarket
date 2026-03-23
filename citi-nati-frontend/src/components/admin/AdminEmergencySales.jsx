import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { notifyError, notifyInfo, notifySuccess } from '../../utils/notifications.js';

const STATUS_LABELS = {
  pending_pos_sync: 'Pending POS Sync',
  synced_to_pos: 'Synced to POS',
  sync_failed: 'Sync Failed',
};

const STATUS_COLORS = {
  pending_pos_sync: '#f57c00',
  synced_to_pos: '#2e7d32',
  sync_failed: '#c62828',
};

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function formatMoney(value) {
  return `MWK ${toMoney(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

const AdminEmergencySales = () => {
  const { user } = useAuth();
  const rootRef = useRef(null);
  const barcodeInputRef = useRef(null);

  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [manualSearch, setManualSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState(null);

  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productPickerResults, setProductPickerResults] = useState([]);
  const [pickerTitle, setPickerTitle] = useState('Select Product');

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const [salesStatusFilter, setSalesStatusFilter] = useState('all');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesLoading, setSalesLoading] = useState(false);
  const [sales, setSales] = useState([]);
  const [salesSummary, setSalesSummary] = useState({
    pending_pos_sync: 0,
    synced_to_pos: 0,
    sync_failed: 0,
  });

  const [lastReceipt, setLastReceipt] = useState(null);

  const subtotal = useMemo(() => toMoney(cart.reduce((sum, line) => sum + toMoney(line.qty * line.unitPrice), 0)), [cart]);
  const discountValue = useMemo(() => {
    const parsed = toMoney(discount);
    return Math.max(0, Math.min(parsed, subtotal));
  }, [discount, subtotal]);
  const total = useMemo(() => toMoney(Math.max(0, subtotal - discountValue)), [subtotal, discountValue]);
  const tendered = useMemo(() => {
    if (tenderedAmount === '') return total;
    return Math.max(0, toMoney(tenderedAmount));
  }, [tenderedAmount, total]);
  const change = useMemo(() => (tendered > total ? toMoney(tendered - total) : 0), [tendered, total]);
  const balanceDue = useMemo(() => (tendered < total ? toMoney(total - tendered) : 0), [tendered, total]);

  const focusBarcodeInput = useCallback(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
      barcodeInputRef.current.select();
    }
  }, []);

  const fetchEmergencySales = useCallback(async () => {
    try {
      setSalesLoading(true);
      const response = await api.get('/admin/emergency-sales', {
        params: {
          page: 1,
          pageSize: 50,
          status: salesStatusFilter,
          search: salesSearch.trim() || undefined,
        },
      });

      setSales(response.data?.sales || []);
      setSalesSummary(response.data?.summary || {
        pending_pos_sync: 0,
        synced_to_pos: 0,
        sync_failed: 0,
      });
    } catch (error) {
      notifyError(`Failed to load emergency sales: ${error.response?.data?.error || error.message}`, 4000);
    } finally {
      setSalesLoading(false);
    }
  }, [salesSearch, salesStatusFilter]);

  useEffect(() => {
    fetchEmergencySales();
  }, [fetchEmergencySales]);

  useEffect(() => {
    focusBarcodeInput();
  }, [focusBarcodeInput]);

  const printReceipt = useCallback((receipt) => {
    if (!receipt) return;

    const itemsHtml = (receipt.items || []).map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.product_code || '-'}</td>
        <td>${item.product_name}</td>
        <td style="text-align:right;">${item.qty}</td>
        <td style="text-align:right;">${formatMoney(item.unit_price)}</td>
        <td style="text-align:right;">${formatMoney(item.line_total)}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html>
      <head>
        <title>Emergency Sale Receipt ${receipt.sale_ref}</title>
        <style>
          body { font-family: 'Courier New', monospace; padding: 16px; color: #111; }
          .header { text-align: center; margin-bottom: 12px; }
          .meta { margin-bottom: 10px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ddd; padding: 6px; }
          th { background: #f2f2f2; }
          .totals { margin-top: 12px; font-size: 13px; }
          .totals div { display: flex; justify-content: space-between; margin: 3px 0; }
          .sync-note { margin-top: 14px; font-weight: 700; color: #b26a00; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin:0;">Citi-Nati Supermarket</h2>
          <p style="margin:4px 0 0 0;">Emergency Sale Receipt</p>
        </div>
        <div class="meta">
          <div><strong>Sale Ref:</strong> ${receipt.sale_ref}</div>
          <div><strong>Date:</strong> ${formatDateTime(receipt.created_at)}</div>
          <div><strong>Cashier:</strong> ${receipt.cashier_name || '-'}</div>
          <div><strong>Payment:</strong> ${receipt.payment_method || '-'}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Code</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div><span>Subtotal</span><span>${formatMoney(receipt.subtotal)}</span></div>
          <div><span>Discount</span><span>${formatMoney(receipt.discount)}</span></div>
          <div><span>Total</span><span>${formatMoney(receipt.total)}</span></div>
          <div><span>Tendered</span><span>${formatMoney(receipt.tendered_amount)}</span></div>
          <div><span>Change</span><span>${formatMoney(receipt.change_amount)}</span></div>
          <div><span>Balance Due</span><span>${formatMoney(receipt.balance_due)}</span></div>
        </div>

        <div class="sync-note">Pending POS Sync</div>
      </body>
      </html>
    `;

    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      notifyError('Popup blocked. Please allow popups to print receipt.', 4000);
      return;
    }

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }, []);

  const addProductToCart = useCallback((product, qty = 1) => {
    const productId = Number(product.id);
    if (!Number.isFinite(productId)) return;

    const unitPrice = toMoney(product.unitPrice ?? product.unit_price ?? product.discountPrice ?? product.price);
    const effectiveStock = Number(product.effectiveStock ?? product.effective_stock ?? product.stock ?? 0);

    setCart((prev) => {
      const existingIndex = prev.findIndex((line) => Number(line.productId) === productId);
      if (existingIndex >= 0) {
        const next = [...prev];
        const nextQty = next[existingIndex].qty + qty;
        if (nextQty > effectiveStock) {
          notifyError(`Cannot exceed available stock (${effectiveStock}) for ${product.name}`, 3000);
          return prev;
        }

        next[existingIndex] = {
          ...next[existingIndex],
          qty: nextQty,
          lineTotal: toMoney(nextQty * next[existingIndex].unitPrice),
        };
        return next;
      }

      if (qty > effectiveStock) {
        notifyError(`Insufficient stock for ${product.name}. Available ${effectiveStock}`, 3000);
        return prev;
      }

      return [
        ...prev,
        {
          id: `${productId}-${Date.now()}`,
          productId,
          barcode: product.barcode || '-',
          productCode: product.sourceCode || product.productCode || '-',
          productName: product.name,
          unitPrice,
          qty,
          availableStock: effectiveStock,
          lineTotal: toMoney(unitPrice * qty),
        },
      ];
    });
  }, []);

  const runProductLookup = useCallback(async (query, opts = {}) => {
    const trimmed = String(query || '').trim();
    if (!trimmed) return;

    try {
      const response = await api.get('/admin/emergency-sales/lookup', {
        params: { q: trimmed },
      });
      const products = response.data?.products || [];

      if (products.length === 0) {
        notifyError(`No product found for "${trimmed}"`, 2500);
        return;
      }

      if (products.length === 1 || opts.forceSingle) {
        addProductToCart(products[0], 1);
        notifySuccess(`${products[0].name} added to invoice`, 1800);
        return;
      }

      setPickerTitle(`Multiple matches for "${trimmed}"`);
      setProductPickerResults(products);
      setShowProductPicker(true);
    } catch (error) {
      notifyError(`Lookup failed: ${error.response?.data?.error || error.message}`, 3500);
    }
  }, [addProductToCart]);

  const onBarcodeEnter = async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const query = barcodeQuery.trim();
    if (!query) return;

    await runProductLookup(query);
    setBarcodeQuery('');
    focusBarcodeInput();
  };

  const updateLineQty = (lineId, nextQtyRaw) => {
    const nextQty = Math.max(0, parseInt(nextQtyRaw, 10) || 0);

    setCart((prev) => prev
      .map((line) => {
        if (line.id !== lineId) return line;

        if (nextQty === 0) {
          return null;
        }

        if (nextQty > line.availableStock) {
          notifyError(`Cannot exceed stock (${line.availableStock}) for ${line.productName}`, 2500);
          return line;
        }

        return {
          ...line,
          qty: nextQty,
          lineTotal: toMoney(nextQty * line.unitPrice),
        };
      })
      .filter(Boolean));
  };

  const removeSelectedRow = useCallback(() => {
    if (!selectedRowId) return;
    setCart((prev) => prev.filter((line) => line.id !== selectedRowId));
    setSelectedRowId(null);
  }, [selectedRowId]);

  const clearInvoice = useCallback(() => {
    setCart([]);
    setSelectedRowId(null);
    setDiscount('0');
    setTenderedAmount('');
    notifyInfo('Invoice cleared', 1500);
    focusBarcodeInput();
  }, [focusBarcodeInput]);

  const submitSale = async () => {
    if (cart.length === 0) {
      notifyError('Add at least one product before completing sale', 2500);
      return;
    }

    try {
      setIsSubmittingSale(true);
      const response = await api.post('/admin/emergency-sales', {
        items: cart.map((line) => ({
          product_id: line.productId,
          qty: line.qty,
        })),
        discount: discountValue,
        tendered_amount: tendered,
        payment_method: paymentMethod,
      });

      const savedSale = response.data?.sale;
      const receipt = response.data?.receipt;
      setLastReceipt(receipt || null);

      notifySuccess(`Emergency sale saved: ${savedSale?.sale_ref || ''}`, 3500);

      setShowPaymentDialog(false);
      clearInvoice();
      await fetchEmergencySales();

      if (receipt) {
        printReceipt(receipt);
      }
    } catch (error) {
      notifyError(`Sale failed: ${error.response?.data?.error || error.message}`, 4000);
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await (rootRef.current || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      notifyError(`Fullscreen failed: ${error.message}`, 3000);
    }
  };

  const handleRetryFailedSale = async (saleId) => {
    try {
      await api.post(`/admin/emergency-sales/${saleId}/retry-sync`);
      notifySuccess('Sale marked for retry', 2200);
      await fetchEmergencySales();
    } catch (error) {
      notifyError(`Retry failed: ${error.response?.data?.error || error.message}`, 3500);
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const targetTag = String(event.target?.tagName || '').toLowerCase();
      const isTextInput = targetTag === 'input' || targetTag === 'textarea';

      if (event.key === 'F2') {
        event.preventDefault();
        focusBarcodeInput();
        return;
      }

      if (event.key === 'F4') {
        event.preventDefault();
        clearInvoice();
        return;
      }

      if (event.key === 'F6') {
        event.preventDefault();
        if (cart.length === 0) {
          notifyError('Invoice is empty', 2000);
          return;
        }
        setTenderedAmount(String(total));
        setShowPaymentDialog(true);
        return;
      }

      if (event.key === 'Delete' && !isTextInput) {
        event.preventDefault();
        removeSelectedRow();
        return;
      }

      if (event.key === 'Escape') {
        if (showProductPicker) {
          event.preventDefault();
          setShowProductPicker(false);
        } else if (showPaymentDialog) {
          event.preventDefault();
          setShowPaymentDialog(false);
        }
      }

      if (event.key === 'Enter' && showPaymentDialog) {
        const targetTag = String(event.target?.tagName || '').toLowerCase();
        const allowConfirm = targetTag !== 'textarea';
        if (allowConfirm) {
          event.preventDefault();
          if (!isSubmittingSale && cart.length > 0) {
            submitSale();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    cart.length,
    clearInvoice,
    focusBarcodeInput,
    removeSelectedRow,
    showPaymentDialog,
    showProductPicker,
    isSubmittingSale,
    submitSale,
    total,
  ]);

  return (
    <div ref={rootRef} style={{ padding: '1.5rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#2d2d2d' }}>Emergency Sale / Invoice Panel</h2>
          <p style={{ margin: '0.35rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
            Internal in-shop fallback cashier panel. Receipts print immediately while POS sync happens later.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={toggleFullscreen} style={{
            border: '1px solid #888',
            backgroundColor: '#fff',
            color: '#333',
            borderRadius: '6px',
            padding: '0.6rem 0.9rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}>
            <i className="fas fa-expand" style={{ marginRight: '0.4rem' }}></i>
            Fullscreen
          </button>
          <button onClick={() => setShowPaymentDialog(true)} disabled={cart.length === 0} style={{
            border: 'none',
            backgroundColor: '#2e7d32',
            color: '#fff',
            borderRadius: '6px',
            padding: '0.6rem 1rem',
            cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
            fontWeight: 700,
            opacity: cart.length === 0 ? 0.6 : 1,
          }}>
            <i className="fas fa-cash-register" style={{ marginRight: '0.4rem' }}></i>
            Sale (F6)
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '2.1fr 1fr',
        gap: '1rem',
      }}>
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr auto auto', gap: '0.6rem', marginBottom: '0.8rem' }}>
            <input
              ref={barcodeInputRef}
              placeholder="Scan barcode / code then press Enter"
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              onKeyDown={onBarcodeEnter}
              style={{ padding: '0.7rem', borderRadius: '6px', border: '1px solid #ccc', fontWeight: 600 }}
            />
            <input
              placeholder="Manual search by barcode, code, or name"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runProductLookup(manualSearch);
                }
              }}
              style={{ padding: '0.7rem', borderRadius: '6px', border: '1px solid #ccc' }}
            />
            <button
              onClick={() => runProductLookup(manualSearch)}
              style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '6px', padding: '0.7rem 1rem', cursor: 'pointer', fontWeight: 700 }}
            >
              Search
            </button>
            <button
              onClick={clearInvoice}
              style={{ border: '1px solid #c62828', backgroundColor: '#fff', color: '#c62828', borderRadius: '6px', padding: '0.7rem 0.8rem', cursor: 'pointer', fontWeight: 700 }}
            >
              Clear (F4)
            </button>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '54vh', overflowY: 'auto', border: '1px solid #ececec', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '880px' }}>
              <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f8f8', zIndex: 1 }}>
                <tr>
                  <th style={{ padding: '0.7rem', textAlign: 'center' }}>#</th>
                  <th style={{ padding: '0.7rem', textAlign: 'left' }}>Barcode</th>
                  <th style={{ padding: '0.7rem', textAlign: 'left' }}>Product Code</th>
                  <th style={{ padding: '0.7rem', textAlign: 'left' }}>Product Name</th>
                  <th style={{ padding: '0.7rem', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ padding: '0.7rem', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.7rem', textAlign: 'right' }}>Line Total</th>
                  <th style={{ padding: '0.7rem', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '1.4rem', color: '#777' }}>No items in invoice</td>
                  </tr>
                )}
                {cart.map((line, index) => (
                  <tr
                    key={line.id}
                    onClick={() => setSelectedRowId(line.id)}
                    style={{
                      backgroundColor: selectedRowId === line.id ? '#ede7f6' : '#fff',
                      borderBottom: '1px solid #eee',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '0.65rem', textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ padding: '0.65rem' }}>{line.barcode}</td>
                    <td style={{ padding: '0.65rem', fontFamily: 'monospace' }}>{line.productCode}</td>
                    <td style={{ padding: '0.65rem' }}>{line.productName}</td>
                    <td style={{ padding: '0.65rem', textAlign: 'right', fontWeight: 600 }}>{formatMoney(line.unitPrice)}</td>
                    <td style={{ padding: '0.65rem', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); updateLineQty(line.id, line.qty - 1); }} style={{ border: '1px solid #ccc', backgroundColor: '#fff', borderRadius: '4px', width: '28px', cursor: 'pointer' }}>-</button>
                        <input
                          type="number"
                          min="1"
                          value={line.qty}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateLineQty(line.id, e.target.value)}
                          style={{ width: '52px', textAlign: 'center', border: '1px solid #ccc', borderRadius: '4px', padding: '0.2rem' }}
                        />
                        <button onClick={(e) => { e.stopPropagation(); updateLineQty(line.id, line.qty + 1); }} style={{ border: '1px solid #ccc', backgroundColor: '#fff', borderRadius: '4px', width: '28px', cursor: 'pointer' }}>+</button>
                      </div>
                    </td>
                    <td style={{ padding: '0.65rem', textAlign: 'right', fontWeight: 700 }}>{formatMoney(line.lineTotal)}</td>
                    <td style={{ padding: '0.65rem', textAlign: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCart((prev) => prev.filter((p) => p.id !== line.id));
                          if (selectedRowId === line.id) setSelectedRowId(null);
                        }}
                        style={{ border: '1px solid #c62828', color: '#c62828', backgroundColor: '#fff', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
            <div style={{ color: '#666', fontSize: '0.9rem' }}>
              Shortcuts: F2 Focus Search | F4 Clear | F6 Sale | Delete Remove | Esc Close Dialog
            </div>
            <button
              onClick={removeSelectedRow}
              disabled={!selectedRowId}
              style={{ border: '1px solid #c62828', color: '#c62828', backgroundColor: '#fff', borderRadius: '6px', padding: '0.45rem 0.8rem', cursor: selectedRowId ? 'pointer' : 'not-allowed', opacity: selectedRowId ? 1 : 0.6 }}
            >
              Remove Selected (Delete)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.8rem' }}>Invoice Summary</h3>
            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cashier</span><strong>{user?.name || user?.email || 'Admin'}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Items</span><strong>{cart.length}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  style={{ width: '110px', textAlign: 'right', borderRadius: '4px', border: '1px solid #ccc', padding: '0.3rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #eee', paddingTop: '0.55rem', fontSize: '1.05rem' }}>
                <span>Total</span>
                <strong style={{ color: '#2e7d32' }}>{formatMoney(total)}</strong>
              </div>
            </div>
            <button onClick={() => setShowPaymentDialog(true)} disabled={cart.length === 0} style={{
              width: '100%',
              border: 'none',
              backgroundColor: '#2e7d32',
              color: '#fff',
              borderRadius: '6px',
              padding: '0.75rem',
              fontWeight: 700,
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              opacity: cart.length === 0 ? 0.6 : 1,
            }}>
              Complete Sale (F6)
            </button>
          </div>

          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.8rem' }}>Sync Status Snapshot</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              {Object.keys(salesSummary).map((key) => (
                <div key={key} style={{ border: `1px solid ${STATUS_COLORS[key]}55`, borderRadius: '6px', padding: '0.55rem', textAlign: 'center', backgroundColor: `${STATUS_COLORS[key]}15` }}>
                  <div style={{ fontSize: '0.75rem', color: '#555' }}>{STATUS_LABELS[key]}</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: STATUS_COLORS[key] }}>{salesSummary[key] || 0}</div>
                </div>
              ))}
            </div>
          </div>

          {lastReceipt && (
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '0.6rem' }}>Last Receipt</h3>
              <div style={{ fontSize: '0.9rem', color: '#444', marginBottom: '0.7rem' }}>
                <div><strong>Sale Ref:</strong> {lastReceipt.sale_ref}</div>
                <div><strong>Total:</strong> {formatMoney(lastReceipt.total)}</div>
                <div><strong>Status:</strong> Pending POS Sync</div>
              </div>
              <button onClick={() => printReceipt(lastReceipt)} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '6px', padding: '0.55rem 0.85rem', cursor: 'pointer', fontWeight: 700 }}>
                <i className="fas fa-print" style={{ marginRight: '0.4rem' }}></i>
                Print Again
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1rem', marginTop: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.7rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <h3 style={{ margin: 0 }}>Emergency Sales Monitoring</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              placeholder="Search sale ref or cashier"
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchEmergencySales();
              }}
              style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}
            />
            <select value={salesStatusFilter} onChange={(e) => setSalesStatusFilter(e.target.value)} style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }}>
              <option value="all">All</option>
              <option value="pending_pos_sync">Pending</option>
              <option value="synced_to_pos">Synced</option>
              <option value="sync_failed">Failed</option>
            </select>
            <button onClick={fetchEmergencySales} style={{ border: 'none', backgroundColor: '#1f4f8f', color: '#fff', borderRadius: '4px', padding: '0.5rem 0.8rem', cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f7f7f7' }}>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>Sale Ref</th>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>Created</th>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>Cashier</th>
                <th style={{ padding: '0.6rem', textAlign: 'right' }}>Total</th>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '0.6rem', textAlign: 'center' }}>Retry</th>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>Sync Error</th>
                <th style={{ padding: '0.6rem', textAlign: 'left' }}>POS Invoice</th>
                <th style={{ padding: '0.6rem', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {salesLoading && (
                <tr>
                  <td colSpan={9} style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>Loading emergency sales...</td>
                </tr>
              )}
              {!salesLoading && sales.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>No emergency sales found</td>
                </tr>
              )}
              {!salesLoading && sales.map((sale) => (
                <tr key={sale.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.55rem', fontFamily: 'monospace' }}>{sale.sale_ref}</td>
                  <td style={{ padding: '0.55rem' }}>{formatDateTime(sale.createdAt)}</td>
                  <td style={{ padding: '0.55rem' }}>{sale.cashier_name || '-'}</td>
                  <td style={{ padding: '0.55rem', textAlign: 'right', fontWeight: 700 }}>{formatMoney(sale.total)}</td>
                  <td style={{ padding: '0.55rem' }}>
                    <span style={{
                      padding: '0.25rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      backgroundColor: `${STATUS_COLORS[sale.sync_status] || '#555'}20`,
                      color: STATUS_COLORS[sale.sync_status] || '#555',
                    }}>
                      {STATUS_LABELS[sale.sync_status] || sale.sync_status}
                    </span>
                  </td>
                  <td style={{ padding: '0.55rem', textAlign: 'center' }}>{sale.retry_count}</td>
                  <td style={{ padding: '0.55rem', color: '#a33', maxWidth: '260px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={sale.sync_error || ''}>
                    {sale.sync_error || '-'}
                  </td>
                  <td style={{ padding: '0.55rem' }}>{sale.pos_invoice_no || '-'}</td>
                  <td style={{ padding: '0.55rem', textAlign: 'center' }}>
                    {sale.sync_status === 'sync_failed' ? (
                      <button
                        onClick={() => handleRetryFailedSale(sale.id)}
                        style={{ border: '1px solid #f57c00', backgroundColor: '#fff7e6', color: '#a86500', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontWeight: 700 }}
                      >
                        Retry
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showProductPicker && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '1rem',
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', width: '100%', maxWidth: '760px', maxHeight: '80vh', overflow: 'hidden' }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{pickerTitle}</strong>
              <button onClick={() => setShowProductPicker(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f8f8' }}>
                    <th style={{ textAlign: 'left', padding: '0.65rem' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '0.65rem' }}>Name</th>
                    <th style={{ textAlign: 'right', padding: '0.65rem' }}>Price</th>
                    <th style={{ textAlign: 'right', padding: '0.65rem' }}>Stock</th>
                    <th style={{ textAlign: 'center', padding: '0.65rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {productPickerResults.map((product) => (
                    <tr key={product.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.65rem', fontFamily: 'monospace' }}>{product.sourceCode || '-'}</td>
                      <td style={{ padding: '0.65rem' }}>{product.name}</td>
                      <td style={{ padding: '0.65rem', textAlign: 'right' }}>{formatMoney(product.unitPrice ?? product.unit_price ?? product.price)}</td>
                      <td style={{ padding: '0.65rem', textAlign: 'right' }}>{product.effective_stock ?? product.effectiveStock ?? product.stock ?? 0}</td>
                      <td style={{ padding: '0.65rem', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            addProductToCart(product, 1);
                            setShowProductPicker(false);
                            setProductPickerResults([]);
                            focusBarcodeInput();
                          }}
                          style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '4px', padding: '0.35rem 0.6rem', cursor: 'pointer' }}
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showPaymentDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1200,
          padding: '1rem',
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', width: '100%', maxWidth: '460px', padding: '1.2rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.9rem' }}>Confirm Emergency Sale</h3>

            <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total Amount</span><strong>{formatMoney(total)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Payment Method</span>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0.35rem' }}>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Tendered Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tenderedAmount}
                  onChange={(e) => setTenderedAmount(e.target.value)}
                  style={{ width: '150px', textAlign: 'right', borderRadius: '4px', border: '1px solid #ccc', padding: '0.35rem' }}
                  autoFocus
                />
              </div>
              {change > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2e7d32' }}>
                  <span>Change</span>
                  <strong>{formatMoney(change)}</strong>
                </div>
              )}
              {balanceDue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828' }}>
                  <span>Balance Due</span>
                  <strong>{formatMoney(balanceDue)}</strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.55rem' }}>
              <button onClick={() => setShowPaymentDialog(false)} disabled={isSubmittingSale} style={{ border: '1px solid #ccc', backgroundColor: '#fff', color: '#333', borderRadius: '4px', padding: '0.55rem 0.8rem', cursor: 'pointer' }}>
                Cancel (Esc)
              </button>
              <button onClick={submitSale} disabled={isSubmittingSale || cart.length === 0} style={{ border: 'none', backgroundColor: '#2e7d32', color: '#fff', borderRadius: '4px', padding: '0.55rem 0.85rem', cursor: isSubmittingSale ? 'not-allowed' : 'pointer', opacity: isSubmittingSale ? 0.7 : 1, fontWeight: 700 }}>
                {isSubmittingSale ? 'Saving...' : 'Confirm Sale (Enter)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEmergencySales;
