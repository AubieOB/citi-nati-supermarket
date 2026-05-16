'use strict';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../../utils/api.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';

const STATUS_OPTIONS = ['draft', 'submitted', 'approved', 'completed'];

const formatDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const buildScopedParams = ({ branchCode, locationCode, locationId }) => {
  const params = {};
  if (branchCode) params.branchCode = normalizeCode(branchCode);
  if (locationCode) params.locationCode = normalizeCode(locationCode);
  if (locationId) params.locationId = locationId;
  return params;
};

const emptyLineItem = () => ({
  barcode: '',
  productId: null,
  productName: '',
  quantity: 1,
  unitCost: '',
  totalCost: 0,
  expiryDate: '',
  batchRef: '',
  notes: '',
});

const PurchaseOrdersTab = ({
  refreshKey = 0,
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
  isAggregateMode = false,
}) => {
  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [formError, setFormError] = useState('');
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [form, setForm] = useState({
    id: null,
    purchaseOrderRef: '',
    supplierId: null,
    supplierName: '',
    purchaseDate: formatDateInputValue(new Date()),
    expectedDeliveryDate: '',
    branchCode: effectiveBranchCode || '',
    locationCode: effectiveLocationCode || '',
    locationName: selectedLocationName || '',
    status: 'draft',
     'use strict';

    import React, { useCallback, useEffect, useMemo, useState } from 'react';
    import { jsPDF } from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import api from '../../../utils/api.js';
    import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';

    const PURCHASE_STATUSES = ['draft', 'printed', 'submitted'];

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
      productCode: '',
      productName: '',
      shelfBalance: '',
      posBalance: '',
      sellingPrice: '',
      quantityToOrder: 1,
      notes: '',
      sortOrder: order,
    });

    const PurchaseOrdersTab = ({ selectedLocationId = null, selectedBranchCode = '', selectedLocationCode = '', selectedLocationName = '', isAggregateMode = false }) => {
      const branch = normalizeCode(selectedBranchCode);
      const location = normalizeCode(selectedLocationCode);

      const [searchTerm, setSearchTerm] = useState('');
      const [searchResults, setSearchResults] = useState([]);
      const [searchLoading, setSearchLoading] = useState(false);

      const [orderItems, setOrderItems] = useState([emptySheetItem(1)]);
      const [saving, setSaving] = useState(false);
      const [savingError, setSavingError] = useState('');
      const [sheets, setSheets] = useState([]);
      const [loadingSheets, setLoadingSheets] = useState(false);

      const scopeParams = useMemo(() => buildScopeParams({ branchCode: branch, locationCode: location, locationId: selectedLocationId, isAggregate: isAggregateMode }), [branch, location, selectedLocationId, isAggregateMode]);

      const searchProducts = useCallback(async (q) => {
        const query = String(q || '').trim();
        if (!query) {
          setSearchResults([]);
          return;
        }
        setSearchLoading(true);
        try {
          const resp = await api.get('/business-operations/goods-intake/lookup-products', { params: { q: query, ...scopeParams, take: 12 } });
          setSearchResults(resp.data?.products || []);
        } catch (err) {
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      }, [scopeParams]);

      useEffect(() => {
        const t = setTimeout(() => searchProducts(searchTerm), 220);
        return () => clearTimeout(t);
      }, [searchTerm, searchProducts]);

      const addProductToSheet = (product) => {
        setOrderItems((prev) => {
          const next = [...prev, {
            productCode: product.barcode || product.productCode || '',
            productName: product.name || product.productName || '',
            shelfBalance: '',
            posBalance: product.availableQuantity ?? product.posBalance ?? product.stock ?? '',
            sellingPrice: product.sellingPrice ?? product.price ?? '',
            quantityToOrder: 1,
            notes: '',
            sortOrder: prev.length + 1,
          }];
          return next;
        });
      };

      const addManualRow = () => setOrderItems((prev) => [...prev, emptySheetItem(prev.length + 1)]);

      const updateItem = (index, field, value) => {
        setOrderItems((prev) => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
      };

      const removeItem = (index) => setOrderItems((prev) => {
        const next = prev.filter((_, i) => i !== index).map((it, idx) => ({ ...it, sortOrder: idx + 1 }));
        return next.length ? next : [emptySheetItem(1)];
      });

      const clearSheet = () => setOrderItems([emptySheetItem(1)]);

      const fetchSheets = useCallback(async () => {
        setLoadingSheets(true);
        try {
          const resp = await api.get('/business-operations/purchase-orders', { params: { status: 'draft', page: 1, pageSize: 50, ...scopeParams } });
          setSheets(resp.data?.data || []);
        } catch (err) {
          setSheets([]);
        } finally {
          setLoadingSheets(false);
        }
      }, [scopeParams]);

      useEffect(() => { fetchSheets(); }, [fetchSheets]);

      const openSheet = async (id) => {
        try {
          const resp = await api.get(`/business-operations/purchase-orders/${id}`);
          const sheet = resp.data?.data;
          if (!sheet) return;
          const rows = Array.isArray(sheet.items) ? sheet.items.map((it, idx) => ({
            productCode: it.barcode || '',
            productName: it.productName || '',
            shelfBalance: it.shelfBalance ?? '',
            posBalance: it.posBalance ?? '',
            sellingPrice: it.sellingPrice ?? '',
            quantityToOrder: it.quantity || 0,
            notes: it.notes || '',
            sortOrder: idx + 1,
          })) : [emptySheetItem(1)];
          setOrderItems(rows);
        } catch (err) {
          await boAlert({ title: 'Open failed', message: err.response?.data?.error || 'Unable to open sheet', type: 'error' });
        }
      };

      const saveDraft = async (status = 'draft') => {
        setSaving(true); setSavingError('');
        const payload = {
          purchaseOrderRef: undefined,
          branchCode: branch || undefined,
          locationCode: location || undefined,
          status,
          notes: undefined,
          items: orderItems.map((it, idx) => ({
            productCode: it.productCode || undefined,
            productName: it.productName || undefined,
            shelfBalance: it.shelfBalance === '' ? undefined : Number(it.shelfBalance),
            posBalance: it.posBalance === '' ? undefined : Number(it.posBalance),
            sellingPrice: it.sellingPrice === '' ? undefined : Number(it.sellingPrice),
            quantityToOrder: it.quantityToOrder === '' ? 0 : Number(it.quantityToOrder),
            notes: it.notes || undefined,
            sortOrder: idx + 1,
          })),
        };

        try {
          await api.post('/business-operations/purchase-orders', payload);
          await fetchSheets();
          await boAlert({ title: 'Saved', message: 'Draft saved', type: 'info' });
        } catch (err) {
          setSavingError(err.response?.data?.error || 'Failed to save draft');
        } finally { setSaving(false); }
      };

      const exportToPdf = async () => {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        doc.setFontSize(14);
        // Logo placeholder: if you have an image URL/base64, use doc.addImage
        doc.text('Citi-Nati Supermarket', 14, 14);
        doc.setFontSize(12);
        doc.text('Purchase Order / Stock Replenishment Request', 14, 22);
        doc.setFontSize(10);
        doc.text(`Branch: ${selectedBranchCode || 'N/A'}`, 14, 28);
        doc.text(`Location: ${selectedLocationName || selectedLocationCode || 'N/A'}`, 120, 28);
        doc.text(`Prepared by: ${' '}`, 14, 34);
        doc.text(`Date: ${new Date().toLocaleString()}`, 120, 34);

        const tableBody = orderItems.map((it, idx) => ([
          String(idx + 1),
          String(it.productCode || ''),
          String(it.productName || ''),
          String(it.shelfBalance === '' ? '' : it.shelfBalance),
          String(it.posBalance === '' ? '' : it.posBalance),
          it.sellingPrice === '' || it.sellingPrice == null ? '' : Number(it.sellingPrice).toFixed(2),
          String(it.quantityToOrder || ''),
          String(it.notes || ''),
        ]));

        autoTable(doc, {
          startY: 42,
          head: [[ 'No.', 'Product Code / Barcode', 'Product Name', 'Shelf Balance', 'POS Balance', 'Selling Price', 'Qty to Order', 'Notes' ]],
          body: tableBody,
          styles: { fontSize: 10 },
          headStyles: { fillColor: [33,56,97], textColor: 255 },
          columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 30 }, 2: { cellWidth: 50 }, 7: { cellWidth: 40 } },
          theme: 'grid',
        });

        const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 200;
        doc.setFontSize(10);
        doc.text('Prepared by: ______________________', 14, finalY + 10);
        doc.text('Checked by: ______________________', 80, finalY + 10);
        doc.text('Approved by: _____________________', 150, finalY + 10);

        doc.save(`purchase-order-sheet-${(new Date()).toISOString().slice(0,10)}.pdf`);
      };

      return (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>Purchase Order Sheet</h2>
              <p style={{ margin: '0.25rem 0 0', color: '#475569' }}>Quickly prepare printable stock replenishment sheets. This does not change inventory.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={saveDraft} disabled={saving} style={{ padding: '0.6rem 0.9rem', borderRadius: 8, backgroundColor: '#2563eb', color: '#fff', border: 'none' }}>{saving ? 'Saving…' : 'Save Draft'}</button>
              <button onClick={exportToPdf} style={{ padding: '0.6rem 0.9rem', borderRadius: 8, backgroundColor: '#0f172a', color: '#fff', border: 'none' }}>Export PDF</button>
              <button onClick={clearSheet} style={{ padding: '0.6rem 0.9rem', borderRadius: 8, backgroundColor: '#fff', color: '#0f172a', border: '1px solid #cbd5e1' }}>Clear Sheet</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input placeholder="Search products by name or barcode" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
            <button onClick={() => searchProducts(searchTerm)} style={{ padding: '0.6rem 0.9rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #cbd5e1' }}>{searchLoading ? 'Searching…' : 'Search'}</button>
            <button onClick={addManualRow} style={{ padding: '0.6rem 0.9rem', borderRadius: 8, backgroundColor: '#fff', border: '1px solid #cbd5e1' }}>Add Manual Row</button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.5rem', maxHeight: 220, overflowY: 'auto' }}>
              {searchResults.map((p) => (
                <div key={p.id || p.barcode} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p.name || p.productName}</div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>{p.barcode || p.productCode} • POS: {p.availableQuantity ?? p.stock ?? '-' } • Price: {p.sellingPrice ?? p.price ?? '-'}</div>
                  </div>
                  <div>
                    <button onClick={() => addProductToSheet(p)} style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }}>Add</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ overflowX: 'auto', background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: 10, textAlign: 'left' }}>No.</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Product Code / Barcode</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Product Name</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Shelf Balance</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>POS/System Balance</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Selling Price</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Qty to Order</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Notes</th>
                  <th style={{ padding: 10, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: 8 }}>{idx + 1}</td>
                    <td style={{ padding: 8 }}>{row.productCode}</td>
                    <td style={{ padding: 8 }}>{row.productName}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}><input value={row.shelfBalance} onChange={(e) => updateItem(idx, 'shelfBalance', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td style={{ padding: 8, textAlign: 'right' }}><input value={row.posBalance} onChange={(e) => updateItem(idx, 'posBalance', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td style={{ padding: 8, textAlign: 'right' }}><input value={row.sellingPrice} onChange={(e) => updateItem(idx, 'sellingPrice', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td style={{ padding: 8, textAlign: 'right' }}><input value={row.quantityToOrder} onChange={(e) => updateItem(idx, 'quantityToOrder', e.target.value)} style={{ width: 80, textAlign: 'right' }} /></td>
                    <td style={{ padding: 8 }}><input value={row.notes} onChange={(e) => updateItem(idx, 'notes', e.target.value)} style={{ width: '100%' }} /></td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <button onClick={() => removeItem(idx)} style={{ padding: '0.35rem 0.6rem', borderRadius: 6, border: '1px solid #f1f5f9', background: '#fff' }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ color: '#64748b' }}>{savingError}</div>
          </div>

          <div style={{ marginTop: 6 }}>
            <h4 style={{ margin: '0 0 6px' }}>Drafts</h4>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8 }}>
              {loadingSheets ? (
                <div>Loading drafts…</div>
              ) : sheets.length === 0 ? (
                <div style={{ color: '#64748b' }}>No drafts found</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>{sheets.map((s) => (
                  <li key={s.id} style={{ margin: '6px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>{s.purchaseOrderRef || `Sheet #${s.id}`} • {s.createdAt ? new Date(s.createdAt).toLocaleString() : ''}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => openSheet(s.id)} style={{ padding: '0.35rem 0.6rem' }}>Open</button>
                    </div>
                  </li>
                ))}</ul>
              )}
            </div>
          </div>
        </div>
      );
    };

    export default PurchaseOrdersTab;
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <button type="button" onClick={() => removeLineItem(index)} style={{ border: '1px solid #f1f5f9', backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '10px', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {formError && (
                <div style={{ color: '#b91c1c', padding: '0.75rem', backgroundColor: '#fef2f2', borderRadius: '12px', border: '1px solid #fecaca' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button type="button" onClick={closeForm} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', padding: '0.8rem 1.1rem', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="button" onClick={submitForm} disabled={saving} style={{ borderRadius: '10px', border: '1px solid #2563eb', backgroundColor: '#2563eb', color: '#fff', padding: '0.8rem 1.1rem', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : formMode === 'create' ? 'Save Purchase Order' : 'Update Purchase Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersTab;
