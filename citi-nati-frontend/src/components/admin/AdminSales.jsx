import React, { useState, useEffect } from 'react';
import SalesDayControls from './SalesDayControls.jsx';
import DriverPerformanceTable from './DriverPerformanceTable.jsx';
import SalesHistoryTable from './SalesHistoryTable.jsx';
import SalesReports from './SalesReports.jsx';
import { getCurrentSalesDay } from '../../utils/salesService.js';
import { useAuth } from '../../context/AuthContext.jsx';

const AdminSales = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [currentSalesDay, setCurrentSalesDay] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  return (
    <div>
      {/* Sub-Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #eee',
        flexWrap: 'wrap',
      }}>
        {salesSubTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.25rem',
              border: 'none',
              backgroundColor: activeTab === tab.id ? '#5B4B8A' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#666',
              fontWeight: activeTab === tab.id ? '600' : '500',
              cursor: 'pointer',
              fontSize: '0.95rem',
              transition: 'all 0.2s ease',
              borderBottom: activeTab === tab.id ? '3px solid #2D8659' : 'none',
              marginBottom: '-2px',
            }}
          >
            <i className={`fas ${tab.icon}`} style={{ marginRight: '0.5rem' }}></i>
            {tab.label}
          </button>
        ))}
      </div>

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
  );
};

export default AdminSales;
