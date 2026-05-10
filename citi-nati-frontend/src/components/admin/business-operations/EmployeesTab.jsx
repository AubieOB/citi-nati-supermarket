import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import { exportEmployeesPdf } from '../../../utils/businessOperationsPdfExports.js';
import { boAlert } from '../../../utils/boDialogBus.js';
import EmployeeSummaryCards from './EmployeeSummaryCards.jsx';
import EmployeesList from './EmployeesList.jsx';
import EmployeeDetailPanel from './EmployeeDetailPanel.jsx';
import EmployeeFormModal from './EmployeeFormModal.jsx';
import SalaryStructureFormModal from './SalaryStructureFormModal.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const buildFullName = (emp) =>
  [emp?.firstName, emp?.middleName, emp?.surname].filter(Boolean).join(' ');

const getApiError = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const buildScopeParams = ({
  selectedLocationId,
  selectedBranchCode,
  selectedLocationCode,
  isAggregateMode = false,
  extra = {},
}) => {
  const branchCode = normalizeCode(selectedBranchCode);
  const locationCode = normalizeCode(selectedLocationCode);

  const params = { ...extra };

  if (!isAggregateMode) {
    params.branchCode = branchCode || undefined;
    params.locationCode = locationCode || undefined;
    params.locationId = selectedLocationId || undefined;
  }

  if (isAggregateMode) {
    params.aggregate = true;
  }

  return params;
};

const EmployeesTab = ({
  refreshKey = 0,
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
  locations = [],
  isAggregateMode = false,
  onToggleAggregateMode = () => {},
}) => {
  const isAdminDarkTheme = typeof document !== 'undefined' && document.body.classList.contains('admin-theme-dark');

  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);
  const scopeLabel = selectedLocationName || (effectiveBranchCode && effectiveLocationCode ? `${effectiveBranchCode} / ${effectiveLocationCode}` : 'All Locations');

  const aggregateModeToggle = (
    <button
      type="button"
      onClick={onToggleAggregateMode}
      aria-pressed={isAggregateMode}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        border: '1px solid #cbd5e1',
        borderRadius: '999px',
        padding: '0.42rem 0.72rem',
        backgroundColor: isAggregateMode ? '#ecfdf5' : '#f8fafc',
        color: '#0f172a',
        cursor: 'pointer',
        fontSize: '0.82rem',
        fontWeight: 700,
      }}
    >
      <span>All Locations Mode</span>
      <span
        style={{
          width: '30px',
          height: '16px',
          borderRadius: '999px',
          backgroundColor: isAggregateMode ? '#10b981' : '#d1d5db',
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px',
        }}
      >
        <span
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            transform: isAggregateMode ? 'translateX(14px)' : 'translateX(0)',
            transition: 'transform 0.2s ease',
          }}
        />
      </span>
    </button>
  );

  const themedCardStyle = isAdminDarkTheme
    ? {
        ...cardStyle,
        backgroundColor: '#1e1e1e',
        border: '1px solid #333333',
        boxShadow: '0 16px 34px rgba(0, 0, 0, 0.35)',
      }
    : cardStyle;

  const [showFilters, setShowFilters] = useState(false);
  const [isEmployeesWorkspaceModalOpen, setIsEmployeesWorkspaceModalOpen] = useState(false);
  const [isEmployeesWorkspaceMaximized, setIsEmployeesWorkspaceMaximized] = useState(false);
  const [isEmployeeProfileModalOpen, setIsEmployeeProfileModalOpen] = useState(false);
  const [isEmployeeProfileModalMaximized, setIsEmployeeProfileModalMaximized] = useState(false);

  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, skip: 0, take: 20 });
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState('');
  const [pendingSelectId, setPendingSelectId] = useState(null);

  const [employeeModal, setEmployeeModal] = useState({ open: false, employee: null });
  const [salaryModal, setSalaryModal] = useState({ open: false, salaryStructure: null });
  const [empSaving, setEmpSaving] = useState(false);
  const [empSaveError, setEmpSaveError] = useState('');
  const [salSaving, setSalSaving] = useState(false);
  const [salSaveError, setSalSaveError] = useState('');
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const activeCount = employees.filter((e) => e.status === 'active').length;
  const inactiveCount = employees.filter((e) => e.status !== 'active').length;
  const departmentCount = new Set(employees.map((e) => e.department).filter(Boolean)).size;

  const scopeParams = useMemo(
    () =>
      buildScopeParams({
        selectedLocationId,
        selectedBranchCode: effectiveBranchCode,
        selectedLocationCode: effectiveLocationCode,
        isAggregateMode,
      }),
    [effectiveBranchCode, effectiveLocationCode, selectedLocationId, isAggregateMode]
  );

  const fetchEmployees = useCallback(async (pg = page) => {
    setListLoading(true);
    setListError('');

    try {
      const skip = (pg - 1) * 20;

      const params = buildScopeParams({
        selectedLocationId,
        selectedBranchCode: effectiveBranchCode,
        selectedLocationCode: effectiveLocationCode,
        extra: {
          skip,
          take: 20,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
        },
      });

      const res = await api.get('/business-operations/employees', { params });
      const payload = res.data;
      const list = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.employees)
          ? payload.employees
          : [];

      const total = payload?.pagination?.total ?? payload?.total ?? list.length;
      const take = payload?.pagination?.pageSize ?? 20;

      setEmployees(list);
      setPagination({ total, skip, take });
    } catch (err) {
      setListError(getApiError(err, 'Failed to load employees.'));
    } finally {
      setListLoading(false);
    }
  }, [
    effectiveBranchCode,
    effectiveLocationCode,
    page,
    search,
    selectedLocationId,
    statusFilter,
  ]);

  const fetchDetail = useCallback(async (id) => {
    if (!id) return;

    setDetailLoading(true);
    setDetailError('');
    setSalaryLoading(true);
    setSalaryError('');

    try {
      const [detailRes, salaryRes] = await Promise.all([
        api.get(`/business-operations/employees/${id}`),
        api.get(`/business-operations/employees/${id}/salary-structures`),
      ]);

      setDetail(detailRes?.data?.data ?? detailRes?.data ?? null);
      setSalaryHistory(Array.isArray(salaryRes?.data?.data) ? salaryRes.data.data : []);
    } catch (err) {
      setDetailError(getApiError(err, 'Failed to load employee details.'));
    } finally {
      setDetailLoading(false);
      setSalaryLoading(false);
    }
  }, []);

  const refreshData = useCallback(async (pg = page) => {
    await fetchEmployees(pg);
  }, [fetchEmployees, page]);

  useEffect(() => {
    fetchEmployees(1);
    setPage(1);
  }, [search, statusFilter, effectiveBranchCode, effectiveLocationCode, selectedLocationId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (page === 1) return;
    fetchEmployees(page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedEmployeeId(null);
    setDetail(null);
    setSalaryHistory([]);
    setPendingSelectId(null);
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationId]);

  useEffect(() => {
    if (listLoading) return;

    if (pendingSelectId) {
      const found = employees.find((e) => e.id === pendingSelectId);
      if (found) {
        setSelectedEmployeeId(pendingSelectId);
        fetchDetail(pendingSelectId);
        setPendingSelectId(null);
        return;
      }
    }

    if (!selectedEmployeeId && employees.length > 0) {
      const first = employees[0];
      setSelectedEmployeeId(first.id);
      fetchDetail(first.id);
    }
  }, [employees, fetchDetail, listLoading, pendingSelectId, selectedEmployeeId]);

  const handleSelectEmployee = (emp) => {
    setSelectedEmployeeId(emp.id);
    setDetail(null);
    setSalaryHistory([]);
    fetchDetail(emp.id);
  };

  const handleAddEmployee = () => {
    setEmpSaveError('');
    setEmployeeModal({ open: true, employee: null });
  };

  const openEmployeeProfileModal = () => {
    if (!selectedEmployeeId) return;
    setIsEmployeeProfileModalMaximized(false);
    setIsEmployeeProfileModalOpen(true);
  };

  const handleEditEmployee = () => {
    if (!detail) return;
    setEmpSaveError('');
    setEmployeeModal({ open: true, employee: detail });
  };

  const handleDeleteEmployee = async (emp) => {
    try {
      await api.delete(`/business-operations/employees/${emp.id}`);
      if (selectedEmployeeId === emp.id) setSelectedEmployeeId(null);
      await refreshData(page);
    } catch (err) {
      await boAlert({
        title: 'Delete Failed',
        message: err.response?.data?.error || 'Failed to delete employee',
        type: 'error',
      });
    }
  };

  const handleEmployeeSubmit = async (payload) => {
    setEmpSaving(true);
    setEmpSaveError('');

    try {
      const scopedPayload = {
        ...payload,
        branchCode: payload.branchCode || effectiveBranchCode || undefined,
        locationCode: payload.locationCode || effectiveLocationCode || undefined,
        locationName: payload.locationName || selectedLocationName || scopeLabel || undefined,
        locationId: payload.locationId ?? selectedLocationId ?? undefined,
      };

      let saved;

      if (employeeModal.employee) {
        const res = await api.put(`/business-operations/employees/${employeeModal.employee.id}`, scopedPayload);
        saved = res.data;
      } else {
        const res = await api.post('/business-operations/employees', scopedPayload);
        saved = res.data;
      }

      setEmployeeModal({ open: false, employee: null });

      const id = saved?.data?.id ?? saved?.id ?? saved?.employee?.id;
      if (id) setPendingSelectId(id);

      await refreshData(1);
      setPage(1);

      if (employeeModal.employee && id) {
        fetchDetail(id);
      }
    } catch (err) {
      setEmpSaveError(getApiError(err, 'Failed to save employee.'));
    } finally {
      setEmpSaving(false);
    }
  };

  const handleAddSalary = () => {
    setSalSaveError('');
    setSalaryModal({ open: true, salaryStructure: null });
  };

  const handleEditSalary = (ss) => {
    setSalSaveError('');
    setSalaryModal({ open: true, salaryStructure: ss });
  };

  const handleSalarySubmit = async (payload) => {
    if (!selectedEmployeeId) return;

    setSalSaving(true);
    setSalSaveError('');

    try {
      if (salaryModal.salaryStructure) {
        await api.put(`/business-operations/employees/salary-structures/${salaryModal.salaryStructure.id}`, payload);
      } else {
        await api.post(`/business-operations/employees/${selectedEmployeeId}/salary-structures`, payload);
      }

      setSalaryModal({ open: false, salaryStructure: null });
      await fetchDetail(selectedEmployeeId);
      await fetchEmployees(page);
    } catch (err) {
      setSalSaveError(getApiError(err, 'Failed to save salary structure.'));
    } finally {
      setSalSaving(false);
    }
  };

  const selectedEmployee = detail || employees.find((e) => e.id === selectedEmployeeId) || null;
  const employeeFullName = selectedEmployee ? buildFullName(selectedEmployee) : '';

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      if (format === 'pdf') {
        exportEmployeesPdf({
          employees,
          pagination,
          search,
          statusFilter,
          selectedLocationId,
          selectedBranchCode: effectiveBranchCode,
          selectedLocationCode: effectiveLocationCode,
          selectedLocationName: scopeLabel,
        });
        return;
      }

      await downloadBusinessReport({
        format,
        module: 'employees',
        type: 'list',
        filters: {
          search: search || undefined,
          status: statusFilter || undefined,
          ...scopeParams,
        },
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  };

  useEffect(() => {
    if (!isEmployeesWorkspaceModalOpen || employeeModal.open || salaryModal.open || isEmployeeProfileModalOpen) return;

    const handler = (event) => {
      if (event.key === 'Escape') {
        setIsEmployeesWorkspaceModalOpen(false);
        setIsEmployeesWorkspaceMaximized(false);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEmployeesWorkspaceModalOpen, employeeModal.open, salaryModal.open, isEmployeeProfileModalOpen]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.28rem' }}>
            <i className="fas fa-users" style={{ color: '#5B4B8A', marginRight: '0.55rem' }} />
            Employees
          </h2>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            Scope: {scopeLabel}
          </p>
        </div>
      </div>

      <EmployeeSummaryCards
        totalEmployees={pagination.total || employees.length}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        departmentCount={departmentCount}
      />

      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Employee Workspaces</strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              title="Click to open"
              onClick={() => {
                setIsEmployeesWorkspaceMaximized(false);
                setIsEmployeesWorkspaceModalOpen(true);
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-2px)';
                event.currentTarget.style.boxShadow = '0 12px 24px rgba(15, 23, 42, 0.12)';
                event.currentTarget.style.borderColor = '#cbd5e1';
                event.currentTarget.style.backgroundColor = '#f8fafc';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
                event.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.04)';
                event.currentTarget.style.borderColor = '#e2e8f0';
                event.currentTarget.style.backgroundColor = '#fff';
              }}
              style={{
                border: '1px solid #e2e8f0',
                backgroundColor: '#fff',
                borderRadius: '14px',
                padding: '0.95rem 1rem',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'grid',
                gap: '0.42rem',
                boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
                transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#ede9fe', color: '#6d28d9' }}>
                <i className="fas fa-users" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Employee Register Workspace</span>
              <span style={{ color: '#64748b', fontSize: '0.82rem', lineHeight: 1.45 }}>Add employees, update profiles, and review salary records.</span>
            </button>
          </div>
        </div>
      </div>

      {isEmployeesWorkspaceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isEmployeesWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isEmployeesWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1320px, 98vw)', height: isEmployeesWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', padding: '1rem', borderRadius: isEmployeesWorkspaceMaximized ? '10px' : '18px', background: isAdminDarkTheme ? 'linear-gradient(180deg, #1e1e1e 0%, #181818 32%)' : 'linear-gradient(180deg, #f8fafc 0%, #ffffff 30%)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ backgroundColor: isAdminDarkTheme ? '#181818' : '#fff', margin: '-1rem -1rem 0.85rem', padding: '1rem 1rem 0.9rem', borderBottom: isAdminDarkTheme ? '1px solid #333333' : '1px solid #e2e8f0', boxShadow: isAdminDarkTheme ? '0 14px 26px rgba(0, 0, 0, 0.28)' : '0 10px 24px rgba(15, 23, 42, 0.05)' }}>
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: '#0f172a', fontSize: '1rem' }}>Employees Workspace</strong>
                    <div style={{ color: '#64748b', fontSize: '0.82rem', marginTop: '0.25rem' }}>
                      Scope: {scopeLabel}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {aggregateModeToggle}
                    <button type="button" onClick={handleAddEmployee} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.86rem' }}>
                      <i className="fas fa-plus" style={{ marginRight: '0.4rem' }} />Add Employee
                    </button>

                    <button type="button" onClick={() => setShowFilters((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}>
                      <i className="fas fa-sliders" style={{ marginRight: '0.42rem' }} />
                      {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </button>

                    <button type="button" onClick={() => refreshData()} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.58rem 0.9rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                      <i className="fas fa-sync-alt" style={{ marginRight: '0.4rem' }} />Refresh
                    </button>

                    <button type="button" onClick={() => handleExport('pdf')} disabled={exportingExcel || exportingPdf} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.58rem 0.9rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                      <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.4rem' }} />Export PDF
                    </button>

                    <button type="button" onClick={() => handleExport('excel')} disabled={exportingExcel || exportingPdf} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.58rem 0.9rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                      <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.4rem' }} />Export Excel
                    </button>

                    <button type="button" title={isEmployeesWorkspaceMaximized ? 'Restore' : 'Maximize'} onClick={() => setIsEmployeesWorkspaceMaximized((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                      <i className={`fas ${isEmployeesWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                    </button>

                    <button type="button" title="Close" onClick={() => { setIsEmployeesWorkspaceModalOpen(false); setIsEmployeesWorkspaceMaximized(false); }} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                      <i className="fas fa-times" />
                    </button>
                  </div>
                </div>

                {showFilters && (
                  <div style={{ ...cardStyle, padding: '0.82rem 0.9rem', borderRadius: '12px', boxShadow: 'none', backgroundColor: '#f8fafc' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: '1 1 220px' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', fontSize: '0.88rem' }} />
                        <input type="text" placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '0.72rem 0.9rem 0.72rem 2.2rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }} />
                      </div>

                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.72rem 0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc', cursor: 'pointer', minWidth: '130px' }}>
                        <option value="">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="terminated">Terminated</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.85rem' }}>
              <div style={{ ...themedCardStyle, overflow: 'hidden', borderRadius: '16px' }}>
                <div style={{ padding: '0.75rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: '0.2rem' }}>
                    <strong style={{ color: '#0f172a' }}>Employee Register</strong>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                      Selected: {selectedEmployee ? buildFullName(selectedEmployee) : 'None'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={openEmployeeProfileModal} disabled={!selectedEmployeeId} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 700, cursor: selectedEmployeeId ? 'pointer' : 'not-allowed', opacity: selectedEmployeeId ? 1 : 0.65 }}>
                      Open Employee Profile
                    </button>

                    <button type="button" onClick={handleAddSalary} disabled={!selectedEmployeeId} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 700, cursor: selectedEmployeeId ? 'pointer' : 'not-allowed', opacity: selectedEmployeeId ? 1 : 0.65 }}>
                      Add Salary Structure
                    </button>
                  </div>
                </div>

                <div style={{ borderBottom: '1px solid #e2e8f0', padding: '0.52rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                    Visible: {Number(employees.length || 0).toLocaleString('en-US')} employees
                  </span>
                  <span style={{ color: '#334155', fontSize: '0.78rem', fontWeight: 700 }}>
                    Total: {Number(pagination.total || employees.length || 0).toLocaleString('en-US')}
                  </span>
                </div>

                <EmployeesList
                  employees={employees}
                  loading={listLoading}
                  error={listError}
                  pagination={pagination}
                  page={page}
                  onPageChange={(pg) => setPage(pg)}
                  selectedEmployeeId={selectedEmployeeId}
                  onSelectEmployee={handleSelectEmployee}
                  onEditEmployee={handleEditEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isEmployeeProfileModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', zIndex: 180, display: 'grid', placeItems: 'center', padding: isEmployeeProfileModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...themedCardStyle, width: isEmployeeProfileModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1100px, 96vw)', height: isEmployeeProfileModalMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isEmployeeProfileModalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '0.8rem 1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: isAdminDarkTheme ? '#181818' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: isAdminDarkTheme ? '#f8fafc' : '#0f172a' }}>Employee Profile</h3>
                <div style={{ color: '#64748b', fontSize: '0.84rem' }}>
                  {selectedEmployee ? `${buildFullName(selectedEmployee)}${selectedEmployee.employeeNo ? ` · ${selectedEmployee.employeeNo}` : ''}` : 'No employee selected'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {aggregateModeToggle}
                <button type="button" onClick={handleEditEmployee} disabled={!selectedEmployee} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.82rem', fontWeight: 700, cursor: selectedEmployee ? 'pointer' : 'not-allowed', opacity: selectedEmployee ? 1 : 0.65 }}>
                  Edit Employee
                </button>

                <button type="button" onClick={handleAddSalary} disabled={!selectedEmployeeId} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.55rem 0.82rem', fontWeight: 700, cursor: selectedEmployeeId ? 'pointer' : 'not-allowed', opacity: selectedEmployeeId ? 1 : 0.65 }}>
                  Add Salary Structure
                </button>

                <button type="button" title={isEmployeeProfileModalMaximized ? 'Restore' : 'Maximize'} onClick={() => setIsEmployeeProfileModalMaximized((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                  <i className={`fas ${isEmployeeProfileModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>

                <button type="button" title="Close" onClick={() => { setIsEmployeeProfileModalOpen(false); setIsEmployeeProfileModalMaximized(false); }} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.9rem' }}>
              <EmployeeDetailPanel
                employee={selectedEmployee}
                salaryHistory={salaryHistory}
                salaryLoading={salaryLoading}
                salaryError={salaryError}
                detailLoading={detailLoading}
                detailError={detailError}
                onEditEmployee={handleEditEmployee}
                onAddSalary={handleAddSalary}
                onEditSalary={handleEditSalary}
                onAddEmployee={handleAddEmployee}
              />
            </div>
          </div>
        </div>
      )}

      <EmployeeFormModal
        isOpen={employeeModal.open}
        employee={employeeModal.employee}
        selectedLocationId={selectedLocationId}
        selectedBranchCode={effectiveBranchCode}
        selectedLocationCode={effectiveLocationCode}
        selectedLocationName={scopeLabel}
        locations={locations}
        saving={empSaving}
        error={empSaveError}
        onClose={() => setEmployeeModal({ open: false, employee: null })}
        onSubmit={handleEmployeeSubmit}
      />

      <SalaryStructureFormModal
        isOpen={salaryModal.open}
        salaryStructure={salaryModal.salaryStructure}
        employeeId={selectedEmployeeId}
        employeeName={employeeFullName}
        saving={salSaving}
        error={salSaveError}
        onClose={() => setSalaryModal({ open: false, salaryStructure: null })}
        onSubmit={handleSalarySubmit}
      />
    </div>
  );
};

export default EmployeesTab;