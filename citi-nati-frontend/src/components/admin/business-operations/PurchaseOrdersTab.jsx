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

const createRowId = () => `purchase-order-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const BRAND_PURPLE = '#5B4B8A';
const BRAND_GREEN = '#2D8659';
const COLOR_TEXT = [15, 23, 42];
const COLOR_MUTED = [100, 116, 139];
const COLOR_BORDER = [226, 232, 240];
const COLOR_CARD_BG = [248, 250, 252];
const COLOR_ALT_ROW = [249, 250, 251];
const PAGE_MARGIN = 12;

const toRgb = (hex) => {
  const normalized = String(hex || '').replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((ch) => `${ch}${ch}`).join('')
    : normalized;
  const intVal = parseInt(value, 16);
  return [(intVal >> 16) & 255, (intVal >> 8) & 255, intVal & 255];
};

const drawHeader = (doc, { reportTitle, generatedText, periodText }, left, right) => {
  const logoWidth = 22;
  const logoHeight = 14;
  try {
    doc.addImage(logo, 'PNG', left, 10, logoWidth, logoHeight);
  } catch {
    // Ignore image render errors.
  }

  const titleX = left + logoWidth + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...toRgb(BRAND_PURPLE));
  doc.text('Citi-', titleX, 16);
  const citiWidth = doc.getTextWidth('Citi-');
  doc.setTextColor(...toRgb(BRAND_GREEN));
  doc.text('Nati Supermarket', titleX + citiWidth, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...COLOR_TEXT);
  doc.text(reportTitle, titleX, 21);

  doc.setFontSize(9);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(`Generated: ${generatedText}`, right, 12.5, { align: 'right' });
  doc.text(`Period: ${periodText}`, right, 17.0, { align: 'right' });

  doc.setDrawColor(...toRgb(BRAND_GREEN));
  doc.setLineWidth(0.4);
  doc.line(left, 22.5, right, 22.5);
};

const drawSummaryCards = (doc, cards, startY, left, width) => {
  const gap = 4;
  const count = cards.length;
  const cardWidth = (width - gap * (count - 1)) / count;
  const cardHeight = 18;

  cards.forEach((card, index) => {
    const x = left + index * (cardWidth + gap);
    doc.setFillColor(...COLOR_CARD_BG);
    doc.setDrawColor(...COLOR_BORDER);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(card.label.toUpperCase(), x + 2.5, startY + 5.5, { maxWidth: cardWidth - 5 });

    doc.setFontSize(9.5);
    doc.setTextColor(...toRgb(card.color || BRAND_GREEN));
    doc.text(card.value, x + 2.5, startY + 12.5, { maxWidth: cardWidth - 5 });
  });

  return startY + cardHeight + 6;
};

const drawMetadataTable = (doc, rows, startY, left, right) => {
  autoTable(doc, {
    startY,
    margin: { left, right, top: 0, bottom: 12 },
    head: [['Field', 'Value']],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8.2,
      cellPadding: 2.8,
      textColor: COLOR_TEXT,
      lineColor: COLOR_BORDER,
      lineWidth: 0.22,
      valign: 'middle',
    },
    headStyles: {
      fillColor: toRgb(BRAND_PURPLE),
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: COLOR_ALT_ROW,
    },
    columnStyles: {
      0: { cellWidth: 46, fontStyle: 'bold', textColor: COLOR_MUTED },
      1: { cellWidth: right - left - 46 },
    },
  });

  return (doc.lastAutoTable?.finalY || startY) + 6;
};

const getNextField = (manual, field) => {
  if (manual) {
    switch (field) {
      case 'productCode': return 'productName';
      case 'productName': return 'shelfBalance';
      case 'shelfBalance': return 'posBalance';
      case 'posBalance': return 'sellingPrice';
      case 'sellingPrice': return 'quantityToOrder';
      case 'quantityToOrder': return 'notes';
      case 'notes': return 'addRow';
      default: return null;
    }
  }

  switch (field) {
    case 'shelfBalance': return 'quantityToOrder';
    case 'quantityToOrder': return 'notes';
    case 'notes': return 'addRow';
    default: return null;
  }
};

const parseNumberValue = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatBadgeValue = (value) => {
  if (Number.isFinite(value)) {
    const intValue = Number.isInteger(value) ? value : Number(value.toFixed(2));
    return intValue;
  }
  return value;
};

const getItemStatus = (item) => {
  const shelf = parseNumberValue(item.shelfBalance);
  const pos = parseNumberValue(item.posBalance);
  if (shelf === null || pos === null) {
    return { label: 'Pending', background: '#f3f4f6', color: '#6b7280' };
  }

  const diff = pos - shelf;
  if (diff > 0) {
    return {
      label: `Shortage (-${formatBadgeValue(diff)})`,
      background: '#fef2f2',
      color: '#991b1b',
    };
  }

  if (diff < 0) {
    return {
      label: `Overage (+${formatBadgeValue(Math.abs(diff))})`,
      background: '#eef2ff',
      color: '#3730a3',
    };
  }

  return { label: 'Balanced (0)', background: '#ecfdf5', color: '#166534' };
};

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
  const [orderItems, setOrderItems] = useState([]);
  const [sheetNotes, setSheetNotes] = useState('');
  const [currentOrderId, setCurrentOrderId] = useState(null);
  const [orderRef, setOrderRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [printedOrders, setPrintedOrders] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadingPrintedOrders, setLoadingPrintedOrders] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState('new');
  const [workspaceMaximized, setWorkspaceMaximized] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

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

  const fetchDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    try {
      const resp = await api.get('/business-operations/purchase-orders', {
        params: { status: 'draft', page: 1, pageSize: 50, ...scopeParams },
      });
      setDrafts(Array.isArray(resp.data?.data) ? resp.data.data : []);
    } catch (err) {
      setDrafts([]);
    } finally {
      setLoadingDrafts(false);
    }
  }, [scopeParams]);

  const fetchPrintedOrders = useCallback(async () => {
    setLoadingPrintedOrders(true);
    try {
      const resp = await api.get('/business-operations/purchase-orders', {
        params: { status: 'printed', page: 1, pageSize: 50, ...scopeParams },
      });
      setPrintedOrders(Array.isArray(resp.data?.data) ? resp.data.data : []);
    } catch (err) {
      setPrintedOrders([]);
    } finally {
      setLoadingPrintedOrders(false);
    }
  }, [scopeParams]);

  useEffect(() => {
    fetchDrafts();
    fetchPrintedOrders();
  }, [fetchDrafts, fetchPrintedOrders]);

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
          id: createRowId(),
          productId: product.id || product.productId || null,
          productCode: product.barcode || product.productCode || '',
          productName: product.productName || product.name || '',
          shelfBalance: '',
          posBalance: product.availableQuantity ?? product.stock ?? product.posBalance ?? '',
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
    const newRow = { ...emptySheetItem(Date.now()), manual: true };
    setOrderItems((prev) => {
      const next = [...prev, newRow];
      window.setTimeout(() => focusField(newRow.id, 'productCode'), 75);
      return next;
    });
  };

  const updateItem = (rowId, field, value) => {
    setOrderItems((prev) => prev.map((item) => (item.id === rowId ? { ...item, [field]: value } : item)));
  };

  const removeItem = (rowId) => {
    setOrderItems((prev) => prev.filter((item) => item.id !== rowId).map((item, idx) => ({ ...item, sortOrder: idx + 1 })));
  };

  const clearSheet = () => {
    setOrderItems([]);
    setSheetNotes('');
    setOrderRef('');
    setCurrentOrderId(null);
    setSavingError('');
  };

  const openSheet = async (id) => {
    try {
      const resp = await api.get(`/business-operations/purchase-orders/${id}`);
      const sheet = resp.data?.data;
      if (!sheet) return;

      const rows = Array.isArray(sheet.items)
        ? sheet.items.map((item, idx) => ({
            id: createRowId(),
            productId: item.productId ?? null,
            productCode: item.barcode || '',
            productName: item.productName || '',
            shelfBalance: item.shelfBalance ?? '',
            posBalance: item.posBalance ?? '',
            sellingPrice: item.sellingPrice ?? '',
            quantityToOrder: item.quantity ?? 1,
            notes: item.notes || '',
            manual: !item.productId,
            sortOrder: idx + 1,
          }))
        : [emptySheetItem(1)];

      setOrderItems(rows.length ? rows : []);
      setSheetNotes(sheet.notes || '');
      setOrderRef(sheet.purchaseOrderRef || '');
      setCurrentOrderId(sheet.id);
      setWorkspaceMode('continue');
      setWorkspaceOpen(true);
      setWorkspaceMaximized(false);
    } catch (err) {
      await boAlert({
        title: 'Unable to open draft',
        message: err.response?.data?.error || 'Failed to open saved purchase order',
        type: 'error',
      });
    }
  };

  const openNewSheet = () => {
    clearSheet();
    setWorkspaceMode('new');
    setWorkspaceOpen(true);
    setWorkspaceMaximized(false);
  };

  const openContinueDraft = () => {
    if (drafts.length > 0) {
      openSheet(drafts[0].id);
    } else {
      openNewSheet();
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
      purchaseOrderRef: orderRef || undefined,
      branchCode: branch || undefined,
      locationId: selectedLocationId || undefined,
      locationCode: location || undefined,
      locationName: selectedLocationName || undefined,
      status: 'draft',
      notes: sheetNotes || undefined,
      items: buildSaveItems(),
    };

    try {
      const resp = currentOrderId
        ? await api.put(`/business-operations/purchase-orders/${currentOrderId}`, payload)
        : await api.post('/business-operations/purchase-orders', payload);

      const saved = resp.data?.data;
      setCurrentOrderId(saved?.id || currentOrderId);
      setOrderRef(saved?.purchaseOrderRef || orderRef);
      setSaving(false);
      fetchDrafts();
      await boAlert({ title: 'Draft saved', message: 'Purchase order draft was saved successfully.', type: 'info' });
    } catch (err) {
      setSaving(false);
      console.error('[PURCHASE_ORDER_SAVE_ERROR] saveDraft payload:', payload, err);
      const backendMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to save draft';
      setSavingError(backendMessage);
      await boAlert({ title: 'Save failed', message: backendMessage, type: 'error' });
    }
  };

  const exportToPdf = () => {
    const now = new Date();
    const preparedBy = tokenStorage.getUser()?.name || tokenStorage.getUser()?.email || '-';
    const orderReference = orderRef || 'Draft';
    const branchLabel = selectedBranchCode || '-';
    const locationLabel = selectedLocationName || selectedLocationCode || '-';
    const dateLabel = now.toLocaleDateString('en-GB');
    const timeLabel = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const totalQuantity = orderItems.reduce((sum, item) => sum + Number(item.quantityToOrder || 0), 0);

    const rows = orderItems.map((item, index) => {
      const statusLabel = getItemStatus(item)?.label || item.status || '-';
      const shelfBalance = item.shelfBalance === '' ? '-' : String(item.shelfBalance);
      const posBalance = item.posBalance === '' ? '-' : String(item.posBalance);
      const price = item.sellingPrice === '' || Number.isNaN(Number(item.sellingPrice))
        ? '-'
        : `MWK ${Number(item.sellingPrice).toFixed(2)}`;
      const quantity = String(Number(item.quantityToOrder || 0));
      return [
        String(index + 1),
        item.productCode || '-',
        item.productName || '-',
        shelfBalance,
        posBalance,
        statusLabel,
        price,
        quantity,
        item.notes || '-',
      ];
    });

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = PAGE_MARGIN;
    const right = pageWidth - PAGE_MARGIN;
    const width = right - left;

    drawHeader(doc, {
      reportTitle: 'Purchase Order Sheet',
      generatedText: `${dateLabel} ${timeLabel}`,
      periodText: `Order ref: ${orderReference}`,
    }, left, right);

    const summaryCards = [
      { label: 'Branch', value: branchLabel, color: BRAND_GREEN },
      { label: 'Location', value: locationLabel, color: BRAND_PURPLE },
      { label: 'Prepared by', value: preparedBy, color: '#0f766e' },
      { label: 'Total quantity', value: String(totalQuantity), color: '#4338ca' },
    ];
    let y = drawSummaryCards(doc, summaryCards, 26, left, width);

    const metadataRows = [
      ['Order reference', orderReference],
      ['Date', dateLabel],
      ['Time', timeLabel],
      ['Line count', String(orderItems.length)],
    ];
    y = drawMetadataTable(doc, metadataRows, y + 2, left, right);

    autoTable(doc, {
      startY: y + 2,
      margin: { left, right, top: 0, bottom: 12 },
      head: [['No.', 'Code', 'Product', 'Shelf', 'POS', 'Status', 'Price', 'Qty', 'Notes']],
      body: rows.length ? rows : [['No purchase order items were found.', '', '', '', '', '', '', '', '']],
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2.6,
        textColor: COLOR_TEXT,
        lineColor: COLOR_BORDER,
        lineWidth: 0.22,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: toRgb(BRAND_GREEN),
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: COLOR_ALT_ROW,
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 28, halign: 'left' },
        2: { cellWidth: 78, halign: 'left' },
        3: { cellWidth: 18, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 32, halign: 'left' },
        6: { cellWidth: 24, halign: 'right' },
        7: { cellWidth: 16, halign: 'right' },
        8: { cellWidth: 56, halign: 'left' },
      },
    });

    doc.save(`purchase-order-sheet-${now.toISOString().slice(0, 10)}.pdf`);
  };

  const openHistoryModal = () => {
    setHistoryModalOpen(true);
  };

  const closeWorkspace = () => {
    setWorkspaceOpen(false);
    setSearchModalOpen(false);
    setWorkspaceMaximized(false);
  };

  const actionCardStyle = {
    textAlign: 'left',
    borderRadius: 18,
    border: '1px solid #e0e7ff',
    background: '#eef2ff',
    padding: '1.2rem 1rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 160,
  };

  const buttonStyle = {
    border: 'none',
    borderRadius: 12,
    padding: '0.85rem 1rem',
    backgroundColor: '#7c3aed',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
  };

  const renderOrderTable = () => (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ minWidth: 1000, width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px minmax(120px, 1fr) minmax(220px, 2fr) 100px 100px 120px 90px 100px 220px 90px', gap: '1px', backgroundColor: '#eef2ff', padding: '0.85rem 0.65rem', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', alignItems: 'center' }}>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>#</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'left', display: 'flex', alignItems: 'center' }}>Code</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'left', display: 'flex', alignItems: 'center' }}>Product name</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>Shelf</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>POS</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>Status</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>Price</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>Order Qty</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'left', display: 'flex', alignItems: 'center' }}>Notes</div>
          <div style={{ padding: '0.75rem 0.65rem', textAlign: 'center', display: 'flex', alignItems: 'center' }}>Action</div>
        </div>
        {orderItems.length === 0 ? (
          <div style={{ backgroundColor: '#fff', padding: '2rem 1rem', textAlign: 'center', color: '#475569' }}>
            No products added yet. Press F1 or click Search Product to add items.
          </div>
        ) : orderItems.map((item, index) => {
          const status = getItemStatus(item);
          return (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '40px minmax(120px, 1fr) minmax(220px, 2fr) 100px 100px 120px 90px 100px 220px 90px', gap: '1px', backgroundColor: '#fff', alignItems: 'center' }}>
              <div style={{ padding: '0.75rem 0.65rem', backgroundColor: '#f8fafc', color: '#475569', textAlign: 'center' }}>{index + 1}</div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-productCode`] = el; }}
                  type="text"
                  value={item.productCode}
                  onChange={(e) => updateItem(item.id, 'productCode', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const next = getNextField(item.manual, 'productCode');
                      if (next === 'addRow') addManualRow(); else focusField(item.id, next);
                    }
                  }}
                  placeholder="Code"
                  readOnly={!item.manual}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', backgroundColor: item.manual ? '#fff' : '#f8fafc', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-productName`] = el; }}
                  type="text"
                  value={item.productName}
                  onChange={(e) => updateItem(item.id, 'productName', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const next = getNextField(item.manual, 'productName');
                      if (next === 'addRow') addManualRow(); else focusField(item.id, next);
                    }
                  }}
                  placeholder="Product name"
                  readOnly={!item.manual}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', backgroundColor: item.manual ? '#fff' : '#f8fafc', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-shelfBalance`] = el; }}
                  type="number"
                  value={item.shelfBalance}
                  onChange={(e) => updateItem(item.id, 'shelfBalance', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const next = getNextField(item.manual, 'shelfBalance');
                      if (next === 'addRow') addManualRow(); else focusField(item.id, next);
                    }
                  }}
                  placeholder="Shelf"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-posBalance`] = el; }}
                  type="number"
                  value={item.posBalance}
                  onChange={(e) => updateItem(item.id, 'posBalance', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const next = getNextField(item.manual, 'posBalance');
                      if (next === 'addRow') addManualRow(); else focusField(item.id, next);
                    }
                  }}
                  placeholder="POS"
                  readOnly={!item.manual}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', backgroundColor: item.manual ? '#fff' : '#f8fafc', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ display: 'inline-block', whiteSpace: 'nowrap', minHeight: 32, minWidth: 100, borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: status.background, color: status.color, fontWeight: 600, fontSize: '0.8rem', padding: '0.35rem 0.5rem', textAlign: 'center' }}>{status.label}</span>
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-sellingPrice`] = el; }}
                  type="number"
                  value={item.sellingPrice}
                  onChange={(e) => updateItem(item.id, 'sellingPrice', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const next = getNextField(item.manual, 'sellingPrice');
                      if (next === 'addRow') addManualRow(); else focusField(item.id, next);
                    }
                  }}
                  placeholder="Price"
                  readOnly={!item.manual}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', backgroundColor: item.manual ? '#fff' : '#f8fafc', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-quantityToOrder`] = el; }}
                  type="number"
                  value={item.quantityToOrder}
                  onChange={(e) => updateItem(item.id, 'quantityToOrder', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const next = getNextField(item.manual, 'quantityToOrder');
                      if (next === 'addRow') addManualRow(); else focusField(item.id, next);
                    }
                  }}
                  placeholder="Qty"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff' }}>
                <input
                  ref={(el) => { inputRefs.current[`${item.id}-notes`] = el; }}
                  type="text"
                  value={item.notes}
                  onChange={(e) => updateItem(item.id, 'notes', e.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      setSearchModalOpen(true);
                    }
                  }}
                  placeholder="Notes"
                  style={{ width: '100%', borderRadius: 10, border: '1px solid #cbd5e1', padding: '0.55rem', color: '#0f172a' }}
                />
              </div>
              <div style={{ padding: '0.45rem 0.65rem', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  style={{ border: 'none', backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: 10, padding: '0.6rem 0.85rem', cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const visibleBranch = selectedBranchCode || '—';
  const visibleLocation = selectedLocationName || selectedLocationCode || '—';

  return (
    <div style={{ display: 'grid', gap: '1rem', width: '100%' }}>
      {!workspaceOpen && (
        <section style={{ borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', padding: '1.2rem', display: 'grid', gap: '0.85rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.35rem' }}>Purchase Orders</h2>
            <p style={{ margin: '0.65rem 0 0', color: '#475569', maxWidth: 680, lineHeight: 1.6 }}>
              Build and save purchase order sheets for branch replenishment.
            </p>
          </div>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <button type="button" onClick={openNewSheet} style={{ ...actionCardStyle, background: '#eef2ff' }}>
              <div style={{ color: '#7c3aed', fontWeight: 800, marginBottom: '0.45rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Create</div>
              <div style={{ fontSize: '1rem', color: '#1e293b', fontWeight: 800 }}>Create New Purchase Order Sheet</div>
              <div style={{ marginTop: '0.55rem', color: '#475569', fontSize: '0.92rem' }}>Open a clean workspace with a fresh printable purchase order sheet.</div>
            </button>
            <button type="button" onClick={openContinueDraft} style={{ ...actionCardStyle, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <div style={{ color: '#7c3aed', fontWeight: 800, marginBottom: '0.45rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Continue</div>
              <div style={{ fontSize: '1rem', color: '#1e293b', fontWeight: 800 }}>Continue Current Draft / Auto-Saved Sheet</div>
              <div style={{ marginTop: '0.55rem', color: '#475569', fontSize: '0.92rem' }}>
                {drafts.length > 0 ? `Resume the latest draft: ${drafts[0].purchaseOrderRef || 'Untitled draft'}` : 'No active drafts found. Start a new sheet.'}
              </div>
            </button>
            <button type="button" onClick={openHistoryModal} style={{ ...actionCardStyle, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ color: '#7c3aed', fontWeight: 800, marginBottom: '0.45rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>History</div>
              <div style={{ fontSize: '1rem', color: '#1e293b', fontWeight: 800 }}>Saved Drafts / Order History</div>
              <div style={{ marginTop: '0.55rem', color: '#475569', fontSize: '0.92rem' }}>Browse saved drafts and previously printed purchase order sheets.</div>
            </button>
            <button type="button" onClick={openHistoryModal} style={{ ...actionCardStyle, background: '#fdf2f8', border: '1px solid #fbcfe8' }}>
              <div style={{ color: '#9d174d', fontWeight: 800, marginBottom: '0.45rem', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Export</div>
              <div style={{ fontSize: '1rem', color: '#1e293b', fontWeight: 800 }}>Exported / Printed Orders</div>
              <div style={{ marginTop: '0.55rem', color: '#475569', fontSize: '0.92rem' }}>Review orders that were finalized for printing or distribution.</div>
            </button>
          </div>
        </section>
      )}

      {workspaceOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: workspaceMaximized ? '0' : '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: workspaceMaximized ? '100%' : '92%', maxWidth: workspaceMaximized ? '100%' : 1360, maxHeight: '100%', backgroundColor: '#ffffff', borderRadius: workspaceMaximized ? '0' : 22, boxShadow: workspaceMaximized ? 'none' : '0 30px 80px rgba(15, 23, 42, 0.2)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: workspaceMaximized ? '100%' : 'unset' }}>
            <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>{workspaceMode === 'new' ? 'New Purchase Order Sheet' : 'Purchase Order Workspace'}</h2>
                  <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>{orderRef ? orderRef : 'Draft'}</span>
                </div>
                <div style={{ marginTop: '0.55rem', color: '#475569', fontSize: '0.9rem' }}>
                  Branch: <strong style={{ color: '#111827' }}>{visibleBranch}</strong> · Location: <strong style={{ color: '#111827' }}>{visibleLocation}</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={clearSheet} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', borderRadius: 10, padding: '0.75rem 0.9rem', cursor: 'pointer' }}>Clear sheet</button>
                <button type="button" onClick={saveDraft} disabled={saving} style={{ ...buttonStyle, backgroundColor: '#7c3aed' }}>{saving ? 'Saving…' : 'Save Draft'}</button>
                <button type="button" onClick={exportToPdf} style={{ ...buttonStyle, backgroundColor: '#4338ca' }}>Export PDF</button>
                <button type="button" title={workspaceMaximized ? 'Restore workspace' : 'Maximize workspace'} aria-label={workspaceMaximized ? 'Restore workspace' : 'Maximize workspace'} onClick={() => setWorkspaceMaximized((prev) => !prev)} style={{ width: 36, height: 36, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#3730a3', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <i className={`fas ${workspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>
                <button type="button" onClick={closeWorkspace} style={{ border: 'none', background: 'transparent', color: '#475569', fontSize: '1.25rem', lineHeight: 1, cursor: 'pointer' }}>×</button>
              </div>
            </div>
            <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1rem', gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>Order details</div>
                  <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: '#475569' }}>Use the product search modal or manual rows to build the sheet.</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <button type="button" onClick={() => setSearchModalOpen(true)} style={{ border: '1px solid #c7d2fe', borderRadius: 10, padding: '0.75rem 0.95rem', background: '#eef2ff', color: '#3730a3', cursor: 'pointer' }}>Search product (F1)</button>
                  <button type="button" onClick={addManualRow} style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: '0.75rem 0.95rem', background: '#fff', color: '#0f172a', cursor: 'pointer' }}>Add manual row</button>
                </div>
              </div>

              {savingError && <div style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 700 }}>{savingError}</div>}

              <div style={{ display: 'grid', gap: '1rem' }}>
                {renderOrderTable()}
              </div>
            </div>
          </div>
        </div>
      )}

      {searchModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 860, backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Search products</h3>
                <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.92rem' }}>Search by barcode, code, or product name. Arrow keys navigate, Enter selects.</p>
              </div>
              <button type="button" onClick={() => setSearchModalOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', color: '#475569', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '1rem 1.25rem', display: 'grid', gap: '0.85rem' }}>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                ref={searchInputRef}
                placeholder="Search products by barcode, code or name..."
                style={{ width: '100%', padding: '0.95rem 1rem', borderRadius: 12, border: '1px solid #cbd5e1', color: '#0f172a', fontSize: '0.95rem' }}
              />
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {searchLoading && <div style={{ padding: '1rem', color: '#475569' }}>Searching...</div>}
                {!searchLoading && searchResults.length === 0 && <div style={{ padding: '1rem', color: '#475569' }}>No results found. Use the manual row button to add a non-system item.</div>}
                {!searchLoading && searchResults.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    {searchResults.map((product, index) => {
                      const active = index === selectedSearchIndex;
                      return (
                        <button
                          key={product.id || product.barcode || product.productName || index}
                          type="button"
                          onClick={() => selectSearchResult(product)}
                          onMouseEnter={() => setSelectedSearchIndex(index)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '0.95rem 1rem', borderRadius: 14,
                            border: active ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                            backgroundColor: active ? '#f5f3ff' : '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                            <div>
                              <div style={{ color: '#0f172a', fontWeight: 700 }}>{product.productName || product.name || 'Unnamed product'}</div>
                              <div style={{ color: '#64748b', fontSize: '0.88rem' }}>{product.barcode || product.productCode || 'No barcode'}</div>
                            </div>
                            <div style={{ color: '#111827', fontWeight: 700 }}>{product.sellingPrice != null ? Number(product.sellingPrice).toFixed(2) : product.price != null ? Number(product.price).toFixed(2) : '-'}</div>
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

      {historyModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, backgroundColor: 'rgba(15, 23, 42, 0.45)', padding: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 980, backgroundColor: '#fff', borderRadius: 18, boxShadow: '0 18px 40px rgba(15, 23, 42, 0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>Purchase Order History</h3>
                <p style={{ margin: '0.35rem 0 0', color: '#475569', fontSize: '0.92rem' }}>Review saved drafts and exported orders for this branch / location.</p>
              </div>
              <button type="button" onClick={() => setHistoryModalOpen(false)} style={{ border: 'none', background: 'transparent', fontSize: '1.2rem', color: '#475569', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '1rem', padding: '1rem 1.25rem', maxHeight: '75vh', overflowY: 'auto' }}>
              <section style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '1rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Saved Drafts</div>
                {loadingDrafts && <div style={{ color: '#475569' }}>Loading drafts…</div>}
                {!loadingDrafts && drafts.length === 0 && <div style={{ color: '#475569' }}>No saved drafts found for this location.</div>}
                {!loadingDrafts && drafts.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {drafts.map((sheet) => (
                      <button
                        key={sheet.id}
                        type="button"
                        onClick={() => { openSheet(sheet.id); setHistoryModalOpen(false); }}
                        style={{ width: '100%', textAlign: 'left', borderRadius: 14, border: '1px solid #e2e8f0', backgroundColor: '#fff', padding: '0.95rem 1rem', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{sheet.purchaseOrderRef || `Draft #${sheet.id}`}</span>
                          <span style={{ color: '#64748b', fontSize: '0.88rem' }}>{sheet.purchaseDate ? new Date(sheet.purchaseDate).toLocaleDateString('en-GB') : 'No date'}</span>
                        </div>
                        <div style={{ marginTop: '0.35rem', color: '#475569' }}>{sheet.notes || 'No notes'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <section style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '1rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.75rem' }}>Exported / Printed Orders</div>
                {loadingPrintedOrders && <div style={{ color: '#475569' }}>Loading exported orders…</div>}
                {!loadingPrintedOrders && printedOrders.length === 0 && <div style={{ color: '#475569' }}>No printed purchase orders found for this location.</div>}
                {!loadingPrintedOrders && printedOrders.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {printedOrders.map((sheet) => (
                      <div key={sheet.id} style={{ width: '100%', borderRadius: 14, border: '1px solid #e2e8f0', backgroundColor: '#fff', padding: '0.95rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{sheet.purchaseOrderRef || `Order #${sheet.id}`}</span>
                          <span style={{ color: '#64748b', fontSize: '0.88rem' }}>{sheet.purchaseDate ? new Date(sheet.purchaseDate).toLocaleDateString('en-GB') : 'No date'}</span>
                        </div>
                        <div style={{ marginTop: '0.35rem', color: '#475569' }}>{sheet.notes || 'No notes'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersTab;
