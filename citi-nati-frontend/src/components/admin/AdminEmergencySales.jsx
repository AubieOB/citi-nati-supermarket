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
  pending_pos_sync: '#b06c00',
  synced_to_pos: '#2e7d32',
  sync_failed: '#c62828',
};

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function formatMoney(value) {
  return toMoney(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function isPrintableKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return typeof event.key === 'string' && event.key.length === 1;
}

const AdminEmergencySales = () => {
  const { user } = useAuth();

  const rootRef = useRef(null);
  const hiddenBarcodeInputRef = useRef(null);
  const searchModalInputRef = useRef(null);

  const scanBufferRef = useRef('');
  const scanLastKeyAtRef = useRef(0);
  const scanClearTimeoutRef = useRef(null);

  const [cart, setCart] = useState([]);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [barcodeGhostValue, setBarcodeGhostValue] = useState('');

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [searchModalLoading, setSearchModalLoading] = useState(false);
  const [searchModalResults, setSearchModalResults] = useState([]);

  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  const [sales, setSales] = useState([]);
  const [salesSummary, setSalesSummary] = useState({
    pending_pos_sync: 0,
    synced_to_pos: 0,
    sync_failed: 0,
  });

  const [lastReceipt, setLastReceipt] = useState(null);

  const subtotal = useMemo(
    () => toMoney(cart.reduce((sum, line) => sum + toMoney(line.qty * line.unitPrice), 0)),
    [cart]
  );

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

  const focusCaptureInput = useCallback(() => {
    if (hiddenBarcodeInputRef.current) {
      hiddenBarcodeInputRef.current.focus();
    }
  }, []);

  const fetchEmergencySales = useCallback(async () => {
    try {
      const response = await api.get('/admin/emergency-sales', {
        params: {
          page: 1,
          pageSize: 8,
          status: 'all',
        },
      });

      setSales(response.data?.sales || []);
      setSalesSummary(
        response.data?.summary || {
          pending_pos_sync: 0,
          synced_to_pos: 0,
          sync_failed: 0,
        }
      );
    } catch (error) {
      notifyError(`Failed to load emergency sales: ${error.response?.data?.error || error.message}`, 3000);
    }
  }, []);

  useEffect(() => {
    fetchEmergencySales();
    focusCaptureInput();
  }, [fetchEmergencySales, focusCaptureInput]);

  useEffect(() => {
    if (!searchModalOpen) return;
    if (searchModalInputRef.current) {
      searchModalInputRef.current.focus();
    }
  }, [searchModalOpen]);

  const addProductToCart = useCallback((product, qty = 1) => {
    const productId = Number(product.id);
    if (!Number.isFinite(productId)) return;

    const unitPrice = toMoney(product.unitPrice ?? product.unit_price ?? product.discountPrice ?? product.price);
    const effectiveStock = Number(product.effectiveStock ?? product.effective_stock ?? product.stock ?? 0);

    setCart((prev) => {
      const index = prev.findIndex((line) => Number(line.productId) === productId);

      if (index >= 0) {
        const next = [...prev];
        const nextQty = next[index].qty + qty;

        if (nextQty > effectiveStock) {
          notifyError(`Cannot exceed stock (${effectiveStock}) for ${product.name}`, 2500);
          return prev;
        }

        next[index] = {
          ...next[index],
          qty: nextQty,
          lineTotal: toMoney(nextQty * next[index].unitPrice),
        };
        return next;
      }

      if (qty > effectiveStock) {
        notifyError(`Insufficient stock for ${product.name}. Available ${effectiveStock}`, 2500);
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

  const lookupProducts = useCallback(async (query) => {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];

    const response = await api.get('/admin/emergency-sales/lookup', {
      params: { q: trimmed },
    });

    return response.data?.products || [];
  }, []);

  const lookupAndAddFromScan = useCallback(async (scanValue) => {
    const query = String(scanValue || '').trim();
    if (!query) return;

    try {
      const products = await lookupProducts(query);

      if (products.length === 0) {
        notifyError(`No product found for "${query}"`, 2200);
        return;
      }

      const normalized = query.toLowerCase();
      const exactMatches = products.filter((p) => {
        const byBarcode = String(p.barcode || '').toLowerCase() === normalized;
        const byCode = String(p.sourceCode || p.productCode || '').toLowerCase() === normalized;
        return byBarcode || byCode;
      });

      if (exactMatches.length === 1) {
        addProductToCart(exactMatches[0], 1);
        notifySuccess(`${exactMatches[0].name} added`, 1400);
        return;
      }

      if (products.length === 1) {
        addProductToCart(products[0], 1);
        notifySuccess(`${products[0].name} added`, 1400);
        return;
      }

      setSearchModalQuery(query);
      setSearchModalResults(products);
      setSearchModalOpen(true);
      notifyInfo('Multiple matches found. Select from search modal.', 2000);
    } catch (error) {
      notifyError(`Lookup failed: ${error.response?.data?.error || error.message}`, 3000);
    }
  }, [addProductToCart, lookupProducts]);

  useEffect(() => {
    if (!searchModalOpen) return;

    const query = searchModalQuery.trim();
    if (!query) {
      setSearchModalResults([]);
      setSearchModalLoading(false);
      return;
    }

    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        setSearchModalLoading(true);
        const products = await lookupProducts(query);
        if (!disposed) {
          setSearchModalResults(products);
        }
      } catch (error) {
        if (!disposed) {
          setSearchModalResults([]);
          notifyError(`Search failed: ${error.response?.data?.error || error.message}`, 2600);
        }
      } finally {
        if (!disposed) {
          setSearchModalLoading(false);
        }
      }
    }, 160);

    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [lookupProducts, searchModalOpen, searchModalQuery]);

  const clearInvoice = useCallback(() => {
    setCart([]);
    setSelectedRowId(null);
    setDiscount('0');
    setTenderedAmount('');
    notifyInfo('New invoice started', 1500);
  }, []);

  const removeSelectedRow = useCallback(() => {
    if (!selectedRowId) return;
    setCart((prev) => prev.filter((line) => line.id !== selectedRowId));
    setSelectedRowId(null);
  }, [selectedRowId]);

  const printReceipt = useCallback((receipt) => {
    if (!receipt) {
      notifyInfo('No receipt available to print', 1800);
      return;
    }

    const itemsHtml = (receipt.items || [])
      .map(
        (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${item.product_code || '-'}</td>
          <td>${item.product_name}</td>
          <td style="text-align:right;">${item.qty}</td>
          <td style="text-align:right;">${formatMoney(item.unit_price)}</td>
          <td style="text-align:right;">${formatMoney(item.line_total)}</td>
        </tr>`
      )
      .join('');

    const html = `<!doctype html>
    <html>
    <head>
      <title>Emergency Receipt ${receipt.sale_ref}</title>
      <style>
        body { font-family: Consolas, 'Courier New', monospace; padding: 12px; color: #111; }
        h2, p { margin: 0; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th, td { border: 1px solid #bbb; padding: 5px; }
        .meta { margin-top: 10px; font-size: 12px; }
        .row { display: flex; justify-content: space-between; margin-top: 2px; }
        .note { margin-top: 12px; color: #9a5d00; font-weight: 700; }
      </style>
    </head>
    <body>
      <h2>Citi-Nati Supermarket</h2>
      <p>Emergency Sale Receipt</p>
      <div class="meta">
        <div><strong>Ref:</strong> ${receipt.sale_ref}</div>
        <div><strong>Date:</strong> ${formatDateTime(receipt.created_at)}</div>
        <div><strong>Cashier:</strong> ${receipt.cashier_name || '-'}</div>
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
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="row"><span>Subtotal</span><span>${formatMoney(receipt.subtotal)}</span></div>
      <div class="row"><span>Discount</span><span>${formatMoney(receipt.discount)}</span></div>
      <div class="row"><span>Total</span><span>${formatMoney(receipt.total)}</span></div>
      <div class="row"><span>Tendered</span><span>${formatMoney(receipt.tendered_amount)}</span></div>
      <div class="row"><span>Change</span><span>${formatMoney(receipt.change_amount)}</span></div>
      <div class="note">Pending POS Sync</div>
    </body>
    </html>`;

    const popup = window.open('', '_blank', 'width=780,height=680');
    if (!popup) {
      notifyError('Popup blocked. Please allow popups to print.', 3000);
      return;
    }

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }, []);

  const submitSale = useCallback(async () => {
    if (cart.length === 0) {
      notifyError('Invoice is empty', 2200);
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
      const receipt = response.data?.receipt || null;
      setLastReceipt(receipt);

      notifySuccess(`Saved ${savedSale?.sale_ref || 'sale'}`, 2600);

      setShowPaymentDialog(false);
      clearInvoice();
      fetchEmergencySales();

      if (receipt) {
        printReceipt(receipt);
      }
    } catch (error) {
      notifyError(`Sale failed: ${error.response?.data?.error || error.message}`, 3500);
    } finally {
      setIsSubmittingSale(false);
    }
  }, [cart, clearInvoice, discountValue, fetchEmergencySales, paymentMethod, printReceipt, tendered]);

  const updateLineQty = useCallback((lineId, nextQtyRaw) => {
    const nextQty = Math.max(0, parseInt(nextQtyRaw, 10) || 0);

    setCart((prev) =>
      prev
        .map((line) => {
          if (line.id !== lineId) return line;

          if (nextQty === 0) return null;

          if (nextQty > line.availableStock) {
            notifyError(`Cannot exceed stock (${line.availableStock})`, 2200);
            return line;
          }

          return {
            ...line,
            qty: nextQty,
            lineTotal: toMoney(nextQty * line.unitPrice),
          };
        })
        .filter(Boolean)
    );
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (rootRef.current || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      notifyError(`Fullscreen failed: ${error.message}`, 2500);
    }
  }, []);

  const openSearchModal = useCallback(() => {
    setSearchModalOpen(true);
    setSearchModalQuery('');
    setSearchModalResults([]);
  }, []);

  const closeAllDialogs = useCallback(() => {
    setSearchModalOpen(false);
    setShowQuickMenu(false);
    setShowPaymentDialog(false);
  }, []);

  useEffect(() => {
    const resetScanBuffer = () => {
      scanBufferRef.current = '';
      setBarcodeGhostValue('');
    };

    const onKeyDown = (event) => {
      const targetTag = String(event.target?.tagName || '').toLowerCase();
      const isInputLike = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';

      if (event.key === 'F1') {
        event.preventDefault();
        openSearchModal();
        return;
      }

      if (event.key === 'F3') {
        event.preventDefault();
        focusCaptureInput();
        notifyInfo('Invoice / scanner focus ready', 1200);
        return;
      }

      if (event.key === 'F4') {
        event.preventDefault();
        setShowQuickMenu(true);
        return;
      }

      if (event.key === 'F6') {
        event.preventDefault();
        if (cart.length === 0) {
          notifyError('Invoice is empty', 1800);
          return;
        }
        setTenderedAmount(String(total));
        setShowPaymentDialog(true);
        return;
      }

      if (event.key === 'F8') {
        event.preventDefault();
        printReceipt(lastReceipt);
        return;
      }

      if (event.key === 'F9') {
        event.preventDefault();
        removeSelectedRow();
        return;
      }

      if (event.key === 'F10') {
        event.preventDefault();
        clearInvoice();
        return;
      }

      if (event.key === 'F11') {
        event.preventDefault();
        toggleFullscreen();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeAllDialogs();
        resetScanBuffer();
        return;
      }

      if (event.key === 'Enter' && showPaymentDialog) {
        event.preventDefault();
        if (!isSubmittingSale) {
          submitSale();
        }
        return;
      }

      if (isPrintableKey(event) && !searchModalOpen && !showPaymentDialog) {
        const now = Date.now();
        if (now - scanLastKeyAtRef.current > 85) {
          scanBufferRef.current = '';
        }
        scanLastKeyAtRef.current = now;
        scanBufferRef.current += event.key;
        setBarcodeGhostValue(scanBufferRef.current);

        if (scanClearTimeoutRef.current) {
          clearTimeout(scanClearTimeoutRef.current);
        }
        scanClearTimeoutRef.current = setTimeout(() => {
          resetScanBuffer();
        }, 180);
        return;
      }

      if (event.key === 'Enter' && !searchModalOpen && !showPaymentDialog && scanBufferRef.current.length >= 4) {
        event.preventDefault();
        const scanned = scanBufferRef.current;
        resetScanBuffer();
        lookupAndAddFromScan(scanned);
        return;
      }

      if (event.key === 'Delete' && !isInputLike) {
        event.preventDefault();
        removeSelectedRow();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (scanClearTimeoutRef.current) {
        clearTimeout(scanClearTimeoutRef.current);
      }
    };
  }, [
    cart.length,
    clearInvoice,
    closeAllDialogs,
    focusCaptureInput,
    isSubmittingSale,
    lastReceipt,
    lookupAndAddFromScan,
    openSearchModal,
    printReceipt,
    removeSelectedRow,
    searchModalOpen,
    showPaymentDialog,
    submitSale,
    toggleFullscreen,
    total,
  ]);

  const headerButtonStyle = {
    border: '1px solid #5d5d5d',
    borderRadius: '4px',
    fontWeight: 700,
    fontSize: '0.83rem',
    minHeight: '52px',
    minWidth: '88px',
    cursor: 'pointer',
  };

  return (
    <div
      ref={rootRef}
      style={{
        height: 'calc(100vh - 112px)',
        overflow: 'hidden',
        backgroundColor: '#d7d9de',
        border: '2px solid #7a7d86',
        borderRadius: '8px',
        padding: '0.65rem',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        color: '#101010',
      }}
    >
      <input
        ref={hiddenBarcodeInputRef}
        value={barcodeGhostValue}
        onChange={(e) => setBarcodeGhostValue(e.target.value)}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
        aria-hidden="true"
      />

      <div style={{
        backgroundColor: '#bfc3ff',
        border: '1px solid #8e92c3',
        borderRadius: '6px',
        padding: '0.55rem 0.75rem',
        marginBottom: '0.55rem',
      }}>
        <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '1.7rem', letterSpacing: '0.4px', marginBottom: '0.45rem' }}>
          EMERGENCY SALE - Citi Nati Supermarket
        </div>

        <div style={{ display: 'flex', gap: '0.42rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={openSearchModal} style={{ ...headerButtonStyle, backgroundColor: '#98f28f' }}>SEARCH<br />[F1]</button>
          <button onClick={focusCaptureInput} style={{ ...headerButtonStyle, backgroundColor: '#ffe568' }}>CS / INV<br />[F3]</button>
          <button onClick={() => setShowQuickMenu(true)} style={{ ...headerButtonStyle, backgroundColor: '#f8bd75' }}>Q. MENU<br />[F4]</button>
          <button onClick={() => setShowPaymentDialog(true)} style={{ ...headerButtonStyle, backgroundColor: '#f4afd8' }}>SAVE<br />[F6]</button>
          <button onClick={() => printReceipt(lastReceipt)} style={{ ...headerButtonStyle, backgroundColor: '#ffc6ba' }}>PRINT<br />[F8]</button>
          <button onClick={removeSelectedRow} style={{ ...headerButtonStyle, backgroundColor: '#ff6248', color: '#fff' }}>DELETE<br />[F9]</button>
          <button onClick={clearInvoice} style={{ ...headerButtonStyle, backgroundColor: '#ecf0a8' }}>NEW<br />[F10]</button>
          <button onClick={toggleFullscreen} style={{ ...headerButtonStyle, backgroundColor: '#ece3a8' }}>FULL<br />[F11]</button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '2.2fr 1fr',
        gap: '0.55rem',
        flex: 1,
        minHeight: 0,
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          backgroundColor: '#cfd2ff',
          border: '1px solid #8f92c8',
          borderRadius: '6px',
          padding: '0.5rem',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 0.7fr 0.7fr',
            gap: '0.5rem',
            marginBottom: '0.4rem',
          }}>
            <div style={{ backgroundColor: '#000', borderRadius: '4px', padding: '0.45rem 0.55rem' }}>
              <div style={{ color: '#ff4f4f', fontWeight: 700, fontSize: '0.78rem' }}>TOTAL DUE</div>
              <div style={{ color: '#00ff66', fontFamily: 'Consolas, monospace', fontWeight: 800, fontSize: '2rem', textAlign: 'right', lineHeight: 1.1 }}>
                {formatMoney(total)}
              </div>
            </div>
            <div style={{ backgroundColor: '#000', borderRadius: '4px', padding: '0.45rem 0.55rem' }}>
              <div style={{ color: '#ff4f4f', fontWeight: 700, fontSize: '0.78rem' }}>DISCOUNT</div>
              <div style={{ color: '#00ff66', fontFamily: 'Consolas, monospace', fontWeight: 800, fontSize: '1.5rem', textAlign: 'right', lineHeight: 1.1 }}>
                {formatMoney(discountValue)}
              </div>
            </div>
            <div style={{ backgroundColor: '#000', borderRadius: '4px', padding: '0.45rem 0.55rem' }}>
              <div style={{ color: '#ff4f4f', fontWeight: 700, fontSize: '0.78rem' }}>ITEMS</div>
              <div style={{ color: '#00ff66', fontFamily: 'Consolas, monospace', fontWeight: 800, fontSize: '1.5rem', textAlign: 'right', lineHeight: 1.1 }}>
                {cart.length}
              </div>
            </div>
          </div>

          <div style={{
            flex: 1,
            minHeight: 0,
            border: '1px solid #9195d5',
            backgroundColor: '#fff',
            borderRadius: '5px',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ backgroundColor: '#b9bdf6', color: '#141414' }}>
                  <th style={{ padding: '0.38rem', width: '40px', borderBottom: '1px solid #8f93d2' }}>#</th>
                  <th style={{ padding: '0.38rem', width: '120px', borderBottom: '1px solid #8f93d2' }}>Barcode</th>
                  <th style={{ padding: '0.38rem', width: '140px', borderBottom: '1px solid #8f93d2' }}>Product Code</th>
                  <th style={{ padding: '0.38rem', borderBottom: '1px solid #8f93d2' }}>Product</th>
                  <th style={{ padding: '0.38rem', width: '115px', borderBottom: '1px solid #8f93d2', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ padding: '0.38rem', width: '132px', borderBottom: '1px solid #8f93d2', textAlign: 'center' }}>Qty</th>
                  <th style={{ padding: '0.38rem', width: '120px', borderBottom: '1px solid #8f93d2', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#666', fontWeight: 600 }}>
                      Scan product code now. No need to focus a search box first.
                    </td>
                  </tr>
                )}
                {cart.slice(0, 13).map((line, index) => (
                  <tr
                    key={line.id}
                    onClick={() => setSelectedRowId(line.id)}
                    style={{
                      backgroundColor: selectedRowId === line.id ? '#e8ecff' : '#fff',
                      borderBottom: '1px solid #ececff',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '0.34rem', textAlign: 'center' }}>{index + 1}</td>
                    <td style={{ padding: '0.34rem' }}>{line.barcode}</td>
                    <td style={{ padding: '0.34rem', fontFamily: 'Consolas, monospace' }}>{line.productCode}</td>
                    <td style={{ padding: '0.34rem' }}>{line.productName}</td>
                    <td style={{ padding: '0.34rem', textAlign: 'right', fontWeight: 700 }}>{formatMoney(line.unitPrice)}</td>
                    <td style={{ padding: '0.34rem', textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '0.18rem', alignItems: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); updateLineQty(line.id, line.qty - 1); }} style={{ border: '1px solid #999', borderRadius: '4px', backgroundColor: '#fff', width: '22px', cursor: 'pointer' }}>-</button>
                        <input
                          type="number"
                          min="1"
                          value={line.qty}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateLineQty(line.id, e.target.value)}
                          style={{ width: '46px', textAlign: 'center', border: '1px solid #aaa', borderRadius: '4px', padding: '0.16rem' }}
                        />
                        <button onClick={(e) => { e.stopPropagation(); updateLineQty(line.id, line.qty + 1); }} style={{ border: '1px solid #999', borderRadius: '4px', backgroundColor: '#fff', width: '22px', cursor: 'pointer' }}>+</button>
                      </div>
                    </td>
                    <td style={{ padding: '0.34rem', textAlign: 'right', fontWeight: 800 }}>{formatMoney(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '0.35rem', fontSize: '0.82rem', color: '#282828', fontWeight: 600 }}>
            Scanner Buffer: {barcodeGhostValue || 'ready'}
          </div>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
          minHeight: 0,
        }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #aab', borderRadius: '6px', padding: '0.6rem' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.45rem' }}>Invoice Summary</div>
            <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Cashier</span><strong>{user?.name || user?.email || 'Admin'}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  style={{ width: '96px', border: '1px solid #9aa', borderRadius: '4px', textAlign: 'right', padding: '0.2rem' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ddd', paddingTop: '0.35rem', fontSize: '1rem' }}>
                <span>Total</span>
                <strong style={{ color: '#1f6d2c' }}>{formatMoney(total)}</strong>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: '#fff', border: '1px solid #aab', borderRadius: '6px', padding: '0.6rem' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.45rem' }}>Sync Counters</div>
            <div style={{ display: 'grid', gap: '0.32rem' }}>
              {Object.keys(salesSummary).map((status) => (
                <div key={status} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  border: `1px solid ${STATUS_COLORS[status]}66`,
                  borderRadius: '4px',
                  backgroundColor: `${STATUS_COLORS[status]}17`,
                  padding: '0.28rem 0.4rem',
                  fontSize: '0.86rem',
                }}>
                  <span>{STATUS_LABELS[status]}</span>
                  <strong>{salesSummary[status] || 0}</strong>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            flex: 1,
            minHeight: 0,
            backgroundColor: '#fff',
            border: '1px solid #aab',
            borderRadius: '6px',
            padding: '0.6rem',
            overflow: 'hidden',
          }}>
            <div style={{ fontWeight: 800, marginBottom: '0.45rem' }}>Recent Emergency Sales</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f2f8' }}>
                  <th style={{ textAlign: 'left', padding: '0.25rem' }}>Ref</th>
                  <th style={{ textAlign: 'right', padding: '0.25rem' }}>Total</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '0.5rem', textAlign: 'center', color: '#666' }}>No sales</td>
                  </tr>
                )}
                {sales.slice(0, 8).map((sale) => (
                  <tr key={sale.id} style={{ borderBottom: '1px solid #eef' }}>
                    <td style={{ padding: '0.26rem', fontFamily: 'Consolas, monospace' }}>{sale.sale_ref}</td>
                    <td style={{ padding: '0.26rem', textAlign: 'right', fontWeight: 700 }}>{formatMoney(sale.total)}</td>
                    <td style={{ padding: '0.26rem', color: STATUS_COLORS[sale.sync_status] || '#555', fontWeight: 700 }}>
                      {STATUS_LABELS[sale.sync_status] || sale.sync_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lastReceipt && (
              <div style={{ marginTop: '0.45rem' }}>
                <button onClick={() => printReceipt(lastReceipt)} style={{
                  width: '100%',
                  border: '1px solid #5e61a8',
                  backgroundColor: '#e8e9ff',
                  color: '#252867',
                  borderRadius: '4px',
                  padding: '0.38rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}>
                  Reprint Last Receipt (F8)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {searchModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.54)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1200,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '760px',
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '2px solid #8b8ec6',
            overflow: 'hidden',
          }}>
            <div style={{ backgroundColor: '#bfc3ff', padding: '0.65rem 0.9rem', fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>SEARCH PRODUCT [F1]</span>
              <button onClick={() => setSearchModalOpen(false)} style={{ border: '1px solid #777', backgroundColor: '#fff', borderRadius: '4px', cursor: 'pointer' }}>Esc</button>
            </div>
            <div style={{ padding: '0.8rem' }}>
              <input
                ref={searchModalInputRef}
                value={searchModalQuery}
                onChange={(e) => setSearchModalQuery(e.target.value)}
                placeholder="Type barcode, code, or product name..."
                style={{ width: '100%', padding: '0.66rem', borderRadius: '4px', border: '1px solid #8f8f8f', fontWeight: 600 }}
              />
              <div style={{ marginTop: '0.65rem', border: '1px solid #ddd', borderRadius: '4px', maxHeight: '48vh', overflowY: 'auto' }}>
                {searchModalLoading && <div style={{ padding: '0.7rem', color: '#666' }}>Searching...</div>}
                {!searchModalLoading && searchModalResults.length === 0 && (
                  <div style={{ padding: '0.7rem', color: '#666' }}>No results</div>
                )}
                {!searchModalLoading && searchModalResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      addProductToCart(product, 1);
                      setSearchModalOpen(false);
                      setSearchModalQuery('');
                      setSearchModalResults([]);
                      notifySuccess(`${product.name} added`, 1400);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #eee',
                      backgroundColor: '#fff',
                      padding: '0.56rem 0.7rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{product.name}</div>
                    <div style={{ fontSize: '0.82rem', color: '#666' }}>
                      Code: {product.sourceCode || '-'} | Barcode: {product.barcode || '-'} | Stock: {product.effective_stock ?? product.effectiveStock ?? product.stock ?? 0} | Price: {formatMoney(product.unitPrice ?? product.unit_price ?? product.price)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuickMenu && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1250,
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #999', padding: '1rem', minWidth: '280px' }}>
            <div style={{ fontWeight: 800, marginBottom: '0.6rem' }}>Quick Menu [F4]</div>
            <div style={{ display: 'grid', gap: '0.45rem' }}>
              <button onClick={() => { setShowQuickMenu(false); clearInvoice(); }} style={{ border: '1px solid #999', backgroundColor: '#fff', borderRadius: '4px', padding: '0.4rem', cursor: 'pointer' }}>New Invoice [F10]</button>
              <button onClick={() => { setShowQuickMenu(false); setShowPaymentDialog(true); }} style={{ border: '1px solid #999', backgroundColor: '#fff', borderRadius: '4px', padding: '0.4rem', cursor: 'pointer' }}>Save / Sale [F6]</button>
              <button onClick={() => { setShowQuickMenu(false); printReceipt(lastReceipt); }} style={{ border: '1px solid #999', backgroundColor: '#fff', borderRadius: '4px', padding: '0.4rem', cursor: 'pointer' }}>Print [F8]</button>
              <button onClick={() => setShowQuickMenu(false)} style={{ border: '1px solid #999', backgroundColor: '#f5f5f5', borderRadius: '4px', padding: '0.4rem', cursor: 'pointer' }}>Close [Esc]</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1300,
          padding: '1rem',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '2px solid #8f94c9',
            overflow: 'hidden',
          }}>
            <div style={{ backgroundColor: '#bfc3ff', padding: '0.65rem 0.8rem', fontWeight: 800 }}>
              CASH SALE / PAYMENT [F6]
            </div>
            <div style={{ padding: '0.8rem' }}>
              <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.7rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total</span><strong>{formatMoney(total)}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Payment Method</span>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} style={{ border: '1px solid #999', borderRadius: '4px', padding: '0.3rem' }}>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tendered</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tenderedAmount}
                    onChange={(e) => setTenderedAmount(e.target.value)}
                    autoFocus
                    style={{ width: '170px', border: '1px solid #999', borderRadius: '4px', padding: '0.3rem', textAlign: 'right' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2e7d32' }}>
                  <span>Change</span><strong>{formatMoney(change)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: balanceDue > 0 ? '#c62828' : '#444' }}>
                  <span>Balance Due</span><strong>{formatMoney(balanceDue)}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button onClick={() => setShowPaymentDialog(false)} disabled={isSubmittingSale} style={{ border: '1px solid #888', backgroundColor: '#fff', borderRadius: '4px', padding: '0.45rem 0.65rem', cursor: 'pointer' }}>Cancel [Esc]</button>
                <button onClick={submitSale} disabled={isSubmittingSale || cart.length === 0} style={{ border: 'none', backgroundColor: '#2e7d32', color: '#fff', borderRadius: '4px', padding: '0.45rem 0.72rem', cursor: isSubmittingSale ? 'not-allowed' : 'pointer', opacity: isSubmittingSale ? 0.7 : 1, fontWeight: 700 }}>
                  {isSubmittingSale ? 'Saving...' : 'Confirm [Enter]'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEmergencySales;
