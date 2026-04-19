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
import { getOperationalScopeOptions } from '../../utils/operationalScope.js';

const BO_OPERATIONAL_SCOPES = getOperationalScopeOptions().map((scope, index) => ({
  id: index + 1,
  code: scope.locationCode,
  uiCode: scope.uiCode,
  name: scope.label,
  branchCode: scope.branchCode,
}));

const BO_ALL_LOCATIONS_SCOPE_ID = 'all';

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

const AdminBusinessOperations = () => {
  const { modal, showModal, closeModal } = useModal();
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
    'sales-reports': <SalesReportsTab drilldownRequest={drilldownRequests['sales-reports']} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} />,
    suppliers: <SuppliersTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'goods-intake': <GoodsIntakeTab selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    expenses: <ExpensesTab refreshKey={locationRefreshKey} drilldownRequest={drilldownRequests.expenses} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'monthly-summary': <MonthlySummaryTab refreshKey={locationRefreshKey} onNavigateTab={handleNavigateTab} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocationName} />,
    employees: <EmployeesTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    payroll: <PayrollTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'report-history': <ReportHistoryTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} onNavigateTab={handleNavigateTab} />,
    'sales-balancing': <SalesBalancingTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocationName} />,
    'analytics-performance': <BusinessAnalyticsTab selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} locations={locations} />,
    actions: <BusinessOperationsActionsTab />,
  };

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
              <div className="bo-filter-actions">
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
            <BusinessOperationsTabs tabs={TABS} activeTab={activeTab} onChange={handleNavigateTab} />
          </div>
      </div>

      <div style={{ height: `${filterBarHeight}px` }}></div>

      <div className="bo-content-grid">
        {contentByTab[activeTab]}
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
