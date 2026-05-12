import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';
import { exportStockIntakeOnlyRecordPdf, exportStockIntakeTransferRecordPdf } from '../../../utils/businessOperationsPdfExports.js';

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
const GOODS_INTAKE_AUTOSAVE_STORAGE_KEY = 'goods-intake-autosaves:v1';
const GOODS_INTAKE_AUTOSAVE_MAX_ITEMS = 30;
const GOODS_INTAKE_STOCK_REFRESH_INTERVAL_MS = 12000;

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

function normalizeTransferGrnInput(value) {
  return String(value || '').trim().toUpperCase();
}

function buildGrnDatePartFromInput(value) {
  const normalizedDate = value || localDateKey(new Date());
  const date = new Date(normalizedDate);
  if (Number.isNaN(date.getTime())) return 'YYYYMDD';
  return `${date.getFullYear()}${date.getMonth() + 1}${date.getDate()}`;
}

function resolveRequestedTransferGrn(record) {
  return normalizeTransferGrnInput(record?.posTransferCommand?.requestedGrn || '');
}

function resolveFinalTransferGrn(record) {
  return normalizeTransferGrnInput(
    record?.posTransferCommand?.finalGrn
    || record?.posTransferGrn
    || record?.posTransferCommand?.resultSummary?.grnNo
    || ''
  );
}

function resolveDisplayedTransferGrn(record) {
  return resolveFinalTransferGrn(record) || resolveRequestedTransferGrn(record) || '';
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
    latestSyncedStock: null,
    stockStatus: '',
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

// Returns true if the given locationCode belongs to Blantyre
function isBlantyreLocationCode(code) {
  return String(code || '').trim().toUpperCase() === 'BT';
}

// Returns true if the given locationCode belongs to Zomba (any sub-location)
function isZombaLocationCode(code) {
  var c = String(code || '').trim().toUpperCase();
  return c === 'ZA' || c === 'SH' || c === 'BAR' || c === 'ST999';
}

// Returns true if POS transfer is supported for this location
function isPosTransferSupported(code) {
  return isBlantyreLocationCode(code) || isZombaLocationCode(code);
}

// Human-readable POS agent name for the location
function posAgentLabel(code, branchCode) {
  const normalizedBranch = String(branchCode || '').trim().toUpperCase();
  if (normalizedBranch === 'BLANTYRE') return 'Blantyre POS Agent';
  if (normalizedBranch === 'ZOMBA') {
    const c = String(code || '').trim().toUpperCase();
    if (c === 'ZA' || c === 'SH') return 'Zomba POS Agent (SH)';
    if (c === 'BAR') return 'Zomba POS Agent (BAR)';
    if (c === 'ST999') return 'Zomba POS Agent (Restaurant/ST999)';
    return 'Zomba POS Agent';
  }

  var c = String(code || '').trim().toUpperCase();
  if (isBlantyreLocationCode(code)) return 'Blantyre POS Agent';
  if (c === 'ZA') return 'Zomba POS Agent (SH)';
  if (c === 'SH') return 'POS Agent (SH)';
  if (c === 'BAR') return 'Zomba POS Agent (BAR)';
  if (c === 'ST999') return 'Zomba POS Agent (Restaurant/ST999)';
  return 'POS Agent';
}

function branchCodeForLocationCode(code) {
  var c = String(code || '').trim().toUpperCase();
  if (!c) return null;
  if (c === 'BT') return 'BLANTYRE';
  if (c === 'ZA' || c === 'BAR' || c === 'ST999') return 'ZOMBA';
  return null;
}

function normalizeLocationCode(location) {
  const name = String(location?.name || '').trim().toLowerCase();
  if (name === 'blantyre') return 'BT';
  if (name === 'zomba') return 'ZA';
  return location?.code ? String(location.code).trim().toUpperCase() : '';
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase() || null;
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

function buildNewForm(selectedLocation, branchCode) {
  return {
    id: null,
    intakeRef: '',
    supplierId: '',
    manualSupplierName: '',
    supplierStoreRef: '',
    purchaseDate: localDateKey(new Date()),
    receiptReference: '',
    locationId: selectedLocation ? String(selectedLocation.id) : '',
    branchCode: branchCode || '',
    locationCode: selectedLocation?.code || normalizeLocationCode(selectedLocation),
    locationName: selectedLocation?.name || '',
    overallNotes: '',
    receiptTotalAmount: '',
    status: 'draft',
    items: [createEmptyLine()],
    posTransferStatus: null,
    posTransferGrn: null,
    transferGrnMode: 'auto',
    transferManualGrn: '',
  };
}

function createGoodsIntakeAutosaveId() {
  return `gi-auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readGoodsIntakeAutosaves() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GOODS_INTAKE_AUTOSAVE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object') : [];
  } catch (_error) {
    return [];
  }
}

function writeGoodsIntakeAutosaves(entries) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GOODS_INTAKE_AUTOSAVE_STORAGE_KEY, JSON.stringify(entries));
  } catch (_error) {
    // Keep intake workflow uninterrupted if storage quota fails.
  }
}

function hasGoodsIntakeAutosaveContent(form) {
  const hasMetadata = [
    form?.supplierId,
    form?.manualSupplierName,
    form?.supplierStoreRef,
    form?.receiptReference,
    form?.overallNotes,
    form?.receiptTotalAmount,
  ].some((value) => String(value || '').trim().length > 0);

  const hasLineContent = Array.isArray(form?.items) && form.items.some((line) => {
    if (!line || typeof line !== 'object') return false;
    if (String(line.barcode || '').trim()) return true;
    if (String(line.productName || '').trim()) return true;
    if (String(line.batchRef || '').trim()) return true;
    if (String(line.lineNotes || '').trim()) return true;
    if (String(line.expiryDate || '').trim()) return true;
    if (line.quantity != null && Number(line.quantity || 0) !== 1) return true;
    if (String(line.unitCost ?? '').trim()) return true;
    if (String(line.sellingPrice ?? '').trim()) return true;
    return false;
  });

  return hasMetadata || hasLineContent;
}

function sanitizeGoodsIntakeAutosaveForm(form) {
  return {
    id: null,
    intakeRef: '',
    supplierId: form?.supplierId || '',
    manualSupplierName: form?.manualSupplierName || '',
    supplierStoreRef: form?.supplierStoreRef || '',
    purchaseDate: form?.purchaseDate || localDateKey(new Date()),
    receiptReference: form?.receiptReference || '',
    locationId: form?.locationId || '',
    branchCode: form?.branchCode || '',
    locationCode: form?.locationCode || '',
    locationName: form?.locationName || '',
    overallNotes: form?.overallNotes || '',
    receiptTotalAmount: form?.receiptTotalAmount ?? '',
    status: 'draft',
    items: Array.isArray(form?.items) && form.items.length
      ? form.items.map((item) => ({
          barcode: item?.barcode || '',
          productId: item?.productId || null,
          productName: item?.productName || '',
          quantity: item?.quantity ?? 1,
          unitCost: item?.unitCost ?? '',
          sellingPrice: item?.sellingPrice ?? '',
          expiryDate: item?.expiryDate || '',
          batchRef: item?.batchRef || '',
          lineNotes: item?.lineNotes || '',
          latestSyncedStock: null,
          stockStatus: '',
        }))
      : [createEmptyLine()],
    posTransferStatus: null,
    posTransferGrn: null,
    transferGrnMode: form?.transferGrnMode === 'manual' ? 'manual' : 'auto',
    transferManualGrn: form?.transferManualGrn || '',
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
    branchCode: form.branchCode || null,
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
  const requestedGrn = resolveRequestedTransferGrn(record);
  return {
    id: record.id,
    intakeRef: record.intakeRef || '',
    supplierId: record.supplierId ? String(record.supplierId) : '',
    manualSupplierName: record.manualSupplierName || '',
    supplierStoreRef: record.supplierStoreRef || '',
    purchaseDate: dateInputValue(record.purchaseDate),
    receiptReference: record.receiptReference || '',
    locationId: record.locationId ? String(record.locationId) : '',
    branchCode: record.branchCode || '',
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
          latestSyncedStock: null,
          stockStatus: '',
        }))
      : [createEmptyLine()],
    posTransferStatus: record.posTransferStatus || null,
    posTransferGrn: record.posTransferGrn || null,
    transferGrnMode: record?.posTransferCommand?.manualGrnOverride ? 'manual' : 'auto',
    transferManualGrn: requestedGrn,
  };
}

function buildScopedParams(params, branchCode, locationCode, locationId) {
  const scoped = { ...params };
  if (branchCode) scoped.branchCode = branchCode;
  if (locationCode) scoped.locationCode = locationCode;
  if (locationId) scoped.locationId = locationId;
  return scoped;
}

const GoodsIntakeTab = ({ selectedLocationId = null, selectedBranchCode = '', selectedLocationCode = '', permissions = {} }) => {
  const workspaceRef = useRef(null);
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');
  const canViewForm = permissions.canViewForm !== false;
  const canViewHistory = permissions.canViewHistory !== false;
  const canCreate = permissions.canCreate !== false;
  const canEdit = permissions.canEdit !== false;
  const canDelete = permissions.canDelete !== false;
  const canExport = permissions.canExport !== false;

  const themedCardStyle = useMemo(() => ({
    ...cardStyle,
    backgroundColor: isAdminDarkTheme ? '#1e1e1e' : '#fff',
    border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0',
    boxShadow: isAdminDarkTheme ? '0 12px 28px rgba(0, 0, 0, 0.45)' : cardStyle.boxShadow,
  }), [isAdminDarkTheme]);

  const themedInputStyle = useMemo(() => ({
    ...tableInputStyle,
    border: isAdminDarkTheme ? '1px solid #333333' : tableInputStyle.border,
    backgroundColor: isAdminDarkTheme ? '#1a1a1a' : '#fff',
    color: isAdminDarkTheme ? '#e5e7eb' : '#0f172a',
  }), [isAdminDarkTheme]);

  const colors = useMemo(() => ({
    text: isAdminDarkTheme ? '#f3f4f6' : '#111827',
    strongText: isAdminDarkTheme ? '#e5e7eb' : '#1f2937',
    mutedText: isAdminDarkTheme ? '#a1a1aa' : '#64748b',
    subtleText: isAdminDarkTheme ? '#71717a' : '#64748b',
    tableBorder: isAdminDarkTheme ? '#2d2d2d' : '#f1f5f9',
    launchCardOneBorder: isAdminDarkTheme ? '#3a3a3a' : '#d8b4fe',
    launchCardOneBg: isAdminDarkTheme ? 'linear-gradient(135deg, #232323 0%, #1c1c1c 65%)' : 'linear-gradient(135deg, #f8f5ff 0%, #ffffff 60%)',
    launchCardTwoBorder: isAdminDarkTheme ? '#3f3f3f' : '#bfdbfe',
    launchCardTwoBg: isAdminDarkTheme ? 'linear-gradient(135deg, #242424 0%, #1c1c1c 65%)' : 'linear-gradient(135deg, #eff6ff 0%, #ffffff 60%)',
    launchCardThreeBorder: isAdminDarkTheme ? '#404040' : '#fcd34d',
    launchCardThreeBg: isAdminDarkTheme ? 'linear-gradient(135deg, #252525 0%, #1c1c1c 65%)' : 'linear-gradient(135deg, #fffbeb 0%, #ffffff 60%)',
    launchCardFourBorder: isAdminDarkTheme ? '#383838' : '#bbf7d0',
    launchCardFourBg: isAdminDarkTheme ? 'linear-gradient(135deg, #222222 0%, #1c1c1c 65%)' : 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 60%)',
    launchCardFiveBorder: isAdminDarkTheme ? '#424242' : '#fed7aa',
    launchCardFiveBg: isAdminDarkTheme ? 'linear-gradient(135deg, #262626 0%, #1c1c1c 65%)' : 'linear-gradient(135deg, #fff7ed 0%, #ffffff 60%)',
    launchCardSixBorder: isAdminDarkTheme ? '#3a3a3a' : '#bfdbfe',
    launchCardSixBg: isAdminDarkTheme ? 'linear-gradient(135deg, #232323 0%, #1c1c1c 65%)' : 'linear-gradient(135deg, #e0f2fe 0%, #ffffff 60%)',
  }), [isAdminDarkTheme]);

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  const responsiveSettings = useMemo(() => {
    const isSmallScreen = windowWidth < 1024; // Below laptop size
    const isCompactScreen = windowWidth < 768; // Below tablet size

    return {
      isSmallScreen,
      isCompactScreen,
      // Column visibility based on screen size
      showBarcode: !isCompactScreen,
      showMargin: !isSmallScreen,
      showEstimatedProfit: !isSmallScreen,
      showComments: !isSmallScreen,
      showExpiryDate: !isCompactScreen,
      // Font and padding adjustments
      tableFontSize: isCompactScreen ? '0.75rem' : isSmallScreen ? '0.8rem' : '0.86rem',
      tablePadding: isCompactScreen ? '0.3rem 0.35rem' : isSmallScreen ? '0.35rem 0.4rem' : '0.45rem 0.5rem',
      headerFontSize: isCompactScreen ? '0.65rem' : isSmallScreen ? '0.7rem' : '0.72rem',
      // Column widths adjustments
      colWidths: isCompactScreen ? {
        index: '2%',
        barcode: '12%',
        productName: '28%',
        quantity: '6%',
        unitCost: '8%',
        totalCost: '9%',
        sellingPrice: '9%',
        margin: '5%', // hidden but kept for consistency
        estimatedProfit: '8%', // hidden but kept
        expiryDate: '7%', // hidden but kept
        comments: '6%', // hidden but kept
        actions: '5%'
      } : isSmallScreen ? {
        index: '3%',
        barcode: '14%',
        productName: '26%',
        quantity: '5%',
        unitCost: '7%',
        totalCost: '8%',
        sellingPrice: '8%',
        margin: '5%', // hidden but kept
        estimatedProfit: '8%', // hidden but kept
        expiryDate: '8%', // hidden but kept
        comments: '5%', // hidden but kept
        actions: '4%'
      } : {
        index: '3%',
        barcode: '15%',
        productName: '24%',
        quantity: '5%',
        unitCost: '7%',
        totalCost: '8%',
        sellingPrice: '8%',
        margin: '5%',
        estimatedProfit: '8%',
        expiryDate: '8%',
        comments: '5%',
        actions: '4%'
      }
    };
  }, [windowWidth]);

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

  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);

  const scopeParams = useMemo(() => ({
    branchCode: effectiveBranchCode || undefined,
    locationCode: effectiveLocationCode || undefined,
    locationId: selectedLocationId || undefined,
  }), [effectiveBranchCode, effectiveLocationCode, selectedLocationId]);

  const scopeLabel = useMemo(() => {
    if (effectiveBranchCode && effectiveLocationCode) {
      return `${effectiveBranchCode} / ${effectiveLocationCode}`;
    }
    if (effectiveLocationCode) {
      return effectiveLocationCode;
    }
    return 'All Locations';
  }, [effectiveBranchCode, effectiveLocationCode]);

  const [form, setForm] = useState(() => buildNewForm({ code: effectiveLocationCode, name: '' }, effectiveBranchCode));
  const [activeAutosaveId, setActiveAutosaveId] = useState(() => createGoodsIntakeAutosaveId());
  const [autosaveEntries, setAutosaveEntries] = useState(() => readGoodsIntakeAutosaves());
  const [liveLineStockByProductId, setLiveLineStockByProductId] = useState({});
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [activeLookupRow, setActiveLookupRow] = useState(-1);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const inputRefs = useRef({});
  const [lookupWarning, setLookupWarning] = useState('');
  const [isIntakeWorkspaceOpen, setIsIntakeWorkspaceOpen] = useState(false);
  const [isIntakeWorkspaceMaximized, setIsIntakeWorkspaceMaximized] = useState(false);
  const [isAutosaveRecoveryOpen, setIsAutosaveRecoveryOpen] = useState(false);
  const [isFinalizedHistoryOpen, setIsFinalizedHistoryOpen] = useState(false);
  const [isFinalizedHistoryMaximized, setIsFinalizedHistoryMaximized] = useState(false);
  const [isTransferHistoryOpen, setIsTransferHistoryOpen] = useState(false);
  const [isTransferHistoryMaximized, setIsTransferHistoryMaximized] = useState(false);
  const [isPriceSyncHistoryOpen, setIsPriceSyncHistoryOpen] = useState(false);
  const [isPriceSyncHistoryMaximized, setIsPriceSyncHistoryMaximized] = useState(false);
  const [isPriceSyncDetailOpen, setIsPriceSyncDetailOpen] = useState(false);
  const [isTransferDetailOpen, setIsTransferDetailOpen] = useState(false);
  const [transferDetailRecord, setTransferDetailRecord] = useState(null);
  const [lastFinalizePriceSync, setLastFinalizePriceSync] = useState(null);
  const [activePriceSyncRecord, setActivePriceSyncRecord] = useState(null);

  const [transferStatusFilter, setTransferStatusFilter] = useState('all');
  const [transferSupplierFilter, setTransferSupplierFilter] = useState('all');
  const [transferLocationFilter, setTransferLocationFilter] = useState('all');
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');
  const [priceSyncStatusFilter, setPriceSyncStatusFilter] = useState('all');

  // Product search picker state
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerRowIndex, setProductPickerRowIndex] = useState(-1);
  const [productPickerQuery, setProductPickerQuery] = useState('');
  const [productPickerResults, setProductPickerResults] = useState([]);
  const [productPickerLoading, setProductPickerLoading] = useState(false);
  const [productPickerError, setProductPickerError] = useState('');
  const [productPickerHighlightedIndex, setProductPickerHighlightedIndex] = useState(0);
  const [priceChangeProduct, setPriceChangeProduct] = useState(null);
  const [priceChangeValue, setPriceChangeValue] = useState('');
  const [priceChangeLoading, setPriceChangeLoading] = useState(false);
  const [priceChangeError, setPriceChangeError] = useState('');
  const [isPriceChangeModalOpen, setIsPriceChangeModalOpen] = useState(false);
  const productPickerInputRef = useRef(null);
  const priceChangeInputRef = useRef(null);
  const productPickerTimeoutRef = useRef(null);

  // Product replacement confirmation modal state
  const [productReplacementModalOpen, setProductReplacementModalOpen] = useState(false);
  const [pendingProductToApply, setPendingProductToApply] = useState(null);
  const [pendingRowIndex, setPendingRowIndex] = useState(-1);
  const [currentProductName, setCurrentProductName] = useState('');
  const [replacementModalFocusedButton, setReplacementModalFocusedButton] = useState(0); // 0=Replace, 1=AddNew, 2=Cancel
  const replacementModalRef = useRef(null);
  const replacementModalButtonRefs = useRef([null, null, null]);
  const workspaceScrollRef = useRef(null);
  const previousWorkspaceRowsCountRef = useRef(form.items.length);

  const setLineInputRef = useCallback((rowIndex, fieldName, element) => {
    inputRefs.current[rowIndex] = inputRefs.current[rowIndex] || {};
    if (element) {
      inputRefs.current[rowIndex][fieldName] = element;
    } else if (inputRefs.current[rowIndex]) {
      delete inputRefs.current[rowIndex][fieldName];
      if (Object.keys(inputRefs.current[rowIndex]).length === 0) {
        delete inputRefs.current[rowIndex];
      }
    }
  }, []);

  const focusField = useCallback((rowIndex, fieldName) => {
    const target = inputRefs.current?.[rowIndex]?.[fieldName];
    if (!target) return false;
    if (typeof target.focus === 'function') {
      target.focus();
    }
    if (typeof target.select === 'function' && target.tagName !== 'SELECT') {
      target.select();
    }
    setActiveRowIndex(rowIndex);
    return true;
  }, []);

  const activeLookupLocationCode = useMemo(() => {
    const formLocationCode = String(form.locationCode || '').trim().toUpperCase();
    if (formLocationCode) return formLocationCode;
    return effectiveLocationCode;
  }, [form.locationCode, effectiveLocationCode]);

  useEffect(() => {
    if (form.id) return;
    setForm((prev) => ({
      ...prev,
      locationId: selectedLocationId ? String(selectedLocationId) : '',
      branchCode: effectiveBranchCode,
      locationCode: effectiveLocationCode,
      locationName: '',
    }));
  }, [form.id, effectiveBranchCode, effectiveLocationCode, selectedLocationId]);

  useEffect(() => {
    if (activeLookupLocationCode) {
      setLookupWarning('');
    }
  }, [activeLookupLocationCode]);

  const selectedLocation = useMemo(() => ({
    code: effectiveLocationCode,
    name: '',
  }), [effectiveLocationCode]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const existing = readGoodsIntakeAutosaves();
    const withoutCurrent = existing.filter((entry) => String(entry.id || '') !== String(activeAutosaveId || ''));

    if (form.id || !hasGoodsIntakeAutosaveContent(form)) {
      writeGoodsIntakeAutosaves(withoutCurrent);
      setAutosaveEntries(withoutCurrent);
      return;
    }

    const supplier = suppliers.find((entry) => String(entry.id) === String(form.supplierId || ''));
    const supplierName = supplier?.name || String(form.manualSupplierName || '').trim() || 'Unassigned Supplier';
    const lineCount = Array.isArray(form.items)
      ? form.items.filter((item) => String(item?.productName || item?.barcode || '').trim()).length
      : 0;
    const payload = {
      id: activeAutosaveId,
      savedAt: new Date().toISOString(),
      supplierName,
      lineCount,
      branchCode: form.branchCode || effectiveBranchCode || '',
      locationCode: form.locationCode || normalizeLocationCode(selectedLocation) || '',
      locationName: form.locationName || selectedLocation?.name || '',
      purchaseDate: form.purchaseDate || '',
      form: sanitizeGoodsIntakeAutosaveForm(form),
    };

    const next = [payload, ...withoutCurrent]
      .sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime())
      .slice(0, GOODS_INTAKE_AUTOSAVE_MAX_ITEMS);

    writeGoodsIntakeAutosaves(next);
    setAutosaveEntries(next);
  }, [activeAutosaveId, form, selectedLocation, suppliers]);

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

  const isLineEntryDisabled = !activeLookupLocationCode;

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

  const priceSyncHistoryRecords = useMemo(() => {
    return records.filter((record) => {
      if (String(record.status || '').toLowerCase() !== 'finalized') return false;
      const attempted = Number(record?.priceSyncSummary?.attempted || 0);
      return attempted > 0;
    });
  }, [records]);

  const filteredPriceSyncHistoryRecords = useMemo(() => {
    if (priceSyncStatusFilter === 'all') return priceSyncHistoryRecords;

    return priceSyncHistoryRecords.filter((record) => {
      const summary = record?.priceSyncSummary || {};
      const queued = Number(summary.queued || 0) + Number(summary.processing || 0);
      const completed = Number(summary.completed || 0);
      const failed = Number(summary.failed || 0);

      if (priceSyncStatusFilter === 'failed') return failed > 0;
      if (priceSyncStatusFilter === 'queued') return queued > 0;
      if (priceSyncStatusFilter === 'completed') return completed > 0 && failed === 0 && queued === 0;
      if (priceSyncStatusFilter === 'mixed') return failed > 0 && (completed > 0 || queued > 0);
      return true;
    });
  }, [priceSyncHistoryRecords, priceSyncStatusFilter]);

  const priceSyncRecordsCount = useMemo(
    () => priceSyncHistoryRecords.length,
    [priceSyncHistoryRecords]
  );

  const resolvedLineProductIds = useMemo(() => Array.from(new Set(
    (form.items || [])
      .map((item) => Number(item?.productId))
      .filter((value) => Number.isFinite(value) && value > 0)
  )), [form.items]);

  const autosaveCount = useMemo(() => autosaveEntries.length, [autosaveEntries]);

  const fetchRecords = useCallback(async () => {
    setListLoading(true);
    setListError('');

    try {
      const response = await api.get('/business-operations/goods-intake', {
        params: buildScopedParams({
          page,
          pageSize: 15,
          sortBy: 'purchaseDate',
          sortOrder: 'desc',
          search: search || undefined,
          status: statusFilter !== DEFAULT_STATUS_FILTER ? statusFilter : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }, effectiveBranchCode, effectiveLocationCode, selectedLocationId),
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
  }, [effectiveBranchCode, effectiveLocationCode, endDate, page, search, selectedLocationId, startDate, statusFilter]);

  const fetchSuppliers = useCallback(async () => {
    setSupplierLoading(true);
    try {
      const response = await api.get('/business-operations/suppliers', {
        params: buildScopedParams({
          page: 1,
          pageSize: 200,
          sortBy: 'name',
          sortOrder: 'asc',
          status: 'active',
        }, effectiveBranchCode, effectiveLocationCode, selectedLocationId),
      });
      setSuppliers(response.data?.data || []);
    } catch (_error) {
      setSuppliers([]);
    } finally {
      setSupplierLoading(false);
    }
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, startDate, endDate, effectiveBranchCode, effectiveLocationCode, selectedLocationId]);

  const setLineValue = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const nextItem = { ...item, [key]: value };
        if (key === 'barcode' || key === 'productName') {
          nextItem.productId = null;
          nextItem.latestSyncedStock = null;
          nextItem.stockStatus = '';
        }
        return nextItem;
      }),
    }));
  };

  const addLine = () => {
    if (!(canCreate || canEdit)) return;
    const nextRowIndex = form.items.length;
    setForm((prev) => ({ ...prev, items: [...prev.items, createEmptyLine()] }));
    setActiveRowIndex(nextRowIndex);
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

  const removeAutosaveEntry = useCallback((autosaveId) => {
    const next = readGoodsIntakeAutosaves().filter((entry) => String(entry.id || '') !== String(autosaveId || ''));
    writeGoodsIntakeAutosaves(next);
    setAutosaveEntries(next);
  }, []);

  const openAutosaveRecoveryModal = () => {
    if (!canViewForm) return;
    setAutosaveEntries(readGoodsIntakeAutosaves());
    setIsAutosaveRecoveryOpen(true);
  };

  const clearAllAutosaveEntries = async () => {
    if (autosaveEntries.length === 0) return;
    const confirmed = await boConfirm({
      title: 'Clear All Auto-Saved Sessions?',
      message: 'This will permanently remove all unsaved intake autosave sessions from this browser.',
      confirmText: 'Clear All',
      cancelText: 'Cancel',
      type: 'warning',
    });
    if (!confirmed) return;
    writeGoodsIntakeAutosaves([]);
    setAutosaveEntries([]);
  };

  const restoreAutosaveEntry = (entry) => {
    if (!entry?.form || typeof entry.form !== 'object') return;
    const restoredItems = Array.isArray(entry.form.items) && entry.form.items.length
      ? entry.form.items
      : [createEmptyLine()];

    setForm({
      ...buildNewForm(selectedLocation, effectiveBranchCode),
      ...entry.form,
      id: null,
      intakeRef: '',
      status: 'draft',
      items: restoredItems,
    });
    setLookupWarning('');
    setLiveLineStockByProductId({});
    setActiveAutosaveId(String(entry.id || createGoodsIntakeAutosaveId()));
    setIsAutosaveRecoveryOpen(false);
    setIsIntakeWorkspaceMaximized(false);
    setActiveRowIndex(0);
    setIsIntakeWorkspaceOpen(true);
  };

  const clearForm = () => {
    setLookupWarning('');
    setLiveLineStockByProductId({});
    setLastFinalizePriceSync(null);
    setActivePriceSyncRecord(null);
    setActiveAutosaveId(createGoodsIntakeAutosaveId());
    setForm(buildNewForm(selectedLocation, effectiveBranchCode));
  };

  const openWorkspace = ({ reset = false } = {}) => {
    if (!canViewForm) return;
    closeWorkspaceOverlayModals();
    if (reset) {
      setLiveLineStockByProductId({});
      setLastFinalizePriceSync(null);
      setActivePriceSyncRecord(null);
      setActiveAutosaveId(createGoodsIntakeAutosaveId());
      setForm(buildNewForm(selectedLocation, effectiveBranchCode));
    }
    setActiveRowIndex(0);
    setIsIntakeWorkspaceMaximized(false);
    setIsIntakeWorkspaceOpen(true);
  };

  useEffect(() => {
    if (!isIntakeWorkspaceOpen) return;
    const rowCount = Array.isArray(form.items) ? form.items.length : 0;
    if (rowCount === 0) return;
    if (!Number.isFinite(activeRowIndex) || activeRowIndex < 0 || activeRowIndex >= rowCount) {
      setActiveRowIndex(0);
    }
  }, [isIntakeWorkspaceOpen, form.items, activeRowIndex]);

  const openFinalizedHistoryModal = () => {
    if (!canViewHistory) return;
    setIsFinalizedHistoryMaximized(false);
    setIsFinalizedHistoryOpen(true);
  };

  const openTransferHistoryModal = () => {
    if (!canViewHistory) return;
    setIsTransferHistoryMaximized(false);
    setIsTransferHistoryOpen(true);
  };

  const openPriceSyncHistoryModal = () => {
    if (!canViewHistory) return;
    setIsPriceSyncHistoryMaximized(false);
    setPriceSyncStatusFilter('all');
    setIsPriceSyncHistoryOpen(true);
  };

  const openPriceSyncDetail = (record) => {
    if (!record) return;
    setActivePriceSyncRecord(record);
    setIsPriceSyncDetailOpen(true);
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
      payload.locationName = '';
      payload.locationCode = effectiveLocationCode;
    }

    setSaving(true);
    try {
      const response = form.id
        ? await api.put(`/business-operations/goods-intake/${form.id}`, payload)
        : await api.post('/business-operations/goods-intake', payload);

      const saved = response.data?.data;
      const priceSync = response.data?.priceSync || null;
      if (saved) {
        setForm(toFormFromRecord(saved));
        setActivePriceSyncRecord(saved);
        if (!isEditingExisting) {
          removeAutosaveEntry(activeAutosaveId);
        }
        setActiveAutosaveId(createGoodsIntakeAutosaveId());
      }

      if (status === 'finalized' && priceSync) {
        const attempted = Number(priceSync.attempted || 0);
        setLastFinalizePriceSync(attempted > 0 ? {
          attempted,
          updated: Number(priceSync.updated || 0),
          queued: Number(priceSync.queued || 0),
          failed: Number(priceSync.failed || 0),
          capturedAt: new Date().toISOString(),
        } : null);
      } else if (status !== 'finalized') {
        setLastFinalizePriceSync(null);
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
    closeWorkspaceOverlayModals();
    try {
      const response = await api.get(`/business-operations/goods-intake/${recordId}`);
      const data = response.data?.data;
      if (!data) return;
      setLiveLineStockByProductId({});
      setActiveAutosaveId(createGoodsIntakeAutosaveId());
      setForm(toFormFromRecord(data));
      setActivePriceSyncRecord(data);
      setLastFinalizePriceSync(null);
      setActiveRowIndex(0);
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

  const handleExportRecord = async (recordId, exportType = 'full') => {
    if (!canExport) return;
    try {
      const response = await api.get(`/business-operations/goods-intake/${recordId}`);
      const data = response.data?.data;
      if (!data) return;
      if (exportType === 'intake-only') {
        exportStockIntakeOnlyRecordPdf({
          record: data,
          companyName: 'Citi-Nati Supermarket',
        });
      } else {
        exportStockIntakeTransferRecordPdf({
          record: data,
          companyName: 'Citi-Nati Supermarket',
        });
      }
    } catch (error) {
      await boAlert({ title: 'Export Failed', message: error.response?.data?.error || 'Failed to export PDF.', type: 'error' });
    }
  };

  const handleTransferToPOS = async (recordId) => {
    if (!canEdit) return;
    const isCurrentFormRecord = Number(form.id) === Number(recordId);
    const matchedRecord = !isCurrentFormRecord
      ? records.find((record) => Number(record.id) === Number(recordId))
      : null;
    const recordLocationCode = String(
      isCurrentFormRecord ? (form.locationCode || '') : (matchedRecord?.locationCode || '')
    ).trim().toUpperCase();
    const manualGrn = normalizeTransferGrnInput(isCurrentFormRecord ? form.transferManualGrn : '');
    const manualGrnOverride = isCurrentFormRecord && form.transferGrnMode === 'manual';
    const recordBranchCode = String(
      (isCurrentFormRecord ? form.branchCode : matchedRecord?.branchCode) || effectiveBranchCode || ''
    ).trim().toUpperCase() || branchCodeForLocationCode(recordLocationCode);
    const agentLabel = posAgentLabel(recordLocationCode, recordBranchCode);
    const transferSupplierId = isCurrentFormRecord
      ? Number(form.supplierId || 0)
      : Number(matchedRecord?.supplierId || 0);

    if (transferSupplierId > 0 && recordBranchCode) {
      const selectedSupplier = suppliers.find((entry) => Number(entry.id) === transferSupplierId);
      const posLinks = Array.isArray(selectedSupplier?.posLinks) ? selectedSupplier.posLinks : [];

      const hasBranchLink = posLinks.some((link) =>
        String(link.branchCode || '').trim().toUpperCase() === recordBranchCode
        && Number(link.posSupplierCode || 0) > 0
      );

      // Only block when posLinks were actually loaded and clearly show no match.
      // If posLinks were not included in the supplier list response, let backend validate.
      if (posLinks.length > 0 && !hasBranchLink) {
        await boAlert({
          title: 'Supplier Not POS-Linked',
          message: 'This supplier is not linked to a POS SupplierCode for this branch. Sync or link supplier first.',
          type: 'warning',
        });
        return;
      }
    }

    if (manualGrnOverride && !manualGrn) {
      await boAlert({
        title: 'Manual GRN Required',
        message: 'Enter a manual GRN or switch back to auto-generated GRN before transferring.',
        type: 'warning',
      });
      return;
    }

    const confirmed = await boConfirm({
      title: 'Transfer to POS Pending Stock?',
      message: manualGrnOverride
        ? `This will queue a pending stock-add request via ${agentLabel} using manual GRN ${manualGrn}. The POS agent will validate that GRN before insert. Proceed?`
        : `This will queue a pending stock-add request via ${agentLabel}. The POS agent will safely auto-generate the next available GRN for the intake date before insert. Proceed?`,
    });
    if (!confirmed) return;
    setTransferring(true);
    try {
      const response = await api.post(`/business-operations/goods-intake/${recordId}/transfer-to-pos`, {
        manualGrnOverride,
        requestedGrn: manualGrnOverride ? manualGrn : null,
        branchCode: recordBranchCode || undefined,
        locationCode: recordLocationCode || undefined,
      });
      const result = response.data;
      await boAlert({
        title: 'Queued for POS Transfer',
        message: result.grnMode === 'manual'
          ? `Transfer queued successfully.\nRequested manual GRN: ${result.requestedGrn || manualGrn}\nLines: ${result.linesQueued != null ? result.linesQueued : result.linesInserted}\n\nThe ${agentLabel} will validate that GRN against POS before insert. If it already exists, the transfer history will show a precise duplicate warning.`
          : `Transfer queued successfully.\nGRN: auto-generated by POS agent\nLines: ${result.linesQueued != null ? result.linesQueued : result.linesInserted}\n\nThe ${agentLabel} will generate the next available GRN for the intake date, write the stock into pending POS tables, and report the final GRN back here once processed.`,
        type: 'success',
      });
      // Reload the record to reflect new transfer status and final GRN once the command metadata refreshes.
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
        params: buildScopedParams({
          q: query,
        }, effectiveBranchCode, activeLookupLocationCode, selectedLocationId),
      });
      const products = response.data?.products || [];
      if (!products.length) return;

      const exact = products.find((product) =>
        String(product.barcode || '').toLowerCase() === query.toLowerCase()
        || String(product.productCode || '').toLowerCase() === query.toLowerCase()
      );

      const chosen = exact || products[0];
      const lookupPriceCandidates = [
        chosen?.sellingPrice,
        chosen?.selling_price,
        chosen?.unitPrice,
        chosen?.unit_price,
        chosen?.price,
      ];
      const resolvedSellingPrice = lookupPriceCandidates.find((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
      const resolvedEffectiveStockRaw = chosen?.effectiveStock ?? chosen?.effective_stock ?? chosen?.posStock ?? chosen?.pos_stock ?? chosen?.stock;
      const resolvedEffectiveStock = Number.isFinite(Number(resolvedEffectiveStockRaw)) ? Number(resolvedEffectiveStockRaw) : null;
      setLiveLineStockByProductId((prev) => ({
        ...prev,
        [Number(chosen.id || 0)]: {
          latestSyncedStock: resolvedEffectiveStock,
          stockStatus: String(chosen?.stockStatus || chosen?.stock_status || ''),
        },
      }));
      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          return {
            ...item,
            productId: chosen.id || null,
            barcode: item.barcode || chosen.barcode || chosen.productCode || '',
            productName: chosen.name || item.productName,
            sellingPrice: resolvedSellingPrice ?? item.sellingPrice ?? '',
            latestSyncedStock: resolvedEffectiveStock,
            stockStatus: String(chosen?.stockStatus || chosen?.stock_status || ''),
          };
        }),
      }));
    } catch (_error) {
      // Keep entry flow uninterrupted if lookup fails.
    } finally {
      setActiveLookupRow(-1);
    }
  };

  // Product picker helpers
  const fetchProductPickerResults = useCallback(async (query) => {
    if (!query || !activeLookupLocationCode) {
      setProductPickerResults([]);
      setProductPickerError('');
      return;
    }

    setProductPickerLoading(true);
    setProductPickerError('');
    try {
      const response = await api.get('/business-operations/goods-intake/lookup-products', {
        params: buildScopedParams({
          q: query,
        }, effectiveBranchCode, activeLookupLocationCode, selectedLocationId),
      });
      const products = response.data?.products || [];
      console.log('[DEBUG] Product Search:', {
        branchCode: effectiveBranchCode,
        locationCode: activeLookupLocationCode,
        query,
        resultsCount: products.length,
        results: products.map(p => ({ code: p.sourceCode || p.productCode, name: p.name, price: p.price })),
      });
      setProductPickerResults(products);
      setProductPickerHighlightedIndex(0);
      if (products.length === 0) {
        setProductPickerError(`No products found for "${query}" in this branch/location.`);
      }
    } catch (error) {
      setProductPickerResults([]);
      setProductPickerError('Failed to search products. Please try again.');
      console.error('Product picker search error:', error);
    } finally {
      setProductPickerLoading(false);
    }
  }, [effectiveBranchCode, activeLookupLocationCode, selectedLocationId]);

  const openProductPicker = useCallback((rowIndex, initialQuery = '') => {
    const itemsLength = Array.isArray(form.items) ? form.items.length : 0;
    if (itemsLength === 0) return;
    const requestedIndex = Number.isFinite(Number(rowIndex)) ? Number(rowIndex) : 0;
    const normalizedRowIndex = requestedIndex >= 0 && requestedIndex < itemsLength ? requestedIndex : 0;
    setProductPickerOpen(true);
    setProductPickerRowIndex(normalizedRowIndex);
    setProductPickerQuery(initialQuery);
    setProductPickerResults([]);
    setProductPickerError('');
    setProductPickerHighlightedIndex(0);
    setActiveRowIndex(normalizedRowIndex);
    if (initialQuery) {
      fetchProductPickerResults(initialQuery);
    }

    setTimeout(() => {
      productPickerInputRef.current?.focus();
      productPickerInputRef.current?.select?.();
    }, 100);
  }, [form.items, fetchProductPickerResults]);

  const closeProductPicker = useCallback(() => {
    setProductPickerOpen(false);
    setProductPickerRowIndex(-1);
    setProductPickerQuery('');
    setProductPickerResults([]);
    setProductPickerError('');
    setProductPickerHighlightedIndex(0);
    setPriceChangeProduct(null);
    setPriceChangeValue('');
    setPriceChangeLoading(false);
    setPriceChangeError('');
    if (productPickerTimeoutRef.current) {
      clearTimeout(productPickerTimeoutRef.current);
    }
  }, []);

  const closeWorkspaceOverlayModals = useCallback(() => {
    closeProductPicker();
    setIsAutosaveRecoveryOpen(false);
    setIsFinalizedHistoryOpen(false);
    setIsTransferHistoryOpen(false);
    setIsPriceSyncHistoryOpen(false);
    setIsPriceSyncDetailOpen(false);
    setIsTransferDetailOpen(false);
    setProductReplacementModalOpen(false);
    setIsPriceChangeModalOpen(false);
  }, [closeProductPicker]);

  const applyProductToLine = useCallback((product, rowIndex) => {
    if (!product || rowIndex < 0) return;

    // Check if the current row already has a product
    const currentLine = form.items?.[rowIndex];
    const hasExistingProduct = currentLine && (currentLine.productId || currentLine.productName?.trim());

    if (hasExistingProduct) {
      // Show confirmation modal
      setPendingProductToApply(product);
      setPendingRowIndex(rowIndex);
      setCurrentProductName(currentLine.productName || 'Unknown Product');
      setProductReplacementModalOpen(true);
      closeProductPicker();
      return;
    }

    // If no existing product, apply directly
    applyProductDirectly(product, rowIndex);
  }, [form.items, closeProductPicker]);

  const applyProductDirectly = useCallback((product, rowIndex) => {
    if (!product || rowIndex < 0) return;

    const lookupPriceCandidates = [
      product?.sellingPrice,
      product?.selling_price,
      product?.unitPrice,
      product?.unit_price,
      product?.price,
    ];
    const resolvedSellingPrice = lookupPriceCandidates.find((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
    const resolvedEffectiveStockRaw = product?.effectiveStock ?? product?.effective_stock ?? product?.posStock ?? product?.pos_stock ?? product?.stock;
    const resolvedEffectiveStock = Number.isFinite(Number(resolvedEffectiveStockRaw)) ? Number(resolvedEffectiveStockRaw) : null;

    setLiveLineStockByProductId((prev) => ({
      ...prev,
      [Number(product.id || 0)]: {
        latestSyncedStock: resolvedEffectiveStock,
        stockStatus: String(product?.stockStatus || product?.stock_status || ''),
      },
    }));

    setForm((prev) => ({
      ...prev,
      items: (prev.items || []).map((item, itemIndex) => {
        if (itemIndex !== rowIndex) return item;
        return {
          ...item,
          productId: product.id || null,
          barcode: product.barcode || product.productCode || '',
          productName: product.name || item.productName,
          sellingPrice: resolvedSellingPrice ?? item.sellingPrice ?? '',
          latestSyncedStock: resolvedEffectiveStock,
          stockStatus: String(product?.stockStatus || product?.stock_status || ''),
        };
      }),
    }));

    closeProductPicker();
    setActiveRowIndex(rowIndex);
    setTimeout(() => {
      focusField(rowIndex, 'quantity');
    }, 0);
  }, [closeProductPicker, focusField]);

  const handleReplaceCurrentProduct = useCallback(() => {
    if (pendingProductToApply && pendingRowIndex >= 0) {
      applyProductDirectly(pendingProductToApply, pendingRowIndex);
    }
    setProductReplacementModalOpen(false);
    setPendingProductToApply(null);
    setPendingRowIndex(-1);
    setCurrentProductName('');
  }, [pendingProductToApply, pendingRowIndex, applyProductDirectly]);

  const handleAddToNewRow = useCallback(() => {
    if (!pendingProductToApply) return;

    // Add a new row if needed
    const currentItems = form.items || [];
    const newRowIndex = currentItems.length;

    // Add empty row
    setForm((prev) => ({
      ...prev,
      items: [...(prev.items || []), createEmptyLine()],
    }));

    // Apply product to the new row
    setTimeout(() => {
      applyProductDirectly(pendingProductToApply, newRowIndex);
    }, 0);

    setProductReplacementModalOpen(false);
    setPendingProductToApply(null);
    setPendingRowIndex(-1);
    setCurrentProductName('');
  }, [pendingProductToApply, form.items, applyProductDirectly]);

  const handleCancelProductReplacement = useCallback(() => {
    setProductReplacementModalOpen(false);
    setPendingProductToApply(null);
    setPendingRowIndex(-1);
    setCurrentProductName('');
    setReplacementModalFocusedButton(0);
  }, []);

  const handleProductPickerSearch = useCallback((query) => {
    setProductPickerQuery(query);
    if (productPickerTimeoutRef.current) {
      clearTimeout(productPickerTimeoutRef.current);
    }
    productPickerTimeoutRef.current = setTimeout(() => {
      fetchProductPickerResults(query);
    }, 300);
  }, [fetchProductPickerResults]);

  const handleOpenPriceChange = useCallback((product) => {
    if (!product || !product.id) return;
    closeProductPicker();
    setPriceChangeProduct(product);
    setPriceChangeError('');
    const currentPrice = product.sellingPrice ?? product.selling_price ?? product.unitPrice ?? product.unit_price ?? product.price ?? '';
    setPriceChangeValue(currentPrice == null ? '' : String(currentPrice));
    setIsPriceChangeModalOpen(true);
  }, [closeProductPicker]);

  const handleClosePriceChange = useCallback(() => {
    setPriceChangeProduct(null);
    setPriceChangeValue('');
    setPriceChangeLoading(false);
    setPriceChangeError('');
    setIsPriceChangeModalOpen(false);
  }, []);

  const handleConfirmPriceChange = useCallback(async () => {
    if (!priceChangeProduct || !priceChangeProduct.id) {
      setPriceChangeError('Cannot update price for this product.');
      return;
    }

    const parsedPrice = Number(priceChangeValue);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setPriceChangeError('Enter a valid non-negative price.');
      return;
    }

    try {
      setPriceChangeLoading(true);
      const response = await api.put(`/products/${priceChangeProduct.id}`, {
        price: parsedPrice,
        branchCode: effectiveBranchCode || undefined,
        locationCode: activeLookupLocationCode || undefined,
      });

      const updatedPrice = parsedPrice;
      setProductPickerResults((prevResults) => prevResults.map((item) => {
        if (Number(item.id) !== Number(priceChangeProduct.id)) return item;
        return {
          ...item,
          sellingPrice: updatedPrice,
          selling_price: updatedPrice,
          unitPrice: updatedPrice,
          unit_price: updatedPrice,
          price: updatedPrice,
        };
      }));

      await boAlert({
        title: 'Price Updated',
        message: `Updated ${priceChangeProduct.name || 'product'} price to ${money(updatedPrice)}.`, 
        type: 'success',
      });
      handleClosePriceChange();
    } catch (error) {
      console.error('Price change failed:', error);
      setPriceChangeError(error.response?.data?.error || 'Failed to update product price.');
    } finally {
      setPriceChangeLoading(false);
    }
  }, [activeLookupLocationCode, effectiveBranchCode, handleClosePriceChange, priceChangeProduct, priceChangeValue]);

  const handlePriceChangeKeyDown = useCallback((event) => {
    if (!isPriceChangeModalOpen) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      handleConfirmPriceChange();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClosePriceChange();
    }
  }, [isPriceChangeModalOpen, handleConfirmPriceChange, handleClosePriceChange]);

  useEffect(() => {
    if (isPriceChangeModalOpen) {
      document.addEventListener('keydown', handlePriceChangeKeyDown, true);
      return () => document.removeEventListener('keydown', handlePriceChangeKeyDown, true);
    }
    return undefined;
  }, [isPriceChangeModalOpen, handlePriceChangeKeyDown]);

  const handleProductPickerKeyDown = useCallback((event) => {
    if (!productPickerOpen || isPriceChangeModalOpen || productReplacementModalOpen) return;
    if (priceChangeProduct && priceChangeInputRef.current && priceChangeInputRef.current.contains(event.target)) {
      return;
    }

    if (event.key === 'Escape' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    if (event.key === 'Escape') {
      closeProductPicker();
      return;
    }

    if (event.key === 'ArrowDown') {
      setProductPickerHighlightedIndex((prevIndex) => {
        const nextIndex = Math.min(prevIndex + 1, productPickerResults.length - 1);
        requestAnimationFrame(() => {
          const resultRow = document.querySelector(`[data-product-result-index="${nextIndex}"]`);
          resultRow?.scrollIntoView({ block: 'nearest' });
        });
        return nextIndex;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      setProductPickerHighlightedIndex((prevIndex) => {
        const prev = Math.max(prevIndex - 1, 0);
        requestAnimationFrame(() => {
          const resultRow = document.querySelector(`[data-product-result-index="${prev}"]`);
          resultRow?.scrollIntoView({ block: 'nearest' });
        });
        return prev;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (productPickerResults.length > 0 && productPickerHighlightedIndex >= 0) {
        const product = productPickerResults[productPickerHighlightedIndex];
        applyProductToLine(product, productPickerRowIndex);
      }
      return;
    }
  }, [productPickerOpen, productPickerResults, productPickerHighlightedIndex, productPickerRowIndex, closeProductPicker, applyProductToLine]);

  useEffect(() => {
    if (productPickerOpen) {
      document.addEventListener('keydown', handleProductPickerKeyDown, true);
      return () => document.removeEventListener('keydown', handleProductPickerKeyDown, true);
    }
    return undefined;
  }, [productPickerOpen, handleProductPickerKeyDown]);

  const handleProductReplacementKeyDown = useCallback((event) => {
    if (!productReplacementModalOpen) return;

    if (['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    if (event.key === 'Enter') {
      if (replacementModalFocusedButton === 0) {
        handleReplaceCurrentProduct();
      } else if (replacementModalFocusedButton === 1) {
        handleAddToNewRow();
      } else if (replacementModalFocusedButton === 2) {
        handleCancelProductReplacement();
      }
    } else if (event.key === 'Tab') {
      if (event.shiftKey) {
        setReplacementModalFocusedButton((prev) => (prev - 1 + 3) % 3);
      } else {
        setReplacementModalFocusedButton((prev) => (prev + 1) % 3);
      }
    } else if (event.key === 'ArrowDown') {
      setReplacementModalFocusedButton((prev) => (prev + 1) % 3);
    } else if (event.key === 'ArrowUp') {
      setReplacementModalFocusedButton((prev) => (prev - 1 + 3) % 3);
    } else if (event.key === 'Escape') {
      handleCancelProductReplacement();
    }
  }, [productReplacementModalOpen, replacementModalFocusedButton, handleReplaceCurrentProduct, handleAddToNewRow, handleCancelProductReplacement]);

  useEffect(() => {
    if (productReplacementModalOpen) {
      setReplacementModalFocusedButton(0);
    }
  }, [productReplacementModalOpen]);

  useEffect(() => {
    if (productReplacementModalOpen) {
      document.addEventListener('keydown', handleProductReplacementKeyDown, true);
      return () => document.removeEventListener('keydown', handleProductReplacementKeyDown, true);
    }
    return undefined;
  }, [productReplacementModalOpen, handleProductReplacementKeyDown]);

  useEffect(() => {
    if (productReplacementModalOpen) {
      replacementModalButtonRefs.current[replacementModalFocusedButton]?.focus();
    }
  }, [productReplacementModalOpen, replacementModalFocusedButton]);

  useEffect(() => {
    if (workspaceScrollRef.current && isIntakeWorkspaceOpen) {
      if (form.items.length > previousWorkspaceRowsCountRef.current) {
        requestAnimationFrame(() => {
          const scrollContainer = workspaceScrollRef.current;
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });
      }
      previousWorkspaceRowsCountRef.current = form.items.length;
    } else {
      previousWorkspaceRowsCountRef.current = form.items.length;
    }
  }, [form.items.length, isIntakeWorkspaceOpen]);

  useEffect(() => {
    if (!isIntakeWorkspaceOpen) return;
    const handler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (productReplacementModalOpen) {
          handleCancelProductReplacement();
        } else if (productPickerOpen) {
          closeProductPicker();
        } else {
          handleCloseWorkspace();
        }
      } else if (event.key === 'F1') {
        event.preventDefault();
        event.stopPropagation();
        if (productPickerOpen) return;
        const itemsLength = Array.isArray(form.items) ? form.items.length : 0;
        if (itemsLength === 0) return;
        let rowIndex = Number(activeRowIndex);
        if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= itemsLength) {
          rowIndex = 0;
          setActiveRowIndex(0);
        }
        const row = form.items[rowIndex] || {};
        const query = String(row.barcode || row.productName || '').trim();
        openProductPicker(rowIndex, query);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCloseWorkspace, isIntakeWorkspaceOpen, productPickerOpen, closeProductPicker, openProductPicker]);

  useEffect(() => {
    if (isPriceChangeModalOpen && priceChangeInputRef.current) {
      setTimeout(() => {
        priceChangeInputRef.current?.focus();
        priceChangeInputRef.current?.select?.();
      }, 100);
    }
  }, [isPriceChangeModalOpen]);

  const refreshResolvedLineStock = useCallback(async () => {
    if (!isIntakeWorkspaceOpen || !activeLookupLocationCode || resolvedLineProductIds.length === 0) {
      return;
    }

    try {
      const response = await api.post('/business-operations/goods-intake/line-stock', {
        branchCode: effectiveBranchCode,
        locationCode: activeLookupLocationCode,
        locationId: selectedLocationId || undefined,
        productIds: resolvedLineProductIds,
      });

      const stockLines = Array.isArray(response.data?.lines) ? response.data.lines : [];
      setLiveLineStockByProductId((prev) => {
        let changed = false;
        const next = { ...prev };

        stockLines.forEach((entry) => {
          const productId = Number(entry.productId || entry.id);
          if (!Number.isFinite(productId) || productId <= 0) return;
          const nextStockRaw = entry.effectiveStock ?? entry.effective_stock ?? entry.stock ?? null;
          const nextStock = Number.isFinite(Number(nextStockRaw)) ? Number(nextStockRaw) : null;
          const nextStatus = String(entry.stockStatus || entry.stock_status || '');
          const current = prev[productId] || {};

          if (current.latestSyncedStock === nextStock && String(current.stockStatus || '') === nextStatus) {
            return;
          }

          changed = true;
          next[productId] = {
            latestSyncedStock: nextStock,
            stockStatus: nextStatus,
          };
        });

        return changed ? next : prev;
      });
    } catch (_error) {
      // Keep entry flow uninterrupted if background stock refresh fails.
    }
  }, [activeLookupLocationCode, isIntakeWorkspaceOpen, resolvedLineProductIds]);

  useEffect(() => {
    if (!isIntakeWorkspaceOpen || !activeLookupLocationCode || resolvedLineProductIds.length === 0) {
      return undefined;
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let disposed = false;

    const silentRefresh = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      void refreshResolvedLineStock();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        silentRefresh();
      }
    };

    silentRefresh();
    const intervalId = window.setInterval(silentRefresh, GOODS_INTAKE_STOCK_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', silentRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', silentRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeLookupLocationCode, isIntakeWorkspaceOpen, refreshResolvedLineStock, resolvedLineProductIds.length]);

  const handleEntryFieldEnter = useCallback((event, rowIndex, fieldName) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    setActiveRowIndex(rowIndex);

    if (fieldName === 'barcode') {
      handleLookup(rowIndex);
      focusField(rowIndex, 'productName');
      return;
    }

    const lineFields = ['barcode', 'productName', 'quantity', 'unitCost', 'sellingPrice', 'expiryDate', 'lineNotes'];
    const currentIndex = lineFields.indexOf(fieldName);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= 0 && nextIndex < lineFields.length) {
      const nextField = lineFields[nextIndex];
      if (focusField(rowIndex, nextField)) return;
    }

    if (fieldName === 'lineNotes') {
      const isLastRow = rowIndex === ((form.items?.length || 1) - 1);
      if (isLastRow) {
        const newRowIndex = form.items?.length || 0;
        addLine();
        setTimeout(() => {
          focusField(newRowIndex, 'barcode');
        }, 50);
      } else {
        focusField(rowIndex + 1, 'barcode');
      }
    }
  }, [handleLookup, focusField, form.items?.length, addLine]);

  const renderTransferBadge = (record, { compact = false } = {}) => {
    const key = resolveTransferStatus(record);
    const meta = TRANSFER_STATUS_META[key] || TRANSFER_STATUS_META.not_transferred;
    const label = compact ? meta.short : meta.label;
    const displayedGrn = resolveDisplayedTransferGrn(record);
    const grn = displayedGrn ? ` (${displayedGrn})` : '';

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
        title={displayedGrn ? `GRN: ${displayedGrn}` : meta.label}
      >
        {label}{compact && (key === 'queued' || key === 'transferred' || key === 'approved') ? grn : ''}
      </span>
    );
  };

  const renderPriceSyncStatusBadge = (summary, { compact = false } = {}) => {
    const attempted = Number(summary?.attempted || 0);
    const queued = Number(summary?.queued || 0);
    const processing = Number(summary?.processing || 0);
    const completed = Number(summary?.completed || 0);
    const failed = Number(summary?.failed || 0);

    let tone = { border: '#cbd5e1', bg: '#f8fafc', color: '#475569' };
    let label = 'No Price Sync';

    if (attempted > 0 && failed > 0) {
      tone = { border: '#fecaca', bg: '#fff1f2', color: '#b91c1c' };
      label = 'Price Sync Failed';
    } else if (attempted > 0 && (queued > 0 || processing > 0)) {
      tone = { border: '#fde68a', bg: '#fefce8', color: '#92400e' };
      label = 'Price Sync Queued';
    } else if (attempted > 0 && completed > 0) {
      tone = { border: '#bbf7d0', bg: '#f0fdf4', color: '#166534' };
      label = 'Price Synced';
    }

    return (
      <span
        style={{
          border: `1px solid ${tone.border}`,
          background: tone.bg,
          color: tone.color,
          borderRadius: compact ? '7px' : '999px',
          padding: compact ? '0.28rem 0.55rem' : '0.3rem 0.65rem',
          fontWeight: 700,
          fontSize: compact ? '0.78rem' : '0.74rem',
          whiteSpace: 'nowrap',
        }}
        title={`attempted ${attempted}, completed ${completed}, queued ${queued + processing}, failed ${failed}`}
      >
        {label}
      </span>
    );
  };

  const workspaceContent = (
    <section ref={workspaceRef} style={{ ...cardStyle, padding: '1rem', width: '100%', minWidth: 0, boxShadow: 'none', border: 'none', background: 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, color: colors.text, fontSize: '1.2rem', lineHeight: 1.15 }}>Stock Intake Workflow</h2>
            <div style={{ fontSize: '0.86rem', color: colors.mutedText, marginTop: '0.2rem' }}>
              Record stock intake, finalize, export, and transfer to POS pending stock from one workspace.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {canCreate && (
              <button type="button" onClick={() => clearForm()} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#e5e7eb' : '#0f172a', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                New Record
              </button>
            )}
            {form.id && canExport && (
              <>
                <button type="button" onClick={() => handleExportRecord(form.id, 'full')} style={{ border: isAdminDarkTheme ? '1px solid #2f7f58' : '1px solid #bbf7d0', background: isAdminDarkTheme ? '#1a2a1a' : '#f0fdf4', color: isAdminDarkTheme ? '#91e0b4' : '#166534', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                  Export Intake + Transfer Report
                </button>
                <button type="button" onClick={() => handleExportRecord(form.id, 'intake-only')} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#e5e7eb' : '#0f172a', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                  Export Intake Only
                </button>
              </>
            )}
            {((form.id && canEdit) || (!form.id && canCreate)) && (
              <button type="button" onClick={() => saveRecord('draft')} disabled={saving} style={{ border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #dbeafe', background: isAdminDarkTheme ? '#242424' : '#eff6ff', color: isAdminDarkTheme ? '#e4e4e7' : '#1d4ed8', borderRadius: '8px', padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
            )}
            {((form.id && canEdit) || (!form.id && canCreate)) && (
              <button type="button" onClick={() => saveRecord('finalized')} disabled={saving} style={{ border: 'none', background: '#0f766e', color: '#fff', borderRadius: '8px', padding: '0.45rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Saving...' : 'Finalize Intake'}
              </button>
            )}
            {form.id && canEdit && form.status === 'finalized' && isPosTransferSupported(form.locationCode) && (
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

        {form.id && canEdit && form.status === 'finalized' && isPosTransferSupported(form.locationCode) && (
          <div style={{ marginTop: '0.85rem', border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #dbeafe', background: isAdminDarkTheme ? '#222222' : '#f8fbff', borderRadius: '12px', padding: '0.8rem' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: isAdminDarkTheme ? '#e4e4e7' : '#1d4ed8' }}>GRN Handling</div>
            <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: colors.mutedText, lineHeight: 1.5 }}>
              Default mode is auto-generated GRN. The {posAgentLabel(form.locationCode)} checks both pending and approved POS stock tables for the intake date and picks the next safe GRN in format {`GRN_${buildGrnDatePartFromInput(form.purchaseDate)}-###`}.
            </div>
            <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.55rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}>
              <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.83rem', color: colors.text, fontWeight: 600 }}>
                <input
                  type="radio"
                  name="transferGrnMode"
                  checked={form.transferGrnMode !== 'manual'}
                  onChange={() => setForm((prev) => ({ ...prev, transferGrnMode: 'auto', transferManualGrn: '' }))}
                />
                Auto-generate safest GRN in POS
              </label>
              <label style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', fontSize: '0.83rem', color: colors.text, fontWeight: 600 }}>
                <input
                  type="radio"
                  name="transferGrnMode"
                  checked={form.transferGrnMode === 'manual'}
                  onChange={() => setForm((prev) => ({ ...prev, transferGrnMode: 'manual' }))}
                />
                Manual GRN override (advanced)
              </label>
              <div>
                <label style={{ display: 'block', fontSize: '0.76rem', color: colors.mutedText, marginBottom: '0.25rem' }}>Manual GRN</label>
                <input
                  value={form.transferManualGrn || ''}
                  disabled={form.transferGrnMode !== 'manual'}
                  onFocus={selectInputText}
                  onChange={(event) => setForm((prev) => ({ ...prev, transferManualGrn: normalizeTransferGrnInput(event.target.value) }))}
                  placeholder={`GRN_${buildGrnDatePartFromInput(form.purchaseDate)}-001`}
                  style={{
                    ...themedInputStyle,
                    backgroundColor: form.transferGrnMode === 'manual' ? themedInputStyle.backgroundColor : (isAdminDarkTheme ? '#181818' : '#f8fafc'),
                    color: form.transferGrnMode === 'manual' ? themedInputStyle.color : colors.subtleText,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {form.status === 'finalized' && lastFinalizePriceSync && (
          <div style={{ marginTop: '0.85rem', border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#242424' : '#eff6ff', borderRadius: '12px', padding: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isAdminDarkTheme ? '#e4e4e7' : '#1d4ed8' }}>Price Sync Status After Finalize</div>
              {renderPriceSyncStatusBadge({
                attempted: lastFinalizePriceSync.attempted,
                queued: lastFinalizePriceSync.queued,
                processing: 0,
                completed: Math.max(0, lastFinalizePriceSync.queued - lastFinalizePriceSync.failed),
                failed: lastFinalizePriceSync.failed,
              }, { compact: true })}
            </div>
            <div style={{ marginTop: '0.45rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #dbeafe', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: isAdminDarkTheme ? '#e4e4e7' : '#1e3a8a', borderRadius: '999px', padding: '0.18rem 0.5rem', fontSize: '0.74rem', fontWeight: 700 }}>
                Attempted: {lastFinalizePriceSync.attempted}
              </span>
              <span style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '999px', padding: '0.18rem 0.5rem', fontSize: '0.74rem', fontWeight: 700 }}>
                Updated local: {lastFinalizePriceSync.updated}
              </span>
              <span style={{ border: '1px solid #fde68a', background: '#fefce8', color: '#92400e', borderRadius: '999px', padding: '0.18rem 0.5rem', fontSize: '0.74rem', fontWeight: 700 }}>
                Queued to POS: {lastFinalizePriceSync.queued}
              </span>
              <span style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c', borderRadius: '999px', padding: '0.18rem 0.5rem', fontSize: '0.74rem', fontWeight: 700 }}>
                Failed queue: {lastFinalizePriceSync.failed}
              </span>
            </div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.76rem', color: colors.mutedText }}>
              Captured at {formatDateTime(lastFinalizePriceSync.capturedAt)}. Use Price Sync History for per-product command status and agent results.
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.8rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', width: '100%', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#64748b', marginBottom: '0.25rem' }}>Supplier (existing)</label>
            <select
              value={form.supplierId}
              onChange={(event) => setForm((prev) => ({ ...prev, supplierId: event.target.value }))}
              onKeyDown={handleEntryFieldEnter}
              style={{ ...themedInputStyle, backgroundColor: supplierLoading ? (isAdminDarkTheme ? '#181818' : '#f8fafc') : themedInputStyle.backgroundColor }}
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
            <input value={String(form.status || 'draft').toUpperCase()} disabled style={{ ...themedInputStyle, backgroundColor: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', color: isAdminDarkTheme ? '#d4d4d8' : '#334155' }} />
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
            <input
              value={`${effectiveBranchCode || ''} / ${effectiveLocationCode || ''}`.trim().replace(/^\/|\/$/g, '')}
              readOnly
              style={{ ...themedInputStyle, backgroundColor: isAdminDarkTheme ? '#2a2a2a' : '#f8f9fa', cursor: 'not-allowed' }}
            />
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

        {isLineEntryDisabled && (
          <div style={{ marginTop: '1rem', border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#242424' : '#eff6ff', color: isAdminDarkTheme ? '#e4e4e7' : '#1e3a8a', borderRadius: '10px', padding: '0.65rem 0.8rem', fontSize: '0.82rem', fontWeight: 600 }}>
            Select Branch / Location to enable line entry.
          </div>
        )}

        <fieldset disabled={isLineEntryDisabled} style={{ margin: 0, padding: 0, border: 'none', minInlineSize: 0, opacity: isLineEntryDisabled ? 0.56 : 1 }}>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {(canCreate || canEdit) && <button type="button" onClick={addLine} style={{ border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #93c5fd', background: isAdminDarkTheme ? '#242424' : '#eff6ff', color: isAdminDarkTheme ? '#e4e4e7' : '#1d4ed8', borderRadius: '8px', padding: '0.35rem 0.7rem', fontWeight: 600, cursor: isLineEntryDisabled ? 'not-allowed' : 'pointer' }}>Add Row</button>}
            <span style={{ fontSize: '0.8rem', color: colors.mutedText }}>Checks:</span>
            <span style={{ fontSize: '0.78rem', color: missingBarcodeCount ? '#b45309' : colors.mutedText }}>Missing barcode: {missingBarcodeCount}</span>
            <span style={{ fontSize: '0.78rem', color: missingExpiryCount ? '#b45309' : colors.mutedText }}>Missing expiry: {missingExpiryCount}</span>
          </div>

          {lookupWarning && (
            <div style={{ marginTop: '0.75rem', border: isAdminDarkTheme ? '1px solid #7f4a2f' : '1px solid #fdba74', background: isAdminDarkTheme ? '#26201a' : '#fff7ed', color: isAdminDarkTheme ? '#fdba74' : '#9a3412', borderRadius: '10px', padding: '0.7rem 0.85rem', fontSize: '0.84rem', fontWeight: 600 }}>
              {lookupWarning}
            </div>
          )}

          <div style={{ marginTop: '0.8rem', width: '100%', maxWidth: '100%', overflowX: 'auto', border: isAdminDarkTheme ? '1px solid #2d2d2d' : '1px solid #dbe5f0', borderRadius: '12px', background: isAdminDarkTheme ? '#181818' : '#ffffff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: responsiveSettings.colWidths.index }} />
              <col style={{ width: responsiveSettings.colWidths.barcode, display: responsiveSettings.showBarcode ? 'table-column' : 'none' }} />
              <col style={{ width: responsiveSettings.colWidths.productName }} />
              <col style={{ width: responsiveSettings.colWidths.quantity }} />
              <col style={{ width: responsiveSettings.colWidths.unitCost }} />
              <col style={{ width: responsiveSettings.colWidths.totalCost }} />
              <col style={{ width: responsiveSettings.colWidths.sellingPrice }} />
              <col style={{ width: responsiveSettings.colWidths.margin, display: responsiveSettings.showMargin ? 'table-column' : 'none' }} />
              <col style={{ width: responsiveSettings.colWidths.estimatedProfit, display: responsiveSettings.showEstimatedProfit ? 'table-column' : 'none' }} />
              <col style={{ width: responsiveSettings.colWidths.expiryDate, display: responsiveSettings.showExpiryDate ? 'table-column' : 'none' }} />
              <col style={{ width: responsiveSettings.colWidths.comments, display: responsiveSettings.showComments ? 'table-column' : 'none' }} />
              <col style={{ width: responsiveSettings.colWidths.actions }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>#</th>
                {responsiveSettings.showBarcode && <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Barcode</th>}
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Product Name</th>
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Qty</th>
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Unit Cost</th>
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Total Cost</th>
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Selling Price</th>
                {responsiveSettings.showMargin && <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Margin %</th>}
                {responsiveSettings.showEstimatedProfit && <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Est. Profit</th>}
                {responsiveSettings.showExpiryDate && <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Expiry Date</th>}
                {responsiveSettings.showComments && <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Comments</th>}
                <th style={{ textAlign: 'left', fontSize: responsiveSettings.headerFontSize, color: colors.mutedText, fontWeight: 700, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc', whiteSpace: 'nowrap' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {calculatedItems.map((line, index) => {
                const compactLineInputStyle = { ...themedInputStyle, padding: responsiveSettings.tablePadding, fontSize: responsiveSettings.tableFontSize };
                const rowMoney = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const belowCost = line.sellingPrice != null && Number(line.sellingPrice) < Number(line.unitCost || 0);
                const lineLiveStock = Number.isFinite(Number(line.productId)) ? liveLineStockByProductId[Number(line.productId)] : null;
                const displayStock = lineLiveStock?.latestSyncedStock ?? line.latestSyncedStock;
                const displayStockStatus = String(lineLiveStock?.stockStatus || line.stockStatus || '');
                const syncedStockTone = displayStockStatus === 'out_of_stock'
                  ? { color: '#b91c1c', bg: isAdminDarkTheme ? '#2d1a1a' : '#fff1f2', border: isAdminDarkTheme ? '#7f1d1d' : '#fecdd3', label: 'Out of stock' }
                  : displayStockStatus === 'low_stock'
                    ? { color: '#b45309', bg: isAdminDarkTheme ? '#242418' : '#fffbeb', border: isAdminDarkTheme ? '#7a5f2a' : '#fcd34d', label: 'Low stock' }
                    : { color: '#166534', bg: isAdminDarkTheme ? '#1a2a1a' : '#f0fdf4', border: isAdminDarkTheme ? '#2f7f58' : '#bbf7d0', label: 'In stock' };
                return (
                  <tr key={`line-${index}`} data-row-index={index}>
                    <td style={{ fontWeight: 700, color: colors.subtleText, fontSize: responsiveSettings.tableFontSize, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>{index + 1}</td>
                    {responsiveSettings.showBarcode && <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'flex-start' }}>
                        <input
                          name="barcode"
                          data-row-index={index}
                          ref={(element) => setLineInputRef(index, 'barcode', element)}
                          value={line.barcode || ''}
                          onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                          onKeyDown={(event) => handleEntryFieldEnter(event, index, 'barcode')}
                          onChange={(event) => setLineValue(index, 'barcode', event.target.value)}
                          onBlur={() => handleLookup(index)}
                          style={{ ...compactLineInputStyle, backgroundColor: line.productName && !line.barcode ? (isAdminDarkTheme ? '#26201a' : '#fff7ed') : compactLineInputStyle.backgroundColor, flex: 1 }}
                          placeholder="scan/manual"
                        />
                      </div>
                      <div style={{ marginTop: '0.18rem', fontSize: responsiveSettings.isCompactScreen ? '0.65rem' : '0.7rem', color: colors.mutedText, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{line.barcode || '-'}</div>
                    </td>}
                    <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <div style={{ position: 'relative' }}>
                        <input
                          name="productName"
                          data-row-index={index}
                          ref={(element) => setLineInputRef(index, 'productName', element)}
                          value={line.productName || ''}
                          onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                          onKeyDown={(event) => handleEntryFieldEnter(event, index, 'productName')}
                          onChange={(event) => setLineValue(index, 'productName', event.target.value)}
                          onBlur={() => { if (!line.productName) return; handleLookup(index); }}
                          style={{ ...compactLineInputStyle, paddingRight: '2.4rem' }}
                          placeholder="Product name"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => openProductPicker(index, line.productName || line.barcode || '')}
                          title="Search products (F1)"
                          style={{
                            position: 'absolute',
                            top: '50%',
                            right: '0.65rem',
                            transform: 'translateY(-50%)',
                            border: 'none',
                            background: 'transparent',
                            color: isAdminDarkTheme ? '#94a3b8' : '#475569',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <i className="fas fa-search" aria-hidden="true" />
                        </button>
                      </div>
                      <div style={{ marginTop: '0.18rem', fontSize: responsiveSettings.isCompactScreen ? '0.68rem' : '0.72rem', color: colors.text, lineHeight: 1.25, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{line.productName || '-'}</div>
                      <div style={{ marginTop: '0.28rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: responsiveSettings.isCompactScreen ? '0.64rem' : '0.68rem', color: colors.mutedText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Latest synced stock</span>
                        <span style={{ fontSize: responsiveSettings.isCompactScreen ? '0.7rem' : '0.74rem', fontWeight: 800, color: displayStock == null ? colors.mutedText : syncedStockTone.color }}>
                          {displayStock == null ? 'Resolve product to view' : Number(displayStock).toLocaleString('en-US')}
                        </span>
                        {displayStock != null && (
                          <span style={{ border: `1px solid ${syncedStockTone.border}`, background: syncedStockTone.bg, color: syncedStockTone.color, borderRadius: '999px', padding: '0.08rem 0.4rem', fontSize: responsiveSettings.isCompactScreen ? '0.62rem' : '0.66rem', fontWeight: 800 }}>
                            {syncedStockTone.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <input
                        ref={(element) => setLineInputRef(index, 'quantity', element)}
                        name="quantity"
                        data-row-index={index}
                        type="number"
                        min="0"
                        step="1"
                        value={line.quantity}
                        onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                        onKeyDown={(event) => handleEntryFieldEnter(event, index, 'quantity')}
                        onChange={(event) => setLineValue(index, 'quantity', event.target.value)}
                        style={compactLineInputStyle}
                      />
                    </td>
                    <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <input
                        ref={(element) => setLineInputRef(index, 'unitCost', element)}
                        name="unitCost"
                        data-row-index={index}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitCost}
                        onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                        onKeyDown={(event) => handleEntryFieldEnter(event, index, 'unitCost')}
                        onChange={(event) => setLineValue(index, 'unitCost', event.target.value)}
                        style={compactLineInputStyle}
                      />
                    </td>
                    <td style={{ color: colors.text, fontWeight: 700, fontSize: responsiveSettings.tableFontSize, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{rowMoney(line.totalCost)}</td>
                    <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <input
                        ref={(element) => setLineInputRef(index, 'sellingPrice', element)}
                        name="sellingPrice"
                        data-row-index={index}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.sellingPrice == null ? '' : line.sellingPrice}
                        onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                        onKeyDown={(event) => handleEntryFieldEnter(event, index, 'sellingPrice')}
                        onChange={(event) => setLineValue(index, 'sellingPrice', event.target.value)}
                        style={{ ...compactLineInputStyle, borderColor: belowCost ? '#f59e0b' : (isAdminDarkTheme ? '#333333' : '#cbd5e1'), backgroundColor: belowCost ? (isAdminDarkTheme ? '#242418' : '#fffbeb') : compactLineInputStyle.backgroundColor }}
                      />
                    </td>
                    {responsiveSettings.showMargin && <td style={{ fontWeight: 700, color: colors.subtleText, fontSize: responsiveSettings.tableFontSize, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{line.marginPercent == null ? '-' : `${line.marginPercent.toFixed(2)}%`}</td>}
                    {responsiveSettings.showEstimatedProfit && <td style={{ fontWeight: 700, color: line.estimatedProfit >= 0 ? '#166534' : '#b91c1c', fontSize: responsiveSettings.tableFontSize, padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{rowMoney(line.estimatedProfit)}</td>}
                    {responsiveSettings.showExpiryDate && <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <input
                        ref={(element) => setLineInputRef(index, 'expiryDate', element)}
                        name="expiryDate"
                        data-row-index={index}
                        type="date"
                        value={line.expiryDate || ''}
                        onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                        onKeyDown={(event) => handleEntryFieldEnter(event, index, 'expiryDate')}
                        onChange={(event) => setLineValue(index, 'expiryDate', event.target.value)}
                        style={{ ...compactLineInputStyle, backgroundColor: line.productName && !line.expiryDate ? (isAdminDarkTheme ? '#26201a' : '#fff7ed') : compactLineInputStyle.backgroundColor }}
                      />
                    </td>}
                    {responsiveSettings.showComments && <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      <input
                        ref={(element) => setLineInputRef(index, 'lineNotes', element)}
                        name="lineNotes"
                        data-row-index={index}
                        value={line.lineNotes || ''}
                        onFocus={(event) => { selectInputText(event); setActiveRowIndex(index); }}
                        onKeyDown={(event) => handleEntryFieldEnter(event, index, 'lineNotes')}
                        onChange={(event) => setLineValue(index, 'lineNotes', event.target.value)}
                        style={compactLineInputStyle}
                      />
                    </td>}
                    <td style={{ padding: responsiveSettings.tablePadding, borderBottom: `1px solid ${colors.tableBorder}`, verticalAlign: 'top' }}>
                      {(canCreate || canEdit) && (
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => duplicateLine(index)} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text, borderRadius: '7px', padding: responsiveSettings.isCompactScreen ? '0.2rem 0.35rem' : '0.25rem 0.45rem', fontWeight: 600, fontSize: responsiveSettings.isCompactScreen ? '0.7rem' : '0.76rem', cursor: 'pointer' }}>Dup</button>
                          <button type="button" onClick={() => removeLine(index)} style={{ border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', borderRadius: '7px', padding: responsiveSettings.isCompactScreen ? '0.2rem 0.35rem' : '0.25rem 0.45rem', fontWeight: 600, fontSize: responsiveSettings.isCompactScreen ? '0.7rem' : '0.76rem', cursor: 'pointer' }}>Del</button>
                        </div>
                      )}
                      {activeLookupRow === index && <div style={{ marginTop: '0.25rem', fontSize: responsiveSettings.isCompactScreen ? '0.68rem' : '0.72rem', color: '#2563eb' }}>Looking up...</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </fieldset>

        <div style={{ marginTop: '0.8rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem', width: '100%', minWidth: 0 }}>
          <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: isAdminDarkTheme ? '#1a1a1a' : '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: colors.mutedText, fontWeight: 700 }}>TOTAL LINES</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: colors.strongText }}>{totals.totalItems}</div>
          </div>
          <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: isAdminDarkTheme ? '#1a1a1a' : '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: colors.mutedText, fontWeight: 700 }}>TOTAL QUANTITY</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: colors.strongText }}>{totals.totalQuantity.toLocaleString('en-US')}</div>
          </div>
          <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: isAdminDarkTheme ? '#1a1a1a' : '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: colors.mutedText, fontWeight: 700 }}>TOTAL COST</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: colors.strongText }}>{money(totals.totalCost)}</div>
          </div>
          <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px', padding: '0.65rem', background: isAdminDarkTheme ? '#1a1a1a' : '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', color: colors.mutedText, fontWeight: 700 }}>EST. PROFIT</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: totals.totalEstimatedProfit >= 0 ? '#166534' : '#b91c1c' }}>{money(totals.totalEstimatedProfit)}</div>
          </div>
        </div>
      </section>
  );

  return (
    <div style={{ display: 'grid', gap: '1rem', width: '100%', minWidth: 0, fontSize: '0.92rem' }}>
      {canViewForm && (
        <section style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, color: colors.strongText, fontSize: '1.05rem', lineHeight: 1.2 }}>Stock Intake & POS Transfer</h2>
              <div style={{ marginTop: '0.25rem', fontSize: '0.84rem', color: colors.mutedText }}>
                Use launcher actions to record intake, finalize, export, queue POS transfer, and review sync history.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ border: isAdminDarkTheme ? '1px solid #3f3f3f' : '1px solid #dbeafe', background: isAdminDarkTheme ? '#242424' : '#eff6ff', color: isAdminDarkTheme ? '#e4e4e7' : '#1d4ed8', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem' }}>
                Finalized: {finalizedRecordsCount}
              </span>
              <span style={{ border: isAdminDarkTheme ? '1px solid #7a5f2a' : '1px solid #fde68a', background: isAdminDarkTheme ? '#242418' : '#fefce8', color: isAdminDarkTheme ? '#facc15' : '#92400e', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem' }}>
                Queued POS: {queuedTransfersCount}
              </span>
              <span style={{ border: isAdminDarkTheme ? '1px solid #3a3a3a' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#222222' : '#eff6ff', color: isAdminDarkTheme ? '#d4d4d8' : '#1e40af', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 700, padding: '0.22rem 0.55rem' }}>
                Price Sync Records: {priceSyncRecordsCount}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: '0.9rem' }}>
            <button
              type="button"
              onClick={() => openWorkspace({ reset: true })}
              style={{ textAlign: 'left', border: `1px solid ${colors.launchCardTwoBorder}`, background: colors.launchCardTwoBg, borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#d4d4d8' : '#1d4ed8', fontWeight: 800 }}>Launcher</div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.96rem', color: colors.strongText, fontWeight: 800 }}>Start New Stock Intake</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: colors.mutedText }}>Open a clean intake workflow modal with fresh line entries.</div>
            </button>

            <button
              type="button"
              onClick={() => openWorkspace()}
              style={{ textAlign: 'left', border: `1px solid ${colors.launchCardOneBorder}`, background: colors.launchCardOneBg, borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#d4d4d8' : '#7c3aed', fontWeight: 800 }}>Launcher</div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.96rem', color: colors.strongText, fontWeight: 800 }}>Continue Current Intake</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: colors.mutedText }}>Resume the current draft/finalized intake and manage transfer actions.</div>
            </button>

            <button
              type="button"
              onClick={openAutosaveRecoveryModal}
              style={{ textAlign: 'left', border: `1px solid ${colors.launchCardThreeBorder}`, background: colors.launchCardThreeBg, borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#facc15' : '#92400e', fontWeight: 800 }}>Recovery</div>
                <span style={{ border: isAdminDarkTheme ? '1px solid #7a5f2a' : '1px solid #fde68a', background: isAdminDarkTheme ? '#2e2a18' : '#fef3c7', color: isAdminDarkTheme ? '#facc15' : '#92400e', borderRadius: '999px', fontSize: '0.71rem', fontWeight: 800, padding: '0.14rem 0.45rem' }}>{autosaveCount}</span>
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.96rem', color: colors.strongText, fontWeight: 800 }}>Recover Auto-Saved Intake</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: colors.mutedText }}>Open unsaved intake sessions and continue where you left off.</div>
            </button>

            <button
              type="button"
              onClick={openFinalizedHistoryModal}
              style={{ textAlign: 'left', border: `1px solid ${colors.launchCardFourBorder}`, background: colors.launchCardFourBg, borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#86efac' : '#166534', fontWeight: 800 }}>History</div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.96rem', color: colors.strongText, fontWeight: 800 }}>Finalized Intake Records</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: colors.mutedText }}>Review finalized entries, export files, and open transfer details.</div>
            </button>

            <button
              type="button"
              onClick={openTransferHistoryModal}
              style={{ textAlign: 'left', border: `1px solid ${colors.launchCardFiveBorder}`, background: colors.launchCardFiveBg, borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#fdba74' : '#c2410c', fontWeight: 800 }}>Sync</div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.96rem', color: colors.strongText, fontWeight: 800 }}>POS Transfer History</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: colors.mutedText }}>Track queue status, processing results, and transfer failures.</div>
            </button>

            <button
              type="button"
              onClick={openPriceSyncHistoryModal}
              style={{ textAlign: 'left', border: `1px solid ${colors.launchCardSixBorder}`, background: colors.launchCardSixBg, borderRadius: '18px', padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: isAdminDarkTheme ? '#d4d4d8' : '#1e40af', fontWeight: 800 }}>Sync</div>
                <span style={{ border: isAdminDarkTheme ? '1px solid #3a3a3a' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#282828' : '#dbeafe', color: isAdminDarkTheme ? '#d4d4d8' : '#1e40af', borderRadius: '999px', fontSize: '0.71rem', fontWeight: 800, padding: '0.14rem 0.45rem' }}>{priceSyncRecordsCount}</span>
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.96rem', color: colors.strongText, fontWeight: 800 }}>Price Sync History</div>
              <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: colors.mutedText }}>View product-level price sync commands, statuses, errors, and agent outcomes.</div>
            </button>
          </div>
        </section>
      )}

      {!canViewForm && !canViewHistory && (
        <section style={{ ...themedCardStyle, padding: '1rem', width: '100%', minWidth: 0 }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.4rem', color: colors.strongText, fontSize: '0.95rem' }}>No Permitted Sections</h3>
          <p style={{ margin: 0, color: colors.mutedText }}>
            You do not currently have access to Stock Intake & POS Transfer form or history sections.
          </p>
        </section>
      )}

      {isIntakeWorkspaceOpen && canViewForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 22% 12%, rgba(120, 120, 120, 0.18), rgba(12, 14, 18, 0.72) 45%)', backdropFilter: 'blur(2px)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isIntakeWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isIntakeWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1480px, 98vw)', height: isIntakeWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isIntakeWorkspaceMaximized ? '10px' : '20px', display: 'flex', flexDirection: 'column', padding: '0.95rem', boxShadow: isAdminDarkTheme ? '0 28px 70px rgba(0, 0, 0, 0.56)' : '0 28px 70px rgba(15, 23, 42, 0.25)', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #dbeafe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', border: isAdminDarkTheme ? '1px solid #2d2d2d' : '1px solid #dbeafe', borderRadius: '14px', padding: '0.75rem 0.85rem', background: isAdminDarkTheme ? 'linear-gradient(140deg, #1a1a1a 0%, #1e1e1e 55%)' : 'linear-gradient(140deg, #eff6ff 0%, #ffffff 55%)' }}>
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: isAdminDarkTheme ? '#d4d4d8' : '#2563eb', fontWeight: 800 }}>Stock Intake</div>
                <div style={{ marginTop: '0.2rem', fontSize: '0.95rem', fontWeight: 800, color: isAdminDarkTheme ? '#f8fafc' : '#111827' }}>Supplier: {selectedSupplierName}</div>
                <div style={{ marginTop: '0.16rem', fontSize: '0.75rem', color: isAdminDarkTheme ? '#a0a0a0' : '#475569' }}>Capture intake lines, save progress, and finalize from one workspace.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  type="button"
                  title={isIntakeWorkspaceMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isIntakeWorkspaceMaximized ? 'Restore workspace' : 'Maximize workspace'}
                  onClick={() => setIsIntakeWorkspaceMaximized((prev) => !prev)}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #bfdbfe', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#d4d4d8' : '#334155', cursor: 'pointer' }}
                >
                  <i className={`fas ${isIntakeWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCloseWorkspace}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div ref={workspaceScrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0.35rem', borderRadius: '14px', border: isAdminDarkTheme ? '1px solid #2d2d2d' : '1px solid #e2e8f0', background: isAdminDarkTheme ? '#181818' : '#f8fbff' }}>
              {workspaceContent}
            </div>
          </div>
        </div>
      )}

      {isAutosaveRecoveryOpen && canViewForm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 171, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(980px, 97vw)', maxHeight: '86vh', overflow: 'hidden', borderRadius: '16px', display: 'flex', flexDirection: 'column', padding: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.65rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.strongText }}>Recover Auto-Saved Intake Sessions</div>
                <div style={{ marginTop: '0.2rem', fontSize: '0.8rem', color: '#64748b' }}>These sessions were auto-saved before finalizing or saving as draft.</div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {autosaveEntries.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllAutosaveEntries}
                    style={{ border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.34rem 0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsAutosaveRecoveryOpen(false)}
                  style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.15rem' }}>
              {autosaveEntries.length === 0 ? (
                <div style={{ border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '1rem', color: '#475569', fontSize: '0.84rem' }}>
                  No auto-saved intake sessions found.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {autosaveEntries.map((entry) => (
                    <div key={entry.id} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem', background: isAdminDarkTheme ? '#1a1a1a' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.7rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: colors.strongText }}>{entry.supplierName || 'Unassigned Supplier'}</div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {(entry.branchCode && entry.locationCode) ? `${entry.branchCode} / ${entry.locationCode}` : entry.locationName || entry.locationCode || 'No location'} • Purchase Date: {entry.purchaseDate || '-'} • Lines: {Number(entry.lineCount || 0)}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#a0a0a0' }}>Last auto-save: {formatDateTime(entry.savedAt)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => restoreAutosaveEntry(entry)}
                            style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '0.34rem 0.7rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Continue
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAutosaveEntry(entry.id)}
                            style={{ border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.34rem 0.7rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isFinalizedHistoryOpen && canViewHistory && (
        <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 78% 10%, rgba(110, 110, 110, 0.16), rgba(12, 14, 18, 0.72) 48%)', backdropFilter: 'blur(2px)', zIndex: 180, display: 'grid', placeItems: 'center', padding: isFinalizedHistoryMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isFinalizedHistoryMaximized ? 'calc(100vw - 0.7rem)' : 'min(1500px, 98vw)', height: isFinalizedHistoryMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isFinalizedHistoryMaximized ? '10px' : '20px', display: 'flex', flexDirection: 'column', padding: '0.95rem', boxShadow: isAdminDarkTheme ? '0 28px 70px rgba(0, 0, 0, 0.56)' : '0 28px 70px rgba(15, 23, 42, 0.25)', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap', border: isAdminDarkTheme ? '1px solid #2d2d2d' : '1px solid #bbf7d0', borderRadius: '14px', padding: '0.75rem 0.85rem', background: isAdminDarkTheme ? 'linear-gradient(140deg, #1a1a1a 0%, #1e1e1e 55%)' : 'linear-gradient(140deg, #f0fdf4 0%, #ffffff 55%)' }}>
              <div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: isAdminDarkTheme ? '#86efac' : '#166534', fontWeight: 800 }}>History</div>
                <div style={{ marginTop: '0.2rem', fontSize: '0.95rem', fontWeight: 800, color: isAdminDarkTheme ? '#f8fafc' : '#111827' }}>Finalized Intake Records</div>
                <div style={{ marginTop: '0.16rem', fontSize: '0.75rem', color: isAdminDarkTheme ? '#a1a1aa' : '#475569' }}>Filter finalized and draft entries, then open, export, or transfer safely.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  type="button"
                  title={isFinalizedHistoryMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isFinalizedHistoryMaximized ? 'Restore finalized history' : 'Maximize finalized history'}
                  onClick={() => setIsFinalizedHistoryMaximized((prev) => !prev)}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #bbf7d0', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#d4d4d8' : '#334155', cursor: 'pointer' }}
                >
                  <i className={`fas ${isFinalizedHistoryMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsFinalizedHistoryOpen(false);
                    setIsFinalizedHistoryMaximized(false);
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0.45rem', borderRadius: '14px', border: isAdminDarkTheme ? '1px solid #2d2d2d' : '1px solid #e2e8f0', background: isAdminDarkTheme ? '#181818' : '#f8fbff', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.6rem 0.65rem', borderRadius: '10px', background: isAdminDarkTheme ? 'rgba(0, 0, 0, 0.45)' : '#ffffff', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #dbeafe' }}>
                <h3 style={{ margin: 0, color: colors.text, fontSize: '0.9rem', lineHeight: 1.2 }}>Intake Records</h3>
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
                        <th key={label} style={{ textAlign: 'left', padding: '0.48rem 0.4rem', fontSize: '0.72rem', color: colors.mutedText, borderBottom: `1px solid ${isAdminDarkTheme ? '#333333' : '#e2e8f0'}` }}>{label}</th>
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
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText, fontSize: '0.86rem' }}>{record.intakeRef}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{dateInputValue(record.purchaseDate)}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{record.supplier?.name || record.manualSupplierName || '-'}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{record.branchCode && record.locationCode ? `${record.branchCode} / ${record.locationCode}` : record.locationName || record.locationCode || '-'}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                          <span style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 700, color: record.status === 'finalized' ? '#166534' : '#1d4ed8', backgroundColor: record.status === 'finalized' ? '#ecfdf3' : '#eff6ff', border: `1px solid ${record.status === 'finalized' ? '#bbf7d0' : '#bfdbfe'}` }}>
                            {String(record.status || 'draft').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}` }}>{renderTransferBadge(record)}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{record.totalItems || record._count?.items || 0}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText, fontSize: '0.84rem' }}>{money(record.totalCost)}</td>
                        <td style={{ padding: '0.5rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {canEdit && canViewForm && <button type="button" onClick={() => handleEditRecord(record.id)} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#e5e7eb' : '#0f172a', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Open</button>}
                            {canExport && <button type="button" onClick={() => handleExportRecord(record.id, 'full')} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Export Intake + Transfer Report</button>}
                            {canExport && <button type="button" onClick={() => handleExportRecord(record.id, 'intake-only')} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text, borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Export Intake Only</button>}
                            {canDelete && <button type="button" onClick={() => handleDeleteRecord(record)} style={{ border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>}
                            {canViewHistory && <button type="button" onClick={() => openTransferDetail(record.id)} style={{ border: '1px solid #e9d5ff', background: '#faf5ff', color: '#6b21a8', borderRadius: '7px', padding: '0.28rem 0.55rem', fontWeight: 700, cursor: 'pointer' }}>Details</button>}
                            {canEdit && record.status === 'finalized' && isPosTransferSupported(record.locationCode) && (resolveTransferStatus(record) === 'not_transferred' || resolveTransferStatus(record) === 'failed') && (
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
                    <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={pagination.page <= 1} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', borderRadius: '7px', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#e5e7eb' : '#0f172a', padding: '0.3rem 0.65rem', cursor: 'pointer' }}>Prev</button>
                    <button type="button" onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))} disabled={pagination.page >= pagination.totalPages} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', borderRadius: '7px', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#e5e7eb' : '#0f172a', padding: '0.3rem 0.65rem', cursor: 'pointer' }}>Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isTransferHistoryOpen && canViewHistory && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 181, display: 'grid', placeItems: 'center', padding: isTransferHistoryMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isTransferHistoryMaximized ? 'calc(100vw - 0.7rem)' : 'min(1520px, 98vw)', height: isTransferHistoryMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isTransferHistoryMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: colors.strongText }}>POS Transfer History</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  type="button"
                  title={isTransferHistoryMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isTransferHistoryMaximized ? 'Restore transfer history' : 'Maximize transfer history'}
                  onClick={() => setIsTransferHistoryMaximized((prev) => !prev)}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#d4d4d8' : '#334155', cursor: 'pointer' }}
                >
                  <i className={`fas ${isTransferHistoryMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsTransferHistoryOpen(false);
                    setIsTransferHistoryMaximized(false);
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, color: colors.text, fontSize: '0.9rem', lineHeight: 1.2 }}>POS Transfer History</h3>
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
                  <option value={effectiveLocationCode}>{effectiveBranchCode} / {effectiveLocationCode}</option>
                </select>
                <input type="date" value={transferStartDate} onFocus={selectInputText} onChange={(event) => setTransferStartDate(event.target.value)} style={themedInputStyle} />
                <input type="date" value={transferEndDate} onFocus={selectInputText} onChange={(event) => setTransferEndDate(event.target.value)} style={themedInputStyle} />
              </div>

              <div style={{ marginTop: '0.8rem', width: '100%', maxWidth: '100%', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1280px' }}>
                  <thead>
                    <tr>
                      {['Ref', 'GRN', 'Supplier', 'Location', 'Intake Date', 'Items', 'Total Cost', 'Transfer Status', 'Queued Time', 'Completed Time', 'Agent Message', 'Actions'].map((label) => (
                        <th key={label} style={{ textAlign: 'left', padding: '0.48rem 0.4rem', fontSize: '0.72rem', color: colors.mutedText, borderBottom: `1px solid ${isAdminDarkTheme ? '#333333' : '#e2e8f0'}` }}>{label}</th>
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
                      const requestedGrn = resolveRequestedTransferGrn(record);
                      const finalGrn = resolveFinalTransferGrn(record);
                      return (
                        <tr key={`transfer-${record.id}`}>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText, fontSize: '0.85rem' }}>{record.intakeRef}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>
                            {finalGrn || requestedGrn || '-'}
                            {finalGrn && requestedGrn && finalGrn !== requestedGrn ? (
                              <div style={{ fontSize: '0.72rem', color: colors.mutedText, marginTop: '0.12rem' }}>requested {requestedGrn}</div>
                            ) : null}
                          </td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{record.supplier?.name || record.manualSupplierName || '-'}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{(record.branchCode && record.locationCode) ? `${record.branchCode} / ${record.locationCode}` : record.locationName || record.locationCode || '-'}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{dateInputValue(record.purchaseDate)}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{record.totalItems || record._count?.items || 0}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText, fontSize: '0.84rem' }}>{money(record.totalCost)}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}` }}>{renderTransferBadge(record)}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{formatDateTime(record.posTransferAt || transferCommand.createdAt)}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.84rem' }}>{formatDateTime(transferCommand.processedAt)}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}`, color: String(responseSummary).toLowerCase().includes('fail') ? '#b91c1c' : colors.text, maxWidth: '260px', fontSize: '0.82rem' }}>{String(responseSummary).slice(0, 120)}</td>
                          <td style={{ padding: '0.48rem 0.4rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button type="button" onClick={() => openTransferDetail(record.id)} style={{ border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', borderRadius: '7px', padding: '0.25rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>View</button>
                              {canExport && <button type="button" onClick={() => handleExportRecord(record.id, 'full')} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '7px', padding: '0.25rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>Export Intake + Transfer Report</button>}
                              {canExport && <button type="button" onClick={() => handleExportRecord(record.id, 'intake-only')} style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #cbd5e1', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text, borderRadius: '7px', padding: '0.25rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}>Export Intake Only</button>}
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
            </div>
          </div>
        </div>
      )}

      {isPriceSyncHistoryOpen && canViewHistory && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 182, display: 'grid', placeItems: 'center', padding: isPriceSyncHistoryMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isPriceSyncHistoryMaximized ? 'calc(100vw - 0.7rem)' : 'min(1560px, 98vw)', height: isPriceSyncHistoryMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isPriceSyncHistoryMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: colors.strongText }}>Price Sync History</div>
                <div style={{ marginTop: '0.16rem', fontSize: '0.78rem', color: '#64748b' }}>Review queued, processing, completed, and failed price sync commands from finalized intakes.</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button
                  type="button"
                  title={isPriceSyncHistoryMaximized ? 'Restore' : 'Maximize'}
                  aria-label={isPriceSyncHistoryMaximized ? 'Restore price sync history' : 'Maximize price sync history'}
                  onClick={() => setIsPriceSyncHistoryMaximized((prev) => !prev)}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', background: isAdminDarkTheme ? '#1a1a1a' : '#fff', color: isAdminDarkTheme ? '#d4d4d8' : '#334155', cursor: 'pointer' }}
                >
                  <i className={`fas ${isPriceSyncHistoryMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPriceSyncHistoryOpen(false);
                    setIsPriceSyncHistoryMaximized(false);
                    setActivePriceSyncRecord(null);
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer' }}
                >
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem' }}>
              <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', background: isAdminDarkTheme ? '#1a1a1a' : '#fff' }}>
                <div style={{ padding: '0.7rem 0.8rem', borderBottom: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, color: colors.text, fontSize: '0.88rem' }}>Finalized Intake Records With Price Sync</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <select
                      value={priceSyncStatusFilter}
                      onChange={(event) => setPriceSyncStatusFilter(event.target.value)}
                      style={{ ...themedInputStyle, width: '170px', fontSize: '0.78rem', padding: '0.3rem 0.45rem' }}
                    >
                      <option value="all">All Status</option>
                      <option value="queued">Queued/Processing</option>
                      <option value="completed">Completed Only</option>
                      <option value="failed">Failed</option>
                      <option value="mixed">Mixed Outcome</option>
                    </select>
                    <span style={{ fontSize: '0.78rem', color: colors.mutedText }}>{filteredPriceSyncHistoryRecords.length} records</span>
                  </div>
                </div>
                <div style={{ width: '100%', maxWidth: '100%', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                    <thead>
                      <tr>
                        {['Ref', 'Supplier', 'Location', 'Intake Date', 'Sync Status', 'Attempted', 'Queued', 'Completed', 'Failed', 'Last Activity', 'Actions'].map((label) => (
                          <th key={label} style={{ textAlign: 'left', padding: '0.46rem 0.38rem', fontSize: '0.72rem', color: colors.mutedText, borderBottom: `1px solid ${isAdminDarkTheme ? '#333333' : '#e2e8f0'}` }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listLoading ? (
                        <tr><td colSpan={11} style={{ padding: '1rem', color: colors.mutedText }}>Loading price sync history...</td></tr>
                      ) : filteredPriceSyncHistoryRecords.length === 0 ? (
                        <tr><td colSpan={11} style={{ padding: '1rem', color: colors.mutedText }}>No finalized intake records with price sync commands yet.</td></tr>
                      ) : filteredPriceSyncHistoryRecords.map((record) => {
                        const summary = record.priceSyncSummary || {};
                        return (
                          <tr
                            key={`price-sync-${record.id}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => openPriceSyncDetail(record)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openPriceSyncDetail(record);
                              }
                            }}
                            style={{
                              cursor: 'pointer',
                              backgroundColor: 'transparent',
                              outline: 'none',
                            }}
                            aria-label={`Open price sync details for ${record.intakeRef}`}
                          >
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText, fontSize: '0.84rem' }}>{record.intakeRef}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.82rem' }}>{record.supplier?.name || record.manualSupplierName || '-'}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.82rem' }}>{record.locationName || record.locationCode || '-'}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.82rem' }}>{dateInputValue(record.purchaseDate)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}` }}>{renderPriceSyncStatusBadge(summary)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.82rem' }}>{Number(summary.attempted || 0)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.82rem' }}>{Number(summary.queued || 0) + Number(summary.processing || 0)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: '#166534', fontSize: '0.82rem', fontWeight: 700 }}>{Number(summary.completed || 0)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: Number(summary.failed || 0) > 0 ? '#b91c1c' : colors.text, fontSize: '0.82rem', fontWeight: Number(summary.failed || 0) > 0 ? 700 : 500 }}>{Number(summary.failed || 0)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text, fontSize: '0.82rem' }}>{formatDateTime(summary.lastProcessedAt || summary.lastQueuedAt)}</td>
                            <td style={{ padding: '0.48rem 0.38rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPriceSyncDetail(record);
                                }}
                                style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', borderRadius: '7px', padding: '0.24rem 0.5rem', fontWeight: 700, cursor: 'pointer' }}
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isPriceSyncDetailOpen && activePriceSyncRecord && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 183, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(1380px, 98vw)', height: '90vh', overflow: 'hidden', borderRadius: '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Price Sync Detail</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: colors.strongText }}>{activePriceSyncRecord.intakeRef}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {renderPriceSyncStatusBadge(activePriceSyncRecord.priceSyncSummary || {}, { compact: true })}
                <button type="button" onClick={() => setIsPriceSyncDetailOpen(false)} style={{ border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Close</button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem' }}>
              <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Supplier:</strong> {activePriceSyncRecord.supplier?.name || activePriceSyncRecord.manualSupplierName || '-'}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Location:</strong> {(activePriceSyncRecord.branchCode && activePriceSyncRecord.locationCode) ? `${activePriceSyncRecord.branchCode} / ${activePriceSyncRecord.locationCode}` : activePriceSyncRecord.locationName || activePriceSyncRecord.locationCode || '-'}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Intake Date:</strong> {dateInputValue(activePriceSyncRecord.purchaseDate)}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Commands:</strong> {Number(activePriceSyncRecord?.priceSyncSummary?.attempted || 0)}</div>
              </div>

              <div style={{ marginTop: '0.85rem', width: '100%', maxWidth: '100%', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1020px' }}>
                  <thead>
                    <tr>
                      {['Command ID', 'Product Code', 'Product Name', 'Location', 'Price Type', 'Old Price', 'New Price', 'Status', 'Queued', 'Processed', 'Agent Message'].map((label) => (
                        <th key={label} style={{ textAlign: 'left', padding: '0.55rem 0.45rem', fontSize: '0.75rem', color: colors.mutedText, borderBottom: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activePriceSyncRecord.priceSyncCommands || []).length === 0 ? (
                      <tr><td colSpan={11} style={{ padding: '0.9rem', color: '#64748b' }}>No command rows available for this record.</td></tr>
                    ) : (activePriceSyncRecord.priceSyncCommands || []).map((command) => {
                      const commandStatus = String(command.status || '').trim().toLowerCase();
                      const tone = commandStatus === 'completed'
                        ? { border: '#bbf7d0', bg: '#f0fdf4', color: '#166534' }
                        : commandStatus === 'failed'
                          ? { border: '#fecaca', bg: '#fff1f2', color: '#b91c1c' }
                          : commandStatus === 'processing'
                            ? { border: '#c7d2fe', bg: '#eef2ff', color: '#4338ca' }
                            : { border: '#fde68a', bg: '#fefce8', color: '#92400e' };

                      const message = command.resultSummary?.message || command.errorMessage || '-';
                      return (
                        <tr key={`price-sync-detail-cmd-${command.id}`}>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{command.id}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{command.productCode || command.productId || '-'}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{command.productName || '-'}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{command.locationCode || command.requestedLocationCode || '-'}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{command.priceTypeCode || '-'}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{command.oldPrice == null ? '-' : money(command.oldPrice)}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.strongText, fontWeight: 700 }}>{command.newPrice == null ? '-' : money(command.newPrice)}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}` }}>
                            <span style={{ border: `1px solid ${tone.border}`, background: tone.bg, color: tone.color, borderRadius: '999px', padding: '0.14rem 0.48rem', fontSize: '0.72rem', fontWeight: 700 }}>
                              {String(command.status || 'pending').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{formatDateTime(command.createdAt)}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{formatDateTime(command.processedAt)}</td>
                          <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: String(message).toLowerCase().includes('fail') ? '#b91c1c' : colors.mutedText, maxWidth: '320px' }}>{String(message).slice(0, 200)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {productPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 180, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(900px, 95vw)', maxHeight: '90vh', overflow: 'hidden', borderRadius: '18px', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: colors.strongText }}>Product Search</div>
                <div style={{ marginTop: '0.15rem', fontSize: '0.74rem', color: colors.mutedText }}>Search by product name, barcode, or code • Press F1 to open • Arrow keys to navigate • Enter to select</div>
              </div>
              <button
                type="button"
                onClick={closeProductPicker}
                style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <input
              ref={productPickerInputRef}
              type="text"
              value={productPickerQuery}
              onChange={(event) => handleProductPickerSearch(event.target.value)}
              onKeyDown={handleProductPickerKeyDown}
              placeholder="Search products by name, barcode, or code..."
              style={{ ...themedInputStyle, marginBottom: '0.85rem', fontSize: '0.9rem', padding: '0.55rem 0.7rem' }}
              autoFocus
            />

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '12px' }}>
              {productPickerLoading && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '150px', color: colors.mutedText }}>
                  <div>Searching...</div>
                </div>
              )}

              {!productPickerLoading && productPickerError && (
                <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.85rem', textAlign: 'center' }}>
                  {productPickerError}
                </div>
              )}

              {!productPickerLoading && productPickerResults.length === 0 && !productPickerError && (
                <div style={{ padding: '1rem', color: colors.mutedText, fontSize: '0.85rem', textAlign: 'center' }}>
                  {productPickerQuery ? 'No results. Try a different search.' : 'Enter a search term to find products.'}
                </div>
              )}

              {!productPickerLoading && productPickerResults.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: isAdminDarkTheme ? '#2a2a2a' : '#f8fafc', stickyTop: 0 }}>
                      {['Product Name', 'Code', 'Price', 'Stock', 'Status', 'Actions'].map((label) => (
                        <th key={label} style={{ textAlign: 'left', padding: '0.6rem 0.65rem', fontSize: '0.76rem', fontWeight: 700, color: colors.mutedText, borderBottom: `2px solid ${colors.tableBorder}` }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {productPickerResults.map((product, resultIndex) => {
                      const isHighlighted = resultIndex === productPickerHighlightedIndex;
                      const displayStock = product?.effectiveStock ?? product?.effective_stock ?? product?.posStock ?? product?.pos_stock ?? product?.stock ?? null;
                      const stockStatus = String(product?.stockStatus || product?.stock_status || '');
                      const stockTone = stockStatus === 'out_of_stock'
                        ? { color: '#b91c1c', bg: isAdminDarkTheme ? '#2d1a1a' : '#fff1f2' }
                        : stockStatus === 'low_stock'
                          ? { color: '#b45309', bg: isAdminDarkTheme ? '#242418' : '#fffbeb' }
                          : { color: '#166534', bg: isAdminDarkTheme ? '#1a2a1a' : '#f0fdf4' };

                      return (
                        <tr
                          key={`product-${product.id || resultIndex}`}
                          data-product-result-index={resultIndex}
                          onClick={() => applyProductToLine(product, productPickerRowIndex)}
                          onMouseEnter={() => setProductPickerHighlightedIndex(resultIndex)}
                          style={{
                            background: isHighlighted ? (isAdminDarkTheme ? '#2a5a3a' : '#eff6ff') : 'transparent',
                            cursor: 'pointer',
                            borderBottom: `1px solid ${colors.tableBorder}`,
                            transition: 'background 0.1s',
                          }}
                        >
                          <td style={{ padding: '0.65rem 0.65rem', color: colors.text, fontSize: '0.82rem', fontWeight: 600 }}>{product.name || '-'}</td>
                          <td style={{ padding: '0.65rem 0.65rem', color: colors.mutedText, fontSize: '0.8rem' }}>{product.sourceCode || product.productCode || '-'}</td>
                          <td style={{ padding: '0.65rem 0.65rem', color: colors.strongText, fontSize: '0.82rem', fontWeight: 700 }}>{money(product.sellingPrice || product.selling_price || product.unitPrice || product.unit_price || product.price || 0)}</td>
                          <td style={{ padding: '0.65rem 0.65rem', color: colors.text, fontSize: '0.82rem' }}>{displayStock == null ? 'Unknown' : Number(displayStock).toLocaleString('en-US')}</td>
                          <td style={{ padding: '0.65rem 0.65rem' }}>
                            <span style={{ border: `1px solid ${stockTone.color}`, background: stockTone.bg, color: stockTone.color, borderRadius: '999px', padding: '0.12rem 0.4rem', fontSize: '0.7rem', fontWeight: 700, display: 'inline-block' }}>
                              {stockStatus || 'Unknown'}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.65rem', textAlign: 'left' }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenPriceChange(product);
                              }}
                              style={{
                                border: '1px solid #cbd5e1',
                                background: isAdminDarkTheme ? '#1f2937' : '#f8fafc',
                                color: colors.text,
                                borderRadius: '10px',
                                padding: '0.35rem 0.55rem',
                                cursor: 'pointer',
                                fontSize: '0.76rem',
                              }}
                            >
                              Change Price
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ marginTop: '0.85rem', fontSize: '0.75rem', color: colors.mutedText, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                {productPickerResults.length > 0 && (
                  <span>
                    Showing {productPickerHighlightedIndex + 1} of {productPickerResults.length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span>ESC to close</span>
                {productPickerResults.length > 0 && <span>↑↓ to navigate</span>}
                {productPickerResults.length > 0 && <span>⏎ to select</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {productReplacementModalOpen && (
        <div ref={replacementModalRef} tabIndex={-1} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 190, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(480px, 95vw)', borderRadius: '18px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: colors.strongText }}>Replace Product?</div>
              </div>
              <button
                type="button"
                onClick={handleCancelProductReplacement}
                style={{ border: 'none', background: 'transparent', color: colors.mutedText, cursor: 'pointer', padding: '0.25rem', borderRadius: '6px' }}
                title="Cancel (Esc)"
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: colors.text, lineHeight: 1.5 }}>
                This row already contains <strong>{currentProductName}</strong>. What would you like to do?
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
              <button
                type="button"
                ref={(el) => { replacementModalButtonRefs.current[0] = el; }}
                onClick={handleReplaceCurrentProduct}
                style={{
                  border: `1px solid ${isAdminDarkTheme ? '#3f3f3f' : '#dbeafe'}`,
                  background: replacementModalFocusedButton === 0 ? (isAdminDarkTheme ? '#1e3a5f' : '#dbeafe') : (isAdminDarkTheme ? '#242424' : '#eff6ff'),
                  color: isAdminDarkTheme ? '#e4e4e7' : '#1d4ed8',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  outline: replacementModalFocusedButton === 0 ? `2px solid ${isAdminDarkTheme ? '#3b82f6' : '#2563eb'}` : 'none',
                  outlineOffset: '2px'
                }}
                title="Replace the current product (Enter)"
              >
                <i className="fas fa-exchange-alt" aria-hidden="true" />
                Replace Current Product
              </button>

              <button
                type="button"
                ref={(el) => { replacementModalButtonRefs.current[1] = el; }}
                onClick={handleAddToNewRow}
                style={{
                  border: `1px solid ${isAdminDarkTheme ? '#3a3a3a' : '#d8b4fe'}`,
                  background: replacementModalFocusedButton === 1 ? (isAdminDarkTheme ? '#3f2e5f' : '#d8b4fe') : (isAdminDarkTheme ? '#232323' : '#f8f5ff'),
                  color: isAdminDarkTheme ? '#e4e4e7' : '#7c3aed',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  outline: replacementModalFocusedButton === 1 ? `2px solid ${isAdminDarkTheme ? '#a855f7' : '#7c3aed'}` : 'none',
                  outlineOffset: '2px'
                }}
                title="Add to a new row"
              >
                <i className="fas fa-plus" aria-hidden="true" />
                Add To New Row
              </button>

              <button
                type="button"
                ref={(el) => { replacementModalButtonRefs.current[2] = el; }}
                onClick={handleCancelProductReplacement}
                style={{
                  border: `1px solid ${isAdminDarkTheme ? '#404040' : '#e2e8f0'}`,
                  background: replacementModalFocusedButton === 2 ? (isAdminDarkTheme ? '#2d2d2d' : '#e2e8f0') : (isAdminDarkTheme ? '#1e1e1e' : '#f8fafc'),
                  color: colors.mutedText,
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  outline: replacementModalFocusedButton === 2 ? `2px solid ${isAdminDarkTheme ? '#6b7280' : '#9ca3af'}` : 'none',
                  outlineOffset: '2px'
                }}
                title="Cancel and keep current product"
              >
                <i className="fas fa-times" aria-hidden="true" />
                Cancel
              </button>
            </div>

            <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: colors.mutedText, textAlign: 'center' }}>
              Press Enter for Replace • Tab to navigate • Esc to cancel
            </div>
          </div>
        </div>
      )}

      {isPriceChangeModalOpen && priceChangeProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 195, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(520px, 95vw)', borderRadius: '18px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: colors.strongText }}>Quick Price Change</div>
                <div style={{ fontSize: '0.78rem', color: colors.mutedText }}>Update the product price and queue POS writeback for the current branch/location.</div>
              </div>
              <button
                type="button"
                onClick={handleClosePriceChange}
                style={{ width: '36px', height: '36px', borderRadius: '10px', border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr auto' }}>
              <div>
                <div style={{ marginBottom: '0.35rem', fontSize: '0.78rem', color: colors.mutedText }}>Product</div>
                <div style={{ fontSize: '0.91rem', color: colors.strongText, fontWeight: 700 }}>{priceChangeProduct.name || priceChangeProduct.sourceCode || priceChangeProduct.productCode || 'Unnamed product'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ marginBottom: '0.35rem', fontSize: '0.78rem', color: colors.mutedText }}>Current Price</div>
                <div style={{ fontSize: '0.91rem', color: colors.text, fontWeight: 700 }}>{money(priceChangeProduct.sellingPrice ?? priceChangeProduct.selling_price ?? priceChangeProduct.unitPrice ?? priceChangeProduct.unit_price ?? priceChangeProduct.price ?? 0)}</div>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem', display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr auto' }}>
              <input
                ref={priceChangeInputRef}
                type="number"
                min="0"
                step="0.01"
                value={priceChangeValue}
                onChange={(event) => setPriceChangeValue(event.target.value)}
                style={{ ...themedInputStyle, width: '100%' }}
                placeholder="Enter new selling price"
              />
              <button
                type="button"
                onClick={handleConfirmPriceChange}
                disabled={priceChangeLoading}
                style={{ border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', borderRadius: '10px', cursor: 'pointer', padding: '0.8rem 1rem', fontWeight: 700 }}
              >
                {priceChangeLoading ? 'Updating...' : 'Save Price'}
              </button>
            </div>
            {priceChangeError && (
              <div style={{ marginBottom: '1rem', color: '#b91c1c', fontSize: '0.82rem' }}>{priceChangeError}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleClosePriceChange}
                style={{ border: '1px solid #d1d5db', background: isAdminDarkTheme ? '#374151' : '#f9fafb', color: colors.text, borderRadius: '10px', cursor: 'pointer', padding: '0.6rem 1rem', fontWeight: 700 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isTransferDetailOpen && transferDetailRecord && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(12, 14, 18, 0.72)', zIndex: 184, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ ...themedCardStyle, width: 'min(1320px, 98vw)', height: '90vh', overflow: 'hidden', borderRadius: '18px', display: 'flex', flexDirection: 'column', padding: '0.95rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Transfer Detail</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: colors.strongText }}>
                  {transferDetailRecord.intakeRef} {resolveDisplayedTransferGrn(transferDetailRecord) ? `• ${resolveDisplayedTransferGrn(transferDetailRecord)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {renderTransferBadge(transferDetailRecord)}
                {canExport && <button type="button" onClick={() => handleExportRecord(transferDetailRecord.id)} style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Export PDF</button>}
                {canEdit && resolveTransferStatus(transferDetailRecord) === 'failed' && (
                  <button type="button" onClick={() => handleTransferToPOS(transferDetailRecord.id)} disabled={transferring} style={{ border: '1px solid #fb923c', background: '#fff7ed', color: '#c2410c', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Retry Transfer</button>
                )}
                <button type="button" onClick={() => setIsTransferDetailOpen(false)} style={{ border: '1px solid #fecaca', background: isAdminDarkTheme ? '#2d1a1a' : '#fff5f5', color: '#b91c1c', borderRadius: '8px', padding: '0.38rem 0.75rem', fontWeight: 700, cursor: 'pointer' }}>Close</button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingRight: '0.2rem' }}>
              <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Supplier:</strong> {transferDetailRecord.supplier?.name || transferDetailRecord.manualSupplierName || '-'}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Location:</strong> {(transferDetailRecord.branchCode && transferDetailRecord.locationCode) ? `${transferDetailRecord.branchCode} / ${transferDetailRecord.locationCode}` : transferDetailRecord.locationName || transferDetailRecord.locationCode || '-'}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Intake Date:</strong> {dateInputValue(transferDetailRecord.purchaseDate)}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Queued:</strong> {formatDateTime(transferDetailRecord.posTransferAt || transferDetailRecord.posTransferCommand?.createdAt)}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Completed:</strong> {formatDateTime(transferDetailRecord.posTransferCommand?.processedAt)}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Command ID:</strong> {transferDetailRecord.posTransferCommand?.id || '-'}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Requested GRN:</strong> {resolveRequestedTransferGrn(transferDetailRecord) || 'Auto-generated in POS'}</div>
                <div style={{ border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem', background: isAdminDarkTheme ? '#1e1e1e' : '#fff', color: colors.text }}><strong>Final GRN Used:</strong> {resolveFinalTransferGrn(transferDetailRecord) || '-'}</div>
              </div>

              <div style={{ marginTop: '0.75rem', border: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', borderRadius: '10px', padding: '0.7rem', background: isAdminDarkTheme ? '#1e1e1e' : '#f8fafc' }}>
                <div style={{ fontSize: '0.8rem', color: colors.strongText, fontWeight: 700 }}>POS Agent Response</div>
                <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: colors.mutedText }}>
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
                        <th key={label} style={{ textAlign: 'left', padding: '0.55rem 0.45rem', fontSize: '0.75rem', color: colors.mutedText, borderBottom: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(transferDetailRecord.items || []).map((line, index) => (
                      <tr key={`detail-line-${line.id || index}`}>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{line.barcode || '-'}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{line.productName || '-'}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{Number(line.quantity || 0).toLocaleString('en-US')}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{money(line.unitCost || 0)}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, fontWeight: 700, color: colors.strongText }}>{money(line.totalCost || (Number(line.quantity || 0) * Number(line.unitCost || 0)))}</td>
                        <td style={{ padding: '0.55rem 0.45rem', borderBottom: `1px solid ${colors.tableBorder}`, color: colors.text }}>{dateInputValue(line.expiryDate) || '-'}</td>
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

