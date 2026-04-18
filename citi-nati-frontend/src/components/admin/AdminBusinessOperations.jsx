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
import SalesBalancingTab from './business-operations/SalesBalancingTab.jsx';
import BusinessOperationsImportButton from './business-operations/BusinessOperationsImportButton.jsx';
import BusinessOperationsImportModal from './business-operations/BusinessOperationsImportModal.jsx';
import Modal from '../common/Modal.jsx';
import { useModal } from '../../hooks/useModal.js';
import { registerBoDialogHandler } from '../../utils/boDialogBus.js';
import api from '../../utils/api.js';
import { BO_OPERATIONAL_SCOPES, resolveBoScope } from './business-operations/boScope.js';

const TABS = [
  { id: 'sales-reports', label: 'Sales Reports', icon: 'fa-chart-column' },
  { id: 'suppliers', label: 'Suppliers', icon: 'fa-truck-field' },
  { id: 'goods-intake', label: 'Goods Intake', icon: 'fa-boxes-stacked' },
  { id: 'expenses', label: 'Expenses', icon: 'fa-file-invoice-dollar' },
  { id: 'monthly-summary', label: 'Monthly Summary', icon: 'fa-calendar-days' },
  { id: 'employees', label: 'Employees', icon: 'fa-id-badge' },
  { id: 'payroll', label: 'Payroll', icon: 'fa-money-check-dollar' },
  { id: 'report-history', label: 'Report History', icon: 'fa-clock-rotate-left' },
  { id: 'sales-balancing', label: 'Sales Balancing', icon: 'fa-scale-balanced' },
  { id: 'analytics-performance', label: 'Analytics', icon: 'fa-chart-line' },
  { id: 'actions', label: 'Actions', icon: 'fa-triangle-exclamation' },
];

const BO_TABS_ALLOW_ALL_SCOPES = new Set([
  'sales-reports',
  'monthly-summary',
  'report-history',
  'analytics-performance',
]);

const AdminBusinessOperations = () => {
  const { modal, showModal, closeModal } = useModal();
  const [activeTab, setActiveTab] = useState('sales-reports');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [drilldownRequests, setDrilldownRequests] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedScopeId, setSelectedScopeId] = useState('');
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
    let cancelled = false;

    const loadLocations = async () => {
      try {
        const response = await api.get('/business-operations/locations');
        const locationRows = Array.isArray(response?.data?.data) ? response.data.data : [];
        if (cancelled) return;
        setLocations(locationRows);
      } catch (_error) {
        if (cancelled) return;
        setLocations([
          { id: 1, code: 'BT', name: 'Blantyre' },
          { id: 2, code: 'ZA', name: 'Zomba' },
        ]);
      }
    };

    loadLocations();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLocationRefreshKey((prev) => prev + 1);
    }, [selectedScopeId]);

    const resolvedScope = useMemo(() => resolveBoScope(selectedScopeId, locations), [selectedScopeId, locations]);
    const selectedLocationIdNumber = resolvedScope.locationId;
    const selectedLocationCode = resolvedScope.locationCode;
    const selectedBranchCode = resolvedScope.branchCode;
    const selectedLocationName = BO_OPERATIONAL_SCOPES.find((s) => s.scopeId === selectedScopeId)?.branchName || '';

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
    'sales-reports': <SalesReportsTab drilldownRequest={drilldownRequests['sales-reports']} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} />,
    suppliers: <SuppliersTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} locations={locations} />,
    'goods-intake': <GoodsIntakeTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} locations={locations} />,
    expenses: <ExpensesTab refreshKey={locationRefreshKey} drilldownRequest={drilldownRequests.expenses} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} locations={locations} />,
    'monthly-summary': <MonthlySummaryTab refreshKey={locationRefreshKey} onNavigateTab={handleNavigateTab} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocationName} selectedBranchCode={selectedBranchCode} />,
    employees: <EmployeesTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} locations={locations} />,
    payroll: <PayrollTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} locations={locations} />,
    'report-history': <ReportHistoryTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} onNavigateTab={handleNavigateTab} />,
    'sales-balancing': <SalesBalancingTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocationName} selectedBranchCode={selectedBranchCode} />,
    'analytics-performance': <BusinessAnalyticsTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedBranchCode={selectedBranchCode} locations={locations} />,
    actions: <BusinessOperationsActionsTab />,
  };

  const activeTabRequiresScope = !BO_TABS_ALLOW_ALL_SCOPES.has(activeTab);

  return (
    <div className="bo-shell" style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        className="bo-filter-bar"
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          boxSizing: 'border-box',
        }}
      >
          <div className="bo-filter-header">
            <div className="bo-filter-title">
              <i className="fas fa-briefcase"></i>
              Business Operations
            </div>
              <div className="bo-filter-actions">
              <label className="bo-location-control">
                <span className="bo-location-label">
                  Location Scope
                </span>
                <select
                  value={selectedScopeId}
                  onChange={(event) => setSelectedScopeId(event.target.value)}
                  className="bo-location-select"
                >
                  <option value="">All Locations</option>
                  {BO_OPERATIONAL_SCOPES.map((scope) => (
                    <option key={scope.scopeId} value={scope.scopeId}>
                      {scope.label}
                    </option>
                  ))}
                </select>
              </label>
              <BusinessOperationsImportButton onClick={() => setIsImportModalOpen(true)} />
            </div>
          </div>

          <div className="bo-tabs-row">
            <BusinessOperationsTabs tabs={TABS} activeTab={activeTab} onChange={handleNavigateTab} />
          </div>
      </div>

      <div style={{ height: `${filterBarHeight}px` }}></div>

      <div className="bo-content-grid">
        {activeTabRequiresScope && !selectedScopeId ? (
          <div style={{ padding: '1.2rem', borderRadius: '12px', border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155' }}>
            Select an operational location to continue in this workspace.
          </div>
        ) : (
          contentByTab[activeTab]
        )}
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
