import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api.js';

const cardStyle = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '18px',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
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
};

const tdStyle = {
  padding: '0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const money = (value) => `MWK ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const buildEmployeeName = (employee) => {
  if (!employee) return 'Unknown employee';
  return [employee.firstName, employee.surname].filter(Boolean).join(' ');
};

const EmptyState = ({ message }) => (
  <div style={{ padding: '2rem', color: '#64748b', textAlign: 'center' }}>{message}</div>
);

const ErrorState = ({ message }) => (
  <div style={{ padding: '1rem 1.25rem', borderRadius: '14px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
    {message}
  </div>
);

const SectionTable = ({ title, description, columns, rows, emptyMessage }) => (
  <div style={{ ...cardStyle, overflow: 'hidden' }}>
    <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
      <strong style={{ color: '#0f172a' }}>{title}</strong>
      <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>{description}</p>
    </div>

    {!rows.length ? (
      <EmptyState message={emptyMessage} />
    ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={thStyle}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.id || `${title}-${rowIndex}`}>
                {columns.map((column) => (
                  <td key={column.key} style={tdStyle}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

const PayrollTab = ({ refreshKey = 0 }) => {
  const [filters, setFilters] = useState({ employeeId: '', payrollPeriodId: '' });
  const [lookupState, setLookupState] = useState({ employees: [], periods: [] });
  const [entriesPage, setEntriesPage] = useState(1);
  const [state, setState] = useState({
    loading: true,
    error: '',
    periods: [],
    periodsPagination: null,
    entries: [],
    entriesPagination: null,
    terminations: [],
    terminationsPagination: null,
    reengagements: [],
    reengagementsPagination: null,
  });

  const queryParams = useMemo(() => ({
    employeeId: filters.employeeId || undefined,
    payrollPeriodId: filters.payrollPeriodId || undefined,
  }), [filters.employeeId, filters.payrollPeriodId]);

  const fetchLookups = useCallback(async () => {
    try {
      const [employeesResponse, periodsResponse] = await Promise.all([
        api.get('/business-operations/employees', { params: { page: 1, pageSize: 200, sortBy: 'createdAt', sortOrder: 'desc' } }),
        api.get('/business-operations/payroll/periods', { params: { page: 1, pageSize: 100, sortBy: 'createdAt', sortOrder: 'desc' } }),
      ]);

      setLookupState({
        employees: employeesResponse.data?.data || [],
        periods: periodsResponse.data?.data || [],
      });
    } catch (_error) {
      setLookupState({ employees: [], periods: [] });
    }
  }, []);

  const fetchPayrollData = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const [periodsResponse, entriesResponse, terminationsResponse, reengagementsResponse] = await Promise.all([
        api.get('/business-operations/payroll/periods', { params: { page: 1, pageSize: 6, sortBy: 'createdAt', sortOrder: 'desc' } }),
        api.get('/business-operations/payroll/entries', { params: { page: entriesPage, pageSize: 12, sortBy: 'createdAt', sortOrder: 'desc', ...queryParams } }),
        api.get('/business-operations/payroll/terminations', { params: { page: 1, pageSize: 8, sortBy: 'terminationDate', sortOrder: 'desc', employeeId: queryParams.employeeId } }),
        api.get('/business-operations/payroll/reengagements', { params: { page: 1, pageSize: 8, sortBy: 'effectiveDate', sortOrder: 'desc', employeeId: queryParams.employeeId } }),
      ]);

      setState({
        loading: false,
        error: '',
        periods: periodsResponse.data?.data || [],
        periodsPagination: periodsResponse.data?.pagination || null,
        entries: entriesResponse.data?.data || [],
        entriesPagination: entriesResponse.data?.pagination || null,
        terminations: terminationsResponse.data?.data || [],
        terminationsPagination: terminationsResponse.data?.pagination || null,
        reengagements: reengagementsResponse.data?.data || [],
        reengagementsPagination: reengagementsResponse.data?.pagination || null,
      });
    } catch (requestError) {
      setState({
        loading: false,
        error: requestError.response?.data?.error || 'Failed to load payroll records',
        periods: [],
        periodsPagination: null,
        entries: [],
        entriesPagination: null,
        terminations: [],
        terminationsPagination: null,
        reengagements: [],
        reengagementsPagination: null,
      });
    }
  }, [entriesPage, queryParams]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups, refreshKey]);

  useEffect(() => {
    fetchPayrollData();
  }, [fetchPayrollData, refreshKey]);

  useEffect(() => {
    setEntriesPage(1);
  }, [filters.employeeId, filters.payrollPeriodId]);

  const summaryCards = useMemo(() => ([
    {
      label: 'Payroll Periods',
      value: state.periodsPagination?.total || 0,
      note: 'Imported pay runs available for payroll entries.',
    },
    {
      label: filters.employeeId || filters.payrollPeriodId ? 'Filtered Entries' : 'Payroll Entries',
      value: state.entriesPagination?.total || 0,
      note: filters.employeeId || filters.payrollPeriodId ? 'Entries matching the active employee/period filters.' : 'Individual employee pay records loaded into the system.',
    },
    {
      label: 'Terminations',
      value: state.terminationsPagination?.total || 0,
      note: 'Termination records parsed from workbook sections.',
    },
    {
      label: 'Reengagements',
      value: state.reengagementsPagination?.total || 0,
      note: 'Reengagement records recognized from the workbook.',
    },
  ]), [state.entriesPagination?.total, state.periodsPagination?.total, state.reengagementsPagination?.total, state.terminationsPagination?.total]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ ...cardStyle, padding: '1.2rem 1.3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.15rem' }}>Payroll</h3>
            <p style={{ margin: '0.45rem 0 0', color: '#64748b', lineHeight: 1.6, maxWidth: '780px' }}>
              Payroll imports are now visible here, including recent periods, employee payroll entries, terminations, and reengagements. Filter by employee and payroll period to isolate the exact imported records you want.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchPayrollData}
            disabled={state.loading}
            style={{
              border: '1px solid #cbd5e1',
              backgroundColor: '#fff',
              color: '#0f172a',
              borderRadius: '10px',
              padding: '0.7rem 1rem',
              fontWeight: 700,
              cursor: state.loading ? 'not-allowed' : 'pointer',
            }}
          >
            <i className={`fas ${state.loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: '0.45rem' }}></i>
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
          {summaryCards.map((item) => (
            <div key={item.label} style={{ ...cardStyle, padding: '1rem 1.1rem', display: 'grid', gap: '0.35rem' }}>
              <span style={{ color: '#64748b', fontSize: '0.78rem', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em' }}>{item.label}</span>
              <strong style={{ fontSize: '1.65rem', color: '#0f172a' }}>{item.value.toLocaleString('en-US')}</strong>
              <span style={{ color: '#64748b', fontSize: '0.84rem' }}>{item.note}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select
            value={filters.employeeId}
            onChange={(event) => setFilters((current) => ({ ...current, employeeId: event.target.value }))}
            style={{ minWidth: '260px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}
          >
            <option value="">All employees</option>
            {lookupState.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {[employee.firstName, employee.surname].filter(Boolean).join(' ')}{employee.employeeNo ? ` (${employee.employeeNo})` : ''}
              </option>
            ))}
          </select>
          <select
            value={filters.payrollPeriodId}
            onChange={(event) => setFilters((current) => ({ ...current, payrollPeriodId: event.target.value }))}
            style={{ minWidth: '260px', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', fontSize: '0.92rem', backgroundColor: '#fff' }}
          >
            <option value="">All payroll periods</option>
            {lookupState.periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.description || String(period.payrollMode || '').replace('_', ' ') || `Period ${period.id}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFilters({ employeeId: '', payrollPeriodId: '' })}
            style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.7rem 1rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {state.error ? (
        <ErrorState message={state.error} />
      ) : state.loading ? (
        <div style={cardStyle}>
          <EmptyState message="Loading payroll records..." />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <SectionTable
            title="Recent Payroll Periods"
            description="Latest payroll periods available for entries and reporting."
            rows={state.periods}
            emptyMessage="No payroll periods have been imported yet."
            columns={[
              { key: 'mode', label: 'Mode', render: (row) => String(row.payrollMode || '').replace('_', ' ') || 'Not set' },
              { key: 'description', label: 'Description', render: (row) => row.description || 'No description' },
              { key: 'status', label: 'Status', render: (row) => row.status || 'Unknown' },
              { key: 'createdBy', label: 'Created By', render: (row) => row.createdBy || 'System' },
              { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
            ]}
          />

          <SectionTable
            title="Recent Payroll Entries"
            description="Employee payroll records, filtered by employee and payroll period when selected."
            rows={state.entries}
            emptyMessage="No payroll entries have been imported yet."
            columns={[
              { key: 'employee', label: 'Employee', render: (row) => `${buildEmployeeName(row.employee)}${row.employee?.employeeNo ? ` (${row.employee.employeeNo})` : ''}` },
              { key: 'period', label: 'Payroll Period', render: (row) => row.payrollPeriod?.description || String(row.payrollPeriod?.payrollMode || '').replace('_', ' ') || 'Not set' },
              { key: 'basicSalary', label: 'Basic Salary', render: (row) => money(row.basicSalary) },
              { key: 'grossPay', label: 'Gross Pay', render: (row) => money(row.grossPay) },
              { key: 'netPay', label: 'Net Pay', render: (row) => money(row.netPay) },
            ]}
          />

          {state.entriesPagination && state.entriesPagination.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0 0.25rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#64748b', fontSize: '0.88rem' }}>Page {state.entriesPagination.page} of {state.entriesPagination.totalPages} with {state.entriesPagination.total.toLocaleString('en-US')} payroll entries.</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => setEntriesPage((current) => Math.max(1, current - 1))} disabled={state.entriesPagination.page <= 1} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Previous</button>
                <button type="button" onClick={() => setEntriesPage((current) => current + 1)} disabled={state.entriesPagination.page >= state.entriesPagination.totalPages} style={{ border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#0f172a', borderRadius: '10px', padding: '0.55rem 0.9rem', fontWeight: 700, cursor: 'pointer' }}>Next</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            <SectionTable
              title="Terminations"
              description="Recent termination records recognized during import."
              rows={state.terminations}
              emptyMessage="No termination records have been imported yet."
              columns={[
                { key: 'employee', label: 'Employee', render: (row) => buildEmployeeName(row.employee) },
                { key: 'date', label: 'Termination Date', render: (row) => formatDate(row.terminationDate) },
                { key: 'reason', label: 'Reason', render: (row) => row.reason || 'Not provided' },
                { key: 'settlement', label: 'Settlement', render: (row) => row.settlementAmount ? money(row.settlementAmount) : 'Not set' },
              ]}
            />

            <SectionTable
              title="Reengagements"
              description="Recent reengagement records parsed from the workbook."
              rows={state.reengagements}
              emptyMessage="No reengagement records have been imported yet."
              columns={[
                { key: 'employee', label: 'Employee', render: (row) => buildEmployeeName(row.employee) },
                { key: 'effectiveDate', label: 'Effective Date', render: (row) => formatDate(row.effectiveDate) },
                { key: 'occupation', label: 'Occupation', render: (row) => row.occupation || 'Not set' },
                { key: 'wage', label: 'Reengagement Wage', render: (row) => row.reengagementWage ? money(row.reengagementWage) : 'Not set' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollTab;