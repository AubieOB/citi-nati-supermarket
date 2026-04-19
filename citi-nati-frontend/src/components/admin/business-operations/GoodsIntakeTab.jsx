import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';
import { exportGoodsIntakeRecordPdf } from '../../../utils/businessOperationsPdfExports.js';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const tableInputStyle = {
  width: '100%',
  minWidth: 0,
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  padding: '0.45rem 0.5rem',
  fontSize: '0.86rem',
  backgroundColor: '#fff',
};

const DEFAULT_STATUS_FILTER = 'all';

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function money(value) {
  return `MWK ${toMoney(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function localDateKey(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function dateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return localDateKey(d);
}

function createEmptyLine() {
  return {
    barcode: '',
    productId: null,
    productName: '',
    quantity: 1,
    unitCost: '',
    sellingPrice: '',
    expiryDate: '',
    batchRef: '',
    lineNotes: '',
  };
}

function withCalculatedLine(line) {
  const quantity = Math.max(0, Number(line.quantity || 0));
  const unitCost = Math.max(0, Number(line.unitCost || 0));
  const totalCost = toMoney(quantity * unitCost);
  const hasSellingPrice = line.sellingPrice !== '' && line.sellingPrice !== null && line.sellingPrice !== undefined;
  const sellingPrice = hasSellingPrice ? Math.max(0, Number(line.sellingPrice || 0)) : null;
  const estimatedProfit = sellingPrice == null ? 0 : toMoney((sellingPrice - unitCost) * quantity);
  const marginPercent = sellingPrice && sellingPrice > 0
    ? toMoney(((sellingPrice - unitCost) / sellingPrice) * 100)
    : null;

  return {
    ...line,
    quantity,
    unitCost: toMoney(unitCost),
    totalCost,
    sellingPrice,
    estimatedProfit,
    marginPercent,
  };
}

function normalizeLocationCode(location) {
  const name = String(location?.name || '').trim().toLowerCase();
  if (name === 'blantyre') return 'BT';
  if (name === 'zomba') return 'ZA';
  return location?.code ? String(location.code).trim().toUpperCase() : '';
}

function selectInputText(event) {
  const target = event?.target;
  if (!target) return;
  if (target.disabled || target.readOnly) return;
  if (typeof target.select === 'function') {
    target.select();
  }
}

function focusNextWorkspaceField(container, currentField) {
  if (!container || !currentField) return;

  const focusableFields = Array.from(
    container.querySelectorAll('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
  ).filter((field) => !field.readOnly && field.tabIndex !== -1 && field.offsetParent !== null);

  const currentIndex = focusableFields.indexOf(currentField);
  if (currentIndex === -1) return;

  const nextField = focusableFields[currentIndex + 1];
  if (!nextField) return;

  nextField.focus();
  if (typeof nextField.select === 'function' && nextField.tagName !== 'SELECT') {
    nextField.select();
  }
}

function buildNewForm(selectedLocation) {
  return {
    id: null,
    intakeRef: '',
    supplierId: '',
    manualSupplierName: '',
    supplierStoreRef: '',
    purchaseDate: localDateKey(new Date()),
    receiptReference: '',
    locationId: selectedLocation ? String(selectedLocation.id) : '',
    locationCode: selectedLocation?.code || normalizeLocationCode(selectedLocation),
    locationName: selectedLocation?.name || '',
    overallNotes: '',
    receiptTotalAmount: '',
    status: 'draft',
    items: [createEmptyLine()],
  };
}

function toPayload(form, items) {
  return {
    supplierId: form.supplierId ? Number(form.supplierId) : null,
    manualSupplierName: form.manualSupplierName || null,
    supplierStoreRef: form.supplierStoreRef || null,
    purchaseDate: form.purchaseDate,
    receiptReference: form.receiptReference || null,
    locationId: form.locationId ? Number(form.locationId) : null,
    locationCode: form.locationCode || null,
    locationName: form.locationName || null,
    overallNotes: form.overallNotes || null,
    receiptTotalAmount: form.receiptTotalAmount === '' ? null : Number(form.receiptTotalAmount),
    status: form.status,
    items: items.map((item) => ({
      barcode: item.barcode || null,
      productId: item.productId || null,
      productName: item.productName || '',
      quantity: Number(item.quantity || 0),
      unitCost: Number(item.unitCost || 0),
      sellingPrice: item.sellingPrice == null || item.sellingPrice === '' ? null : Number(item.sellingPrice),
      expiryDate: item.expiryDate || null,
      batchRef: item.batchRef || null,
      lineNotes: item.lineNotes || null,
    })),
  };
}

function toFormFromRecord(record) {
  return {
    id: record.id,
    intakeRef: record.intakeRef || '',
    supplierId: record.supplierId ? String(record.supplierId) : '',
    manualSupplierName: record.manualSupplierName || '',
    supplierStoreRef: record.supplierStoreRef || '',
    purchaseDate: dateInputValue(record.purchaseDate),
    receiptReference: record.receiptReference || '',
    locationId: record.locationId ? String(record.locationId) : '',
    locationCode: record.locationCode || '',
    locationName: record.locationName || '',
    overallNotes: record.overallNotes || '',
    receiptTotalAmount: record.receiptTotalAmount == null ? '' : String(record.receiptTotalAmount),
    status: String(record.status || 'draft').toLowerCase(),
    items: Array.isArray(record.items) && record.items.length > 0
      ? record.items.map((item) => ({
          barcode: item.barcode || '',
          productId: item.productId || null,
          productName: item.productName || '',
          quantity: Number(item.quantity || 0),
          unitCost: Number(item.unitCost || 0),
          sellingPrice: item.sellingPrice == null ? '' : Number(item.sellingPrice),
          expiryDate: dateInputValue(item.expiryDate),
          batchRef: item.batchRef || '',
          lineNotes: item.lineNotes || '',
        }))
      : [createEmptyLine()],
  };
}

const GoodsIntakeTab = ({ selectedLocationId = null, locations = [] }) => {
  const workspaceRef = useRef(null);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');

  const themedCardStyle = useMemo(() => ({
    ...cardStyle,
    backgroundColor: isAdminDarkTheme ? '#111827' : '#fff',
    border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #e2e8f0',
    boxShadow: isAdminDarkTheme ? '0 12px 28px rgba(0, 0, 0, 0.45)' : cardStyle.boxShadow,
  }), [isAdminDarkTheme]);

  const themedInputStyle = useMemo(() => ({
    ...tableInputStyle,
    border: isAdminDarkTheme ? '1px solid #334155' : tableInputStyle.border,
    backgroundColor: isAdminDarkTheme ? '#0f172a' : '#fff',
    color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a',
  }), [isAdminDarkTheme]);

  const colors = useMemo(() => ({
    text: isAdminDarkTheme ? '#f8fafc' : '#111827',
    strongText: isAdminDarkTheme ? '#f1f5f9' : '#1f2937',
    mutedText: isAdminDarkTheme ? '#cbd5e1' : '#64748b',
    subtleText: isAdminDarkTheme ? '#94a3b8' : '#64748b',
    tableBorder: isAdminDarkTheme ? '#243244' : '#f1f5f9',
    launchCardOneBorder: isAdminDarkTheme ? '#5b4b8a' : '#d8b4fe',
    launchCardOneBg: isAdminDarkTheme ? 'linear-gradient(135deg, #231b38 0%, #151a28 65%)' : 'linear-gradient(135deg, #f8f5ff 0%, #ffffff 60%)',
    launchCardTwoBorder: isAdminDarkTheme ? '#365f98' : '#bfdbfe',
    launchCardTwoBg: isAdminDarkTheme ? 'linear-gradient(135deg, #18273f 0%, #151a28 65%)' : 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)',
  }), [isAdminDarkTheme]);

  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const selectedLocation = useMemo(() => {
    if (!selectedLocationId) return null;
    return locations.find((location) => Number(location.id) === Number(selectedLocationId)) || null;
  }, [locations, selectedLocationId]);

  const [form, setForm] = useState(() => buildNewForm(selectedLocation));
  const [saving, setSaving] = useState(false);
  const [activeLookupRow, setActiveLookupRow] = useState(-1);
  const [isIntakeWorkspaceOpen, setIsIntakeWorkspaceOpen] = useState(false);
  const [isIntakeWorkspaceMaximized, setIsIntakeWorkspaceMaximized] = useState(false);

  useEffect(() => {
    if (form.id) return;
    setForm((prev) => ({
      ...prev,
      locationId: selectedLocation ? String(selectedLocation.id) : '',
      locationCode: selectedLocation?.code || normalizeLocationCode(selectedLocation),
      locationName: selectedLocation?.name || '',
    }));
  }, [form.id, selectedLocation]);

  const calculatedItems = useMemo(() => form.items.map(withCalculatedLine), [form.items]);

  const totals = useMemo(() => {
    const totalItems = calculatedItems.length;
    const totalQuantity = toMoney(calculatedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0));
    const totalCost = toMoney(calculatedItems.reduce((sum, item) => sum + Number(item.totalCost || 0), 0));
    const totalEstimatedProfit = toMoney(calculatedItems.reduce((sum, item) => sum + Number(item.estimatedProfit || 0), 0));
    return { totalItems, totalQuantity, totalCost, totalEstimatedProfit };
  }, [calculatedItems]);

  const missingBarcodeCount = useMemo(
    () => calculatedItems.filter((item) => item.productName && !String(item.barcode || '').trim()).length,
    [calculatedItems]
  );

  const missingExpiryCount = useMemo(
    () => calculatedItems.filter((item) => item.productName && !item.expiryDate).length,
    [calculatedItems]
  );

  const selectedSupplierName = useMemo(() => {
    const supplier = suppliers.find((entry) => String(entry.id) === String(form.supplierId || ''));
    if (supplier?.name) return supplier.name;
    if (String(form.manualSupplierName || '').trim()) return String(form.manualSupplierName).trim();
    return 'Supplier Name';
  }, [form.manualSupplierName, form.supplierId, suppliers]);

  const fetchRecords = useCallback(async () => {
    setListLoading(true);
    setListError('');

    try {
      const response = await api.get('/business-operations/goods-intake', {
        params: {
          page,
          pageSize: 15,
          sortBy: 'purchaseDate',
          sortOrder: 'desc',
          search: search || undefined,
          status: statusFilter !== DEFAULT_STATUS_FILTER ? statusFilter : undefined,
          locationId: selectedLocationId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });

      setRecords(response.data?.data || []);
      setPagination(response.data?.pagination || null);
    } catch (error) {
      setRecords([]);
      setPagination(null);
      setListError(error.response?.data?.error || 'Failed to load goods intake records');
    } finally {
      setListLoading(false);
    }
  }, [endDate, page, search, selectedLocationId, startDate, statusFilter]);

  const fetchSuppliers = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const response = await api.get('/business-operations/suppliers', {
        params: {
          page: 1,
          pageSize: 200,
          sortBy: 'name',
          sortOrder: 'asc',
          locationId: selectedLocationId || undefined,
          status: 'active',
        },
      });
      setSuppliers(response.data?.data || []);
    } catch (_error) {
      setSuppliers([]);
    } finally {
      setSupplierLoading(false);
    }
  }, [selectedLocationId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, startDate, endDate, selectedLocationId]);

  useEffect(() => {
    if (!isIntakeWorkspaceOpen) return;
    const handler = (event) => {
      if (event.key === 'Escape') {
        setIsIntakeWorkspaceOpen(false);
        setIsIntakeWorkspaceMaximized(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isIntakeWorkspaceOpen]);

  const setLineValue = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, createEmptyLine()] }));
  };

  const duplicateLine = (index) => {
    setForm((prev) => {
      const source = prev.items[index] || createEmptyLine();
      const clone = {
        ...source,
        barcode: source.barcode || '',
        productName: source.productName || '',
      };
      return {
        ...prev,
        items: [...prev.items.slice(0, index + 1), clone, ...prev.items.slice(index + 1)],
      };
    });
  };

  const removeLine = (index) => {
    setForm((prev) => {
      if (prev.items.length <= 1) return { ...prev, items: [createEmptyLine()] };
      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const clearForm = () => {
    setForm(buildNewForm(selectedLocation));
  };

  const openWorkspace = ({ reset = false } = {}) => {
    if (reset) {
      setForm(buildNewForm(selectedLocation));
    }
    setIsIntakeWorkspaceMaximized(false);
    setIsIntakeWorkspaceOpen(true);
  };

  const validateBeforeSave = () => {
    if (!form.purchaseDate) return 'Purchase date is required.';
    if (!form.supplierId && !form.manualSupplierName.trim()) return 'Select a supplier or enter a manual supplier name.';

    const validLines = calculatedItems.filter((item) => item.productName.trim());
    if (!validLines.length) return 'Enter at least one product line.';

    for (let i = 0; i < validLines.length; i += 1) {
      const line = validLines[i];
      if (line.quantity <= 0) return `Line ${i + 1}: quantity must be greater than 0.`;
      if (line.unitCost < 0) return `Line ${i + 1}: unit cost must be 0 or greater.`;
    }

    return null;
  };

  const saveRecord = async (status = 'draft') => {
    const validationError = validateBeforeSave();
    if (validationError) {
      await boAlert({ title: 'Validation Error', message: validationError, type: 'warning' });
      return;
    }

    const validItems = calculatedItems.filter((item) => item.productName.trim());
    const payload = toPayload({ ...form, status }, validItems);

    if (payload.locationId && !payload.locationName) {
      const chosen = locations.find((location) => Number(location.id) === Number(payload.locationId));
      if (chosen) {
        payload.locationName = chosen.name;
        payload.locationCode = chosen.code || normalizeLocationCode(chosen);
      }
    }

    setSaving(true);
    try {
      const response = form.id
        ? await api.put(`/business-operations/goods-intake/${form.id}`, payload)
        : await api.post('/business-operations/goods-intake', payload);

      const saved = response.data?.data;
      if (saved) {
        setForm(toFormFromRecord(saved));
      }

      await fetchRecords();
      await boAlert({
        title: 'Saved',
        message: `Goods intake record ${status === 'finalized' ? 'finalized' : 'saved as draft'} successfully.`,
        type: 'success',
      });
    } catch (error) {
      await boAlert({
        title: 'Save Failed',
        message: error.response?.data?.error || 'Failed to save goods intake record.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditRecord = async (recordId) => {
    try {
      const response = await api.get(`/business-operations/goods-intake/${recordId}`);
      const data = response.data?.data;
      if (!data) return;
      setForm(toFormFromRecord(data));
      setIsIntakeWorkspaceOpen(true);
    } catch (error) {
      await boAlert({ title: 'Load Failed', message: error.response?.data?.error || 'Failed to load record.', type: 'error' });
    }
  };

  const handleDeleteRecord = async (record) => {
    const confirmed = await boConfirm({
      title: 'Delete Record',
      message: `Delete Goods Intake ${record.intakeRef}? This cannot be undone.`,
      type: 'warning',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    try {
      await api.delete(`/business-operations/goods-intake/${record.id}`);
      if (Number(form.id) === Number(record.id)) clearForm();
      await fetchRecords();
    } catch (error) {
      await boAlert({ title: 'Delete Failed', message: error.response?.data?.error || 'Failed to delete record.', type: 'error' });
    }
  };

  const handleExportRecord = async (recordId) => {
    try {
      const response = await api.get(`/business-operations/goods-intake/${recordId}`);
      const data = response.data?.data;
      if (!data) return;
      exportGoodsIntakeRecordPdf({
        record: data,
        companyName: 'Citi-Nati Supermarket',
      });
    } catch (error) {
      await boAlert({ title: 'Export Failed', message: error.response?.data?.error || 'Failed to export PDF.', type: 'error' });
    }
  };

  const handleLookup = async (index) => {
    const line = form.items[index];
    const query = String(line?.barcode || line?.productName || '').trim();
    if (!query) return;

    setActiveLookupRow(index);
    try {
      const response = await api.get('/admin/emergency-sales/lookup', { params: { q: query } });
      const products = response.data?.products || [];
      if (!products.length) return;

      const exact = products.find((product) =>
        String(product.barcode || '').toLowerCase() === query.toLowerCase()
        || String(product.productCode || '').toLowerCase() === query.toLowerCase()
      );

      const chosen = exact || products[0];
      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          return {
            ...item,
            productId: chosen.id || null,
            barcode: item.barcode || chosen.barcode || chosen.productCode || '',
            productName: chosen.name || item.productName,
            sellingPrice: item.sellingPrice || chosen.price || '',
          };
        }),
      }));
    } catch (_error) {
      // Keep entry flow uninterrupted if lookup fails.
    } finally {
      setActiveLookupRow(-1);
    }
  };

  const handleEntryFieldEnter = useCallback((event, options = {}) => {
    if (event.key !== 'Enter') return;

    const { lookupRowIndex = null } = options;
    event.preventDefault();

    if (lookupRowIndex != null) {
      handleLookup(lookupRowIndex);
    }

    focusNextWorkspaceField(workspaceRef.current, event.currentTarget);
  }, [handleLookup]);

  const workspaceContent = (
    <section ref={workspaceRef} style={{ ...cardStyle, padding: '1rem', width: '100%', minWidth: 0, boxShadow: 'none', border: 'none', background: 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: colors.text }}>Goods Intake</h2>
            <div style={{ fontSize: '0.86rem', color: colors.mutedText, marginTop: '0.2rem' }}>
              Digital Purchase Intake Register for supplier receipt entry and printable filing.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => clearForm()} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              New Record
            </button>
            {form.id && (
              <button type="button" onClick={() => handleExportRecord(form.id)} style={{ border: isAdminDarkTheme ? '1px solid #2f7f58' : '1px solid #bbf7d0', background: isAdminDarkTheme ? '#153828' : '#f0fdf4', color: isAdminDarkTheme ? '#91e0b4' : '#166534', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                Export PDF
              </button>
            )}
            <button type="button" onClick={() => saveRecord('draft')} disabled={saving} style={{ border: isAdminDarkTheme ? '1px solid #365f98' : '1px solid #dbeafe', background: isAdminDarkTheme ? '#18273f' : '#eff6ff', color: isAdminDarkTheme ? '#b9d7ff' : '#1d4ed8', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button type="button" onClick={() => saveRecord('finalized')} disabled={saving} style={{ border: 'none', background: '#0f766e', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Finalize Intake'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', width: '100%', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Supplier (existing)</label>
            <select
              value={form.supplierId}
              onChange={(event) => setForm((prev) => ({ ...prev, supplierId: event.target.value }))}
              onKeyDown={handleEntryFieldEnter}
              style={{ ...tableInputStyle, backgroundColor: supplierLoading ? '#f8fafc' : '#fff' }}
            >
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={String(supplier.id)}>{supplier.name}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Manual Supplier Name</label>
            <input value={form.manualSupplierName} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setForm((prev) => ({ ...prev, manualSupplierName: event.target.value }))} style={themedInputStyle} placeholder="Use when supplier is not in list" />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Purchase Date</label>
            <input type="date" value={form.purchaseDate} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setForm((prev) => ({ ...prev, purchaseDate: event.target.value }))} style={themedInputStyle} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Status</label>
            <input value={String(form.status || 'draft').toUpperCase()} disabled style={{ ...themedInputStyle, backgroundColor: isAdminDarkTheme ? '#111827' : '#f8fafc', color: isAdminDarkTheme ? '#cbd5e1' : '#334155' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Supplier/Store Ref</label>
            <input value={form.supplierStoreRef} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setForm((prev) => ({ ...prev, supplierStoreRef: event.target.value }))} style={themedInputStyle} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Receipt Ref</label>
            <input value={form.receiptReference} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setForm((prev) => ({ ...prev, receiptReference: event.target.value }))} style={themedInputStyle} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Branch / Location</label>
            <select
              value={form.locationId}
              onChange={(event) => {
                const location = locations.find((entry) => String(entry.id) === event.target.value) || null;
                setForm((prev) => ({
                  ...prev,
                  locationId: event.target.value,
                  locationCode: location?.code || normalizeLocationCode(location),
                  locationName: location?.name || '',
                }));
              }}
              onKeyDown={handleEntryFieldEnter}
              style={themedInputStyle}
            >
              <option value="">Select location</option>
              {locations.map((location) => (
                <option key={location.id} value={String(location.id)}>{location.name}{location.code ? ` (${location.code})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Receipt Total (optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.receiptTotalAmount}
              onFocus={selectInputText}
              onKeyDown={handleEntryFieldEnter}
              onChange={(event) => setForm((prev) => ({ ...prev, receiptTotalAmount: event.target.value }))}
              style={themedInputStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Overall Notes / Comments</label>
            <textarea rows={2} value={form.overallNotes} onFocus={selectInputText} onChange={(event) => setForm((prev) => ({ ...prev, overallNotes: event.target.value }))} style={{ ...themedInputStyle, resize: 'vertical' }} />
          </div>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={addLine} style={{ border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: '8px', padding: '0.35rem 0.7rem', fontWeight: 600, cursor: 'pointer' }}>Add Row</button>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Checks:</span>
          <span style={{ fontSize: '0.78rem', color: missingBarcodeCount ? '#b45309' : '#64748b' }}>Missing barcode: {missingBarcodeCount}</span>
          <span style={{ fontSize: '0.78rem', color: missingExpiryCount ? '#b45309' : '#64748b' }}>Missing expiry: {missingExpiryCount}</span>
        </div>

        <div style={{ marginTop: '0.8rem', width: '100%', maxWidth: '100%', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 0.45rem', minWidth: '1220px' }}>
            <thead>
              <tr>
                {['#', 'Barcode', 'Product Name', 'Qty', 'Unit Cost', 'Total Cost', 'Selling Price', 'Margin %', 'Est. Profit', 'Expiry Date', 'Batch/Lot', 'Comments', 'Actions'].map((label) => (
                  <th key={label} style={{ textAlign: 'left', fontSize: '0.75rem', color: '#64748b', fontWeight: 700, padding: '0 0.35rem' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calculatedItems.map((line, index) => {
                const belowCost = line.sellingPrice != null && Number(line.sellingPrice) < Number(line.unitCost || 0);
                return (
                  <tr key={`line-${index}`}>
                    <td style={{ fontWeight: 700, color: '#334155', fontSize: '0.85rem', padding: '0 0.35rem' }}>{index + 1}</td>
                    <td style={{ minWidth: '120px', padding: '0 0.35rem' }}>
                      <input
                        value={line.barcode || ''}
                        onFocus={selectInputText}
                        onKeyDown={(event) => handleEntryFieldEnter(event, { lookupRowIndex: index })}
                        onChange={(event) => setLineValue(index, 'barcode', event.target.value)}
                        onBlur={() => handleLookup(index)}
                        style={{ ...tableInputStyle, backgroundColor: line.productName && !line.barcode ? '#fff7ed' : '#fff' }}
                        placeholder="scan/manual"
                      />
                    </td>
                    <td style={{ minWidth: '220px', padding: '0 0.35rem' }}>
                      <input
                        value={line.productName || ''}
                        onFocus={selectInputText}
                        onKeyDown={(event) => handleEntryFieldEnter(event, { lookupRowIndex: index })}
                        onChange={(event) => setLineValue(index, 'productName', event.target.value)}
                        onBlur={() => { if (!line.productName) return; handleLookup(index); }}
                        style={tableInputStyle}
                        placeholder="Product name"
                      />
                    </td>
                    <td style={{ minWidth: '70px', padding: '0 0.35rem' }}>
                      <input type="number" min="0" step="1" value={line.quantity} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setLineValue(index, 'quantity', event.target.value)} style={tableInputStyle} />
                    </td>
                    <td style={{ minWidth: '110px', padding: '0 0.35rem' }}>
                      <input type="number" min="0" step="0.01" value={line.unitCost} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setLineValue(index, 'unitCost', event.target.value)} style={tableInputStyle} />
                    </td>
                    <td style={{ minWidth: '115px', color: '#0f172a', fontWeight: 700, fontSize: '0.85rem', padding: '0 0.35rem' }}>{money(line.totalCost)}</td>
                    <td style={{ minWidth: '120px', padding: '0 0.35rem' }}>
                      <input type="number" min="0" step="0.01" value={line.sellingPrice == null ? '' : line.sellingPrice} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setLineValue(index, 'sellingPrice', event.target.value)} style={{ ...tableInputStyle, borderColor: belowCost ? '#f59e0b' : '#cbd5e1', backgroundColor: belowCost ? '#fffbeb' : '#fff' }} />
                    </td>
                    <td style={{ minWidth: '92px', fontWeight: 700, color: '#334155', fontSize: '0.84rem', padding: '0 0.35rem' }}>{line.marginPercent == null ? '-' : `${line.marginPercent.toFixed(2)}%`}</td>
                    <td style={{ minWidth: '110px', fontWeight: 700, color: line.estimatedProfit >= 0 ? '#166534' : '#b91c1c', fontSize: '0.84rem', padding: '0 0.35rem' }}>{money(line.estimatedProfit)}</td>
                    <td style={{ minWidth: '132px', padding: '0 0.35rem' }}>
                      <input type="date" value={line.expiryDate || ''} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setLineValue(index, 'expiryDate', event.target.value)} style={{ ...tableInputStyle, backgroundColor: line.productName && !line.expiryDate ? '#fff7ed' : '#fff' }} />
                    </td>
                    <td style={{ minWidth: '120px', padding: '0 0.35rem' }}>
                      <input value={line.batchRef || ''} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setLineValue(index, 'batchRef', event.target.value)} style={tableInputStyle} />
                    </td>
                    <td style={{ minWidth: '180px', padding: '0 0.35rem' }}>
                      <input value={line.lineNotes || ''} onFocus={selectInputText} onKeyDown={handleEntryFieldEnter} onChange={(event) => setLineValue(index, 'lineNotes', event.target.value)} style={tableInputStyle} />
                    </td>
                    <td style={{ minWidth: '130px', padding: '0 0.35rem' }}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button type="button" onClick={() => duplicateLine(index)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '8px', padding: '0.3rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Dup</button>
                        <button type="button" onClick={() => removeLine(index)} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.3rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Del</button>
                      </div>
                      {activeLookupRow === index && <div style={{ marginTop: '0.25rem', fontSize: '0.72rem', color: '#2563eb' }}>Looking up...</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '0.8rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem', width: '100%', minWidth: 0 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>TOTAL LINES</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>{totals.totalItems}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>TOTAL QUANTITY</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>{totals.totalQuantity.toLocaleString('en-US')}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>TOTAL COST</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>{money(totals.totalCost)}</div>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>EST. PROFIT</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: totals.totalEstimatedProfit >= 0 ? '#166534' : '#b91c1c' }}>{money(totals.totalEstimatedProfit)}</div>
          </div>
        </div>
      </section>
  );

  return (
    <div style={{ display: 'grid', gap: '1rem', width: '100%', minWidth: 0 }}>
      <section style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0 }}>
        <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <button
            type="button"
            onClick={() => openWorkspace()}
            style={{
              textAlign: 'left',
              border: `1px solid ${colors.launchCardOneBorder}`,
              background: colors.launchCardOneBg,
              borderRadius: '20px',
              padding: '1.1rem',
              cursor: 'pointer',
              boxShadow: isAdminDarkTheme ? '0 14px 30px rgba(0, 0, 0, 0.45)' : '0 16px 35px rgba(91, 75, 138, 0.10)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#c4b5fd' : '#6d28d9', fontWeight: 800 }}>Purchase Register</div>
                <div style={{ marginTop: '0.4rem', fontSize: '1.2rem', fontWeight: 800, color: colors.strongText, lineHeight: 1.25 }}>
                  Register Intake For "{selectedSupplierName}"
                </div>
              </div>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: isAdminDarkTheme ? '#7c6cb0' : '#5b4b8a', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <i className="fas fa-arrow-up-right-from-square" />
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => openWorkspace({ reset: true })}
            style={{
              textAlign: 'left',
              border: `1px solid ${colors.launchCardTwoBorder}`,
              background: colors.launchCardTwoBg,
              borderRadius: '20px',
              padding: '1.1rem',
              cursor: 'pointer',
              boxShadow: isAdminDarkTheme ? '0 14px 30px rgba(0, 0, 0, 0.45)' : '0 14px 30px rgba(37, 99, 235, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'start' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#93c5fd' : '#1d4ed8', fontWeight: 800 }}>Quick Start</div>
                <div style={{ marginTop: '0.4rem', fontSize: '1.2rem', fontWeight: 800, color: colors.strongText, lineHeight: 1.25 }}>
                  Start A Fresh Goods Intake
                </div>
              </div>
              <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: isAdminDarkTheme ? '#3b82f6' : '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <i className="fas fa-plus" />
              </div>
            </div>
          </button>
        </div>
      </section>

      <section style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, color: colors.text }}>Purchase Intake History</h3>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <input placeholder="Search ref/supplier/product" value={search} onFocus={selectInputText} onChange={(event) => setSearch(event.target.value)} style={{ ...themedInputStyle, width: '220px' }} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ ...themedInputStyle, width: '130px' }}>
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
            </select>
            <input type="date" value={startDate} onFocus={selectInputText} onChange={(event) => setStartDate(event.target.value)} style={{ ...themedInputStyle, width: '140px' }} />
            <input type="date" value={endDate} onFocus={selectInputText} onChange={(event) => setEndDate(event.target.value)} style={{ ...themedInputStyle, width: '140px' }} />
          </div>
        </div>

        {listError && <div style={{ marginTop: '0.8rem', fontSize: '0.86rem', color: '#b91c1c' }}>{listError}</div>}

        <div style={{ marginTop: '0.8rem', flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
            <thead>
              <tr>
                {['Ref', 'Purchase Date', 'Supplier', 'Location', 'Status', 'Items', 'Total Cost', 'Actions'].map((label) => (
                  <th key={label} style={{ textAlign: 'left', padding: '0.55rem 0.45rem', fontSize: '0.76rem', color: colors.mutedText, borderBottom: `1px solid ${isAdminDarkTheme ? '#334155' : '#e2e8f0'}` }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr><td colSpan={8} style={{ padding: '1rem', color: colors.mutedText }}>Loading records...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '1rem', color: colors.mutedText }}>No records found for current filters.</td></tr>
              ) : records.map((record) => (
                <tr key={record.id}>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{record.intakeRef}</td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{dateInputValue(record.purchaseDate)}</td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.supplier?.name || record.manualSupplierName || '-'}</td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.locationName || record.locationCode || '-'}</td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: record.status === 'finalized' ? '#166534' : '#1d4ed8',
                      backgroundColor: record.status === 'finalized' ? '#ecfdf3' : '#eff6ff',
                      border: `1px solid ${record.status === 'finalized' ? '#bbf7d0' : '#bfdbfe'}`,
                    }}>
                      {String(record.status || 'draft').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.totalItems || record._count?.items || 0}</td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{money(record.totalCost)}</td>
                  <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => handleEditRecord(record.id)} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                      <button type="button" onClick={() => handleExportRecord(record.id)} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>PDF</button>
                      <button type="button" onClick={() => handleDeleteRecord(record)} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div style={{ marginTop: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.8rem', color: colors.mutedText }}>
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={pagination.page <= 1} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '7px', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', padding: '0.3rem 0.65rem', cursor: 'pointer' }}>Prev</button>
              <button type="button" onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))} disabled={pagination.page >= pagination.totalPages} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '7px', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', padding: '0.3rem 0.65rem', cursor: 'pointer' }}>Next</button>
            </div>
          </div>
        )}
      </section>

      {isIntakeWorkspaceOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isIntakeWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isIntakeWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1480px, 98vw)', height: isIntakeWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isIntakeWorkspaceMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Goods Intake Workspace</div>
                <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#111827' }}>Register Intake For "{selectedSupplierName}"</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  type="button"
                  title={isIntakeWorkspaceMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isIntakeWorkspaceMaximized ? 'Restore workspace' : 'Maximize workspace'}
                  onClick={() => setIsIntakeWorkspaceMaximized((prev) => !prev)}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', color: '#334155', cursor: 'pointer' }}
                >
                  <i className={`fas ${isIntakeWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => { setIsIntakeWorkspaceOpen(false); setIsIntakeWorkspaceMaximized(false); }}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem' }}>
              {workspaceContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoodsIntakeTab;
