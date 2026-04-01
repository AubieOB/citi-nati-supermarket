import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport } from '../../../utils/exportService.js';
import PayrollPeriodsList from './PayrollPeriodsList.jsx';
import PayrollPeriodFormModal from './PayrollPeriodFormModal.jsx';
import PayrollPeriodDetailPanel from './PayrollPeriodDetailPanel.jsx';
import PayrollEntryFormModal from './PayrollEntryFormModal.jsx';
import PayrollSupportDrawer from './PayrollSupportDrawer.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const getApiError = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

const reduceSummary = (entries = []) => entries.reduce((acc, entry) => {
  acc.entryCount += 1;
  acc.totalGrossPay += Number(entry.grossPay || 0);
  acc.totalDeductions += Number(entry.totalDeductions || 0);
  acc.totalNetPay += Number(entry.netPay || 0);
  acc.totalOvertimeAmount += Number(entry.overtimeAmount || 0);
  acc.totalLoanDeductionAmount += Number(entry.loanDeductionAmount || 0);
  return acc;
}, {
  entryCount: 0,
  totalGrossPay: 0,
  totalDeductions: 0,
  totalNetPay: 0,
  totalOvertimeAmount: 0,
  totalLoanDeductionAmount: 0,
});

const PayrollTab = ({ refreshKey = 0, selectedLocationId = null, locations = [] }) => {
  const [showManagementPanel, setShowManagementPanel] = useState(false);
  const [showPeriodFilters, setShowPeriodFilters] = useState(false);
  const [employees, setEmployees] = useState([]);

  const [periodFilters, setPeriodFilters] = useState({
    search: '',
    status: '',
    payrollMode: '',
  });

  const [periods, setPeriods] = useState([]);
  const [periodPage, setPeriodPage] = useState(1);
  const [periodsPagination, setPeriodsPagination] = useState(null);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsError, setPeriodsError] = useState('');

  const [selectedPeriodId, setSelectedPeriodId] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [pendingSelectPeriodId, setPendingSelectPeriodId] = useState(null);

  const [entries, setEntries] = useState([]);
  const [entriesPage, setEntriesPage] = useState(1);
  const [entriesPagination, setEntriesPagination] = useState(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState('');

  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [supportData, setSupportData] = useState(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportDrawer, setSupportDrawer] = useState({
    open: false,
    employeeName: '',
    loading: false,
    error: '',
    loans: [],
    terminations: [],
    reengagements: [],
  });

  const [periodModal, setPeriodModal] = useState({ open: false, period: null });
  const [entryModal, setEntryModal] = useState({ open: false, entry: null });
  const [periodSaving, setPeriodSaving] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [periodSaveError, setPeriodSaveError] = useState('');
  const [entrySaveError, setEntrySaveError] = useState('');
  const [entryEmployeeSalary, setEntryEmployeeSalary] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const hasActivePeriodFilters = Boolean(periodFilters.search || periodFilters.status || periodFilters.payrollMode);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get('/business-operations/employees', {
        params: { page: 1, pageSize: 200, sortBy: 'createdAt', sortOrder: 'desc', locationId: selectedLocationId || undefined },
      });
      setEmployees(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch (_err) {
      setEmployees([]);
    }
  }, [selectedLocationId]);

  const fetchPayrollPeriods = useCallback(async (pg = periodPage) => {
    setPeriodsLoading(true);
    setPeriodsError('');
    try {
      const params = {
        page: pg,
        pageSize: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };
      if (periodFilters.search.trim()) params.search = periodFilters.search.trim();
      if (periodFilters.status) params.status = periodFilters.status;
      if (periodFilters.payrollMode) params.payrollMode = periodFilters.payrollMode;
      if (selectedLocationId) params.locationId = selectedLocationId;

      const res = await api.get('/business-operations/payroll/periods', { params });
      const data = Array.isArray(res?.data?.data) ? res.data.data : [];
      setPeriods(data);
      setPeriodsPagination(res?.data?.pagination || null);
    } catch (err) {
      setPeriods([]);
      setPeriodsPagination(null);
      setPeriodsError(getApiError(err, 'Failed to load payroll periods.'));
    } finally {
      setPeriodsLoading(false);
    }
  }, [periodFilters.payrollMode, periodFilters.search, periodFilters.status, periodPage, selectedLocationId]);

  const fetchPeriodDetail = useCallback(async (periodId) => {
    if (!periodId) {
      setSelectedPeriod(null);
      return;
    }
    try {
      const res = await api.get(`/business-operations/payroll/periods/${periodId}`);
      const detail = res?.data?.data || null;
      const fromList = periods.find((p) => p.id === periodId);
      setSelectedPeriod(fromList ? { ...detail, ...fromList } : detail);
    } catch (_err) {
      const fromList = periods.find((p) => p.id === periodId);
      setSelectedPeriod(fromList || null);
    }
  }, [periods]);

  const fetchPayrollEntries = useCallback(async (periodId, pg = entriesPage) => {
    if (!periodId) {
      setEntries([]);
      setEntriesPagination(null);
      return;
    }

    setEntriesLoading(true);
    setEntriesError('');
    try {
      const res = await api.get('/business-operations/payroll/entries', {
        params: {
          payrollPeriodId: periodId,
          page: pg,
          pageSize: 12,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          locationId: selectedLocationId || undefined,
        },
      });

      const data = Array.isArray(res?.data?.data) ? res.data.data : [];
      setEntries(data);
      setEntriesPagination(res?.data?.pagination || null);
      if (selectedEntryId && !data.some((entry) => entry.id === selectedEntryId)) {
        setSelectedEntryId(null);
        setSupportData(null);
      }
    } catch (err) {
      setEntries([]);
      setEntriesPagination(null);
      setEntriesError(getApiError(err, 'Failed to load payroll entries.'));
    } finally {
      setEntriesLoading(false);
    }
  }, [entriesPage, selectedEntryId, selectedLocationId]);

  const fetchSupportData = useCallback(async (employeeId) => {
    if (!employeeId) {
      setSupportData(null);
      return;
    }
    setSupportLoading(true);
    try {
      const [loansRes, terminationsRes, reengagementsRes] = await Promise.all([
        api.get('/business-operations/payroll/loans', { params: { employeeId, page: 1, pageSize: 1 } }),
        api.get('/business-operations/payroll/terminations', { params: { employeeId, page: 1, pageSize: 1 } }),
        api.get('/business-operations/payroll/reengagements', { params: { employeeId, page: 1, pageSize: 1 } }),
      ]);

      setSupportData({
        loansTotal: loansRes?.data?.pagination?.total || 0,
        terminationsTotal: terminationsRes?.data?.pagination?.total || 0,
        reengagementsTotal: reengagementsRes?.data?.pagination?.total || 0,
      });
    } catch (_err) {
      setSupportData({ loansTotal: 0, terminationsTotal: 0, reengagementsTotal: 0 });
    } finally {
      setSupportLoading(false);
    }
  }, []);

  const openSupportDrawerForEntry = useCallback(async (entry) => {
    if (!entry?.employeeId) return;

    const employeeName = [entry?.employee?.firstName, entry?.employee?.surname].filter(Boolean).join(' ') || 'Selected Employee';

    setSupportDrawer({
      open: true,
      employeeName,
      loading: true,
      error: '',
      loans: [],
      terminations: [],
      reengagements: [],
    });

    try {
      const [loansRes, terminationsRes, reengagementsRes] = await Promise.all([
        api.get('/business-operations/payroll/loans', {
          params: { employeeId: entry.employeeId, page: 1, pageSize: 25, sortBy: 'createdAt', sortOrder: 'desc' },
        }),
        api.get('/business-operations/payroll/terminations', {
          params: { employeeId: entry.employeeId, page: 1, pageSize: 25, sortBy: 'terminationDate', sortOrder: 'desc' },
        }),
        api.get('/business-operations/payroll/reengagements', {
          params: { employeeId: entry.employeeId, page: 1, pageSize: 25, sortBy: 'effectiveDate', sortOrder: 'desc' },
        }),
      ]);

      setSupportDrawer({
        open: true,
        employeeName,
        loading: false,
        error: '',
        loans: Array.isArray(loansRes?.data?.data) ? loansRes.data.data : [],
        terminations: Array.isArray(terminationsRes?.data?.data) ? terminationsRes.data.data : [],
        reengagements: Array.isArray(reengagementsRes?.data?.data) ? reengagementsRes.data.data : [],
      });
    } catch (err) {
      setSupportDrawer({
        open: true,
        employeeName,
        loading: false,
        error: getApiError(err, 'Failed to load payroll support records.'),
        loans: [],
        terminations: [],
        reengagements: [],
      });
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await fetchPayrollPeriods(periodPage);
    if (selectedPeriodId) {
      await fetchPeriodDetail(selectedPeriodId);
      await fetchPayrollEntries(selectedPeriodId, entriesPage);
    }
  }, [entriesPage, fetchPayrollEntries, fetchPayrollPeriods, fetchPeriodDetail, periodPage, selectedPeriodId]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, refreshKey]);

  useEffect(() => {
    fetchPayrollPeriods(periodPage);
  }, [fetchPayrollPeriods, periodPage, refreshKey]);

  useEffect(() => {
    setPeriodPage(1);
  }, [periodFilters.payrollMode, periodFilters.search, periodFilters.status, selectedLocationId]);

  useEffect(() => {
    if (periodsLoading) return;
    if (pendingSelectPeriodId) {
      const target = periods.find((period) => period.id === pendingSelectPeriodId);
      if (target) {
        setSelectedPeriodId(target.id);
        setSelectedPeriod(target);
        setPendingSelectPeriodId(null);
        return;
      }
    }

    if (!selectedPeriodId && periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
      setSelectedPeriod(periods[0]);
      return;
    }

    if (selectedPeriodId) {
      const fromList = periods.find((period) => period.id === selectedPeriodId);
      if (fromList) setSelectedPeriod((prev) => ({ ...prev, ...fromList }));
    }
  }, [pendingSelectPeriodId, periods, periodsLoading, selectedPeriodId]);

  useEffect(() => {
    if (!selectedPeriodId) return;
    fetchPeriodDetail(selectedPeriodId);
    fetchPayrollEntries(selectedPeriodId, entriesPage);
  }, [entriesPage, fetchPayrollEntries, fetchPeriodDetail, selectedPeriodId]);

  const summary = useMemo(() => {
    const fallback = reduceSummary(entries);
    return {
      entryCount: selectedPeriod?.entryCount ?? entriesPagination?.total ?? fallback.entryCount,
      totalGrossPay: selectedPeriod?.totalGrossPay ?? fallback.totalGrossPay,
      totalDeductions: selectedPeriod?.totalDeductions ?? fallback.totalDeductions,
      totalNetPay: selectedPeriod?.totalNetPay ?? fallback.totalNetPay,
      totalOvertimeAmount: selectedPeriod?.totalOvertimeAmount ?? fallback.totalOvertimeAmount,
      totalLoanDeductionAmount: selectedPeriod?.totalLoanDeductionAmount ?? fallback.totalLoanDeductionAmount,
    };
  }, [entries, entriesPagination?.total, selectedPeriod]);

  const entryEmployees = useMemo(() => {
    const periodLocationId = selectedPeriod?.locationId ? Number(selectedPeriod.locationId) : null;
    const targetLocationId = periodLocationId || selectedLocationId || null;
    if (!targetLocationId) return employees;
    return employees.filter((employee) => Number(employee.locationId) === Number(targetLocationId));
  }, [employees, selectedLocationId, selectedPeriod?.locationId]);

  const handleCreatePeriod = () => {
    setPeriodSaveError('');
    setPeriodModal({ open: true, period: null });
  };

  const handleEditPeriod = (period) => {
    setPeriodSaveError('');
    setPeriodModal({ open: true, period });
  };

  const handlePeriodSubmit = async (payload) => {
    setPeriodSaving(true);
    setPeriodSaveError('');
    try {
      let saved;
      if (periodModal.period) {
        const res = await api.put(`/business-operations/payroll/periods/${periodModal.period.id}`, { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined });
        saved = res?.data?.data;
      } else {
        const res = await api.post('/business-operations/payroll/periods', { ...payload, locationId: payload.locationId ?? selectedLocationId ?? undefined });
        saved = res?.data?.data;
      }

      setPeriodModal({ open: false, period: null });
      if (saved?.id) {
        setPendingSelectPeriodId(saved.id);
      }
      setPeriodPage(1);
      await fetchPayrollPeriods(1);
      if (saved?.id) {
        setSelectedPeriodId(saved.id);
      }
    } catch (err) {
      setPeriodSaveError(getApiError(err, 'Failed to save payroll period.'));
    } finally {
      setPeriodSaving(false);
    }
  };

  const handleAddEntry = () => {
    setEntrySaveError('');
    setEntryEmployeeSalary(null);
    setEntryModal({ open: true, entry: null });
  };

  const handleEditEntry = (entry) => {
    if (!entry) return;
    setEntrySaveError('');
    setEntryEmployeeSalary(null);
    setEntryModal({ open: true, entry });
  };

  const handleEntryEmployeeChange = async (employeeId) => {
    try {
      const res = await api.get(`/business-operations/employees/${employeeId}/salary/current`);
      setEntryEmployeeSalary(res?.data?.data || null);
    } catch (_err) {
      setEntryEmployeeSalary(null);
    }
  };

  const handleEntrySubmit = async (payload) => {
    if (!selectedPeriodId) return;
    setEntrySaving(true);
    setEntrySaveError('');
    try {
      if (entryModal.entry) {
        await api.put(`/business-operations/payroll/entries/${entryModal.entry.id}`, payload);
      } else {
        await api.post('/business-operations/payroll/entries', payload);
      }

      setEntryModal({ open: false, entry: null });
      await fetchPayrollEntries(selectedPeriodId, entriesPage);
      await fetchPayrollPeriods(periodPage);
      await fetchPeriodDetail(selectedPeriodId);
    } catch (err) {
      setEntrySaveError(getApiError(err, 'Failed to save payroll entry.'));
    } finally {
      setEntrySaving(false);
    }
  };

  const handleSelectEntry = (entry) => {
    setSelectedEntryId(entry.id);
    fetchSupportData(entry.employeeId);
  };

  const handleOpenSupportDrawer = () => {
    const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
    if (!selectedEntry) return;
    openSupportDrawerForEntry(selectedEntry);
  };

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      await downloadBusinessReport({
        format,
        module: 'payroll',
        type: 'period',
        filters: {
          payrollPeriodId: selectedPeriodId,
          search: periodFilters.search,
          status: periodFilters.status,
          payrollMode: periodFilters.payrollMode,
          locationId: selectedLocationId,
        },
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      window.alert(message);
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '0.7rem 0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowManagementPanel((prev) => !prev)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: showManagementPanel ? '#0f172a' : '#fff', color: showManagementPanel ? '#fff' : '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
          >
            <i className={`fas ${showManagementPanel ? 'fa-chevron-up' : 'fa-layer-group'}`} style={{ marginRight: '0.42rem' }}></i>
            {showManagementPanel ? 'Hide Payroll Management' : 'Show Payroll Management'}
          </button>
          <button
            type="button"
            onClick={() => setShowPeriodFilters((prev) => !prev)}
            style={{ border: '1px solid #cbd5e1', backgroundColor: showPeriodFilters ? '#0f172a' : '#fff', color: showPeriodFilters ? '#fff' : '#0f172a', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, fontSize: '0.86rem', cursor: 'pointer' }}
          >
            <i className={`fas ${showPeriodFilters ? 'fa-chevron-up' : 'fa-sliders'}`} style={{ marginRight: '0.42rem' }}></i>
            {showPeriodFilters ? 'Hide Period Filters' : 'Show Period Filters'}
          </button>
        </div>
        <div style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
          {showPeriodFilters ? 'Period filters are visible.' : `Period filters hidden${hasActivePeriodFilters ? ' • active filters applied' : ''}.`}
        </div>
      </div>

      {showManagementPanel && (
      <div style={{ ...cardStyle, padding: '1.1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.14rem' }}>Payroll Management</h3>
          <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Manage payroll periods, employee entries, deductions, allowances, and payroll support records in one structured workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCreatePeriod}
            style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.64rem 0.95rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
          >
            <i className="fas fa-plus" style={{ marginRight: '0.38rem' }}></i>Create Payroll Period
          </button>
          <button
            type="button"
            onClick={refreshAll}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.64rem 0.95rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
          >
            <i className="fas fa-rotate-right" style={{ marginRight: '0.38rem' }}></i>Refresh
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={exportingExcel || exportingPdf}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.64rem 0.95rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
          >
            <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.38rem' }}></i>Export PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('excel')}
            disabled={exportingExcel || exportingPdf}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.64rem 0.95rem', fontWeight: 700, cursor: exportingExcel || exportingPdf ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
          >
            <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.38rem' }}></i>Export Excel
          </button>
        </div>
      </div>
      )}

      {showPeriodFilters && (
      <div style={{ ...cardStyle, padding: '0.9rem 1rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 250px' }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', fontSize: '0.85rem' }}></i>
          <input
            type="text"
            placeholder="Search periods by description, mode, status, or creator"
            value={periodFilters.search}
            onChange={(event) => setPeriodFilters((prev) => ({ ...prev, search: event.target.value }))}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.72rem 0.84rem 0.72rem 2.2rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
          />
        </div>

        <select
          value={periodFilters.status}
          onChange={(event) => setPeriodFilters((prev) => ({ ...prev, status: event.target.value }))}
          style={{ padding: '0.72rem 0.84rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc', minWidth: '120px' }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="review">Review</option>
          <option value="approved">Approved</option>
          <option value="finalized">Finalized</option>
        </select>

        <select
          value={periodFilters.payrollMode}
          onChange={(event) => setPeriodFilters((prev) => ({ ...prev, payrollMode: event.target.value }))}
          style={{ padding: '0.72rem 0.84rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc', minWidth: '120px' }}
        >
          <option value="">All Modes</option>
          <option value="mid_month">Mid Month</option>
          <option value="full_month">Full Month</option>
        </select>

        <button
          type="button"
          onClick={() => setPeriodFilters({ search: '', status: '', payrollMode: '' })}
          style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.68rem 0.88rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}
        >
          Clear
        </button>
      </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', alignItems: 'start' }}>
        <PayrollPeriodsList
          periods={periods}
          loading={periodsLoading}
          error={periodsError}
          page={periodPage}
          pagination={periodsPagination}
          selectedPeriodId={selectedPeriodId}
          onPageChange={setPeriodPage}
          onSelectPeriod={(period) => {
            setSelectedPeriodId(period.id);
            setSelectedPeriod(period);
            setEntriesPage(1);
            setSelectedEntryId(null);
            setSupportData(null);
            setSupportDrawer((prev) => ({ ...prev, open: false, error: '', loans: [], terminations: [], reengagements: [] }));
          }}
          onEditPeriod={handleEditPeriod}
          onCreatePeriod={handleCreatePeriod}
        />

        <PayrollPeriodDetailPanel
          period={selectedPeriod}
          summary={summary}
          entries={entries}
          entriesLoading={entriesLoading}
          entriesError={entriesError}
          entriesPage={entriesPage}
          entriesPagination={entriesPagination}
          selectedEntryId={selectedEntryId}
          supportData={supportData}
          supportLoading={supportLoading}
          onSelectEntry={handleSelectEntry}
          onEditEntry={handleEditEntry}
          onPageChange={setEntriesPage}
          onAddEntry={handleAddEntry}
          onOpenSupportDrawer={handleOpenSupportDrawer}
        />
      </div>

      <PayrollPeriodFormModal
        isOpen={periodModal.open}
        period={periodModal.period}
        selectedLocationId={selectedLocationId}
        locations={locations}
        saving={periodSaving}
        error={periodSaveError}
        onClose={() => setPeriodModal({ open: false, period: null })}
        onSubmit={handlePeriodSubmit}
      />

      <PayrollEntryFormModal
        isOpen={entryModal.open}
        payrollEntry={entryModal.entry}
        periodId={selectedPeriodId}
        employees={entryEmployees}
        employeeSalary={entryEmployeeSalary}
        saving={entrySaving}
        error={entrySaveError}
        onClose={() => setEntryModal({ open: false, entry: null })}
        onEmployeeChange={handleEntryEmployeeChange}
        onSubmit={handleEntrySubmit}
      />

      <PayrollSupportDrawer
        isOpen={supportDrawer.open}
        employeeName={supportDrawer.employeeName}
        loading={supportDrawer.loading}
        error={supportDrawer.error}
        loans={supportDrawer.loans}
        terminations={supportDrawer.terminations}
        reengagements={supportDrawer.reengagements}
        onClose={() => setSupportDrawer((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};

export default PayrollTab;