import React, { useEffect, useRef, useMemo, useState } from 'react';
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
import api from '../../utils/api.js';

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
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [drilldownRequests, setDrilldownRequests] = useState({});
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('all');
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
          { id: 1, code: 'BLT', name: 'Blantyre' },
          { id: 2, code: 'ZMB', name: 'Zomba' },
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
  }, [selectedLocationId]);

  const selectedLocation = useMemo(() => {
    if (selectedLocationId === 'all') return null;
    const asNumber = Number(selectedLocationId);
    return locations.find((location) => Number(location.id) === asNumber) || null;
  }, [locations, selectedLocationId]);

  const selectedLocationCode = selectedLocation?.code || '';
  const selectedLocationIdNumber = selectedLocation ? Number(selectedLocation.id) : null;

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

  const contentByTab = {
    'sales-reports': <SalesReportsTab drilldownRequest={drilldownRequests['sales-reports']} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} />,
    suppliers: <SuppliersTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    expenses: <ExpensesTab refreshKey={locationRefreshKey} drilldownRequest={drilldownRequests.expenses} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'monthly-summary': <MonthlySummaryTab refreshKey={locationRefreshKey} onNavigateTab={handleNavigateTab} selectedLocationId={selectedLocationIdNumber} selectedLocationCode={selectedLocationCode} selectedLocationName={selectedLocation?.name || ''} />,
    employees: <EmployeesTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    payroll: <PayrollTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} locations={locations} />,
    'report-history': <ReportHistoryTab refreshKey={locationRefreshKey} selectedLocationId={selectedLocationIdNumber} />,
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={filterBarRef}
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 80,
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '22px',
          boxShadow: '0 14px 34px rgba(15, 23, 42, 0.08)',
          padding: '0.55rem 1rem',
          backdropFilter: 'blur(6px)',
          boxSizing: 'border-box',
        }}
      >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem', color: '#5B4B8A', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.78rem', letterSpacing: '0.06em' }}>
              <i className="fas fa-briefcase"></i>
              Business Operations
            </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '240px', justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '220px' }}>
                <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  Location Scope
                </span>
                <select
                  value={selectedLocationId}
                  onChange={(event) => setSelectedLocationId(event.target.value)}
                  style={{
                    padding: '0.62rem 0.72rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#fff',
                    color: '#0f172a',
                    fontSize: '0.9rem',
                    minWidth: '220px',
                  }}
                >
                  <option value="all">All Locations</option>
                  {locations.map((location) => (
                    <option key={location.id} value={String(location.id)}>
                      {location.name}{location.code ? ` (${location.code})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <BusinessOperationsImportButton onClick={() => setIsImportModalOpen(true)} />
            </div>
          </div>

          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #edf2f7' }}>
            <BusinessOperationsTabs tabs={TABS} activeTab={activeTab} onChange={handleNavigateTab} />
          </div>
      </div>

      <div style={{ height: `${filterBarHeight}px` }}></div>

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
