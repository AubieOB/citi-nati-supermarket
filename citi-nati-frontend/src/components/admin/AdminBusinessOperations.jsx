import React, { useState } from 'react';
import BusinessOperationsTabs from './business-operations/BusinessOperationsTabs.jsx';
import SalesReportsTab from './business-operations/SalesReportsTab.jsx';
import ComingSoonTabPanel from './business-operations/ComingSoonTabPanel.jsx';
import EmployeesTab from './business-operations/EmployeesTab.jsx';
import ExpensesTab from './business-operations/ExpensesTab.jsx';
import MonthlySummaryTab from './business-operations/MonthlySummaryTab.jsx';
import PayrollTab from './business-operations/PayrollTab.jsx';
import SuppliersTab from './business-operations/SuppliersTab.jsx';
import ReportHistoryTab from './business-operations/ReportHistoryTab.jsx';
import BusinessOperationsImportButton from './business-operations/BusinessOperationsImportButton.jsx';
import BusinessOperationsImportModal from './business-operations/BusinessOperationsImportModal.jsx';

const TABS = [
  { id: 'sales-reports', label: 'Sales Reports', icon: 'fa-chart-column' },
  { id: 'suppliers', label: 'Suppliers', icon: 'fa-truck-field' },
  { id: 'expenses', label: 'Expenses', icon: 'fa-file-invoice-dollar' },
  { id: 'monthly-summary', label: 'Monthly Summary', icon: 'fa-calendar-days' },
  { id: 'employees', label: 'Employees', icon: 'fa-id-badge' },
  { id: 'payroll', label: 'Payroll', icon: 'fa-money-check-dollar' },
  { id: 'report-history', label: 'Report History', icon: 'fa-clock-rotate-left' },
];

const AdminBusinessOperations = () => {
  const [activeTab, setActiveTab] = useState('sales-reports');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [drilldownRequests, setDrilldownRequests] = useState({});

  const handleImportSuccess = () => {
    setDataRefreshKey((current) => current + 1);
  };

  const handleViewImportedData = ({ importResult }) => {
    const importedSections = Object.keys(importResult?.data || {});
    const nextTab = importedSections.includes('suppliers')
      ? 'suppliers'
      : importedSections.some((section) => section === 'expenses' || section === 'expenseCategories')
        ? 'expenses'
        : importedSections.some((section) => section === 'employees' || section === 'salaryStructures')
          ? 'employees'
          : 'payroll';

    setDataRefreshKey((current) => current + 1);
    setActiveTab(nextTab);
    setIsImportModalOpen(false);
  };

  const handleNavigateTab = (tabId, drilldownPayload = null) => {
    if (drilldownPayload) {
      setDrilldownRequests((prev) => ({
        ...prev,
        [tabId]: {
          ...drilldownPayload,
          token: Date.now(),
        },
      }));
    }
    setActiveTab(tabId);
  };

  const contentByTab = {
    'sales-reports': <SalesReportsTab drilldownRequest={drilldownRequests['sales-reports']} />,
    suppliers: <SuppliersTab refreshKey={dataRefreshKey} />,
    expenses: <ExpensesTab refreshKey={dataRefreshKey} drilldownRequest={drilldownRequests.expenses} />,
    'monthly-summary': <MonthlySummaryTab refreshKey={dataRefreshKey} onNavigateTab={handleNavigateTab} />,
    employees: <EmployeesTab refreshKey={dataRefreshKey} />,
    payroll: <PayrollTab refreshKey={dataRefreshKey} />,
    'report-history': <ReportHistoryTab refreshKey={dataRefreshKey} />,
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'sticky', top: '0.5rem', zIndex: 35 }}>
        <div
          style={{
            ...{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '22px',
              boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
              padding: '0.95rem 1rem 0.85rem',
              backdropFilter: 'blur(6px)',
            },
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', color: '#5B4B8A', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                <i className="fas fa-briefcase"></i>
                Business Operations
              </div>
              <h2 style={{ margin: '0.35rem 0 0', fontSize: 'clamp(1.25rem, 2.3vw, 1.65rem)', color: '#0f172a' }}>Unified Business Management Workspace</h2>
              <p style={{ margin: '0.4rem 0 0', color: '#64748b', maxWidth: '860px', lineHeight: 1.5, fontSize: '0.95rem' }}>
                Review branch-aware sales performance now, then extend the same workspace to suppliers, expenses, employees, payroll, and import-driven operational workflows.
              </p>
            </div>
            <BusinessOperationsImportButton onClick={() => setIsImportModalOpen(true)} />
          </div>

          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #edf2f7' }}>
            <BusinessOperationsTabs tabs={TABS} activeTab={activeTab} onChange={handleNavigateTab} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem', marginTop: '0.8rem' }}>
        {contentByTab[activeTab]}
      </div>

      <BusinessOperationsImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={handleImportSuccess}
        onViewImportedData={handleViewImportedData}
      />
    </div>
  );
};

export default AdminBusinessOperations;
