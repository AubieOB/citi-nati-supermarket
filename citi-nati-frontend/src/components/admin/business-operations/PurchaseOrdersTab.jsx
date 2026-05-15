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
    notes: '',
    items: [emptyLineItem()],
  });

  const scopeParams = useMemo(() => {
    if (isAggregateMode) {
      return {};
    }

    return buildScopedParams({
      branchCode: effectiveBranchCode,
      locationCode: effectiveLocationCode,
      locationId: selectedLocationId,
    });
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationId, isAggregateMode]);

  const refreshKeyParams = useMemo(() => ({
    page,
    search,
    status: statusFilter,
    ...scopeParams,
  }), [page, search, statusFilter, scopeParams]);

  const normalizeNumberValue = (value) => {
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const computeLineTotal = (quantity, unitCost) => {
    const qty = normalizeNumberValue(quantity);
    const cost = normalizeNumberValue(unitCost);
    return Number((qty * cost).toFixed(2));
  };

  const fetchSupplierOptions = useCallback(async (query) => {
    setSupplierLoading(true);
    try {
      const response = await api.get('/business-operations/suppliers', {
        params: {
          search: query || undefined,
          pageSize: 12,
          branchCode: !isAggregateMode ? effectiveBranchCode || undefined : undefined,
          locationId: !isAggregateMode ? selectedLocationId || undefined : undefined,
        },
      });
      setSupplierOptions(response.data?.data || []);
    } catch (_err) {
      setSupplierOptions([]);
    } finally {
      setSupplierLoading(false);
    }
  }, [effectiveBranchCode, isAggregateMode, selectedLocationId]);

  useEffect(() => {
    if (!isFormOpen) return undefined;
    const searchTerm = String(form.supplierName || '').trim();
    const timer = setTimeout(() => {
      fetchSupplierOptions(searchTerm);
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchSupplierOptions, form.supplierName, isFormOpen]);

  const resetFormState = useCallback(() => {
    setForm({
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
      notes: '',
      items: [emptyLineItem()],
    });
    setFormError('');
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationName]);

  const fetchPurchaseOrders = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get('/business-operations/purchase-orders', {
        params: {
          page,
          pageSize: 20,
          sortBy: 'purchaseDate',
          sortOrder: 'desc',
          search: search || undefined,
          status: statusFilter || undefined,
          ...scopeParams,
        },
      });

      setPurchaseOrders(response.data?.data || []);
      setPagination(response.data?.pagination || null);
    } catch (err) {
      setPurchaseOrders([]);
      setPagination(null);
      setError(err.response?.data?.error || 'Unable to load purchase orders');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, scopeParams]);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders, refreshKey]);

  const openCreateForm = () => {
    setFormMode('create');
    resetFormState();
    setShowSupplierSuggestions(false);
    setIsFormOpen(true);
  };

  const openEditForm = async (orderId) => {
    setFormMode('edit');
    setSaving(true);
    setFormError('');

    try {
      const response = await api.get(`/business-operations/purchase-orders/${orderId}`);
      const order = response.data?.data;
      if (!order) {
        throw new Error('Purchase order not found');
      }

      setForm({
        id: order.id,
        purchaseOrderRef: order.purchaseOrderRef || '',
        supplierId: order.supplier?.id || null,
        supplierName: order.supplierName || order.supplier?.name || '',
        purchaseDate: formatDateInputValue(order.purchaseDate),
        expectedDeliveryDate: formatDateInputValue(order.expectedDeliveryDate),
        branchCode: order.branchCode || effectiveBranchCode || '',
        locationCode: order.locationCode || effectiveLocationCode || '',
        locationName: order.locationName || selectedLocationName || '',
        status: order.status || 'draft',
        notes: order.notes || '',
        items: Array.isArray(order.items) && order.items.length > 0
          ? order.items.map((item) => ({
              barcode: item.barcode || '',
              productId: item.productId || null,
              productName: item.productName || '',
              quantity: item.quantity || 0,
              unitCost: item.unitCost || 0,
              totalCost: item.totalCost || 0,
              expiryDate: formatDateInputValue(item.expiryDate),
              batchRef: item.batchRef || '',
              notes: item.notes || '',
            }))
          : [emptyLineItem()],
      });
      setIsFormOpen(true);
    } catch (err) {
      await boAlert({
        title: 'Unable to open order',
        message: err.response?.data?.error || err.message || 'Failed to load order details.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setFormError('');
    setShowSupplierSuggestions(false);
  };

  const updateFormField = (field, value) => {
    setForm((prev) => {
      if (field === 'supplierName') {
        return { ...prev, supplierName: value, supplierId: null };
      }
      return { ...prev, [field]: value };
    });
  };

  const selectSupplier = (supplier) => {
    setForm((prev) => ({
      ...prev,
      supplierId: supplier.id,
      supplierName: supplier.name || '',
    }));
    setShowSupplierSuggestions(false);
  };

  const updateLineField = (index, field, value) => {
    setForm((prev) => {
      const nextItems = prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const nextLine = {
          ...item,
          [field]: value,
        };

        if (field === 'quantity' || field === 'unitCost') {
          nextLine.totalCost = computeLineTotal(nextLine.quantity, nextLine.unitCost);
        }

        return nextLine;
      });
      return { ...prev, items: nextItems };
    });
  };

  const addLineItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyLineItem()] }));
  };

  const removeLineItem = (index) => {
    setForm((prev) => {
      const nextItems = prev.items.filter((_, itemIndex) => itemIndex !== index);
      return { ...prev, items: nextItems.length ? nextItems : [emptyLineItem()] };
    });
  };

  const handleLookupProduct = async (index) => {
    const row = form.items[index];
    const query = String(row.barcode || row.productName || '').trim();
    if (!query) return;

    try {
      const response = await api.get('/business-operations/goods-intake/lookup-products', {
        params: {
          q: query,
          ...scopeParams,
        },
      });
      const products = response.data?.products || [];
      if (!products.length) return;
      const normalizedQuery = query.toLowerCase();
      const exact = products.find((product) =>
        String(product.barcode || '').toLowerCase() === normalizedQuery
        || String(product.productCode || '').toLowerCase() === normalizedQuery
      );
      const chosen = exact || products[0];
      if (!chosen) return;

      setForm((prev) => ({
        ...prev,
        items: prev.items.map((item, itemIndex) => {
          if (itemIndex !== index) return item;
          const qty = normalizeNumberValue(item.quantity || 1);
          const cost = normalizeNumberValue(item.unitCost || chosen.sellingPrice || chosen.price || 0);
          return {
            ...item,
            barcode: item.barcode || chosen.barcode || chosen.productCode || '',
            productId: chosen.id || null,
            productName: chosen.name || item.productName || '',
            unitCost: item.unitCost !== '' ? item.unitCost : chosen.sellingPrice ?? chosen.price ?? 0,
            totalCost: Number((qty * cost).toFixed(2)),
          };
        }),
      }));
    } catch (_err) {
      // ignore lookup failures; user can still save manual rows
    }
  };

  const validateForm = () => {
    if (!form.supplierName || form.supplierName.trim() === '') {
      return 'Supplier name is required';
    }

    if (!form.purchaseDate) {
      return 'Purchase date is required';
    }

    if (!Array.isArray(form.items) || form.items.length === 0) {
      return 'At least one line item is required';
    }

    const hasValidLine = form.items.some((item) => item.productName && normalizeNumberValue(item.quantity) > 0);
    if (!hasValidLine) {
      return 'At least one line item with product name and quantity is required';
    }

    return '';
  };

  const submitForm = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      purchaseOrderRef: form.purchaseOrderRef || undefined,
      supplierId: form.supplierId || undefined,
      supplierName: form.supplierName,
      purchaseDate: form.purchaseDate,
      expectedDeliveryDate: form.expectedDeliveryDate || undefined,
      branchCode: form.branchCode || undefined,
      locationCode: form.locationCode || undefined,
      locationName: form.locationName || undefined,
      status: form.status || 'draft',
      notes: form.notes || undefined,
      items: form.items.map((item) => ({
        barcode: item.barcode || undefined,
        productId: item.productId || undefined,
        productName: item.productName || undefined,
        quantity: normalizeNumberValue(item.quantity),
        unitCost: normalizeNumberValue(item.unitCost),
        expiryDate: item.expiryDate || undefined,
        batchRef: item.batchRef || undefined,
        notes: item.notes || undefined,
      })),
    };

    try {
      if (formMode === 'create') {
        await api.post('/business-operations/purchase-orders', payload);
      } else {
        const orderId = form.id;
        await api.put(`/business-operations/purchase-orders/${orderId}`, payload);
      }
      await fetchPurchaseOrders();
      closeForm();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to save purchase order');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteOrder = async (orderId, orderRef) => {
    const confirmed = await boConfirm({
      title: 'Delete purchase order',
      message: `Delete purchase order ${orderRef || orderId}? This action cannot be undone.`,
      type: 'confirm',
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    setDeletingOrderId(orderId);
    try {
      await api.delete(`/business-operations/purchase-orders/${orderId}`);
      await fetchPurchaseOrders();
    } catch (err) {
      await boAlert({
        title: 'Delete failed',
        message: err.response?.data?.error || 'Unable to delete purchase order',
        type: 'error',
      });
    } finally {
      setDeletingOrderId(null);
    }
  };

  const exportToPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Business Operations Purchase Orders', 14, 16);
    doc.setFontSize(10);
    doc.text(`Scope: ${isAggregateMode ? 'All Locations' : (selectedLocationName || 'All Locations')}`, 14, 22);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, 28);

    const tableBody = purchaseOrders.map((order) => [
      String(order.purchaseOrderRef || ''),
      String(order.supplierName || order.supplier?.name || ''),
      formatDateInputValue(order.purchaseDate),
      formatDateInputValue(order.expectedDeliveryDate),
      String(order.branchCode || ''),
      String(order.locationCode || ''),
      String(order.status || ''),
      String(order.totalItems || 0),
      String(order.totalQuantity || 0),
      `MWK ${Number(order.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ]);

    autoTable(doc, {
      startY: 34,
      head: [[
        'Order Ref',
        'Supplier',
        'Purchase Date',
        'Expected Delivery',
        'Branch',
        'Location',
        'Status',
        'Lines',
        'Qty',
        'Total Cost',
      ]],
      body: tableBody,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [33, 56, 97] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    doc.save(`purchase-orders-${formatDateInputValue(new Date()) || 'export'}.pdf`);
  };

  const exportToCsv = () => {
    const rows = [
      ['Order Ref', 'Supplier', 'Purchase Date', 'Expected Delivery', 'Branch', 'Location', 'Status', 'Lines', 'Total Qty', 'Total Cost'],
      ...purchaseOrders.map((order) => [
        order.purchaseOrderRef || '',
        order.supplierName || order.supplier?.name || '',
        formatDateInputValue(order.purchaseDate),
        formatDateInputValue(order.expectedDeliveryDate),
        order.branchCode || '',
        order.locationCode || '',
        order.status || '',
        order.totalItems || 0,
        order.totalQuantity || 0,
        Number(order.totalCost || 0).toFixed(2),
      ]),
    ];
    const csvContent = rows.map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `purchase-orders-${formatDateInputValue(new Date()) || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderStatusBadge = (status) => {
    const colorMap = {
      draft: '#334155',
      submitted: '#0b5e4d',
      approved: '#115e59',
      completed: '#0f5132',
    };
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.25rem 0.5rem',
          borderRadius: '999px',
          backgroundColor: `${colorMap[status] || '#475569'}22`,
          color: colorMap[status] || '#475569',
          fontWeight: 700,
          fontSize: '0.78rem',
          textTransform: 'capitalize',
        }}
      >
        {status || 'draft'}
      </span>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Purchase Order Management</h2>
          <p style={{ margin: '0.4rem 0 0', color: '#475569' }}>
            Create supplier purchase orders, review drafts, and export order summaries for stock planning.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          <button type="button" onClick={openCreateForm} style={{ border: '1px solid #2563eb', backgroundColor: '#2563eb', color: '#fff', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}>
            New Purchase Order
          </button>
          <button type="button" onClick={exportToPdf} disabled={purchaseOrders.length === 0} style={{ border: '1px solid #64748b', backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: purchaseOrders.length === 0 ? 'not-allowed' : 'pointer' }}>
            Export PDF
          </button>
          <button type="button" onClick={exportToCsv} disabled={purchaseOrders.length === 0} style={{ border: '1px solid #64748b', backgroundColor: '#f8fafc', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: purchaseOrders.length === 0 ? 'not-allowed' : 'pointer' }}>
            Export CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search purchase orders, supplier, product"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            style={{ minWidth: '260px', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem', flex: '1 1 320px' }}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{ borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem', minWidth: '180px' }}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
            ))}
          </select>
          <button type="button" onClick={() => { setPage(1); fetchPurchaseOrders(); }} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', padding: '0.75rem 1rem', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '1rem' }}>
          {loading ? (
            <div style={{ padding: '2rem 0', textAlign: 'center', color: '#64748b' }}>Loading purchase orders…</div>
          ) : error ? (
            <div style={{ padding: '1.5rem', color: '#b91c1c' }}>{error}</div>
          ) : purchaseOrders.length === 0 ? (
            <div style={{ padding: '1.5rem', color: '#475569' }}>No purchase orders found for the selected scope.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '880px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Order Ref</th>
                    <th style={{ textAlign: 'left', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Supplier</th>
                    <th style={{ textAlign: 'left', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Purchase Date</th>
                    <th style={{ textAlign: 'left', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Delivery Date</th>
                    <th style={{ textAlign: 'left', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Location</th>
                    <th style={{ textAlign: 'right', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Lines</th>
                    <th style={{ textAlign: 'right', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Total Cost</th>
                    <th style={{ textAlign: 'left', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Status</th>
                    <th style={{ textAlign: 'center', padding: '0.9rem', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map((order) => (
                    <tr key={order.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.85rem' }}>{order.purchaseOrderRef}</td>
                      <td style={{ padding: '0.85rem' }}>{order.supplierName || order.supplier?.name || 'Unknown'}</td>
                      <td style={{ padding: '0.85rem' }}>{formatDateInputValue(order.purchaseDate)}</td>
                      <td style={{ padding: '0.85rem' }}>{formatDateInputValue(order.expectedDeliveryDate)}</td>
                      <td style={{ padding: '0.85rem' }}>{order.branchCode || ''}{order.locationCode ? ` / ${order.locationCode}` : ''}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right' }}>{order.totalItems || 0}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right' }}>{order.totalQuantity || 0}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'right' }}>MWK {Number(order.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td style={{ padding: '0.85rem' }}>{renderStatusBadge(order.status || 'draft')}</td>
                      <td style={{ padding: '0.85rem', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => openEditForm(order.id)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.45rem 0.85rem', cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteOrder(order.id, order.purchaseOrderRef)}
                          disabled={deletingOrderId === order.id}
                          style={{ border: '1px solid #fca5a5', backgroundColor: '#fef2f2', color: '#b91c1c', borderRadius: '10px', padding: '0.45rem 0.85rem', cursor: deletingOrderId === order.id ? 'not-allowed' : 'pointer' }}
                        >
                          {deletingOrderId === order.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pagination && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <span style={{ color: '#475569' }}>
            Page {pagination.page} of {pagination.totalPages} • {pagination.total} orders
          </span>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', padding: '0.65rem 0.9rem', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
              Previous
            </button>
            <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))} style={{ borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#fff', padding: '0.65rem 0.9rem', cursor: page >= pagination.totalPages ? 'not-allowed' : 'pointer' }}>
              Next
            </button>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, backgroundColor: 'rgba(15, 23, 42, 0.45)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div style={{ width: 'min(100%, 980px)', maxHeight: 'calc(100vh - 3rem)', overflowY: 'auto', backgroundColor: '#fff', borderRadius: '20px', boxShadow: '0 25px 75px rgba(15, 23, 42, 0.24)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>{formMode === 'create' ? 'Create Purchase Order' : 'Edit Purchase Order'}</h3>
                <p style={{ margin: '0.35rem 0 0', color: '#475569' }}>Capture supplier order details, expected delivery and line items.</p>
              </div>
              <button type="button" onClick={closeForm} style={{ border: 'none', background: 'transparent', color: '#334155', fontSize: '1.4rem', cursor: 'pointer' }}>&times;</button>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                <label style={{ display: 'grid', gap: '0.4rem', position: 'relative' }}>
                  Supplier Name
                  <input
                    type="text"
                    value={form.supplierName}
                    onChange={(event) => updateFormField('supplierName', event.target.value)}
                    onFocus={() => setShowSupplierSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSupplierSuggestions(false), 120)}
                    style={{ borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem' }}
                  />
                  {showSupplierSuggestions && supplierOptions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 160, maxHeight: '220px', overflowY: 'auto', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '0 0 12px 12px', boxShadow: '0 12px 30px rgba(15, 23, 42, 0.12)' }}>
                      {supplierLoading ? (
                        <div style={{ padding: '0.75rem 1rem', color: '#475569' }}>Searching suppliers…</div>
                      ) : supplierOptions.map((supplier) => (
                        <button
                          key={supplier.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSupplier(supplier)}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.85rem 1rem',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: '#111827',
                          }}
                        >
                          <strong>{supplier.name}</strong>
                          <div style={{ color: '#64748b', fontSize: '0.88rem', marginTop: '0.2rem' }}>{supplier.supplierCode || ''}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label style={{ display: 'grid', gap: '0.4rem' }}>
                  Purchase Date
                  <input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(event) => updateFormField('purchaseDate', event.target.value)}
                    style={{ borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.4rem' }}>
                  Expected Delivery
                  <input
                    type="date"
                    value={form.expectedDeliveryDate}
                    onChange={(event) => updateFormField('expectedDeliveryDate', event.target.value)}
                    style={{ borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '0.4rem' }}>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => updateFormField('status', event.target.value)}
                    style={{ borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem' }}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={{ display: 'grid', gap: '0.4rem' }}>
                Location Scope
                <input type="text" value={form.branchCode && form.locationCode ? `${form.branchCode} / ${form.locationCode}` : selectedLocationName || 'All Locations'} disabled style={{ borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem 1rem', backgroundColor: '#f8fafc' }} />
              </label>

              <label style={{ display: 'grid', gap: '0.4rem' }}>
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => updateFormField('notes', event.target.value)}
                  rows={3}
                  style={{ borderRadius: '12px', border: '1px solid #cbd5e1', padding: '0.75rem 1rem', resize: 'vertical' }}
                />
              </label>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0 }}>Order Lines</h4>
                  <button type="button" onClick={addLineItem} style={{ border: '1px solid #2563eb', backgroundColor: '#2563eb', color: '#fff', borderRadius: '999px', padding: '0.55rem 0.95rem', cursor: 'pointer' }}>
                    Add Line
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '920px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc' }}>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Product / Barcode</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Qty</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Unit Cost</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Total</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Expiry</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Batch</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>Notes</th>
                        <th style={{ padding: '0.85rem', borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((line, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="text"
                              placeholder="Barcode or product name"
                              value={line.barcode || line.productName}
                              onChange={(event) => updateLineField(index, 'productName', event.target.value)}
                              onBlur={() => handleLookupProduct(index)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.65rem 0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="number"
                              min="0"
                              value={line.quantity}
                              onChange={(event) => updateLineField(index, 'quantity', event.target.value)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.65rem 0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitCost}
                              onChange={(event) => updateLineField(index, 'unitCost', event.target.value)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.65rem 0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right' }}>MWK {Number(line.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="date"
                              value={line.expiryDate}
                              onChange={(event) => updateLineField(index, 'expiryDate', event.target.value)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.65rem 0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="text"
                              value={line.batchRef}
                              onChange={(event) => updateLineField(index, 'batchRef', event.target.value)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.65rem 0.85rem' }}
                            />
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <input
                              type="text"
                              value={line.notes}
                              onChange={(event) => updateLineField(index, 'notes', event.target.value)}
                              style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', padding: '0.65rem 0.85rem' }}
                            />
                          </td>
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
