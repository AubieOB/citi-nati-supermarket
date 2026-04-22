import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../utils/api.js';
import { generateQuotationPDF } from '../../utils/pdfReports.js';
import { exportQuotationReportImage } from '../../utils/quotationImageExport.js';
import toast from 'react-hot-toast';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';

/* ─────────────────────────── helpers ─────────────────────────── */
const fmt = (v) =>
  `MWK ${Number(v || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const DEFAULT_VAT_RATE_PERCENT = 16.5;

const calculateInclusiveVat = (grossAmount, ratePercent, enabled = true) => {
  const gross = Number(grossAmount || 0);
  const rate = enabled ? Number(ratePercent || 0) : 0;
  if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return Number((gross - ((gross * 100) / (100 + rate))).toFixed(2));
};

const withVatMeta = (quotation, vatSettings) => {
  if (!quotation) return quotation;
  const vatEnabled = quotation.vatEnabled ?? vatSettings.enabled;
  const configuredVatRatePercent = Number(
    quotation.configuredVatRatePercent
      ?? quotation.vatRatePercent
      ?? vatSettings.configuredVatRatePercent
      ?? DEFAULT_VAT_RATE_PERCENT
  );
  const vatAmount = Number.isFinite(Number(quotation.vatAmount))
    ? Number(quotation.vatAmount)
    : calculateInclusiveVat(quotation.total, configuredVatRatePercent, vatEnabled);

  return {
    ...quotation,
    vatEnabled,
    configuredVatRatePercent,
    vatRatePercent: vatEnabled ? configuredVatRatePercent : 0,
    vatAmount,
  };
};

const emptyItem = () => ({
  _key: Math.random(),
  productId: null,
  productName: '',
  description: '',
  qty: 1,
  unitPrice: 0,
  lineTotal: 0,
});

const emptyForm = () => ({
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAddress: '',
  notes: '',
  validUntil: '',
  discount: 0,
  items: [emptyItem()],
});

/* ─────────────────────────── styles ──────────────────────────── */
const S = {
  container: {
    padding: '1.5rem',
    maxWidth: '1100px',
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    // dimensions set dynamically via fixedHeaderStyle
  },
  title: {
    fontSize: '1.6rem',
    fontWeight: 700,
    color: '#5B4B8A',
    margin: 0,
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '1rem',
    borderBottom: '2px solid #e0e0e0',
    flexWrap: 'wrap',
  },
  tab: (active) => ({
    padding: '0.62rem 1.2rem',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.88rem',
    fontWeight: active ? 700 : 600,
    color: active ? '#5B4B8A' : '#666',
    borderBottom: active ? '2px solid #5B4B8A' : '2px solid transparent',
    marginBottom: '-2px',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
  }),
  card: {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#5B4B8A',
    marginBottom: '1rem',
    marginTop: 0,
  },
  row: {
    display: 'grid',
    gap: '1rem',
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: '#555',
    marginBottom: '4px',
  },
  input: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d0d0d0',
    borderRadius: '5px',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  textarea: {
    width: '100%',
    padding: '0.55rem 0.75rem',
    border: '1px solid #d0d0d0',
    borderRadius: '5px',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'vertical',
    minHeight: '72px',
  },
  btn: (color = '#5B4B8A', outline = false) => ({
    padding: '0.55rem 1.2rem',
    border: outline ? `1.5px solid ${color}` : 'none',
    background: outline ? 'transparent' : color,
    color: outline ? color : '#fff',
    borderRadius: '5px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.88rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    transition: 'opacity 0.15s',
  }),
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.88rem',
  },
  th: {
    background: '#5B4B8A',
    color: '#fff',
    padding: '0.55rem 0.75rem',
    textAlign: 'left',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #eee',
    verticalAlign: 'middle',
  },
  badge: (color = '#5B4B8A') => ({
    background: color + '18',
    color: color,
    borderRadius: '99px',
    padding: '2px 10px',
    fontSize: '0.78rem',
    fontWeight: 600,
  }),
};

/* ═══════════════════════════ Component ═══════════════════════════ */
const AdminQuotations = ({ selectedLocationCode = 'BT', selectedBranchCode = 'BLANTYRE' }) => {
  const [tab, setTab] = useState('new');
  const { modal, closeModal, showConfirm } = useModal();

  // ── Fixed header layout (matches AdminPromotions / AdminOrders pattern) ──
  const headerRef = useRef(null);
  const [headerLayout, setHeaderLayout] = useState({ left: 0, width: 0, top: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    let resizeObserver;
    const update = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;
      const rect = contentArea.getBoundingClientRect();
      setHeaderLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? 56 : 0,
      });
      if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
    };
    update();
    window.addEventListener('resize', update);
    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(contentArea);
    }
    return () => {
      window.removeEventListener('resize', update);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  // Re-measure height after each render (content can wrap)
  useEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight);
  });

  const fixedHeaderStyle = {
    position: 'fixed',
    top: `${headerLayout.top}px`,
    left: `${headerLayout.left}px`,
    width: `${headerLayout.width}px`,
    zIndex: 80,
    backgroundColor: '#fff',
    borderBottom: '1px solid #e0e0e0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
    boxSizing: 'border-box',
    padding: '1rem 2rem 0',
  };

  // ── New quotation state ────────────────────────────────────────
  const [form, setForm] = useState(emptyForm());
  const [mode, setMode] = useState('system'); // 'system' | 'custom'
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productSearching, setProductSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vatSettings, setVatSettings] = useState({
    enabled: true,
    configuredVatRatePercent: DEFAULT_VAT_RATE_PERCENT,
  });

  // ── View quotations state ──────────────────────────────────────
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);

  const operationalScope = {
    locationCode: String(selectedLocationCode || '').trim().toUpperCase(),
    branchCode: String(selectedBranchCode || '').trim().toUpperCase(),
  };

  /* ── Search products (system mode, search-on-type) ─── */
  useEffect(() => {
    if (mode !== 'system') return;
    if (!productSearch.trim()) { setProducts([]); return; }
    const term = productSearch.trim();
    const timer = setTimeout(async () => {
      setProductSearching(true);
      try {
        const res = await api.get('/admin/pos-products', {
          params: {
            search: term,
            limit: 15,
            locationCode: operationalScope.locationCode,
            branchCode: operationalScope.branchCode,
          },
        });
        setProducts(res.data?.products ?? []);
      } catch {
        setProducts([]);
      } finally {
        setProductSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [mode, operationalScope.branchCode, operationalScope.locationCode, productSearch]);

  /* ── Load quotations ─── */
  const loadQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/quotations', { params: operationalScope });
      const rows = res.data?.quotations ?? res.data ?? [];
      setQuotations(rows.map((row) => withVatMeta(row, vatSettings)));
    } catch {
      toast.error('Failed to load quotations');
    } finally {
      setLoading(false);
    }
  }, [operationalScope.branchCode, operationalScope.locationCode, vatSettings]);

  useEffect(() => {
    if (tab === 'view') loadQuotations();
  }, [tab, loadQuotations]);

  useEffect(() => {
    const loadVatSettings = async () => {
      try {
        const response = await api.get('/system/status');
        setVatSettings({
          enabled: response.data?.vatEnabled !== false,
          configuredVatRatePercent: Number(
            response.data?.configuredVatRatePercent
              || response.data?.vatRatePercent
              || DEFAULT_VAT_RATE_PERCENT
          ),
        });
      } catch {
        setVatSettings({ enabled: true, configuredVatRatePercent: DEFAULT_VAT_RATE_PERCENT });
      }
    };

    loadVatSettings();
  }, []);

  /* ── Item helpers ─── */
  const updateItem = (key, field, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it._key !== key) return it;
        const updated = { ...it, [field]: value };
        if (field === 'qty' || field === 'unitPrice') {
          updated.lineTotal = Number(updated.qty) * Number(updated.unitPrice);
        }
        return updated;
      }),
    }));
  };

  const addItem = () =>
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));

  const removeItem = (key) =>
    setForm((prev) => ({ ...prev, items: prev.items.filter((it) => it._key !== key) }));

  const addSystemProduct = (product) => {
    const item = emptyItem();
    item.productId = product.id;
    item.productName = product.name;
    item.unitPrice = Number(product.price ?? 0);
    item.lineTotal = item.qty * item.unitPrice;
    setForm((prev) => ({
      ...prev,
      items: prev.items[0]?.productName === '' ? [item] : [...prev.items, item],
    }));
    setProductSearch('');
  };

  const subtotal = form.items.reduce((s, it) => s + Number(it.lineTotal || 0), 0);
  const total = Math.max(0, subtotal - Number(form.discount || 0));
  const vatAmount = calculateInclusiveVat(total, vatSettings.configuredVatRatePercent, vatSettings.enabled);
  const vatLabel = vatSettings.enabled
    ? `VAT (${Number(vatSettings.configuredVatRatePercent || 0).toFixed(1)}%, included)`
    : 'VAT (disabled)';

  /* ── Submit ─── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.clientName.trim()) { toast.error('Client name is required'); return; }
    const validItems = form.items.filter((it) => it.productName.trim());
    if (!validItems.length) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const payload = {
        ...operationalScope,
        clientName: form.clientName.trim(),
        clientEmail: form.clientEmail.trim() || null,
        clientPhone: form.clientPhone.trim() || null,
        clientAddress: form.clientAddress.trim() || null,
        notes: form.notes.trim() || null,
        validUntil: form.validUntil || null,
        discount: Number(form.discount) || 0,
        items: validItems.map(({ productId, productName, description, qty, unitPrice }) => ({
          productId: productId || null,
          productName: productName.trim(),
          description: description?.trim() || null,
          qty: Number(qty),
          unitPrice: Number(unitPrice),
        })),
      };
      const res = await api.post('/admin/quotations', payload);
      const created = withVatMeta(res.data?.quotation ?? res.data, vatSettings);
      toast.success(`Quotation ${created.quotationRef} created!`);
      setForm(emptyForm());
      // Auto-download PDF
      generateQuotationPDF(created);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create quotation');
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete ─── */
  const handleDelete = async (id, ref) => {
    showConfirm(
      'Delete Quotation?',
      `Are you sure you want to delete quotation "${ref}"? This cannot be undone.`,
      async () => {
        try {
          await api.delete(`/admin/quotations/${id}`, { params: operationalScope });
          toast.success('Quotation deleted');
          setQuotations((prev) => prev.filter((q) => q.id !== id));
        } catch {
          toast.error('Delete failed');
        }
      }
    );
  };

  /* ── WhatsApp share ─── */
  const handleWhatsApp = (q) => {
    const lines = [
      `*QUOTATION – ${q.quotationRef}*`,
      `Client: ${q.clientName}`,
      `Date: ${new Date(q.createdAt).toLocaleDateString('en-GB')}`,
      q.validUntil ? `Valid Until: ${new Date(q.validUntil).toLocaleDateString('en-GB')}` : null,
      '',
      '*Items:*',
      ...(q.items || []).map((it) => `  • ${it.productName} x${it.qty} @ MWK ${Number(it.unitPrice).toLocaleString()} = MWK ${Number(it.lineTotal).toLocaleString()}`),
      '',
      `Subtotal: MWK ${Number(q.subtotal).toLocaleString()}`,
      Number(q.discount) > 0 ? `Discount: -MWK ${Number(q.discount).toLocaleString()}` : null,
      `${q.vatEnabled === false ? 'VAT (disabled)' : `VAT (${Number(q.configuredVatRatePercent || 0).toFixed(1)}%, included)`}: MWK ${Number(q.vatAmount || 0).toLocaleString()}`,
      `*TOTAL: MWK ${Number(q.total).toLocaleString()}*`,
      '',
      q.notes ? `Notes: ${q.notes}` : null,
      '',
      'Citi-Nati Supermarket | (+265) 888857188',
    ].filter((l) => l !== null).join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank', 'noopener');
  };

  const handleExportImage = async (q, format = 'png') => {
    try {
      await exportQuotationReportImage({ quotation: q, title: 'Quotation', format });
    } catch (error) {
      console.error('Image export error:', error);
      toast.error('Failed to generate image. Please try again.');
    }
  };

  /* ── Filtered quotations ─── */
  const filteredQuotations = quotations.filter((q) => {
    const s = search.toLowerCase();
    return !s || q.quotationRef?.toLowerCase().includes(s) || q.clientName?.toLowerCase().includes(s);
  });

  /* ══════════════════════════ RENDER ══════════════════════════ */
  return (
    <div style={S.container}>
      {/* Fixed header */}
      <div ref={headerRef} style={fixedHeaderStyle}>
        <h1 style={S.title}><i className="fas fa-file-invoice" style={{ marginRight: '0.5rem' }}></i>Quotations</h1>
        <div style={{ marginTop: '0.55rem' }}>
          <span style={S.badge('#0f766e')}>
            Location Scope: {operationalScope.branchCode || 'N/A'} / {operationalScope.locationCode || 'N/A'}
          </span>
        </div>
        <div style={S.tabs}>
          <button style={S.tab(tab === 'new')} onClick={() => setTab('new')}>
            <i className="fas fa-plus-circle" style={{ marginRight: '0.4rem' }}></i>New Quotation
          </button>
          <button style={S.tab(tab === 'view')} onClick={() => setTab('view')}>
            <i className="fas fa-list" style={{ marginRight: '0.4rem' }}></i>View Quotations
          </button>
        </div>
      </div>

      {/* Spacer to prevent content from hiding under the fixed header */}
      <div style={{ height: headerHeight + 8 }}></div>

      {/* ══ NEW QUOTATION TAB ══ */}
      {tab === 'new' && (
        <form onSubmit={handleSubmit}>
          {/* Client Info */}
          <div style={S.card}>
            <p style={S.sectionTitle}><i className="fas fa-user" style={{ marginRight: '0.4rem' }}></i>Client Information</p>
            <div style={{ ...S.row, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={S.label}>Client / Organisation Name *</label>
                <input style={S.input} value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} placeholder="e.g. Domasi College" required />
              </div>
              <div>
                <label style={S.label}>Email</label>
                <input style={S.input} type="email" value={form.clientEmail} onChange={(e) => setForm((f) => ({ ...f, clientEmail: e.target.value }))} placeholder="client@example.com" />
              </div>
            </div>
            <div style={{ ...S.row, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={S.label}>Phone</label>
                <input style={S.input} value={form.clientPhone} onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))} placeholder="+265 xxxxxxx" />
              </div>
              <div>
                <label style={S.label}>Address</label>
                <input style={S.input} value={form.clientAddress} onChange={(e) => setForm((f) => ({ ...f, clientAddress: e.target.value }))} placeholder="Physical address" />
              </div>
            </div>
            <div style={{ ...S.row, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={S.label}>Valid Until</label>
                <input style={S.input} type="date" value={form.validUntil} onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Discount (MWK)</label>
                <input style={S.input} type="number" min="0" value={form.discount} onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={S.label}>Notes / Terms</label>
              <textarea style={S.textarea} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Payment terms, delivery info, etc." />
            </div>
          </div>

          {/* Items */}
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ ...S.sectionTitle, margin: 0 }}><i className="fas fa-boxes" style={{ marginRight: '0.4rem' }}></i>Line Items</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" style={S.btn(mode === 'system' ? '#5B4B8A' : undefined, mode !== 'system')} onClick={() => setMode('system')}>
                  <i className="fas fa-database"></i> System Products
                </button>
                <button type="button" style={S.btn(mode === 'custom' ? '#2D8659' : '#888', mode !== 'custom')} onClick={() => setMode('custom')}>
                  <i className="fas fa-pen"></i> Custom Items
                </button>
              </div>
            </div>

            {/* System product search */}
            {mode === 'system' && (
              <div style={{ marginBottom: '1rem', position: 'relative' }}>
                <input
                  style={{ ...S.input, maxWidth: '360px' }}
                  placeholder="Search products to add..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {productSearch && productSearching && (
                  <div style={{ marginTop: '0.4rem', color: '#999', fontSize: '0.82rem' }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 4 }}></i>Searching…</div>
                )}
                {productSearch && !productSearching && products.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, width: 360, background: '#fff', border: '1px solid #ddd', borderRadius: '5px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }}>
                    {products.map((p) => (
                      <div
                        key={p.id}
                        style={{ padding: '0.55rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.88rem' }}
                        onMouseDown={() => addSystemProduct(p)}
                      >
                        <strong>{p.name}</strong>
                        <span style={{ color: '#5B4B8A', marginLeft: '0.5rem', fontSize: '0.82rem' }}>{fmt(p.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {productSearch && !productSearching && products.length === 0 && (
                  <div style={{ marginTop: '0.4rem', color: '#999', fontSize: '0.82rem' }}>No products found.</div>
                )}
              </div>
            )}

            {/* Items table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>Product / Item</th>
                    <th style={S.th}>Description</th>
                    <th style={{ ...S.th, textAlign: 'center', width: 70 }}>Qty</th>
                    <th style={{ ...S.th, textAlign: 'right', width: 120 }}>Unit Price (MWK)</th>
                    <th style={{ ...S.th, textAlign: 'right', width: 120 }}>Line Total</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={item._key} style={{ background: idx % 2 === 0 ? '#fff' : '#faf8ff' }}>
                      <td style={{ ...S.td, color: '#888', fontSize: '0.8rem', width: 30 }}>{idx + 1}</td>
                      <td style={S.td}>
                        <input
                          style={{ ...S.input, minWidth: 160 }}
                          value={item.productName}
                          onChange={(e) => updateItem(item._key, 'productName', e.target.value)}
                          placeholder="Item name"
                          readOnly={mode === 'system' && !!item.productId}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          style={{ ...S.input, minWidth: 140 }}
                          value={item.description}
                          onChange={(e) => updateItem(item._key, 'description', e.target.value)}
                          placeholder="Optional note"
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          style={{ ...S.input, textAlign: 'center', width: 64 }}
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => updateItem(item._key, 'qty', e.target.value)}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          style={{ ...S.input, textAlign: 'right', width: 110 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item._key, 'unitPrice', e.target.value)}
                        />
                      </td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#2D8659', whiteSpace: 'nowrap' }}>
                        {fmt(item.lineTotal)}
                      </td>
                      <td style={S.td}>
                        <button type="button" onClick={() => removeItem(item._key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', padding: '2px 6px', fontSize: '1rem' }}>
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <button type="button" style={S.btn('#2D8659', true)} onClick={addItem}>
                <i className="fas fa-plus"></i> Add Item
              </button>
              {/* Totals */}
              <div style={{ minWidth: 220, textAlign: 'right' }}>
                <div style={{ marginBottom: 4, fontSize: '0.9rem', color: '#555' }}>Subtotal: <strong>{fmt(subtotal)}</strong></div>
                {Number(form.discount) > 0 && (
                  <div style={{ marginBottom: 4, fontSize: '0.9rem', color: '#c0392b' }}>Discount: <strong>-{fmt(form.discount)}</strong></div>
                )}
                <div style={{ marginBottom: 4, fontSize: '0.9rem', color: '#b91c1c' }}>{vatLabel}: <strong>{fmt(vatAmount)}</strong></div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#5B4B8A', borderTop: '2px solid #5B4B8A', paddingTop: '6px', marginTop: '6px' }}>
                  TOTAL: {fmt(total)}
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" style={S.btn('#888', true)} onClick={() => setForm(emptyForm())}>
              <i className="fas fa-undo"></i> Reset
            </button>
            <button type="submit" style={S.btn()} disabled={saving}>
              {saving ? <><i className="fas fa-spinner fa-spin"></i> Saving…</> : <><i className="fas fa-file-invoice"></i> Save & Download PDF</>}
            </button>
          </div>
        </form>
      )}

      {/* ══ VIEW QUOTATIONS TAB ══ */}
      {tab === 'view' && (
        <div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              style={{ ...S.input, maxWidth: 320 }}
              placeholder="Search by ref or client name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button style={S.btn('#5B4B8A', true)} onClick={loadQuotations} disabled={loading}>
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i> Refresh
            </button>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>Loading quotations…</div>}

          {!loading && filteredQuotations.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#aaa' }}>
              <i className="fas fa-file-invoice" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block' }}></i>
              No quotations found.
            </div>
          )}

          {filteredQuotations.map((q) => (
            <div key={q.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                {/* Left: summary */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                    <span style={S.badge()}>{q.quotationRef}</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#222' }}>{q.clientName}</span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#777', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span><i className="fas fa-calendar-alt" style={{ marginRight: 4 }}></i>{new Date(q.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    {q.clientPhone && <span><i className="fas fa-phone" style={{ marginRight: 4 }}></i>{q.clientPhone}</span>}
                    {q.validUntil && <span><i className="fas fa-hourglass-half" style={{ marginRight: 4 }}></i>Valid until {new Date(q.validUntil).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                    <span style={{ fontWeight: 600, color: '#5B4B8A' }}>{fmt(q.total)}</span>
                  </div>
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button style={S.btn()} onClick={() => generateQuotationPDF(q)} title="Download PDF">
                    <i className="fas fa-file-pdf"></i> PDF
                  </button>
                  <button style={S.btn('#6b7280', true)} onClick={() => handleExportImage(q, 'png')} title="Export as PNG image">
                    <i className="fas fa-image"></i> PNG
                  </button>
                  <button style={S.btn('#6b7280', true)} onClick={() => handleExportImage(q, 'jpg')} title="Export as JPG image">
                    <i className="fas fa-image"></i> JPG
                  </button>
                  <button style={S.btn('#25D366')} onClick={() => handleWhatsApp(q)} title="Share via WhatsApp">
                    <i className="fab fa-whatsapp"></i> Share
                  </button>
                  <button style={S.btn('#888', true)} onClick={() => setExpanded(expanded === q.id ? null : q.id)} title="View items">
                    <i className={`fas fa-${expanded === q.id ? 'chevron-up' : 'chevron-down'}`}></i>
                  </button>
                  <button style={S.btn('#c0392b', true)} onClick={() => handleDelete(q.id, q.quotationRef)} title="Delete">
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>

              {/* Expandable items */}
              {expanded === q.id && (
                <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>#</th>
                        <th style={S.th}>Item</th>
                        <th style={{ ...S.th, textAlign: 'center' }}>Qty</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Unit Price</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(q.items || []).map((it, idx) => (
                        <tr key={it.id} style={{ background: idx % 2 === 0 ? '#fff' : '#faf8ff' }}>
                          <td style={{ ...S.td, color: '#888', width: 30 }}>{idx + 1}</td>
                          <td style={S.td}>
                            <div style={{ fontWeight: 500 }}>{it.productName}</div>
                            {it.description && <div style={{ color: '#888', fontSize: '0.8rem' }}>{it.description}</div>}
                          </td>
                          <td style={{ ...S.td, textAlign: 'center' }}>{it.qty}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{fmt(it.unitPrice)}</td>
                          <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#2D8659' }}>{fmt(it.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {Number(q.discount) > 0 && (
                        <tr>
                          <td colSpan={4} style={{ ...S.td, textAlign: 'right', color: '#c0392b' }}>Discount</td>
                          <td style={{ ...S.td, textAlign: 'right', color: '#c0392b', fontWeight: 600 }}>-{fmt(q.discount)}</td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={4} style={{ ...S.td, textAlign: 'right', color: '#b91c1c' }}>
                          {q.vatEnabled === false ? 'VAT (disabled)' : `VAT (${Number(q.configuredVatRatePercent || 0).toFixed(1)}%, included)`}
                        </td>
                        <td style={{ ...S.td, textAlign: 'right', color: '#b91c1c', fontWeight: 600 }}>{fmt(q.vatAmount)}</td>
                      </tr>
                      <tr style={{ background: '#f0ebff' }}>
                        <td colSpan={4} style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#5B4B8A' }}>TOTAL</td>
                        <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: '#5B4B8A', fontSize: '1rem' }}>{fmt(q.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {q.notes && (
                    <div style={{ marginTop: '0.75rem', background: '#f9f6ff', borderRadius: 5, padding: '0.65rem 1rem', fontSize: '0.85rem', color: '#555' }}>
                      <strong>Notes:</strong> {q.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          isOpen={modal.isOpen}
          title={modal.title}
          message={modal.message}
          type={modal.type}
          onConfirm={modal.onConfirm}
          onCancel={modal.onCancel || closeModal}
          confirmText={modal.confirmText}
          cancelText={modal.cancelText}
          showCancelButton={modal.showCancelButton}
          confirmButtonColor={modal.confirmButtonColor}
        >
          {modal.children}
        </Modal>
      )}
    </div>
  );
};

export default AdminQuotations;
