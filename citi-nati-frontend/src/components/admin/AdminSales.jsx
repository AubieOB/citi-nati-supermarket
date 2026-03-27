import React, { useState, useEffect, useRef } from 'react';
import SalesDayControls from './SalesDayControls.jsx';
import DriverPerformanceTable from './DriverPerformanceTable.jsx';
import SalesHistoryTable from './SalesHistoryTable.jsx';
import SalesReports from './SalesReports.jsx';
import { getCurrentSalesDay } from '../../utils/salesService.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { getSocket } from '../../utils/socket.js';

const AdminSales = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [currentSalesDay, setCurrentSalesDay] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);

  // Fetch current sales day on component mount
  useEffect(() => {
    const fetchCurrentDay = async () => {
      if (!token) return;

      try {
        const day = await getCurrentSalesDay(token);
        setCurrentSalesDay(day);
      } catch (error) {
        console.error('Error fetching current sales day:', error);
        setCurrentSalesDay(null);
      }
    };

    fetchCurrentDay();
  }, [token]);

  // Trigger child component refresh when orders are updated in real-time
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleOrderUpdated = () => {
      setRefreshTrigger(prev => prev + 1);
    };

    socket.on('orderUpdated', handleOrderUpdated);
    socket.on('newOrder', handleOrderUpdated);

    return () => {
      socket.off('orderUpdated', handleOrderUpdated);
      socket.off('newOrder', handleOrderUpdated);
    };
  }, []);

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

  // Re-measure bar height after each render to account for content wrapping
  useEffect(() => {
    if (filterBarRef.current) {
      setFilterBarHeight(filterBarRef.current.offsetHeight);
    }
  });

  const handleSalesDayChange = (newDay) => {
    setCurrentSalesDay(newDay);
    setRefreshTrigger(prev => prev + 1); // Trigger refresh of child components
  };

  const salesSubTabs = [
    { id: 'overview', label: 'Overview', icon: 'fa-chart-line' },
    { id: 'drivers', label: 'Driver Performance', icon: 'fa-users' },
    { id: 'history', label: 'Sales History', icon: 'fa-history' },
    { id: 'reports', label: 'Reports & Downloads', icon: 'fa-file-download' },
  ];

  const salesFilterSpacerHeight = Math.max(Math.min(filterBarHeight, 92) - 8, 0);

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
          backgroundColor: '#fff',
          border: '1px solid #eee',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '0.75rem 1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {salesSubTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.6rem 1rem',
                border: activeTab === tab.id ? 'none' : '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: activeTab === tab.id ? '#5B4B8A' : '#fff',
                color: activeTab === tab.id ? '#fff' : '#4b5563',
                fontWeight: activeTab === tab.id ? '700' : '600',
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
            >
              <i className={`fas ${tab.icon}`}></i>
              {tab.label}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: currentSalesDay ? '#2D8659' : '#dc3545', fontWeight: '700' }}>
            {currentSalesDay ? 'Sales Day: OPEN' : 'Sales Day: CLOSED'}
          </div>
        </div>
      </div>

      <div style={{ height: `${salesFilterSpacerHeight}px` }}></div>

      <div style={{
        backgroundColor: '#f8fafc',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '1rem',
      }}>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <SalesDayControls
          currentSalesDay={currentSalesDay}
          onSalesDayChange={handleSalesDayChange}
        />
      )}

      {activeTab === 'drivers' && (
        <DriverPerformanceTable refreshTrigger={refreshTrigger} />
      )}

      {activeTab === 'history' && (
        <SalesHistoryTable refreshTrigger={refreshTrigger} />
      )}

      {activeTab === 'reports' && (
        <SalesReports refreshTrigger={refreshTrigger} />
      )}
      </div>
    </div>
  );
};

export default AdminSales;
