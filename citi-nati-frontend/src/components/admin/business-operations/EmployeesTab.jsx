import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api.js';
import EmployeesEmptyState from './EmployeesEmptyState.jsx';
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

const EmployeesTab = () => {
  // ── List state ──
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, skip: 0, take: 20 });
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ── Detail state ──
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [detail, setDetail] = useState(null);          // full employee object
  const [salaryHistory, setSalaryHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState('');

  // pendingSelectId – set after create so we can auto-select after list refresh
  const [pendingSelectId, setPendingSelectId] = useState(null);

  // ── Modal state ──
  const [employeeModal, setEmployeeModal] = useState({ open: false, employee: null });
  const [salaryModal, setSalaryModal] = useState({ open: false, salaryStructure: null });
  const [empSaving, setEmpSaving] = useState(false);
  const [empSaveError, setEmpSaveError] = useState('');
  const [salSaving, setSalSaving] = useState(false);
  const [salSaveError, setSalSaveError] = useState('');

  // ── Summary counts ──
  const activeCount = employees.filter((e) => e.status === 'active').length;
  const inactiveCount = employees.filter((e) => e.status !== 'active').length;
  const departmentCount = new Set(employees.map((e) => e.department).filter(Boolean)).size;

  // ── Fetch employee list ──
  const fetchEmployees = useCallback(async (pg = page) => {
    setListLoading(true);
    setListError('');
    try {
      const skip = (pg - 1) * 20;
      const params = { skip, take: 20 };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/business-operations/employees', { params });
      const data = res.data;
      setEmployees(Array.isArray(data.employees) ? data.employees : []);
      setPagination({ total: data.total ?? 0, skip, take: 20 });
    } catch (err) {
      setListError(err?.response?.data?.message || err.message || 'Failed to load employees.');
    } finally {
      setListLoading(false);
    }
  }, [page, search, statusFilter]);

  // ── Fetch employee detail + salary history ──
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
      setDetail(detailRes.data);
      setSalaryHistory(Array.isArray(salaryRes.data) ? salaryRes.data : []);
    } catch (err) {
      setDetailError(err?.response?.data?.message || err.message || 'Failed to load employee details.');
    } finally {
      setDetailLoading(false);
      setSalaryLoading(false);
    }
  }, []);

  // ── Refresh both list and detail ──
  const refreshData = useCallback(async (pg = page) => {
    await fetchEmployees(pg);
  }, [fetchEmployees, page]);

  // ── Initial load + filter change ──
  useEffect(() => {
    fetchEmployees(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  useEffect(() => {
    if (page === 1) return; // already loaded by filter change
    fetchEmployees(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ── Auto-select first employee on initial load ──
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
  }, [employees, listLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Select employee ──
  const handleSelectEmployee = (emp) => {
    setSelectedEmployeeId(emp.id);
    setDetail(null);
    setSalaryHistory([]);
    fetchDetail(emp.id);
  };

  // ── Open employee form ──
  const handleAddEmployee = () => {
    setEmpSaveError('');
    setEmployeeModal({ open: true, employee: null });
  };

  const handleEditEmployee = () => {
    if (!detail) return;
    setEmpSaveError('');
    setEmployeeModal({ open: true, employee: detail });
  };

  // ── Submit employee form ──
  const handleEmployeeSubmit = async (payload) => {
    setEmpSaving(true);
    setEmpSaveError('');
    try {
      let saved;
      if (employeeModal.employee) {
        const res = await api.put(`/business-operations/employees/${employeeModal.employee.id}`, payload);
        saved = res.data;
      } else {
        const res = await api.post('/business-operations/employees', payload);
        saved = res.data;
      }
      setEmployeeModal({ open: false, employee: null });
      const id = saved?.id ?? saved?.employee?.id;
      if (id) setPendingSelectId(id);
      await refreshData(1);
      setPage(1);
      // If editing current, refresh detail
      if (employeeModal.employee && id) {
        fetchDetail(id);
      }
    } catch (err) {
      setEmpSaveError(err?.response?.data?.message || err.message || 'Failed to save employee.');
    } finally {
      setEmpSaving(false);
    }
  };

  // ── Open salary form ──
  const handleAddSalary = () => {
    setSalSaveError('');
    setSalaryModal({ open: true, salaryStructure: null });
  };

  const handleEditSalary = (ss) => {
    setSalSaveError('');
    setSalaryModal({ open: true, salaryStructure: ss });
  };

  // ── Submit salary form ──
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
      // Refresh detail + salary history
      await fetchDetail(selectedEmployeeId);
      // Refresh list to update displayed salary
      await fetchEmployees(page);
    } catch (err) {
      setSalSaveError(err?.response?.data?.message || err.message || 'Failed to save salary structure.');
    } finally {
      setSalSaving(false);
    }
  };

  const selectedEmployee = detail || employees.find((e) => e.id === selectedEmployeeId) || null;
  const employeeFullName = selectedEmployee ? buildFullName(selectedEmployee) : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.28rem' }}>
            <i className="fas fa-users" style={{ color: '#5B4B8A', marginRight: '0.55rem' }} />
            Employees
          </h2>
          <p style={{ margin: '0.2rem 0 0', color: '#64748b', fontSize: '0.87rem' }}>
            Manage staff, employment details, and salary structures
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => refreshData()}
            style={{ border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', borderRadius: '10px', padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
          >
            <i className="fas fa-sync-alt" style={{ marginRight: '0.4rem' }} />Refresh
          </button>
          <button
            onClick={handleAddEmployee}
            style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.65rem 1.1rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
          >
            <i className="fas fa-plus" style={{ marginRight: '0.4rem' }} />Add Employee
          </button>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <EmployeeSummaryCards
        totalEmployees={pagination.total || employees.length}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        departmentCount={departmentCount}
      />

      {/* ── Filter bar ── */}
      <div style={{ ...cardStyle, padding: '0.85rem 1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <i className="fas fa-search" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none', fontSize: '0.88rem' }} />
          <input
            type="text"
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '0.72rem 0.9rem 0.72rem 2.2rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc' }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.72rem 0.9rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#f8fafc', cursor: 'pointer', minWidth: '130px' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="terminated">Terminated</option>
        </select>
      </div>

      {/* ── Main two-panel layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr', gap: '1rem', alignItems: 'start' }}>

        {/* Left: list */}
        <EmployeesList
          employees={employees}
          loading={listLoading}
          error={listError}
          pagination={pagination}
          page={page}
          onPageChange={(pg) => setPage(pg)}
          selectedEmployeeId={selectedEmployeeId}
          onSelectEmployee={handleSelectEmployee}
          onEditEmployee={() => handleEditEmployee()}
        />

        {/* Right: detail */}
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

      {/* ── Modals ── */}
      <EmployeeFormModal
        isOpen={employeeModal.open}
        employee={employeeModal.employee}
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
