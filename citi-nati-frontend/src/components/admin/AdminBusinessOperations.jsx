import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import BusinessOperationsTabs from './business-operations/BusinessOperationsTabs.jsx';
import SalesReportsTab from './business-operations/SalesReportsTab.jsx';
import ComingSoonTabPanel from './business-operations/ComingSoonTabPanel.jsx';
import EmployeesTab from './business-operations/EmployeesTab.jsx';
import ExpensesTab from './business-operations/ExpensesTab.jsx';
import MonthlySummaryTab from './business-operations/MonthlySummaryTab.jsx';
import PayrollTab from './business-operations/PayrollTab.jsx';
import SuppliersTab from './business-operations/SuppliersTab.jsx';
import GoodsIntakeTab from './business-operations/GoodsIntakeTab.jsx';
import ReportHistoryTab from './business-operations/ReportHistoryTab.jsx';
import BusinessOperationsActionsTab from './business-operations/BusinessOperationsActionsTab.jsx';
import BusinessAnalyticsTab from './business-operations/BusinessAnalyticsTab.jsx';
import InventoryActivityLedger from './business-operations/InventoryActivityLedger.jsx';
import SalesBalancingTab from './business-operations/SalesBalancingTab.jsx';
import BusinessOperationsImportButton from './business-operations/BusinessOperationsImportButton.jsx';
import BusinessOperationsImportModal from './business-operations/BusinessOperationsImportModal.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import useMobileViewport from '../../hooks/useMobileViewport.js';
import { registerBoDialogHandler } from '../../utils/boDialogBus.js';
import { getOperationalScopeOptions } from '../../utils/operationalScope.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { BUSINESS_OPERATIONS_PERMISSION_TREE, PERMISSION_KEYS, filterVisibleTabs, hasPermission } from '../../utils/permissions.js';

const BO_OPERATIONAL_SCOPES = getOperationalScopeOptions().map((scope, index) => ({
  id: index + 1,
  code: scope.locationCode,
  uiCode: scope.uiCode,
  name: scope.label,
  branchCode: scope.branchCode,
}));

const BO_ALL_LOCATIONS_SCOPE_ID = 'all';

const TABS = [
  { id: 'sales-reports', label: 'Sales Reports', icon: 'fa-chart-column', permission: PERMISSION_KEYS.BO_SALES_REPORTS_VIEW },
  { id: 'suppliers', label: 'Suppliers', icon: 'fa-truck-field', permission: PERMISSION_KEYS.BO_SUPPLIERS_VIEW },
  { id: 'goods-intake', label: 'Stock Intake & POS Transfer', icon: 'fa-boxes-stacked', permission: PERMISSION_KEYS.BO_GOODS_INTAKE_VIEW },
  { id: 'expenses', label: 'Expenses', icon: 'fa-file-invoice-dollar', permission: PERMISSION_KEYS.BO_EXPENSES_VIEW },
  { id: 'monthly-summary', label: 'Monthly Summary', icon: 'fa-calendar-days', permission: PERMISSION_KEYS.BO_MONTHLY_SUMMARY_VIEW },
  { id: 'employees', label: 'Employees', icon: 'fa-id-badge', permission: PERMISSION_KEYS.BO_EMPLOYEES_VIEW },
  { id: 'payroll', label: 'Payroll', icon: 'fa-money-check-dollar', permission: PERMISSION_KEYS.BO_PAYROLL_VIEW },
  { id: 'report-history', label: 'Report History', icon: 'fa-clock-rotate-left', permission: PERMISSION_KEYS.BO_REPORT_HISTORY_VIEW },
  { id: 'sales-balancing', label: 'Sales Balancing', icon: 'fa-scale-balanced', permission: PERMISSION_KEYS.BO_SALES_BALANCING_VIEW },
  { id: 'analytics-performance', label: 'Analytics', icon: 'fa-chart-line', permission: PERMISSION_KEYS.BO_ANALYTICS_VIEW },
  {
    id: 'inventory-activity',
    label: 'Inventory Activity',
    icon: 'fa-box',
    permission: PERMISSION_KEYS.BO_ANALYTICS_VIEW,
  },
  { id: 'actions', label: 'Actions', icon: 'fa-triangle-exclamation', permission: PERMISSION_KEYS.BO_ACTIONS_VIEW },
];

const AdminBusinessOperations = () => {
  const { user } = useAuth();
  const { modal, showModal, closeModal } = useModal();
  const isMobileViewport = useMobileViewport();
  const [activeTab, setActiveTab] = useState('sales-reports');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [drilldownRequests, setDrilldownRequests] = useState({});
  const [locations] = useState(BO_OPERATIONAL_SCOPES);
  const [selectedLocationId, setSelectedLocationId] = useState(BO_ALL_LOCATIONS_SCOPE_ID);
  const [locationRefreshKey, setLocationRefreshKey] = useState(0);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  useEffect(() => {
    setLocationRefreshKey((prev) => prev + 1);
  }, [selectedLocationId]);

  const selectedLocation = useMemo(() => {
    if (String(selectedLocationId || '') === BO_ALL_LOCATIONS_SCOPE_ID) {
      return null;
    }

    const asNumber = Number(selectedLocationId);
    return locations.find((location) => Number(location.id) === asNumber) || null;
  }, [locations, selectedLocationId]);

  const selectedLocationCode = selectedLocation?.code || '';
  const selectedLocationIdNumber = selectedLocation ? Number(selectedLocation.id) : null;
  const selectedLocationName = selectedLocation?.name || 'All Locations';
  const isAllLocationsSelected = String(selectedLocationId || '') === BO_ALL_LOCATIONS_SCOPE_ID;
  const canAccessBusinessOperationsPanel = hasPermission(user, BUSINESS_OPERATIONS_PERMISSION_TREE.panelAccess);
  const visibleTabs = useMemo(() => filterVisibleTabs(TABS, user, BUSINESS_OPERATIONS_PERMISSION_TREE.panelAccess), [user]);
  const visibleTabIds = useMemo(() => new Set(visibleTabs.map((tab) => tab.id)), [visibleTabs]);
  const defaultVisibleTabId = visibleTabs[0]?.id || null;

  const goodsIntakePermissions = useMemo(() => ({
    canViewForm: hasPermission(user, PERMISSION_KEYS.BO_GOODS_INTAKE_FORM_VIEW),
    canViewHistory: hasPermission(user, PERMISSION_KEYS.BO_GOODS_INTAKE_HISTORY_VIEW),
    canCreate: hasPermission(user, PERMISSION_KEYS.BO_GOODS_INTAKE_CREATE),
    canEdit: hasPermission(user, PERMISSION_KEYS.BO_GOODS_INTAKE_EDIT),
    canDelete: hasPermission(user, PERMISSION_KEYS.BO_GOODS_INTAKE_DELETE),
    canExport: hasPermission(user, PERMISSION_KEYS.BO_GOODS_INTAKE_EXPORT),
  }), [user]);

  const monthlySummaryPermissions = useMemo(() => ({
    canViewOverviewCards: hasPermission(user, PERMISSION_KEYS.BO_MONTHLY_SUMMARY_OVERVIEW_CARDS_VIEW),
    canViewSalesOverview: hasPermission(user, PERMISSION_KEYS.BO_MONTHLY_SUMMARY_SALES_OVERVIEW_VIEW),
    canViewExpensesOverview: hasPermission(user, PERMISSION_KEYS.BO_MONTHLY_SUMMARY_EXPENSES_OVERVIEW_VIEW),
    canViewPayrollOverview: hasPermission(user, PERMISSION_KEYS.BO_MONTHLY_SUMMARY_PAYROLL_OVERVIEW_VIEW),
    canViewSuppliersOverview: hasPermission(user, PERMISSION_KEYS.BO_MONTHLY_SUMMARY_SUPPLIERS_OVERVIEW_VIEW),
    canViewNetOverview: hasPermission(user, PERMISSION_KEYS.BO_MONTHLY_SUMMARY_NET_OVERVIEW_VIEW),
    canOpenSalesReports: visibleTabIds.has('sales-reports'),
    canOpenExpenses: visibleTabIds.has('expenses'),
    canOpenPayroll: visibleTabIds.has('payroll'),
    canOpenSuppliers: visibleTabIds.has('suppliers'),
    canExport: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_EXPORT),
  }), [user, visibleTabIds]);

  const salesReportsPermissions = useMemo(() => ({
    canViewSummary: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_SUMMARY_VIEW),
    canViewSalesBy: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_SALES_BY_VIEW),
    canExportReports: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_EXPORT),
    canImportReports: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_IMPORT),
    canExportFullWorkbook: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_FULL_WORKBOOK_EXPORT),
    canImportFullWorkbook: hasPermission(user, PERMISSION_KEYS.BO_SALES_REPORTS_FULL_WORKBOOK_IMPORT),
  }), [user]);

  const actionsPermissions = useMemo(() => ({
    canWipeData: hasPermission(user, PERMISSION_KEYS.BO_ACTIONS_WIPE_DATA),
  }), [user]);

  useEffect(() => {
    if (!defaultVisibleTabId) return;
    if (!visibleTabIds.has(activeTab)) {
      setActiveTab(defaultVisibleTabId);
    }
  }, [activeTab, defaultVisibleTabId, visibleTabIds]);

  const handleImportSuccess = () => {
    setLocationRefreshKey((current) => current + 1);
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
    setActiveTab(visibleTabIds.has(nextTab) ? nextTab : (defaultVisibleTabId || nextTab));
    setIsImportModalOpen(false);
  };

  const handleNavigateTab = (tabId, drilldownPayload = null) => {
    if (!visibleTabIds.has(tabId)) {
      return;
    }

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

  const handleBoDialog = useCallback((config) => {
    showModal({
      ...config,
      onConfirm: () => {
        config.onConfirm?.();
        closeModal();
      },
      onCancel: () => {
        config.onCancel?.();
        closeModal();
      },
    });
  }, [closeModal, showModal]);

  useEffect(() => {
    const unregister = registerBoDialogHandler(handleBoDialog);
    return unregister;
  }, [handleBoDialog]);

  const contentByTab = {
    'sales-reports': <SalesReportsTab drilldownRequest={drilldownRequests['sales-reports']} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} permissions={salesReportsPermissions} />,
    suppliers: <SuppliersTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'goods-intake': <GoodsIntakeTab selectedLocationId={selectedLocationIdNumber} locations={locations} permissions={goodsIntakePermissions} />,
    expenses: <ExpensesTab refreshKey={locationRefreshKey} drilldownRequest={drilldownRequests.expenses} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'monthly-summary': <MonthlySummaryTab refreshKey={locationRefreshKey} onNavigateTab={handleNavigateTab} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocationName} permissions={monthlySummaryPermissions} />,
    employees: <EmployeesTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    payroll: <PayrollTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'report-history': <ReportHistoryTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} onNavigateTab={handleNavigateTab} />,
    'sales-balancing': <SalesBalancingTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocationName} />,
    'analytics-performance': <BusinessAnalyticsTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} locations={locations} />,
    'inventory-activity': (<InventoryActivityLedger selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode}/>
),
    actions: <BusinessOperationsActionsTab permissions={actionsPermissions} />,
  };

  if (!canAccessBusinessOperationsPanel) {
    return (
      <div className="bo-shell" style={{ display: 'grid', gap: '0.8rem' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.1rem', background: '#ffffff' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>Access Restricted</h3>
          <p style={{ margin: 0, color: '#64748b' }}>
            You do not have permission to access Business Operations.
          </p>
        </div>
      </div>
    );
  }

  if (visibleTabs.length === 0) {
    return (
      <div className="bo-shell" style={{ display: 'grid', gap: '0.8rem' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.1rem', background: '#ffffff' }}>
          <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>No Permitted Sections</h3>
          <p style={{ margin: 0, color: '#64748b' }}>
            Your account can open Business Operations, but no tabs are currently assigned.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bo-shell" style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        className={`bo-filter-bar admin-filter-bar-fixed ${isMobileViewport ? 'admin-mobile-filter-bar' : ''}`}
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          boxSizing: 'border-box',
        }}
      >
          <div className="bo-filter-header" style={{ display: isMobileViewport ? 'flex' : 'grid', gridTemplateColumns: isMobileViewport ? undefined : 'minmax(0, 1fr) auto', flexWrap: isMobileViewport ? 'wrap' : 'nowrap' }}>
            <div className="bo-filter-title" style={{ minWidth: 0 }}>
              <i className="fas fa-briefcase"></i>
              Business Operations
              {isAllLocationsSelected && (
                <span
                  style={{
                    marginLeft: '0.65rem',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    color: '#0f766e',
                    background: '#ccfbf1',
                    border: '1px solid #5eead4',
                    borderRadius: '999px',
                    padding: '0.2rem 0.55rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                  title="Reports and BO actions are running in combined mode for all locations"
                >
                  <i className="fas fa-layer-group" style={{ fontSize: '0.7rem' }}></i>
                  All Locations Active
                </span>
              )}
            </div>
              <div className="bo-filter-actions" style={{ marginLeft: isMobileViewport ? 0 : 'auto', justifyContent: isMobileViewport ? 'space-between' : 'flex-end', flexWrap: isMobileViewport ? 'wrap' : 'nowrap', justifySelf: isMobileViewport ? 'stretch' : 'end' }}>
              <label className="bo-location-control">
                <span className="bo-location-label">
                  Location Scope
                </span>
                <select
                  value={selectedLocationId}
                  onChange={(event) => setSelectedLocationId(event.target.value)}
                  className="bo-location-select"
                >
                  <option value={BO_ALL_LOCATIONS_SCOPE_ID}>All Locations (Combined)</option>
                  {locations.map((location) => (
                    <option key={location.id} value={String(location.id)}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <BusinessOperationsImportButton onClick={() => setIsImportModalOpen(true)} />
            </div>
          </div>

          <div className="bo-tabs-row">
            <BusinessOperationsTabs tabs={visibleTabs} activeTab={activeTab} onChange={handleNavigateTab} />
          </div>
      </div>

      <div style={{ height: `${filterBarHeight}px` }}></div>

      <div className="bo-content-grid">
        {contentByTab[activeTab] || contentByTab[defaultVisibleTabId]}
      </div>

      <BusinessOperationsImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSuccess={handleImportSuccess}
        onViewImportedData={handleViewImportedData}
      />

      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
        confirmButtonColor={modal.confirmButtonColor}
      >
        {modal.children}
      </Modal>
    </div>
  );
};

export default AdminBusinessOperations;
