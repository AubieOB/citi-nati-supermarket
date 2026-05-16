import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../../utils/api.js';
import { boAlert } from '../../../utils/boDialogBus.js';
import { tokenStorage } from '../../../utils/tokenStorage.js';
import logo from '../../../assets/citi-nati-logo.png.png';

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const buildScopeParams = ({ branchCode, locationCode, locationId, isAggregate }) => {
  if (isAggregate) return {};
  const params = {};
  if (branchCode) params.branchCode = normalizeCode(branchCode);
  if (locationCode) params.locationCode = normalizeCode(locationCode);
  if (locationId) params.locationId = locationId;
  return params;
};

const emptySheetItem = (order = 1) => ({
  id: `purchase-order-row-${Date.now()}-${order}`,
  productId: null,
  productCode: '',
  productName: '',
  shelfBalance: '',
  posBalance: '',
  sellingPrice: '',
  quantityToOrder: 1,
  notes: '',
  manual: true,
  sortOrder: order,
});

const PurchaseOrdersTab = ({
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
  isAggregateMode = false,
}) => {
  const branch = normalizeCode(selectedBranchCode);
  const location = normalizeCode(selectedLocationCode);

  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [orderItems, setOrderItems] = useState([emptySheetItem(1)]);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState('');
  const [sheets, setSheets] = useState([]);
  const [loadingSheets, setLoadingSheets] = useState(false);

  const searchInputRef = useRef(null);
  const inputRefs = useRef({});
  const searchTimer = useRef(null);

  const scopeParams = useMemo(
    () => buildScopeParams({ branchCode: branch, locationCode: location, locationId: selectedLocationId, isAggregate: isAggregateMode }),
    [branch, location, selectedLocationId, isAggregateMode]
  );

  const focusField = (rowId, fieldName) => {
    const input = inputRefs.current[`${rowId}-${fieldName}`];
    if (input) {
      input.focus();
      if (typeof input.select === 'function') input.select();
    }
  };

  const searchProducts = useCallback(
    async (query) => {
      const searchText = String(query || '').trim();
      if (!searchText) {
        setSearchResults([]);
        return;
      }

      setSearchLoading(true);
      try {
        const resp = await api.get('/business-operations/goods-intake/lookup-products', {
          params: { q: searchText, ...scopeParams, take: 16 },
        });
        setSearchResults(Array.isArray(resp.data?.products) ? resp.data.products : []);
        setSelectedSearchIndex(0);
      } catch (err) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [scopeParams]
  );

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchProducts(searchTerm), 180);
    return () => clearTimeout(searchTimer.current);
  }, [searchTerm, searchProducts]);

  const fetchSheets = useCallback(async () => {
    setLoadingSheets(true);
    try {
      const resp = await api.get('/business-operations/purchase-orders', {
        params: { status: 'draft', page: 1, pageSize: 50, ...scopeParams },
      });
      setSheets(resp.data?.data || []);
    } catch (err) {
      setSheets([]);
    } finally {
      setLoadingSheets(false);
    }
  }, [scopeParams]);

  useEffect(() => {
    fetchSheets();
  }, [fetchSheets]);

  useEffect(() => {
    const handleKeydown = (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setSearchModalOpen(true);
      }
      if (event.key === 'Escape' && searchModalOpen) {
        setSearchModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [searchModalOpen]);

  useEffect(() => {
    if (searchModalOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 60);
    }
  }, [searchModalOpen]);

  const addProductToSheet = (product) => {
    setOrderItems((prev) => {
      const next = [
        ...prev,
        {
          id: `purchase-order-row-${Date.now()}-${prev.length + 1}`,
          productId: product.id || product.productId || null,
          productCode: product.barcode || product.productCode || '',
          productName: product.name || product.productName || '',
          shelfBalance: product.shelfBalance ?? product.availableQuantity ?? product.stock ?? '',
          posBalance: product.posBalance ?? product.availableQuantity ?? '',
          sellingPrice: product.sellingPrice ?? product.price ?? '',
          quantityToOrder: 1,
          notes: '',
          manual: false,
          sortOrder: prev.length + 1,
        },
      ];
      window.setTimeout(() => {
        const lastRow = next[next.length - 1];
        if (lastRow) focusField(lastRow.id, 'shelfBalance');
      }, 75);
      return next;
    });
  };

  const addManualRow = () => {
    setOrderItems((prev) => [
      ...prev,
      {
        ...emptySheetItem(prev.length + 1),
        manual: true,
      },
    ]);
  };

  const updateItem = (rowId, field, value) => {
    setOrderItems((prev) => prev.map((item) => (item.id === rowId ? { ...item, [field]: value } : item)));
  };

  const removeItem = (rowId) => {
    setOrderItems((prev) => {
      const next = prev.filter((item) => item.id !== rowId).map((item, idx) => ({ ...item, sortOrder: idx + 1 }));
      return next.length ? next : [emptySheetItem(1)];
    });
  };

  const clearSheet = () => {
    setOrderItems([emptySheetItem(1)]);
    setSavingError('');
  };

  const openSheet = async (id) => {
    try {
      const resp = await api.get(`/business-operations/purchase-orders/${id}`);
      const sheet = resp.data?.data;
      if (!sheet) return;

      const rows = Array.isArray(sheet.items)
        ? sheet.items.map((item, idx) => ({
            id: `purchase-order-row-${Date.now()}-${idx + 1}`,
            productId: item.productId ?? null,
            productCode: item.barcode || '',
            productName: item.productName || '',
            shelfBalance: item.shelfBalance ?? '',
            posBalance: item.posBalance ?? '',
            sellingPrice: item.sellingPrice ?? '',
            quantityToOrder: item.quantity ?? 0,
            notes: item.notes || '',
            manual: !item.productId,
            sortOrder: idx + 1,
          }))
        : [emptySheetItem(1)];

      setOrderItems(rows.length ? rows : [emptySheetItem(1)]);
    } catch (err) {
      await boAlert({
        title: 'Unable to open draft',
        message: err.response?.data?.error || 'Failed to open saved purchase order',
        type: 'error',
      });
    }
  };

  const selectSearchResult = (product) => {
    addProductToSheet(product);
    setSearchModalOpen(false);
    setSearchTerm('');
    setSearchResults([]);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedSearchIndex((current) => Math.min(current + 1, searchResults.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedSearchIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (searchResults.length > 0) {
        selectSearchResult(searchResults[selectedSearchIndex]);
      } else {
        addManualRow();
        setSearchModalOpen(false);
      }
    }
  };

  const buildSaveItems = () => {
    const itemsToSave = orderItems.filter((item) => item.productName || item.productCode || item.notes || Number(item.quantityToOrder) > 0 || item.shelfBalance !== '' || item.posBalance !== '' || item.sellingPrice !== '');
    return itemsToSave.map((item, index) => ({
      productId: item.productId || undefined,
      productCode: item.productCode || undefined,
      productName: item.productName || undefined,
      shelfBalance: item.shelfBalance === '' ? undefined : Number(item.shelfBalance),
      posBalance: item.posBalance === '' ? undefined : Number(item.posBalance),
      sellingPrice: item.sellingPrice === '' ? undefined : Number(item.sellingPrice),
      quantityToOrder: Number(item.quantityToOrder) || 0,
      notes: item.notes || undefined,
      sortOrder: index + 1,
    }));
  };

  const saveDraft = async () => {
    setSaving(true);
    setSavingError('');

    const payload = {
      purchaseOrderRef: undefined,
      branchCode: branch || undefined,
      locationId: selectedLocationId || undefined,
      locationCode: location || undefined,
      locationName: selectedLocationName || undefined,
      status: 'draft',
      notes: undefined,
      items: buildSaveItems(),
    };

    try {
      await api.post('/business-operations/purchase-orders', payload);
      await fetchSheets();
      await boAlert({ title: 'Draft saved', message: 'Purchase order draft was saved successfully.', type: 'info' });
    } catch (err) {
      setSavingError(err.response?.data?.error || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const exportToPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    const now = new Date();
    const preparedBy = tokenStorage.getUser()?.name || tokenStorage.getUser()?.email || '-';
    const title = 'Purchase Order / Replenishment Request';
    const headerText = `Branch: ${selectedBranchCode || '-'}    Location: ${selectedLocationName || selectedLocationCode || '-'}`;
    const footerText = `Prepared by: ${preparedBy}    Date: ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB')}`;

    try {
      doc.addImage(logo, 'PNG', margin, 8, 24, 16);
    } catch (error) {
      // logo may fail in some environments, continue without it
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('CITI-NATI SUPERMARKET', pageWidth / 2, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(title, pageWidth / 2, 28, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor('#334155');
    doc.text(headerText, margin, 34);
    doc.text(footerText, pageWidth - margin, 34, { align: 'right' });

    const rows = orderItems.map((item, index) => [
      String(index + 1),
      String(item.productCode || '-'),
      String(item.productName || '-'),
      item.shelfBalance === '' ? '-' : String(item.shelfBalance),
      item.posBalance === '' ? '-' : String(item.posBalance),
      item.sellingPrice === '' ? '-' : Number(item.sellingPrice).toFixed(2),
      String(item.quantityToOrder || 0),
      String(item.notes || '-'),
    ]);

    autoTable(doc, {
      startY: 40,
      margin: { left: margin, right: margin },
      head: [[
        'No.',
        'Barcode',
        'Product name',
        'Shelf balance',
        'POS balance',
        'Selling price',
        'Qty to order',
        'Notes',
      ]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 30 },
        2: { cellWidth: 90 },
        3: { cellWidth: 24, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 24, halign: 'right' },
        7: { cellWidth: 50 },
      },
    });

    const finalY = doc.lastAutoTable?.finalY || 150;
    doc.setFontSize(10);
    doc.text(`Total rows: ${orderItems.length}`, margin, finalY + 10);
    doc.text(`Total quantity requested: ${orderItems.reduce((sum, item) => sum + Number(item.quantityToOrder || 0), 0)}`, margin + 90, finalY + 10);

    const lineY = finalY + 24;
    const columnWidth = 60;
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, lineY, margin + columnWidth, lineY);
    doc.line(margin + 90, lineY, margin + 90 + columnWidth, lineY);
    doc.line(margin + 180, lineY, margin + 180 + columnWidth, lineY);
    doc.setFontSize(9);
    doc.text('Prepared by', margin + columnWidth / 2, lineY + 6, { align: 'center' });
    doc.text('Checked by', margin + 90 + columnWidth / 2, lineY + 6, { align: 'center' });
    doc.text('Approved by', margin + 180 + columnWidth / 2, lineY + 6, { align: 'center' });

    doc.save(`purchase-order-sheet-${now.toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#0f172a' }}>Purchase Order Sheet</h2>
          <p style={{ margin: '0.55rem 0 0', color: '#475569', maxWidth: 640 }}>
            Prepare and save replenishment drafts, then export a clean printable request for procurement and branch operations.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={saveDraft} disabled={saving} style={{ border: 'none', borderRadius: 10, padding: '0.85rem 1rem', backgroundColor: '#2563eb', color: '#fff', cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save Draft'}</button>
          <button onClick={exportToPdf} type="button" style={{ border: 'none', borderRadius: 10, padding: '0.85rem 1rem', backgroundColor: '#0f172a', color: '#fff', cursor: 'pointer' }}>Export PDF</button>
          <button onClick={clearSheet} type="button" style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.85rem 1rem', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>Clear sheet</button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search products by name, barcode or code..."
            style={{ flex: '1 1 320px', minWidth: 220, padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid #cbd5e1', color: '#0f172a' }}
          />
          <button type="button" onClick={() => searchProducts(searchTerm)} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.75rem 1rem', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>{searchLoading ? 'Searching...' : 'Search'}</button>
          <button type="button" onClick={addManualRow} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.75rem 1rem', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>Add manual row</button>
          <span style={{ color: '#475569', fontSize: '0.9rem' }}>Open search with <strong>F1</strong></span>
        </div>

        {searchModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(15, 23, 42, 0.45)', padding: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '100%', maxWidth: 860, backgroundColor: '#fff', borderRadius: 16, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Search products</h3>
                  <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.92rem' }}>Type and use arrow keys + Enter to add items quickly.</p>
                </div>
                <button type="button" onClick={() => setSearchModalOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.1rem', color: '#475569', cursor: 'pointer' }}>×</button>
              </div>

              <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.75rem' }}>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  ref={searchInputRef}
                  placeholder="Search products by name, barcode or code..."
                  style={{ width: '100%', padding: '0.85rem 1rem', borderRadius: 10, border: '1px solid #cbd5e1', color: '#0f172a' }}
                />
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {searchLoading && <div style={{ padding: '1rem', color: '#475569' }}>Searching...</div>}
                  {!searchLoading && searchResults.length === 0 && <div style={{ padding: '1rem', color: '#475569' }}>No results found.</div>}
                  {!searchLoading && searchResults.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                      {searchResults.map((product, index) => {
                        const active = index === selectedSearchIndex;
                        return (
                          <button
                            key={product.id || product.barcode || product.productName || index}
                            type="button"
                            onClick={() => selectSearchResult(product)}
                            onMouseEnter={() => setSelectedSearchIndex(index)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '0.85rem 0.95rem', borderRadius: 10,
                              border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                              backgroundColor: active ? '#eff6ff' : '#fff',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                              <div>
                                <div style={{ color: '#0f172a', fontWeight: 700 }}>{product.productName || product.name || 'Unnamed product'}</div>
                                <div style={{ color: '#64748b', fontSize: '0.88rem' }}>{product.barcode || product.productCode || 'No barcode'}</div>
                              </div>
                              <div style={{ color: '#0f172a', fontWeight: 700 }}>{product.sellingPrice != null ? Number(product.sellingPrice).toFixed(2) : product.price != null ? Number(product.price).toFixed(2) : '-'}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {savingError && <div style={{ color: '#b91c1c', fontSize: '0.95rem' }}>{savingError}</div>}
      </section>

      <section style={{ overflowX: 'auto', backgroundColor: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ color: '#0f172a', fontWeight: 700 }}>Stock order rows</div>
          <div style={{ color: '#475569', fontSize: '0.95rem' }}>{sheets.length} saved drafts available</div>
        </div>

        <div style={{ minWidth: 960, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 120px 240px 100px 100px 100px 90px 180px 90px', gap: '1px', backgroundColor: '#e2e8f0', padding: '0.7rem 0.55rem', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
            <div>#</div>
            <div>Barcode</div>
            <div>Product name</div>
            <div>Stock</div>
            <div>POS</div>
            <div>Price</div>
            <div>Qty</div>
            <div>Notes</div>
            <div>Action</div>
          </div>
          {orderItems.map((item, index) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '40px 120px 240px 100px 100px 100px 90px 180px 90px', gap: '1px', backgroundColor: '#fff' }}>
              <div style={{ padding: '0.7rem 0.55rem', backgroundColor: '#f8fafc', color: '#475569', textAlign: 'center' }}>{index + 1}</div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-productCode`] = el; }}
                  type="text"
                  value={item.productCode}
                  onChange={(e) => updateItem(item.id, 'productCode', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      focusField(item.id, 'productName');
                    }
                  }}
                  placeholder="Barcode"
                  readOnly={!item.manual}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', backgroundColor: item.manual ? '#fff' : '#f8fafc', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-productName`] = el; }}
                  type="text"
                  value={item.productName}
                  onChange={(e) => updateItem(item.id, 'productName', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      focusField(item.id, 'shelfBalance');
                    }
                  }}
                  placeholder="Product name"
                  readOnly={!item.manual}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', backgroundColor: item.manual ? '#fff' : '#f8fafc', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-shelfBalance`] = el; }}
                  type="number"
                  value={item.shelfBalance}
                  onChange={(e) => updateItem(item.id, 'shelfBalance', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      focusField(item.id, 'posBalance');
                    }
                  }}
                  placeholder="0"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-posBalance`] = el; }}
                  type="number"
                  value={item.posBalance}
                  onChange={(e) => updateItem(item.id, 'posBalance', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      focusField(item.id, 'sellingPrice');
                    }
                  }}
                  placeholder="0"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-sellingPrice`] = el; }}
                  type="number"
                  value={item.sellingPrice}
                  onChange={(e) => updateItem(item.id, 'sellingPrice', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      focusField(item.id, 'quantityToOrder');
                    }
                  }}
                  placeholder="0.00"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-quantityToOrder`] = el; }}
                  type="number"
                  value={item.quantityToOrder}
                  onChange={(e) => updateItem(item.id, 'quantityToOrder', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      focusField(item.id, 'notes');
                    }
                  }}
                  placeholder="0"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-notes`] = el; }}
                  type="text"
                  value={item.notes}
                  onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setSearchModalOpen(true);
                    }
                  }}
                  placeholder="Notes"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.5rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.55rem', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  style={{ border: 'none', backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: 8, padding: '0.55rem 0.75rem', cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: '0.8rem', padding: '1rem', borderRadius: 16, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ color: '#0f172a', fontWeight: 700 }}>Draft summary</div>
          <div style={{ color: '#475569', fontSize: '0.95rem' }}>
            {orderItems.length} rows · {orderItems.reduce((sum, item) => sum + Number(item.quantityToOrder || 0), 0)} units requested
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.55rem', color: '#475569' }}>
          <div>Branch: <strong style={{ color: '#0f172a' }}>{selectedBranchCode || '—'}</strong></div>
          <div>Location: <strong style={{ color: '#0f172a' }}>{selectedLocationName || selectedLocationCode || '—'}</strong></div>
          <div>Saved drafts: <strong style={{ color: '#0f172a' }}>{loadingSheets ? 'Loading…' : sheets.length}</strong></div>
        </div>
      </section>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ margin: 0, color: '#0f172a' }}>Open saved drafts</h3>
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {loadingSheets && <div style={{ color: '#475569' }}>Loading drafts…</div>}
          {!loadingSheets && sheets.length === 0 && <div style={{ color: '#475569' }}>No saved drafts found.</div>}
          {!loadingSheets && sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              onClick={() => openSheet(sheet.id)}
              style={{ width: '100%', textAlign: 'left', borderRadius: 12, border: '1px solid #e2e8f0', backgroundColor: '#fff', padding: '0.9rem 1rem', cursor: 'pointer', color: '#0f172a' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontWeight: 700 }}>{sheet.purchaseOrderRef || `Draft #${sheet.id}`}</span>
                <span style={{ color: '#64748b' }}>{sheet.purchaseDate ? new Date(sheet.purchaseDate).toLocaleDateString('en-GB') : 'No date'}</span>
              </div>
              <div style={{ color: '#475569', marginTop: '0.35rem' }}>{sheet.notes || 'No notes'}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default PurchaseOrdersTab;
