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

const TRANSFER_STATUS_META = {
  not_transferred: { label: 'Not Transferred', short: 'Not Sent', tone: { border: '#cbd5e1', bg: '#f8fafc', color: '#475569' } },
  queued: { label: 'Queued', short: 'Queued', tone: { border: '#fde68a', bg: '#fefce8', color: '#92400e' } },
  transferred: { label: 'Transferred to POS', short: 'Transferred', tone: { border: '#99f6e4', bg: '#f0fdfa', color: '#0f766e' } },
  failed: { label: 'Failed', short: 'Failed', tone: { border: '#fecaca', bg: '#fff1f2', color: '#b91c1c' } },
  approved: { label: 'Approved in POS', short: 'Approved', tone: { border: '#bbf7d0', bg: '#f0fdf4', color: '#166534' } },
};

function resolveTransferStatus(record) {
  const status = String(record?.posTransferStatus || '').trim().toLowerCase();
  if (status === 'queued') return 'queued';
  if (status === 'failed') return 'failed';
  if (status === 'approved') return 'approved';
  if (status === 'transferred') {
    const approvedFlag = Boolean(record?.posTransferCommand?.resultSummary?.approvedInPos);
    return approvedFlag ? 'approved' : 'transferred';
  }
  return 'not_transferred';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
    posTransferStatus: null,
    posTransferGrn: null,
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
    posTransferStatus: record.posTransferStatus || null,
    posTransferGrn: record.posTransferGrn || null,
  };
}

const GoodsIntakeTab = ({ selectedLocationId = null, locations = [], permissions = {} }) => {
  const workspaceRef = useRef(null);
  const intakeHistorySectionRef = useRef(null);
  const transferHistorySectionRef = useRef(null);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const canViewForm = permissions.canViewForm !== false;
  const canViewHistory = permissions.canViewHistory !== false;
  const canCreate = permissions.canCreate !== false;
  const canEdit = permissions.canEdit !== false;
  const canDelete = permissions.canDelete !== false;
  const canExport = permissions.canExport !== false;

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
  const [transferring, setTransferring] = useState(false);
  const [activeLookupRow, setActiveLookupRow] = useState(-1);
  const [lookupWarning, setLookupWarning] = useState('');
  const [isIntakeWorkspaceOpen, setIsIntakeWorkspaceOpen] = useState(false);
  const [isIntakeWorkspaceMaximized, setIsIntakeWorkspaceMaximized] = useState(false);
  const [isTransferDetailOpen, setIsTransferDetailOpen] = useState(false);
  const [transferDetailRecord, setTransferDetailRecord] = useState(null);

  const [transferStatusFilter, setTransferStatusFilter] = useState('all');
  const [transferSupplierFilter, setTransferSupplierFilter] = useState('all');
  const [transferLocationFilter, setTransferLocationFilter] = useState('all');
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');

  const activeLookupLocationCode = useMemo(() => {
    const formLocationCode = String(form.locationCode || '').trim().toUpperCase();
    if (formLocationCode) return formLocationCode;
    return normalizeLocationCode(selectedLocation);
  }, [form.locationCode, selectedLocation]);

  useEffect(() => {
    if (form.id) return;
    setForm((prev) => ({
      ...prev,
      locationId: selectedLocation ? String(selectedLocation.id) : '',
      locationCode: selectedLocation?.code || normalizeLocationCode(selectedLocation),
      locationName: selectedLocation?.name || '',
    }));
  }, [form.id, selectedLocation]);

  useEffect(() => {
    if (activeLookupLocationCode) {
      setLookupWarning('');
    }
  }, [activeLookupLocationCode]);

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

  const finalizedRecordsCount = useMemo(
    () => records.filter((record) => String(record.status || '').toLowerCase() === 'finalized').length,
    [records]
  );

  const transferHistoryRecords = useMemo(() => {
    return records.filter((record) => {
      if (String(record.status || '').toLowerCase() !== 'finalized') return false;

      const transferStatus = resolveTransferStatus(record);
      if (transferStatusFilter !== 'all' && transferStatus !== transferStatusFilter) return false;

      if (transferSupplierFilter !== 'all' && String(record.supplierId || '') !== String(transferSupplierFilter)) return false;

      if (transferLocationFilter !== 'all') {
        const recordLocation = String(record.locationCode || '').toUpperCase();
        if (recordLocation !== String(transferLocationFilter || '').toUpperCase()) return false;
      }

      const purchaseDateKey = dateInputValue(record.purchaseDate);
      if (transferStartDate && purchaseDateKey && purchaseDateKey < transferStartDate) return false;
      if (transferEndDate && purchaseDateKey && purchaseDateKey > transferEndDate) return false;

      return true;
    });
  }, [records, transferEndDate, transferLocationFilter, transferStartDate, transferStatusFilter, transferSupplierFilter]);

  const queuedTransfersCount = useMemo(
    () => records.filter((record) => resolveTransferStatus(record) === 'queued').length,
    [records]
  );

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
        event.preventDefault();
        // Route Escape through the same safe close flow as the modal close button.
        handleCloseWorkspace();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCloseWorkspace, isIntakeWorkspaceOpen]);

  const setLineValue = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };

  const addLine = () => {
    if (!(canCreate || canEdit)) return;
    setForm((prev) => ({ ...prev, items: [...prev.items, createEmptyLine()] }));
  };

  const duplicateLine = (index) => {
    if (!(canCreate || canEdit)) return;
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
    if (!(canCreate || canEdit)) return;
    setForm((prev) => {
      if (prev.items.length <= 1) return { ...prev, items: [createEmptyLine()] };
      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const clearForm = () => {
    setLookupWarning('');
    setForm(buildNewForm(selectedLocation));
  };

  const openWorkspace = ({ reset = false } = {}) => {
    if (!canViewForm) return;
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
    const isEditingExisting = Boolean(form.id);
    if ((isEditingExisting && !canEdit) || (!isEditingExisting && !canCreate)) {
      await boAlert({
        title: 'Access denied',
        message: 'You do not have permission to perform this action.',
        type: 'warning',
      });
      return;
    }

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
    if (!(canEdit && canViewForm)) return;
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
    if (!canDelete) return;
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
    if (!canExport) return;
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

  const handleTransferToPOS = async (recordId) => {
    if (!canEdit) return;
    const confirmed = await boConfirm({
      title: 'Transfer to POS Pending Stock?',
      message: 'This will create a pending stock-add request in the Blantyre POS system. The final approval must still happen inside the POS software. Proceed?',
    });
    if (!confirmed) return;
    setTransferring(true);
    try {
      const response = await api.post(`/business-operations/goods-intake/${recordId}/transfer-to-pos`);
      const result = response.data;
      await boAlert({
        title: 'Queued for POS Transfer',
        message: `Transfer queued successfully.\nGRN: ${result.grnNo}\nLines: ${result.linesQueued ?? result.linesInserted}\n\nThe Blantyre POS agent will pick this up within seconds and write it to pending stock. The POS operator must then approve it inside the POS software before stock is live.`,
        type: 'success',
      });
      // Reload the record to reflect new posTransferStatus / posTransferGrn
      await handleEditRecord(recordId);
    } catch (error) {
      const msg = error.response?.data?.error || 'Failed to transfer to POS.';
      await boAlert({ title: 'Transfer Failed', message: msg, type: 'error' });
    } finally {
      setTransferring(false);
    }
  };

  async function handleCloseWorkspace() {
    if (saving || transferring) return;
    const confirmed = await boConfirm({
      title: 'Close Intake Workspace?',
      message: 'Any unsaved line edits will be lost. Do you want to close this workspace now?',
      confirmText: 'Close',
      cancelText: 'Continue Editing',
      type: 'warning',
    });
    if (!confirmed) return;
    setIsIntakeWorkspaceOpen(false);
    setIsIntakeWorkspaceMaximized(false);
  }

  const openTransferDetail = async (recordId) => {
    try {
      const response = await api.get(`/business-operations/goods-intake/${recordId}`);
      const data = response.data?.data;
      if (!data) return;
      setTransferDetailRecord(data);
      setIsTransferDetailOpen(true);
    } catch (error) {
      await boAlert({
        title: 'Details Unavailable',
        message: error.response?.data?.error || 'Failed to load transfer details.',
        type: 'error',
      });
    }
  };

  const jumpToSection = (ref) => {
    if (!ref?.current) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleLookup = async (index) => {
    const line = form.items[index];
    const query = String(line?.barcode || line?.productName || '').trim();
    if (!query) return;
    if (!activeLookupLocationCode) {
      setLookupWarning('Select the branch / location before scanning or typing a barcode so goods intake can match the correct product.');
      return;
    }

    setActiveLookupRow(index);
    setLookupWarning('');
    try {
      const response = await api.get('/business-operations/goods-intake/lookup-products', {
        params: {
          q: query,
          locationCode: activeLookupLocationCode,
        },
      });
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

  const renderTransferBadge = (record, { compact = false } = {}) => {
    const key = resolveTransferStatus(record);
    const meta = TRANSFER_STATUS_META[key] || TRANSFER_STATUS_META.not_transferred;
    const label = compact ? meta.short : meta.label;
    const grn = record?.posTransferGrn ? ` (${record.posTransferGrn})` : '';

    return (
      <span
        style={{
          border: `1px solid ${meta.tone.border}`,
          background: meta.tone.bg,
          color: meta.tone.color,
          borderRadius: compact ? '7px' : '999px',
          padding: compact ? '0.28rem 0.55rem' : '0.3rem 0.65rem',
          fontWeight: 700,
          fontSize: compact ? '0.78rem' : '0.74rem',
          whiteSpace: 'nowrap',
        }}
        title={record?.posTransferGrn ? `GRN: ${record.posTransferGrn}` : meta.label}
      >
        {label}{compact && (key === 'queued' || key === 'transferred' || key === 'approved') ? grn : ''}
      </span>
    );
  };

  const workspaceContent = (
    <section ref={workspaceRef} style={{ ...cardStyle, padding: '1rem', width: '100%', minWidth: 0, boxShadow: 'none', border: 'none', background: 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: colors.text }}>Stock Intake Workflow</h2>
            <div style={{ fontSize: '0.86rem', color: colors.mutedText, marginTop: '0.2rem' }}>
              Record stock intake, finalize, export, and transfer to POS pending stock from one workspace.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canCreate && (
              <button type="button" onClick={() => clearForm()} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                New Record
              </button>
            )}
            {form.id && canExport && (
              <button type="button" onClick={() => handleExportRecord(form.id)} style={{ border: isAdminDarkTheme ? '1px solid #2f7f58' : '1px solid #bbf7d0', background: isAdminDarkTheme ? '#153828' : '#f0fdf4', color: isAdminDarkTheme ? '#91e0b4' : '#166534', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                Export PDF
              </button>
            )}
            {((form.id && canEdit) || (!form.id && canCreate)) && (
              <button type="button" onClick={() => saveRecord('draft')} disabled={saving} style={{ border: isAdminDarkTheme ? '1px solid #365f98' : '1px solid #dbeafe', background: isAdminDarkTheme ? '#18273f' : '#eff6ff', color: isAdminDarkTheme ? '#b9d7ff' : '#1d4ed8', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {((form.id && canEdit) || (!form.id && canCreate)) && (
              <button type="button" onClick={() => saveRecord('finalized')} disabled={saving} style={{ border: 'none', background: '#0f766e', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Finalize Intake'}
              </button>
            )}
            {form.id && canEdit && form.status === 'finalized' && String(form.locationCode || '').trim().toUpperCase() === 'BT' && (
              <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {renderTransferBadge(form)}
                {(resolveTransferStatus(form) === 'not_transferred' || resolveTransferStatus(form) === 'failed') && (
                  <button type="button" onClick={() => handleTransferToPOS(form.id)} disabled={transferring || saving}
                    style={{ border: '1px solid #fb923c', background: '#fff7ed', color: '#c2410c', borderRadius: '8px', padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                    {transferring ? 'Queuing for POS…' : resolveTransferStatus(form) === 'failed' ? '↻ Retry Transfer' : '→ Transfer to POS'}
                  </button>
                )}
              </div>
            )}
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
          {(canCreate || canEdit) && <button type="button" onClick={addLine} style={{ border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: '8px', padding: '0.35rem 0.7rem', fontWeight: 600, cursor: 'pointer' }}>Add Row</button>}
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Checks:</span>
          <span style={{ fontSize: '0.78rem', color: missingBarcodeCount ? '#b45309' : '#64748b' }}>Missing barcode: {missingBarcodeCount}</span>
          <span style={{ fontSize: '0.78rem', color: missingExpiryCount ? '#b45309' : '#64748b' }}>Missing expiry: {missingExpiryCount}</span>
        </div>

        {lookupWarning && (
          <div style={{ marginTop: '0.75rem', border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412', borderRadius: '10px', padding: '0.7rem 0.85rem', fontSize: '0.84rem', fontWeight: 600 }}>
            {lookupWarning}
          </div>
        )}

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
                      {(canCreate || canEdit) && (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button type="button" onClick={() => duplicateLine(index)} style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: '8px', padding: '0.3rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Dup</button>
                          <button type="button" onClick={() => removeLine(index)} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.3rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Del</button>
                        </div>
                      )}
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
      {canViewForm && (
        <section style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: colors.strongText }}>Stock Intake & POS Transfer</h2>
              <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: colors.mutedText }}>
                Use launcher actions to record intake, finalize, export, queue POS transfer, and review sync history.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem' }}>
                Finalized: {finalizedRecordsCount}
              </span>
              <span style={{ border: '1px solid #fde68a', background: '#fefce8', color: '#92400e', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem' }}>
                Queued POS: {queuedTransfersCount}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: '0.9rem' }}>
            <button
              type="button"
              onClick={() => openWorkspace({ reset: true })}
              style={{ textAlign: 'left', border: '1px solid #bfdbfe', background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 65%)', borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#1d4ed8', fontWeight: 800 }}>Launcher</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>Start New Stock Intake</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: '#475569' }}>Open a clean intake workflow modal with fresh line entries.</div>
            </button>

            <button
              type="button"
              onClick={() => openWorkspace()}
              style={{ textAlign: 'left', border: '1px solid #d8b4fe', background: 'linear-gradient(135deg, #f8f5ff 0%, #ffffff 65%)', borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#7c3aed', fontWeight: 800 }}>Launcher</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>Continue Current Intake</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: '#475569' }}>Resume the current draft/finalized intake and manage transfer actions.</div>
            </button>

            <button
              type="button"
              onClick={() => jumpToSection(intakeHistorySectionRef)}
              style={{ textAlign: 'left', border: '1px solid #bbf7d0', background: 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 65%)', borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#166534', fontWeight: 800 }}>History</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>Finalized Intake Records</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: '#475569' }}>Review finalized entries, export files, and open transfer details.</div>
            </button>

            <button
              type="button"
              onClick={() => jumpToSection(transferHistorySectionRef)}
              style={{ textAlign: 'left', border: '1px solid #fed7aa', background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)', borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: '#c2410c', fontWeight: 800 }}>Sync</div>
              <div style={{ marginTop: '0.35rem', fontSize: '1.05rem', color: '#0f172a', fontWeight: 800 }}>POS Transfer History</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: '#475569' }}>Track queue status, processing results, and transfer failures.</div>
            </button>
          </div>
        </section>
      )}

      {canViewHistory && (
        <section ref={intakeHistorySectionRef} style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: colors.text }}>Intake Records</h3>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <input placeholder="Search ref/supplier/product" value={search} onFocus={selectInputText} onChange={(event) => setSearch(event.target.value)} style={{ ...themedInputStyle, width: '220px' }} />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ ...themedInputStyle, width: '130px' }}>
                <option value="all">All Intake</option>
                <option value="draft">Draft</option>
                <option value="finalized">Finalized</option>
              </select>
              <input type="date" value={startDate} onFocus={selectInputText} onChange={(event) => setStartDate(event.target.value)} style={{ ...themedInputStyle, width: '140px' }} />
              <input type="date" value={endDate} onFocus={selectInputText} onChange={(event) => setEndDate(event.target.value)} style={{ ...themedInputStyle, width: '140px' }} />
            </div>
          </div>

          {listError && <div style={{ marginTop: '0.8rem', fontSize: '0.86rem', color: '#b91c1c' }}>{listError}</div>}

          <div style={{ marginTop: '0.8rem', flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1180px' }}>
              <thead>
                <tr>
                  {['Ref', 'Date', 'Supplier', 'Location', 'Intake Status', 'POS Transfer', 'Items', 'Total Cost', 'Actions'].map((label) => (
                    <th key={label} style={{ textAlign: 'left', padding: '0.55rem 0.45rem', fontSize: '0.76rem', color: colors.mutedText, borderBottom: `1px solid ${isAdminDarkTheme ? '#334155' : '#e2e8f0'}` }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr><td colSpan={9} style={{ padding: '1rem', color: colors.mutedText }}>Loading records...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: '1rem', color: colors.mutedText }}>No records found for current filters.</td></tr>
                ) : records.map((record) => (
                  <tr key={record.id}>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{record.intakeRef}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{dateInputValue(record.purchaseDate)}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.supplier?.name || record.manualSupplierName || '-'}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.locationName || record.locationCode || '-'}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                      <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, color: record.status === 'finalized' ? '#166534' : '#1d4ed8', backgroundColor: record.status === 'finalized' ? '#ecfdf3' : '#eff6ff', border: `1px solid ${record.status === 'finalized' ? '#bbf7d0' : '#bfdbfe'}` }}>
                        {String(record.status || 'draft').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>{renderTransferBadge(record)}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.totalItems || record._count?.items || 0}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{money(record.totalCost)}</td>
                    <td style={{ padding: '0.6rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {canEdit && canViewForm && <button type="button" onClick={() => handleEditRecord(record.id)} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Open</button>}
                        {canExport && <button type="button" onClick={() => handleExportRecord(record.id)} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>PDF</button>}
                        {canDelete && <button type="button" onClick={() => handleDeleteRecord(record)} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>}
                        {canViewHistory && <button type="button" onClick={() => openTransferDetail(record.id)} style={{ border: '1px solid #e9d5ff', background: '#faf5ff', color: '#6b21a8', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Details</button>}
                        {canEdit && record.status === 'finalized' && String(record.locationCode || '').trim().toUpperCase() === 'BT' && (resolveTransferStatus(record) === 'not_transferred' || resolveTransferStatus(record) === 'failed') && (
                          <button type="button" onClick={() => handleTransferToPOS(record.id)} disabled={transferring} style={{ border: '1px solid #fb923c', background: '#fff7ed', color: '#c2410c', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>
                            {resolveTransferStatus(record) === 'failed' ? 'Retry POS' : '→ POS'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div style={{ marginTop: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.8rem', color: colors.mutedText }}>Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={pagination.page <= 1} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '7px', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', padding: '0.3rem 0.65rem', cursor: 'pointer' }}>Prev</button>
                <button type="button" onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))} disabled={pagination.page >= pagination.totalPages} style={{ border: isAdminDarkTheme ? '1px solid #334155' : '1px solid #cbd5e1', borderRadius: '7px', background: isAdminDarkTheme ? '#0f172a' : '#fff', color: isAdminDarkTheme ? '#e2e8f0' : '#0f172a', padding: '0.3rem 0.65rem', cursor: 'pointer' }}>Next</button>
              </div>
            </div>
          )}
        </section>
      )}

      {canViewHistory && (
        <section ref={transferHistorySectionRef} style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, color: colors.text }}>POS Transfer History</h3>
            <div style={{ fontSize: '0.8rem', color: colors.mutedText }}>
              Showing {transferHistoryRecords.length} finalized intake records on this page
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.55rem', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <select value={transferStatusFilter} onChange={(event) => setTransferStatusFilter(event.target.value)} style={themedInputStyle}>
              <option value="all">All Transfer Status</option>
              <option value="not_transferred">Not Transferred</option>
              <option value="queued">Queued</option>
              <option value="transferred">Transferred</option>
              <option value="failed">Failed</option>
              <option value="approved">Approved in POS</option>
            </select>
            <select value={transferSupplierFilter} onChange={(event) => setTransferSupplierFilter(event.target.value)} style={themedInputStyle}>
              <option value="all">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={String(supplier.id)}>{supplier.name}</option>
              ))}
            </select>
            <select value={transferLocationFilter} onChange={(event) => setTransferLocationFilter(event.target.value)} style={themedInputStyle}>
              <option value="all">All Locations</option>
              {locations.map((location) => (
                <option key={location.id} value={String(location.code || normalizeLocationCode(location)).toUpperCase()}>{location.name}</option>
              ))}
            </select>
            <input type="date" value={transferStartDate} onFocus={selectInputText} onChange={(event) => setTransferStartDate(event.target.value)} style={themedInputStyle} />
            <input type="date" value={transferEndDate} onFocus={selectInputText} onChange={(event) => setTransferEndDate(event.target.value)} style={themedInputStyle} />
          </div>

          <div style={{ marginTop: '0.8rem', width: '100%', maxWidth: '100%', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1280px' }}>
              <thead>
                <tr>
                  {['Ref', 'GRN', 'Supplier', 'Location', 'Intake Date', 'Items', 'Total Cost', 'Transfer Status', 'Queued Time', 'Completed Time', 'Agent Message', 'Actions'].map((label) => (
                    <th key={label} style={{ textAlign: 'left', padding: '0.55rem 0.45rem', fontSize: '0.76rem', color: colors.mutedText, borderBottom: `1px solid ${isAdminDarkTheme ? '#334155' : '#e2e8f0'}` }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listLoading ? (
                  <tr><td colSpan={12} style={{ padding: '1rem', color: colors.mutedText }}>Loading transfer history...</td></tr>
                ) : transferHistoryRecords.length === 0 ? (
                  <tr><td colSpan={12} style={{ padding: '1rem', color: colors.mutedText }}>No transfer history matches current filters.</td></tr>
                ) : transferHistoryRecords.map((record) => {
                  const transferCommand = record.posTransferCommand || {};
                  const responseSummary = transferCommand?.resultSummary?.message || transferCommand?.errorMessage || '-';
                  return (
                    <tr key={`transfer-${record.id}`}>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{record.intakeRef}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.posTransferGrn || '-'}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.supplier?.name || record.manualSupplierName || '-'}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.locationName || record.locationCode || '-'}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{dateInputValue(record.purchaseDate)}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{record.totalItems || record._count?.items || 0}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{money(record.totalCost)}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>{renderTransferBadge(record)}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{formatDateTime(record.posTransferAt || transferCommand.createdAt)}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{formatDateTime(transferCommand.processedAt)}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: String(responseSummary).toLowerCase().includes('fail') ? '#b91c1c' : colors.text, maxWidth: '260px' }}>{String(responseSummary).slice(0, 120)}</td>
                      <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => openTransferDetail(record.id)} style={{ border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', borderRadius: '7px', padding: '0.25rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>View</button>
                          {canExport && <button type="button" onClick={() => handleExportRecord(record.id)} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '7px', padding: '0.25rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>PDF</button>}
                          {canEdit && resolveTransferStatus(record) === 'failed' && (
                            <button type="button" onClick={() => handleTransferToPOS(record.id)} disabled={transferring} style={{ border: '1px solid #fb923c', background: '#fff7ed', color: '#c2410c', borderRadius: '7px', padding: '0.25rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>Retry</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!canViewForm && !canViewHistory && (
        <section style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0 }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.4rem', color: colors.strongText }}>No Permitted Sections</h3>
          <p style={{ margin: 0, color: colors.mutedText }}>
            You do not currently have access to Stock Intake & POS Transfer form or history sections.
          </p>
        </section>
      )}

      {isIntakeWorkspaceOpen && canViewForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isIntakeWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isIntakeWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1480px, 98vw)', height: isIntakeWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isIntakeWorkspaceMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Stock Intake Workflow Modal</div>
                <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#111827' }}>Supplier: {selectedSupplierName}</div>
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
                  onClick={handleCloseWorkspace}
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

      {isTransferDetailOpen && transferDetailRecord && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 175, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(1320px, 98vw)', height: '90vh', overflow: 'hidden', borderRadius: '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Transfer Detail</div>
                <div style={{ fontSize: '1.12rem', fontWeight: 800, color: '#111827' }}>
                  {transferDetailRecord.intakeRef} {transferDetailRecord.posTransferGrn ? `• ${transferDetailRecord.posTransferGrn}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {renderTransferBadge(transferDetailRecord)}
                {canExport && <button type="button" onClick={() => handleExportRecord(transferDetailRecord.id)} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Export PDF</button>}
                {canEdit && resolveTransferStatus(transferDetailRecord) === 'failed' && (
                  <button type="button" onClick={() => handleTransferToPOS(transferDetailRecord.id)} disabled={transferring} style={{ border: '1px solid #fb923c', background: '#fff7ed', color: '#c2410c', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Retry Transfer</button>
                )}
                <button type="button" onClick={() => setIsTransferDetailOpen(false)} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Close</button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem' }}>
              <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem' }}><strong>Supplier:</strong> {transferDetailRecord.supplier?.name || transferDetailRecord.manualSupplierName || '-'}</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem' }}><strong>Location:</strong> {transferDetailRecord.locationName || transferDetailRecord.locationCode || '-'}</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem' }}><strong>Intake Date:</strong> {dateInputValue(transferDetailRecord.purchaseDate)}</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem' }}><strong>Queued:</strong> {formatDateTime(transferDetailRecord.posTransferAt || transferDetailRecord.posTransferCommand?.createdAt)}</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem' }}><strong>Completed:</strong> {formatDateTime(transferDetailRecord.posTransferCommand?.processedAt)}</div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem' }}><strong>Command ID:</strong> {transferDetailRecord.posTransferCommand?.id || '-'}</div>
              </div>

              <div style={{ marginTop: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.7rem', background: '#f8fafc' }}>
                <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 700 }}>POS Agent Response</div>
                <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: '#475569' }}>
                  {transferDetailRecord.posTransferCommand?.resultSummary?.message
                    || transferDetailRecord.posTransferCommand?.errorMessage
                    || 'No response captured yet.'}
                </div>
              </div>

              <div style={{ marginTop: '0.85rem', width: '100%', maxWidth: '100%', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '980px' }}>
                  <thead>
                    <tr>
                      {['Product Code', 'Product Name', 'Quantity', 'Unit Cost', 'Total Cost', 'Expiry Date'].map((label) => (
                        <th key={label} style={{ textAlign: 'left', padding: '0.55rem 0.45rem', fontSize: '0.75rem', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(transferDetailRecord.items || []).map((line, index) => (
                      <tr key={`detail-line-${line.id || index}`}>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{line.barcode || '-'}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{line.productName || '-'}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{Number(line.quantity || 0).toLocaleString('en-US')}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{money(line.unitCost || 0)}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#111827' }}>{money(line.totalCost || (Number(line.quantity || 0) * Number(line.unitCost || 0)))}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{dateInputValue(line.expiryDate) || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoodsIntakeTab;
