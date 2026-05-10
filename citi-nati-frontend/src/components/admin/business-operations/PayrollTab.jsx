import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api.js';
import { downloadBusinessReport, downloadFullBusinessWorkbook, importFullBusinessWorkbook } from '../../../utils/exportService.js';
import { exportPayrollPdf } from '../../../utils/businessOperationsPdfExports.js';
import { boAlert, boConfirm } from '../../../utils/boDialogBus.js';
import PayrollPeriodsList from './PayrollPeriodsList.jsx';
import PayrollPeriodFormModal from './PayrollPeriodFormModal.jsx';
import PayrollPeriodDetailPanel from './PayrollPeriodDetailPanel.jsx';
import PayrollEntryFormModal from './PayrollEntryFormModal.jsx';
import PayrollSupportDrawer from './PayrollSupportDrawer.jsx';
import EmployeeLoanFormModal from './EmployeeLoanFormModal.jsx';
import LoanTransactionFormModal from './LoanTransactionFormModal.jsx';
import EmployeeTerminationFormModal from './EmployeeTerminationFormModal.jsx';
import EmployeeReengagementFormModal from './EmployeeReengagementFormModal.jsx';
import PayrollTaxBracketFormModal from './PayrollTaxBracketFormModal.jsx';
import PayrollIncrementPolicyFormModal from './PayrollIncrementPolicyFormModal.jsx';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const compactParams = (params = {}) =>
  Object.entries(params).reduce((filtered, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      filtered[key] = value;
    }
    return filtered;
  }, {});

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

const PayrollTab = ({
  refreshKey = 0,
  selectedLocationId = null,
  selectedBranchCode = '',
  selectedLocationCode = '',
  selectedLocationName = '',
  locations = [],
  isAggregateMode = false,
}) => {
  const effectiveBranchCode = normalizeCode(selectedBranchCode);
  const effectiveLocationCode = normalizeCode(selectedLocationCode);
  const scopeLabel = selectedLocationName || (
    effectiveBranchCode && effectiveLocationCode
      ? `${effectiveBranchCode} / ${effectiveLocationCode}`
      : 'All Locations'
  );

  const scopeParams = useMemo(() => {
    const params = {};
    if (!isAggregateMode) {
      params.branchCode = effectiveBranchCode || undefined;
      params.locationCode = effectiveLocationCode || undefined;
      params.locationId = selectedLocationId || undefined;
    }
    if (isAggregateMode) {
      params.aggregate = true;
    }
    return compactParams(params);
  }, [effectiveBranchCode, effectiveLocationCode, selectedLocationId, isAggregateMode]);

  const [showPeriodFilters, setShowPeriodFilters] = useState(false);
  const [showPolicyPanel, setShowPolicyPanel] = useState(false);
  const [isPayrollWorkspaceModalOpen, setIsPayrollWorkspaceModalOpen] = useState(false);
  const [isPayrollWorkspaceMaximized, setIsPayrollWorkspaceMaximized] = useState(false);
  const [isPayrollPeriodDetailModalOpen, setIsPayrollPeriodDetailModalOpen] = useState(false);
  const [isPayrollPeriodDetailModalMaximized, setIsPayrollPeriodDetailModalMaximized] = useState(false);
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
    employeeId: null,
    employeeName: '',
    loading: false,
    error: '',
    loans: [],
    terminations: [],
    reengagements: [],
  });

  const [periodModal, setPeriodModal] = useState({ open: false, period: null });
  const [entryModal, setEntryModal] = useState({ open: false, entry: null });
  const [loanModal, setLoanModal] = useState({ open: false, loan: null });
  const [loanTxModal, setLoanTxModal] = useState({ open: false, transaction: null, defaultLoanId: null });
  const [terminationModal, setTerminationModal] = useState({ open: false, termination: null });
  const [reengagementModal, setReengagementModal] = useState({ open: false, reengagement: null });
  const [taxBracketModal, setTaxBracketModal] = useState({ open: false, taxBracket: null });
  const [incrementPolicyModal, setIncrementPolicyModal] = useState({ open: false, incrementPolicy: null });

  const [taxBrackets, setTaxBrackets] = useState([]);
  const [incrementPolicies, setIncrementPolicies] = useState([]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState('');
  const [periodSaving, setPeriodSaving] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [supportSaving, setSupportSaving] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [periodSaveError, setPeriodSaveError] = useState('');
  const [entrySaveError, setEntrySaveError] = useState('');
  const [supportSaveError, setSupportSaveError] = useState('');
  const [policySaveError, setPolicySaveError] = useState('');
  const [entryEmployeeSalary, setEntryEmployeeSalary] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingFullWorkbook, setExportingFullWorkbook] = useState(false);
  const [importingFullWorkbook, setImportingFullWorkbook] = useState(false);

  const fullWorkbookInputRef = useRef(null);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await api.get('/business-operations/employees', {
        params: {
          page: 1,
          pageSize: 200,
          sortBy: 'createdAt',
          sortOrder: 'desc',
          ...scopeParams,
        },
      });
      setEmployees(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch {
      setEmployees([]);
    }
  }, [scopeParams]);

  const fetchPayrollPeriods = useCallback(async (pg = periodPage) => {
    setPeriodsLoading(true);
    setPeriodsError('');

    try {
      const params = {
        page: pg,
        pageSize: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        search: periodFilters.search.trim() || undefined,
        status: periodFilters.status || undefined,
        payrollMode: periodFilters.payrollMode || undefined,
        ...scopeParams,
      };

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
  }, [periodFilters.payrollMode, periodFilters.search, periodFilters.status, periodPage, scopeParams]);

  const fetchPolicies = useCallback(async () => {
    setPolicyLoading(true);
    setPolicyError('');

    try {
      const params = {
        page: 1,
        pageSize: 50,
        sortBy: 'effectiveFrom',
        sortOrder: 'desc',
        ...scopeParams,
      };

      const [taxRes, incrementRes] = await Promise.all([
        api.get('/business-operations/payroll/tax-brackets', { params }),
        api.get('/business-operations/payroll/increment-policies', { params }),
      ]);

      setTaxBrackets(Array.isArray(taxRes?.data?.data) ? taxRes.data.data : []);
      setIncrementPolicies(Array.isArray(incrementRes?.data?.data) ? incrementRes.data.data : []);
    } catch (err) {
      setTaxBrackets([]);
      setIncrementPolicies([]);
      setPolicyError(getApiError(err, 'Failed to load payroll policies.'));
    } finally {
      setPolicyLoading(false);
    }
  }, [scopeParams]);

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
    } catch {
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
          ...scopeParams,
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
  }, [entriesPage, scopeParams, selectedEntryId]);

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
    } catch {
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
      employeeId: entry.employeeId,
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
        employeeId: entry.employeeId,
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
        employeeId: entry.employeeId,
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
    await fetchPolicies();

    if (selectedPeriodId) {
      await fetchPeriodDetail(selectedPeriodId);
      await fetchPayrollEntries(selectedPeriodId, entriesPage);
    }
  }, [entriesPage, fetchPayrollEntries, fetchPayrollPeriods, fetchPeriodDetail, fetchPolicies, periodPage, selectedPeriodId]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, refreshKey]);

  useEffect(() => {
    fetchPayrollPeriods(periodPage);
  }, [fetchPayrollPeriods, periodPage, refreshKey]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies, refreshKey]);

  useEffect(() => {
    setPeriodPage(1);
    setSelectedPeriodId(null);
    setSelectedPeriod(null);
    setEntries([]);
    setSelectedEntryId(null);
    setSupportData(null);
  }, [periodFilters.payrollMode, periodFilters.search, periodFilters.status, effectiveBranchCode, effectiveLocationCode, selectedLocationId]);

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
    if (effectiveBranchCode && effectiveLocationCode) {
      return employees.filter((employee) => {
        const employeeBranch = normalizeCode(employee.branchCode);
        const employeeLocation = normalizeCode(employee.locationCode);
        if (employeeBranch || employeeLocation) {
          return employeeBranch === effectiveBranchCode && employeeLocation === effectiveLocationCode;
        }
        return selectedLocationId ? Number(employee.locationId) === Number(selectedLocationId) : true;
      });
    }

    if (selectedLocationId) {
      return employees.filter((employee) => Number(employee.locationId) === Number(selectedLocationId));
    }

    return employees;
  }, [effectiveBranchCode, effectiveLocationCode, employees, selectedLocationId]);

  const openPayrollPeriodDetailModal = () => {
    if (!selectedPeriodId) return;
    setIsPayrollPeriodDetailModalMaximized(false);
    setIsPayrollPeriodDetailModalOpen(true);
  };

  const handleCreatePeriod = () => {
    setPeriodSaveError('');
    setPeriodModal({ open: true, period: null });
  };

  const handleEditPeriod = (period) => {
    setPeriodSaveError('');
    setPeriodModal({ open: true, period });
  };

  const handleDeletePeriod = async (period) => {
    try {
      await api.delete(`/business-operations/payroll/periods/${period.id}`);
      if (selectedPeriodId === period.id) setSelectedPeriodId(null);
      await fetchPayrollPeriods(periodPage);
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete payroll period.'), type: 'error' });
    }
  };

  const handlePeriodSubmit = async (payload) => {
    setPeriodSaving(true);
    setPeriodSaveError('');

    try {
      const scopedPayload = {
        ...payload,
        branchCode: payload.branchCode || effectiveBranchCode || undefined,
        locationCode: payload.locationCode || effectiveLocationCode || undefined,
        locationName: payload.locationName || selectedLocationName || scopeLabel || undefined,
        locationId: payload.locationId ?? selectedLocationId ?? undefined,
      };

      let saved;

      if (periodModal.period) {
        const res = await api.put(`/business-operations/payroll/periods/${periodModal.period.id}`, scopedPayload);
        saved = res?.data?.data;
      } else {
        const res = await api.post('/business-operations/payroll/periods', scopedPayload);
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

  const handleDeleteEntry = async (entry) => {
    try {
      await api.delete(`/business-operations/payroll/entries/${entry.id}`);
      if (selectedEntryId === entry.id) setSelectedEntryId(null);
      await fetchPayrollEntries(selectedPeriodId, entriesPage);
      await fetchPayrollPeriods(periodPage);
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete payroll entry.'), type: 'error' });
    }
  };

  const handleEntryEmployeeChange = async (employeeId) => {
    try {
      const res = await api.get(`/business-operations/employees/${employeeId}/salary/current`);
      setEntryEmployeeSalary(res?.data?.data || null);
    } catch {
      setEntryEmployeeSalary(null);
    }
  };

  const handleEntrySubmit = async (payload) => {
    if (!selectedPeriodId) return;

    setEntrySaving(true);
    setEntrySaveError('');

    try {
      const scopedPayload = {
        ...payload,
        branchCode: payload.branchCode || effectiveBranchCode || undefined,
        locationCode: payload.locationCode || effectiveLocationCode || undefined,
        locationId: payload.locationId ?? selectedLocationId ?? undefined,
      };

      if (entryModal.entry) {
        await api.put(`/business-operations/payroll/entries/${entryModal.entry.id}`, scopedPayload);
      } else {
        await api.post('/business-operations/payroll/entries', scopedPayload);
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

  const handleAddLoan = () => {
    setSupportSaveError('');
    setLoanModal({
      open: true,
      loan: supportDrawer.employeeId ? { employeeId: supportDrawer.employeeId } : null,
    });
  };

  const handleEditLoan = (loan) => {
    if (!loan) return;
    setSupportSaveError('');
    setLoanModal({ open: true, loan });
  };

  const handleLoanSubmit = async (payload) => {
    setSupportSaving(true);
    setSupportSaveError('');
    try {
      if (loanModal.loan?.id) {
        await api.put(`/business-operations/payroll/loans/${loanModal.loan.id}`, payload);
      } else {
        await api.post('/business-operations/payroll/loans', payload);
      }
      setLoanModal({ open: false, loan: null });
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      setSupportSaveError(getApiError(err, 'Failed to save employee loan.'));
    } finally {
      setSupportSaving(false);
    }
  };

  const handleAddLoanTransaction = (loan) => {
    setSupportSaveError('');
    setLoanTxModal({
      open: true,
      transaction: null,
      defaultLoanId: loan?.id || null,
    });
  };

  const handleLoanTransactionSubmit = async (payload) => {
    setSupportSaving(true);
    setSupportSaveError('');
    try {
      const requestPayload = {
        ...payload,
        payrollPeriodId: selectedPeriodId || undefined,
        transactionType: 'repayment',
      };
      if (loanTxModal.transaction?.id) {
        await api.put(`/business-operations/payroll/loan-transactions/${loanTxModal.transaction.id}`, requestPayload);
      } else {
        await api.post('/business-operations/payroll/loan-transactions', requestPayload);
      }
      setLoanTxModal({ open: false, transaction: null, defaultLoanId: null });
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      setSupportSaveError(getApiError(err, 'Failed to save loan transaction.'));
    } finally {
      setSupportSaving(false);
    }
  };

  const handleAddTermination = () => {
    setSupportSaveError('');
    setTerminationModal({
      open: true,
      termination: supportDrawer.employeeId ? { employeeId: supportDrawer.employeeId } : null,
    });
  };

  const handleEditTermination = (termination) => {
    if (!termination) return;
    setSupportSaveError('');
    setTerminationModal({ open: true, termination });
  };

  const handleTerminationSubmit = async (payload) => {
    setSupportSaving(true);
    setSupportSaveError('');
    try {
      if (terminationModal.termination?.id) {
        await api.put(`/business-operations/payroll/terminations/${terminationModal.termination.id}`, payload);
      } else {
        await api.post('/business-operations/payroll/terminations', payload);
      }
      setTerminationModal({ open: false, termination: null });
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      setSupportSaveError(getApiError(err, 'Failed to save termination record.'));
    } finally {
      setSupportSaving(false);
    }
  };

  const handleAddReengagement = () => {
    setSupportSaveError('');
    setReengagementModal({
      open: true,
      reengagement: supportDrawer.employeeId ? { employeeId: supportDrawer.employeeId } : null,
    });
  };

  const handleEditReengagement = (reengagement) => {
    if (!reengagement) return;
    setSupportSaveError('');
    setReengagementModal({ open: true, reengagement });
  };

  const handleReengagementSubmit = async (payload) => {
    setSupportSaving(true);
    setSupportSaveError('');
    try {
      if (reengagementModal.reengagement?.id) {
        await api.put(`/business-operations/payroll/reengagements/${reengagementModal.reengagement.id}`, payload);
      } else {
        await api.post('/business-operations/payroll/reengagements', payload);
      }
      setReengagementModal({ open: false, reengagement: null });
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      setSupportSaveError(getApiError(err, 'Failed to save reengagement record.'));
    } finally {
      setSupportSaving(false);
    }
  };

  const handleDeleteLoan = async (loan) => {
    try {
      await api.delete(`/business-operations/payroll/loans/${loan.id}`);
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete loan.'), type: 'error' });
    }
  };

  const handleDeleteLoanTransaction = async (tx) => {
    try {
      await api.delete(`/business-operations/payroll/loan-transactions/${tx.id}`);
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete loan transaction.'), type: 'error' });
    }
  };

  const handleDeleteTermination = async (termination) => {
    try {
      await api.delete(`/business-operations/payroll/terminations/${termination.id}`);
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete termination.'), type: 'error' });
    }
  };

  const handleDeleteReengagement = async (reengagement) => {
    try {
      await api.delete(`/business-operations/payroll/reengagements/${reengagement.id}`);
      const selectedEntry = entries.find((entry) => entry.id === selectedEntryId);
      if (selectedEntry) await openSupportDrawerForEntry(selectedEntry);
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete reengagement.'), type: 'error' });
    }
  };

  const handleExport = async (format) => {
    if (format === 'excel') setExportingExcel(true);
    if (format === 'pdf') setExportingPdf(true);

    try {
      const scopedFilters = {
        payrollPeriodId: selectedPeriodId,
        search: periodFilters.search || undefined,
        status: periodFilters.status || undefined,
        payrollMode: periodFilters.payrollMode || undefined,
        ...scopeParams,
      };

      if (format === 'pdf') {
        exportPayrollPdf({
          selectedPeriod,
          periodFilters: scopedFilters,
          selectedLocationId,
          selectedBranchCode: effectiveBranchCode,
          selectedLocationCode: effectiveLocationCode,
          selectedLocationName: scopeLabel,
          periods,
          entries,
          summary,
        });
        return;
      }

      await downloadBusinessReport({
        format,
        module: 'payroll',
        type: 'period',
        filters: scopedFilters,
      });
    } catch (error) {
      const message = error?.response?.data?.error || `Failed to export ${format.toUpperCase()} report.`;
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      if (format === 'excel') setExportingExcel(false);
      if (format === 'pdf') setExportingPdf(false);
    }
  };

  const handleExportFullWorkbook = async () => {
    setExportingFullWorkbook(true);
    try {
      await downloadFullBusinessWorkbook({
        filters: scopeParams,
      });
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'Failed to export full workbook.';
      await boAlert({ title: 'Export Failed', message, type: 'warning' });
    } finally {
      setExportingFullWorkbook(false);
    }
  };

  const handleChooseImportWorkbook = () => {
    if (importingFullWorkbook) return;
    fullWorkbookInputRef.current?.click();
  };

  const handleImportWorkbookFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const confirmed = await boConfirm({
      title: 'Import Workbook',
      message: `Import workbook "${file.name}"? This will re-add/update payroll, sales, and business operations records.`,
      confirmText: 'Import',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    setImportingFullWorkbook(true);
    try {
      const response = await importFullBusinessWorkbook({
        file,
        upsert: true,
        clearExisting: false,
        branchCode: effectiveBranchCode || null,
        locationCode: effectiveLocationCode || null,
        locationId: selectedLocationId || null,
      });

      const payrollImported = response?.result?.payroll?.imported || {};
      const salesImported = response?.result?.sales?.imported || {};
      const businessImported = response?.result?.business?.imported || {};

      const payrollCount = Object.values(payrollImported).reduce((sum, value) => sum + Number(value || 0), 0);
      const salesCount = Object.values(salesImported).reduce((sum, value) => sum + Number(value || 0), 0);
      const businessCount = Object.values(businessImported).reduce((sum, value) => sum + Number(value || 0), 0);

      await boAlert({
        title: 'Import Complete',
        message: `Workbook import complete. Payroll rows: ${payrollCount}. Sales rows: ${salesCount}. BO rows: ${businessCount}.`,
        type: 'success',
      });
      await refreshAll();
    } catch (error) {
      const message = error?.response?.data?.error || error?.message || 'Failed to import full workbook.';
      await boAlert({ title: 'Import Failed', message, type: 'warning' });
    } finally {
      setImportingFullWorkbook(false);
    }
  };

  const handleCreateTaxBracket = () => {
    setPolicySaveError('');
    setTaxBracketModal({
      open: true,
      taxBracket: {
        locationId: selectedLocationId || null,
        branchCode: effectiveBranchCode || null,
        locationCode: effectiveLocationCode || null,
      },
    });
  };

  const handleEditTaxBracket = (taxBracket) => {
    if (!taxBracket) return;
    setPolicySaveError('');
    setTaxBracketModal({ open: true, taxBracket });
  };

  const handleDeleteTaxBracket = async (item) => {
    try {
      await api.delete(`/business-operations/payroll/tax-brackets/${item.id}`);
      await fetchPolicies();
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete tax bracket.'), type: 'error' });
    }
  };

  const handleTaxBracketSubmit = async (payload) => {
    setPolicySaving(true);
    setPolicySaveError('');
    try {
      const requestPayload = {
        ...payload,
        branchCode: payload.branchCode || effectiveBranchCode || undefined,
        locationCode: payload.locationCode || effectiveLocationCode || undefined,
        locationId: payload.locationId || selectedLocationId || undefined,
      };
      if (taxBracketModal.taxBracket?.id) {
        await api.put(`/business-operations/payroll/tax-brackets/${taxBracketModal.taxBracket.id}`, requestPayload);
      } else {
        await api.post('/business-operations/payroll/tax-brackets', requestPayload);
      }
      setTaxBracketModal({ open: false, taxBracket: null });
      await fetchPolicies();
    } catch (err) {
      setPolicySaveError(getApiError(err, 'Failed to save tax bracket.'));
    } finally {
      setPolicySaving(false);
    }
  };

  const handleCreateIncrementPolicy = () => {
    setPolicySaveError('');
    setIncrementPolicyModal({
      open: true,
      incrementPolicy: {
        locationId: selectedLocationId || null,
        branchCode: effectiveBranchCode || null,
        locationCode: effectiveLocationCode || null,
      },
    });
  };

  const handleEditIncrementPolicy = (incrementPolicy) => {
    if (!incrementPolicy) return;
    setPolicySaveError('');
    setIncrementPolicyModal({ open: true, incrementPolicy });
  };

  const handleDeleteIncrementPolicy = async (item) => {
    try {
      await api.delete(`/business-operations/payroll/increment-policies/${item.id}`);
      await fetchPolicies();
    } catch (err) {
      await boAlert({ title: 'Delete Failed', message: getApiError(err, 'Failed to delete increment policy.'), type: 'error' });
    }
  };

  const handleIncrementPolicySubmit = async (payload) => {
    setPolicySaving(true);
    setPolicySaveError('');
    try {
      const requestPayload = {
        ...payload,
        branchCode: payload.branchCode || effectiveBranchCode || undefined,
        locationCode: payload.locationCode || effectiveLocationCode || undefined,
        locationId: payload.locationId || selectedLocationId || undefined,
      };
      if (incrementPolicyModal.incrementPolicy?.id) {
        await api.put(`/business-operations/payroll/increment-policies/${incrementPolicyModal.incrementPolicy.id}`, requestPayload);
      } else {
        await api.post('/business-operations/payroll/increment-policies', requestPayload);
      }
      setIncrementPolicyModal({ open: false, incrementPolicy: null });
      await fetchPolicies();
    } catch (err) {
      setPolicySaveError(getApiError(err, 'Failed to save increment policy.'));
    } finally {
      setPolicySaving(false);
    }
  };

  useEffect(() => {
    if (!isPayrollWorkspaceModalOpen || periodModal.open || entryModal.open || supportDrawer.open || loanModal.open || loanTxModal.open || terminationModal.open || reengagementModal.open || taxBracketModal.open || incrementPolicyModal.open) return;
    const handler = (event) => {
      if (event.key === 'Escape') {
        setIsPayrollWorkspaceModalOpen(false);
        setIsPayrollWorkspaceMaximized(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPayrollWorkspaceModalOpen, periodModal.open, entryModal.open, supportDrawer.open, loanModal.open, loanTxModal.open, terminationModal.open, reengagementModal.open, taxBracketModal.open, incrementPolicyModal.open]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1rem 1.1rem' }}>
        <div style={{ display: 'grid', gap: '0.78rem' }}>
          <div>
            <strong style={{ color: '#0f172a' }}>Payroll Workspaces</strong>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
              Launch payroll periods and entries management from the workspace card below.
            </p>
            <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.84rem', fontWeight: 700 }}>
              Scope: {scopeLabel}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.75rem' }}>
            <button
              type="button"
              title="Click to open"
              onClick={() => { setIsPayrollWorkspaceMaximized(false); setIsPayrollWorkspaceModalOpen(true); }}
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
              style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', borderRadius: '14px', padding: '0.95rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'grid', gap: '0.42rem', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background-color 0.16s ease' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                <i className="fas fa-money-check-dollar" />
              </span>
              <span style={{ color: '#0f172a', fontWeight: 800, fontSize: '0.95rem' }}>Payroll Periods and Entries</span>
              <span style={{ color: '#64748b', fontSize: '0.84rem', lineHeight: 1.45 }}>Create periods, process payroll entries, and inspect support records.</span>
            </button>
          </div>
        </div>
      </div>

      {isPayrollWorkspaceModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.45)', zIndex: 170, display: 'grid', placeItems: 'center', padding: isPayrollWorkspaceMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isPayrollWorkspaceMaximized ? 'calc(100vw - 0.7rem)' : 'min(1400px, 97vw)', height: isPayrollWorkspaceMaximized ? 'calc(100vh - 0.7rem)' : '92vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isPayrollWorkspaceMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(15,23,42,0.04)' }}>
              <input ref={fullWorkbookInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportWorkbookFileChange} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>Payroll Workspace</h2>
                  <p style={{ margin: '0.28rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>Manage payroll periods and process employee salary entries.</p>
                  <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.82rem', fontWeight: 700 }}>Scope: {scopeLabel}</p>
                </div>

                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={() => handleExport('pdf')} disabled={exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, cursor: exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                    <i className={`fas ${exportingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} style={{ marginRight: '0.38rem' }}></i>Export PDF
                  </button>
                  <button type="button" onClick={() => handleExport('excel')} disabled={exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.55rem 0.85rem', fontWeight: 700, cursor: exportingExcel || exportingPdf || exportingFullWorkbook || importingFullWorkbook ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                    <i className={`fas ${exportingExcel ? 'fa-spinner fa-spin' : 'fa-file-excel'}`} style={{ marginRight: '0.38rem' }}></i>Export Excel
                  </button>
                  <button type="button" title={isPayrollWorkspaceMaximized ? 'Restore' : 'Maximize'} onClick={() => setIsPayrollWorkspaceMaximized((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                    <i className={`fas ${isPayrollWorkspaceMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                  </button>
                  <button type="button" title="Close" onClick={() => { setIsPayrollWorkspaceModalOpen(false); setIsPayrollWorkspaceMaximized(false); }} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                    <i className="fas fa-times" />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.8rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={handleCreatePeriod} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <i className="fas fa-plus" style={{ marginRight: '0.34rem' }}></i>Create Payroll Period
                  </button>
                  <button type="button" onClick={() => setShowPeriodFilters((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <i className="fas fa-sliders" style={{ marginRight: '0.34rem' }}></i>{showPeriodFilters ? 'Hide Filters' : 'Show Filters'}
                  </button>
                  <button type="button" onClick={refreshAll} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <i className="fas fa-rotate-right" style={{ marginRight: '0.34rem' }}></i>Refresh
                  </button>
                  <button type="button" onClick={handleCreateTaxBracket} style={{ border: '1px solid #d6d3d1', backgroundColor: '#fff', color: '#44403c', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <i className="fas fa-percent" style={{ marginRight: '0.34rem' }}></i>New Tax Bracket
                  </button>
                  <button type="button" onClick={handleCreateIncrementPolicy} style={{ border: '1px solid #bbf7d0', backgroundColor: '#fff', color: '#166534', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <i className="fas fa-chart-line" style={{ marginRight: '0.34rem' }}></i>New Increment Policy
                  </button>
                  <button type="button" onClick={() => setShowPolicyPanel((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <i className="fas fa-briefcase" style={{ marginRight: '0.34rem' }}></i>{showPolicyPanel ? 'Hide Policies' : 'Show Policies'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'nowrap' }}>
                  <button type="button" onClick={handleExportFullWorkbook} disabled={exportingFullWorkbook || importingFullWorkbook || exportingExcel || exportingPdf} style={{ border: '1px solid #86efac', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 800, cursor: exportingFullWorkbook || importingFullWorkbook || exportingExcel || exportingPdf ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>
                    <i className={`fas ${exportingFullWorkbook ? 'fa-spinner fa-spin' : 'fa-file-arrow-down'}`} style={{ marginRight: '0.32rem' }}></i>Export Full Workbook
                  </button>
                  <button type="button" onClick={handleChooseImportWorkbook} disabled={importingFullWorkbook || exportingFullWorkbook || exportingExcel || exportingPdf} style={{ border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1e3a8a', borderRadius: '10px', padding: '0.46rem 0.72rem', fontWeight: 800, cursor: importingFullWorkbook || exportingFullWorkbook || exportingExcel || exportingPdf ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>
                    <i className={`fas ${importingFullWorkbook ? 'fa-spinner fa-spin' : 'fa-file-arrow-up'}`} style={{ marginRight: '0.32rem' }}></i>Import Full Workbook
                  </button>
                </div>
              </div>

              {showPeriodFilters && (
                <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 250px' }}>
                    <i className="fas fa-search" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', fontSize: '0.85rem' }}></i>
                    <input type="text" placeholder="Search periods by description, mode, status, or creator" value={periodFilters.search} onChange={(event) => setPeriodFilters((prev) => ({ ...prev, search: event.target.value }))} style={{ width: '100%', boxSizing: 'border-box', padding: '0.72rem 0.84rem 0.72rem 2.2rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }} />
                  </div>
                  <select value={periodFilters.status} onChange={(event) => setPeriodFilters((prev) => ({ ...prev, status: event.target.value }))} style={{ padding: '0.72rem 0.84rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc', minWidth: '130px' }}>
                    <option value="">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="approved">Approved</option>
                    <option value="finalized">Finalized</option>
                  </select>
                  <select value={periodFilters.payrollMode} onChange={(event) => setPeriodFilters((prev) => ({ ...prev, payrollMode: event.target.value }))} style={{ padding: '0.72rem 0.84rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc', minWidth: '130px' }}>
                    <option value="">All Modes</option>
                    <option value="mid_month">Mid Month</option>
                    <option value="full_month">Full Month</option>
                  </select>
                  <button type="button" onClick={() => setPeriodFilters({ search: '', status: '', payrollMode: '' })} style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.68rem 0.88rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                    Clear
                  </button>
                </div>
              )}

              {showPolicyPanel && (
                <div style={{ marginTop: '0.85rem', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.8rem', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                    <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>Payroll Policy Center</strong>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Tax Brackets: {taxBrackets.length} | Increment Policies: {incrementPolicies.length}</span>
                  </div>

                  {policyError ? (
                    <div style={{ padding: '0.7rem 0.8rem', borderRadius: '10px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: '0.82rem' }}>{policyError}</div>
                  ) : policyLoading ? (
                    <div style={{ color: '#64748b', fontSize: '0.82rem' }}><i className="fas fa-spinner fa-spin" style={{ marginRight: '0.35rem' }}></i>Loading policies...</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.75rem' }}>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff', padding: '0.65rem' }}>
                        <div style={{ fontWeight: 800, color: '#334155', marginBottom: '0.45rem', fontSize: '0.82rem' }}>Tax Brackets</div>
                        {!taxBrackets.length ? (
                          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No tax brackets configured.</div>
                        ) : taxBrackets.slice(0, 6).map((item) => (
                          <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.45rem', marginTop: '0.45rem', display: 'grid', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.79rem' }}>MWK {Number(item.minIncome || 0).toLocaleString('en-US')} - MWK {Number(item.maxIncome || 0).toLocaleString('en-US')}</span>
                              <span style={{ fontSize: '0.75rem', color: item.isActive ? '#166534' : '#9a3412' }}>{item.isActive ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Rate: {Number(item.ratePercent || 0).toLocaleString('en-US')}% | Fixed: MWK {Number(item.fixedTaxAmount || 0).toLocaleString('en-US')}</div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button type="button" onClick={() => handleEditTaxBracket(item)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.3rem 0.5rem', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 700 }}>
                                <i className="fas fa-pen" style={{ marginRight: '0.28rem' }}></i>Edit
                              </button>
                              <button type="button" onClick={async () => { const confirmed = await boConfirm({ title: 'Delete Tax Bracket', message: `Delete tax bracket MWK ${Number(item.minIncome || 0).toLocaleString('en-US')} - MWK ${Number(item.maxIncome || 0).toLocaleString('en-US')}? This cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' }); if (confirmed) handleDeleteTaxBracket(item); }} style={{ border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#b91c1c', borderRadius: '8px', padding: '0.3rem 0.5rem', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 700 }}>
                                <i className="fas fa-trash" style={{ marginRight: '0.28rem' }}></i>Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#fff', padding: '0.65rem' }}>
                        <div style={{ fontWeight: 800, color: '#334155', marginBottom: '0.45rem', fontSize: '0.82rem' }}>Increment Policies</div>
                        {!incrementPolicies.length ? (
                          <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No increment policies configured.</div>
                        ) : incrementPolicies.slice(0, 6).map((item) => (
                          <div key={item.id} style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.45rem', marginTop: '0.45rem', display: 'grid', gap: '0.2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.79rem' }}>{item.minServiceMonths} - {item.maxServiceMonths || '∞'} months</span>
                              <span style={{ fontSize: '0.75rem', color: item.isActive ? '#166534' : '#9a3412' }}>{item.isActive ? 'Active' : 'Inactive'}</span>
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.76rem' }}>Increment: {item.incrementPercent ? `${Number(item.incrementPercent).toLocaleString('en-US')}%` : '0%'} + MWK {Number(item.incrementAmount || 0).toLocaleString('en-US')}</div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button type="button" onClick={() => handleEditIncrementPolicy(item)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '8px', padding: '0.3rem 0.5rem', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 700 }}>
                                <i className="fas fa-pen" style={{ marginRight: '0.28rem' }}></i>Edit
                              </button>
                              <button type="button" onClick={async () => { const confirmed = await boConfirm({ title: 'Delete Increment Policy', message: `Delete increment policy for ${item.minServiceMonths} - ${item.maxServiceMonths || '∞'} months? This cannot be undone.`, confirmText: 'Delete', cancelText: 'Cancel' }); if (confirmed) handleDeleteIncrementPolicy(item); }} style={{ border: '1px solid #fca5a5', backgroundColor: '#fff', color: '#b91c1c', borderRadius: '8px', padding: '0.3rem 0.5rem', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 700 }}>
                                <i className="fas fa-trash" style={{ marginRight: '0.28rem' }}></i>Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.85rem' }}>
              <div style={{ ...cardStyle, overflow: 'hidden' }}>
                <div style={{ padding: '0.75rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: '0.2rem' }}>
                    <strong style={{ color: '#0f172a' }}>Payroll Period Register</strong>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
                      Selected: {selectedPeriod ? (selectedPeriod.description || `Period #${selectedPeriod.id}`) : 'None'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" onClick={openPayrollPeriodDetailModal} disabled={!selectedPeriodId} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 700, cursor: selectedPeriodId ? 'pointer' : 'not-allowed', opacity: selectedPeriodId ? 1 : 0.65 }}>
                      Open Payroll Details
                    </button>

                    <button type="button" onClick={handleAddEntry} disabled={!selectedPeriodId} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.5rem 0.8rem', fontWeight: 700, cursor: selectedPeriodId ? 'pointer' : 'not-allowed', opacity: selectedPeriodId ? 1 : 0.65 }}>
                      Add Payroll Entry
                    </button>
                  </div>
                </div>

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
                    setSupportDrawer((prev) => ({ ...prev, open: false, employeeId: null, error: '', loans: [], terminations: [], reengagements: [] }));
                  }}
                  onEditPeriod={handleEditPeriod}
                  onDeletePeriod={handleDeletePeriod}
                  onCreatePeriod={handleCreatePeriod}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isPayrollPeriodDetailModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', zIndex: 180, display: 'grid', placeItems: 'center', padding: isPayrollPeriodDetailModalMaximized ? '0.35rem' : '1rem' }}>
          <div style={{ ...cardStyle, width: isPayrollPeriodDetailModalMaximized ? 'calc(100vw - 0.7rem)' : 'min(1200px, 96vw)', height: isPayrollPeriodDetailModalMaximized ? 'calc(100vh - 0.7rem)' : '90vh', maxHeight: 'none', overflow: 'hidden', borderRadius: isPayrollPeriodDetailModalMaximized ? '10px' : '18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, padding: '0.8rem 1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, color: '#0f172a' }}>Payroll Period Details</h3>
                <div style={{ color: '#64748b', fontSize: '0.84rem' }}>
                  {selectedPeriod ? (selectedPeriod.description || `Period #${selectedPeriod.id}`) : 'No period selected'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button type="button" onClick={handleAddEntry} disabled={!selectedPeriodId} style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.55rem 0.82rem', fontWeight: 700, cursor: selectedPeriodId ? 'pointer' : 'not-allowed', opacity: selectedPeriodId ? 1 : 0.65 }}>
                  Add Payroll Entry
                </button>

                <button type="button" title={isPayrollPeriodDetailModalMaximized ? 'Restore' : 'Maximize'} onClick={() => setIsPayrollPeriodDetailModalMaximized((prev) => !prev)} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                  <i className={`fas ${isPayrollPeriodDetailModalMaximized ? 'fa-window-restore' : 'fa-window-maximize'}`} />
                </button>

                <button type="button" title="Close" onClick={() => { setIsPayrollPeriodDetailModalOpen(false); setIsPayrollPeriodDetailModalMaximized(false); }} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#334155', borderRadius: '9px', padding: '0.45rem 0.62rem', cursor: 'pointer', fontWeight: 700 }}>
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0.9rem' }}>
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
                onDeleteEntry={handleDeleteEntry}
                onPageChange={setEntriesPage}
                onAddEntry={handleAddEntry}
                onOpenSupportDrawer={handleOpenSupportDrawer}
              />
            </div>
          </div>
        </div>
      )}

      <PayrollPeriodFormModal
        isOpen={periodModal.open}
        period={periodModal.period}
        selectedLocationId={selectedLocationId}
        selectedBranchCode={effectiveBranchCode}
        selectedLocationCode={effectiveLocationCode}
        selectedLocationName={scopeLabel}
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
        onAddLoan={handleAddLoan}
        onEditLoan={handleEditLoan}
        onDeleteLoan={handleDeleteLoan}
        onAddLoanTransaction={handleAddLoanTransaction}
        onDeleteLoanTransaction={handleDeleteLoanTransaction}
        onAddTermination={handleAddTermination}
        onEditTermination={handleEditTermination}
        onDeleteTermination={handleDeleteTermination}
        onAddReengagement={handleAddReengagement}
        onEditReengagement={handleEditReengagement}
        onDeleteReengagement={handleDeleteReengagement}
        onClose={() => setSupportDrawer((prev) => ({ ...prev, open: false }))}
      />

      <EmployeeLoanFormModal
        isOpen={loanModal.open}
        loan={loanModal.loan}
        employees={entryEmployees}
        saving={supportSaving}
        error={supportSaveError}
        onClose={() => setLoanModal({ open: false, loan: null })}
        onSubmit={handleLoanSubmit}
      />

      <LoanTransactionFormModal
        isOpen={loanTxModal.open}
        transaction={loanTxModal.transaction}
        loans={supportDrawer.loans}
        defaultLoanId={loanTxModal.defaultLoanId}
        saving={supportSaving}
        error={supportSaveError}
        onClose={() => setLoanTxModal({ open: false, transaction: null, defaultLoanId: null })}
        onSubmit={handleLoanTransactionSubmit}
      />

      <EmployeeTerminationFormModal
        isOpen={terminationModal.open}
        termination={terminationModal.termination}
        employees={entryEmployees}
        saving={supportSaving}
        error={supportSaveError}
        onClose={() => setTerminationModal({ open: false, termination: null })}
        onSubmit={handleTerminationSubmit}
      />

      <EmployeeReengagementFormModal
        isOpen={reengagementModal.open}
        reengagement={reengagementModal.reengagement}
        employees={entryEmployees}
        terminations={supportDrawer.terminations}
        saving={supportSaving}
        error={supportSaveError}
        onClose={() => setReengagementModal({ open: false, reengagement: null })}
        onSubmit={handleReengagementSubmit}
      />

      <PayrollTaxBracketFormModal
        isOpen={taxBracketModal.open}
        taxBracket={taxBracketModal.taxBracket}
        locations={locations}
        saving={policySaving}
        error={policySaveError}
        onClose={() => setTaxBracketModal({ open: false, taxBracket: null })}
        onSubmit={handleTaxBracketSubmit}
      />

      <PayrollIncrementPolicyFormModal
        isOpen={incrementPolicyModal.open}
        incrementPolicy={incrementPolicyModal.incrementPolicy}
        locations={locations}
        saving={policySaving}
        error={policySaveError}
        onClose={() => setIncrementPolicyModal({ open: false, incrementPolicy: null })}
        onSubmit={handleIncrementPolicySubmit}
      />
    </div>
  );
};

export default PayrollTab;