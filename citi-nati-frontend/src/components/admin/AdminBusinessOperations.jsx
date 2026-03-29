import React, { useEffect, useRef, useState } from 'react';
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

const PLACEHOLDER_TEXT = {
  suppliers: 'Supplier management is being prepared here so imported workbook records and future supplier activity can be handled inside the same Business Operations workspace.',
  expenses: 'Expense categories, imported workbook expenses, and new operating costs will be managed from this section.',
  'monthly-summary': 'Monthly business rollups and cross-module summaries will appear here once the remaining tabs are connected.',
  employees: 'Employee master records imported from payroll workbooks will be reviewed and managed in this section.',
  payroll: 'Payroll periods, entries, loans, terminations, and reengagements will be managed here as the payroll workflow expands.',
  'report-history': 'Saved exports, print artifacts, and historical report runs will be accessible from this section.',
};

const AdminBusinessOperations = () => {
  const [activeTab, setActiveTab] = useState('sales-reports');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const headerRef = useRef(null);
  const [headerLayout, setHeaderLayout] = useState({ left: 0, width: 0, top: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);

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

  const contentByTab = {
    'sales-reports': <SalesReportsTab />,
    suppliers: <SuppliersTab refreshKey={dataRefreshKey} />,
    expenses: <ExpensesTab refreshKey={dataRefreshKey} />,
    'monthly-summary': <MonthlySummaryTab refreshKey={dataRefreshKey} />,
    employees: <EmployeesTab refreshKey={dataRefreshKey} />,
    payroll: <PayrollTab refreshKey={dataRefreshKey} />,
    'report-history': <ReportHistoryTab refreshKey={dataRefreshKey} />,
  };

  useEffect(() => {
    let resizeObserver;

    const update = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;
      const rect = contentArea.getBoundingClientRect();
      setHeaderLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? 56 : 0,
      });
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    update();
    window.addEventListener('resize', update);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', update);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (headerRef.current) {
      setHeaderHeight(headerRef.current.offsetHeight);
    }
  });

  const fixedHeaderStyle = {
    position: 'fixed',
    top: `${headerLayout.top}px`,
    left: `${headerLayout.left}px`,
    width: `${headerLayout.width}px`,
    zIndex: 80,
    backgroundColor: '#f8fafc',
    boxSizing: 'border-box',
    padding: '1.1rem 0 0',
  };

  const spacerHeight = Math.max(headerHeight, 150);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={headerRef} style={fixedHeaderStyle}>
        <div
          style={{
            ...{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '22px',
              boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
              padding: '1.2rem 1.3rem 1rem',
            },
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', color: '#5B4B8A', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.06em' }}>
                <i className="fas fa-briefcase"></i>
                Business Operations
              </div>
              <h2 style={{ margin: '0.45rem 0 0', fontSize: '1.65rem', color: '#0f172a' }}>Unified Business Management Workspace</h2>
              <p style={{ margin: '0.55rem 0 0', color: '#64748b', maxWidth: '900px', lineHeight: 1.6 }}>
                Review branch-aware sales performance now, then extend the same workspace to suppliers, expenses, employees, payroll, and import-driven operational workflows.
              </p>
            </div>
            <BusinessOperationsImportButton onClick={() => setIsImportModalOpen(true)} />
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #edf2f7' }}>
            <BusinessOperationsTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      <div style={{ height: spacerHeight }}></div>

      <div style={{ display: 'grid', gap: '1rem' }}>
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
