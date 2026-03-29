import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
};

const statCardStyle = {
  ...cardStyle,
  padding: '1rem 1.1rem',
  display: 'grid',
  gap: '0.35rem',
};

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.9rem',
};

const thStyle = {
  textAlign: 'left',
  padding: '0.85rem 0.9rem',
  color: '#475569',
  fontSize: '0.78rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle = {
  padding: '0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const money = (value, currency = 'MWK') => {
  if (value === null || value === undefined || value === '') return 'Not set';
  return `${currency} ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const buildFullName = (employee) => {
  if (!employee) return 'Unknown employee';
  return [employee.firstName, employee.middleName, employee.surname].filter(Boolean).join(' ');
};

const statusBadgeStyle = (status) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  borderRadius: '999px',
  padding: '0.32rem 0.7rem',
  fontSize: '0.77rem',
  fontWeight: 800,
  textTransform: 'capitalize',
  backgroundColor: status === 'active' ? '#dcfce7' : '#f1f5f9',
  color: status === 'active' ? '#166534' : '#475569',
});

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

const EmployeesTab = ({ refreshKey = 0 }) => {
  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput.trim());
  const [statusFilter, setStatusFilter] = useState('');
  const [employees, setEmployees] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [detailState, setDetailState] = useState({ loading: false, error: '', employee: null, salaryHistory: [] });

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/business-operations/employees', {
        params: {
          page,
          pageSize: 25,
          search: deferredSearch || undefined,
          status: statusFilter || undefined,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
      });

      setEmployees(response.data?.data || []);
      setPagination(response.data?.pagination || null);
    } catch (requestError) {
      setEmployees([]);
      setPagination(null);
      setError(requestError.response?.data?.error || 'Failed to load employee records');
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, page, statusFilter]);

  const fetchEmployeeDetail = useCallback(async (employeeId) => {
    if (!employeeId) {
      setDetailState({ loading: false, error: '', employee: null, salaryHistory: [] });
      return;
    }

    setDetailState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const [employeeResponse, salaryHistoryResponse] = await Promise.all([
        api.get(`/business-operations/employees/${employeeId}`),
        api.get(`/business-operations/employees/${employeeId}/salary-structures`),
      ]);

      setDetailState({
        loading: false,
        error: '',
        employee: employeeResponse.data?.data || null,
        salaryHistory: salaryHistoryResponse.data?.data || [],
      });
    } catch (requestError) {
      setDetailState({
        loading: false,
        error: requestError.response?.data?.error || 'Failed to load employee salary details',
        employee: null,
        salaryHistory: [],
      });
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter]);

  useEffect(() => {
    if (!employees.length) {
      setSelectedEmployeeId(null);
      setDetailState({ loading: false, error: '', employee: null, salaryHistory: [] });
      return;
    }

    const selectedStillVisible = employees.some((employee) => employee.id === selectedEmployeeId);
    if (!selectedEmployeeId || !selectedStillVisible) {
      setSelectedEmployeeId(employees[0].id);
    }
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    fetchEmployeeDetail(selectedEmployeeId);
  }, [fetchEmployeeDetail, refreshKey, selectedEmployeeId]);

  const totalEmployees = pagination?.total || 0;

  const summary = useMemo(() => {
    const activeCount = employees.filter((employee) => String(employee.status || '').toLowerCase() === 'active').length;
    const withSalaryCount = employees.filter((employee) => employee.salaryStructures?.[0]?.agreedSalaryPerMonth !== undefined && employee.salaryStructures?.[0]?.agreedSalaryPerMonth !== null).length;
    const departmentCount = new Set(employees.map((employee) => employee.department).filter(Boolean)).size;

    return {
      activeCount,
      withSalaryCount,
      departmentCount,
    };
  }, [employees]);

  const selectedEmployee = detailState.employee;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Employees</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '780px' }}>
              Imported employee master records are live here. Select a row to inspect the latest salary structure and historical salary changes.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchEmployees}
            disabled={loading}
            style={{
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#0f172a',
              borderRadius: '10px',
              padding: '0.7rem 1rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
          <div style={statCardStyle}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Total Employees</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{totalEmployees.toLocaleString('en-US')}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Across imported employee records.</span>
          </div>
          <div style={statCardStyle}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Active On Page</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{summary.activeCount.toLocaleString('en-US')}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Rows currently visible with active status.</span>
          </div>
          <div style={statCardStyle}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Visible Salary Profiles</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{summary.withSalaryCount.toLocaleString('en-US')}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Rows on this page with a current or latest salary structure.</span>
          </div>
          <div style={statCardStyle}>
            <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Departments Visible</span>
            <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{summary.departmentCount.toLocaleString('en-US')}</strong>
            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>Distinct departments on the current page.</span>
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', top: '50%', left: '0.95rem', transform: 'translateY(-50%)', color: '#94a3b8' }}></i>
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by employee number, name, contact, or national ID"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '0.85rem 1rem 0.85rem 2.7rem',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '0.92rem',
              }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{
              minWidth: '180px',
              padding: '0.85rem 1rem',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              fontSize: '0.92rem',
              backgroundColor: '#fff',
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {error ? (
          <div style={{ padding: '1rem' }}>
            <ErrorState message={error} />
          </div>
        ) : loading ? (
          <EmptyState message="Loading employee records..." />
        ) : !employees.length ? (
          <EmptyState message="No employee records matched the current search and status filters." />
        ) : (
          <>
            <div style={{ overflowX: 'auto', maxHeight: '540px' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Employee</th>
                    <th style={thStyle}>Department</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Contact</th>
                    <th style={thStyle}>Current Salary</th>
                    <th style={thStyle}>Employment</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => {
                    const latestSalary = employee.salaryStructures?.[0] || null;
                    const selected = employee.id === selectedEmployeeId;

                    return (
                      <tr
                        key={employee.id}
                        onClick={() => setSelectedEmployeeId(employee.id)}
                        style={{ backgroundColor: selected ? '#f8fafc' : '#fff', cursor: 'pointer' }}
                      >
                        <td style={tdStyle}>
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            <strong style={{ color: '#0f172a' }}>{buildFullName(employee)}</strong>
                            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>
                              {employee.employeeNo || 'No employee number'}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            <strong style={{ color: '#0f172a' }}>{employee.department || 'Not set'}</strong>
                            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{employee.position || 'Position not set'}</span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <span style={statusBadgeStyle(String(employee.status || '').toLowerCase())}>{employee.status || 'Unknown'}</span>
                        </td>
                        <td style={tdStyle}>{employee.contactNumber || 'Not set'}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            <strong style={{ color: '#0f172a' }}>
                              {latestSalary ? money(latestSalary.agreedSalaryPerMonth, latestSalary.currency) : 'Not set'}
                            </strong>
                            <span style={{ color: '#64748b', fontSize: '0.84rem' }}>
                              {latestSalary ? `Effective ${formatDate(latestSalary.effectiveFrom)}` : 'No salary structure imported'}
                            </span>
                          </div>
                        </td>
                        <td style={tdStyle}>{formatDate(employee.dateOfEmployment)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '1rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <span style={{ color: '#64748b', fontSize: '0.88rem' }}>
                Page {pagination?.page || 1} of {pagination?.totalPages || 1} with {(pagination?.total || 0).toLocaleString('en-US')} employees.
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={(pagination?.page || 1) <= 1}
                  style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  disabled={(pagination?.page || 1) >= (pagination?.totalPages || 1)}
                  style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>Selected Employee Details</h4>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Salary structures imported from the workbook appear here for the selected employee.
            </p>
          </div>
          {selectedEmployee && (
            <div style={{ ...statusBadgeStyle(String(selectedEmployee.status || '').toLowerCase()) }}>
              {selectedEmployee.status || 'Unknown'}
            </div>
          )}
        </div>

        {detailState.error ? (
          <div style={{ marginTop: '1rem' }}>
            <ErrorState message={detailState.error} />
          </div>
        ) : detailState.loading ? (
          <EmptyState message="Loading employee salary details..." />
        ) : !selectedEmployee ? (
          <EmptyState message="Select an employee row above to inspect imported salary structures." />
        ) : (
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem' }}>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Employee</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>{buildFullName(selectedEmployee)}</div>
                <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.9rem' }}>{selectedEmployee.employeeNo || 'No employee number'}</div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Current Salary</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedEmployee.salaryStructures?.[0] ? money(selectedEmployee.salaryStructures[0].agreedSalaryPerMonth, selectedEmployee.salaryStructures[0].currency) : 'Not set'}
                </div>
                <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.9rem' }}>
                  {selectedEmployee.salaryStructures?.[0] ? `Effective ${formatDate(selectedEmployee.salaryStructures[0].effectiveFrom)}` : 'No current salary record'}
                </div>
              </div>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '14px', padding: '1rem' }}>
                <div style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>Department / Position</div>
                <div style={{ marginTop: '0.45rem', fontWeight: 800, color: '#0f172a' }}>{selectedEmployee.department || 'Not set'}</div>
                <div style={{ marginTop: '0.3rem', color: '#64748b', fontSize: '0.9rem' }}>{selectedEmployee.position || 'Position not set'}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
                <strong style={{ color: '#0f172a' }}>Salary History</strong>
                <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
                  Latest and historical salary structures imported for this employee.
                </p>
              </div>

              {!detailState.salaryHistory.length ? (
                <EmptyState message="No salary structures are attached to this employee yet." />
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Effective From</th>
                        <th style={thStyle}>Effective To</th>
                        <th style={thStyle}>Agreed Salary</th>
                        <th style={thStyle}>Annual Increment</th>
                        <th style={thStyle}>After Increment</th>
                        <th style={thStyle}>Current</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailState.salaryHistory.map((salary) => (
                        <tr key={salary.id}>
                          <td style={tdStyle}>{formatDate(salary.effectiveFrom)}</td>
                          <td style={tdStyle}>{formatDate(salary.effectiveTo)}</td>
                          <td style={tdStyle}>{money(salary.agreedSalaryPerMonth, salary.currency)}</td>
                          <td style={tdStyle}>{money(salary.annualIncrementAmount, salary.currency)}</td>
                          <td style={tdStyle}>{salary.salaryAfterIncrement ? money(salary.salaryAfterIncrement, salary.currency) : 'Not set'}</td>
                          <td style={tdStyle}>{salary.isCurrent ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeesTab;