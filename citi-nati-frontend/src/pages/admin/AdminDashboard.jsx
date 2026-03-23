import React, { useState, useCallback, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

// Lazy load admin components to reduce bundle size
const AdminProducts = React.lazy(() => import('../../components/admin/AdminProducts.jsx'));
const AdminOrders = React.lazy(() => import('../../components/admin/AdminOrders.jsx'));
const AdminUsers = React.lazy(() => import('../../components/admin/AdminUsers.jsx'));
const AdminDrivers = React.lazy(() => import('../../components/admin/AdminDrivers.jsx'));
const AdminSales = React.lazy(() => import('../../components/admin/AdminSales.jsx'));
const AdminInbox = React.lazy(() => import('../../components/admin/AdminInbox.jsx'));
const AdminRefunds = React.lazy(() => import('../../components/admin/AdminRefunds.jsx'));
const AdminPromotions = React.lazy(() => import('../../components/admin/AdminPromotions.jsx'));
const AdminStocks = React.lazy(() => import('../../components/admin/AdminStocks.jsx'));
const AdminEmergencySales = React.lazy(() => import('../../components/admin/AdminEmergencySales.jsx'));
const AdminEmergencySalesReports = React.lazy(() => import('../../components/admin/AdminEmergencySalesReports.jsx'));
const AdminSecurity = React.lazy(() => import('../../components/admin/AdminSecurity.jsx'));
const AdminSystem = React.lazy(() => import('../../components/admin/AdminSystem.jsx'));
const AdminPOSManagement = React.lazy(() => import('./AdminPOSManagement.jsx'));
const SupportDashboard = React.lazy(() => import('./SupportDashboard.jsx'));

import { useOrderUpdates } from '../../hooks/useOrderUpdates.js';
import { getSpeechAlertsEnabled, setSpeechAlertsEnabled } from '../../utils/notifications.js';
import '../../styles/global.css';
import '../../styles/admin-dashboard.css';

/**
 * 🛡️ ADMIN DASHBOARD
 * 
 * Comprehensive admin panel with 4 main sections:
 * 1. Products - Create, Read, Update, Delete products
 * 2. Orders - View all orders, assign drivers, update status
 * 3. Users - View users, manage roles, delete users
 * 4. Drivers - View drivers, create, update, delete
 * 
 * Real-time Updates: Listens for WebSocket orderUpdated events
 */

const AdminDashboard = () => {
  const location = useLocation();
  const initialTab = location.pathname === '/admin/emergency-sales' ? 'emergency-sales' : 'inbox';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [speechAlertsEnabled, setSpeechAlertsPreference] = useState(() => getSpeechAlertsEnabled());
  const navigate = useNavigate();
  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: 'fa-inbox' },
    { id: 'orders', label: 'Orders', icon: 'fa-list' },
    { id: 'refunds', label: 'Refunds', icon: 'fa-undo' },
    { id: 'support', label: 'Support', icon: 'fa-life-ring' },
    { id: 'products', label: 'Products', icon: 'fa-box' },
    { id: 'stocks', label: 'Stocks', icon: 'fa-warehouse' },
    { id: 'emergency-sales', label: 'Emergency Sale', icon: 'fa-cash-register' },
    { id: 'emergency-sales-reports', label: 'Emergency Reports', icon: 'fa-file-alt' },
    { id: 'system', label: 'System', icon: 'fa-cogs' },
    { id: 'promotions', label: 'Promotions', icon: 'fa-tags' },
    { id: 'pos-management', label: 'POS Management', icon: 'fa-database' },
    { id: 'users', label: 'Users', icon: 'fa-users' },
    { id: 'drivers', label: 'Drivers', icon: 'fa-car' },
    { id: 'sales', label: 'Sales', icon: 'fa-dollar-sign' },
    { id: 'security', label: 'Security', icon: 'fa-key' },
  ];

  /**
   * Handle real-time order updates (for refreshing orders list)
   */
  const handleOrderUpdated = useCallback((updatedOrder) => {
    console.log('[ADMIN] Order updated - refreshing orders:', updatedOrder.id);
    // Orders will be refetched in AdminOrders component via the hook
  }, []);

  const handleToggleSpeechAlerts = useCallback(() => {
    const nextValue = !speechAlertsEnabled;
    setSpeechAlertsEnabled(nextValue);
    setSpeechAlertsPreference(nextValue);
    toast.success(`Spoken alerts ${nextValue ? 'enabled' : 'disabled'}`);
  }, [speechAlertsEnabled]);

  useOrderUpdates(handleOrderUpdated, { listenAll: true, role: 'admin' });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row', backgroundColor: '#f5f5f5' }}>
      {/* Hamburger Menu Icon - Mobile Only */}
      <button
        className="admin-hamburger"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <i className={`fas ${sidebarOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </button>

      {/* Mobile Overlay - Click to close sidebar */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="mobile-overlay"
        />
      )}

      {/* Fixed Left Sidebar Navigation */}
      <div className={`admin-sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Sidebar Logo/Title */}
        <div style={{
          padding: sidebarCollapsed ? '1rem 0.75rem' : '1rem 1.5rem',
          borderBottom: '1px solid #e0e0e0',
          marginBottom: '1rem',
          color: '#5B4B8A',
          fontWeight: '700',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          gap: '0.5rem',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="fas fa-shield-alt"></i>
            {!sidebarCollapsed && <span>Citi-Nati - Admin</span>}
          </div>
          <button
            className="admin-collapse-button"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              border: 'none',
              backgroundColor: '#f3f0fa',
              color: '#5B4B8A',
              borderRadius: '4px',
              width: '28px',
              height: '28px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className={`fas ${sidebarCollapsed ? 'fa-angle-right' : 'fa-angle-left'}`}></i>
          </button>
        </div>

        {/* Sidebar Menu Items Container - Grows to fill space */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSidebarOpen(false); // Close sidebar on mobile after selection
              }}
              style={{
                width: '100%',
                padding: sidebarCollapsed ? '1rem 0.75rem' : '1rem 1.5rem',
                border: 'none',
                backgroundColor: 'transparent',
                borderLeft: activeTab === tab.id ? '4px solid #5B4B8A' : '4px solid transparent',
                color: activeTab === tab.id ? '#5B4B8A' : '#666',
                fontWeight: activeTab === tab.id ? '600' : '500',
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
                textAlign: sidebarCollapsed ? 'center' : 'left',
                display: 'flex',
                alignItems: 'center',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                gap: sidebarCollapsed ? '0' : '0.75rem'
              }}
              onMouseOver={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#5B4B8A';
                }
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#666';
                }
              }}
            >
              <i className={`fas ${tab.icon}`} style={{ width: '20px', textAlign: 'center' }}></i>
              {!sidebarCollapsed && <span>{tab.label}</span>}
            </button>
          ))}
        </div>

        {/* Sidebar Footer - Preferences and Home Button */}
        <div style={{
          padding: sidebarCollapsed ? '1rem 0.75rem' : '1rem 1.5rem',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '0.75rem',
          flexShrink: 0
        }}>
          <button
            onClick={handleToggleSpeechAlerts}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              border: 'none',
              backgroundColor: speechAlertsEnabled ? '#e8f7ee' : '#f5f5f5',
              color: speechAlertsEnabled ? '#1f7a45' : '#666',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: sidebarCollapsed ? '0' : '0.5rem',
              transition: 'all 0.2s ease'
            }}
          >
            <i className={`fas ${speechAlertsEnabled ? 'fa-volume-up' : 'fa-volume-mute'}`}></i>
            {!sidebarCollapsed && <span>{speechAlertsEnabled ? 'Spoken Alerts On' : 'Spoken Alerts Off'}</span>}
          </button>

          {/* Home Link */}
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              backgroundColor: '#f5f5f5',
              color: '#666',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: sidebarCollapsed ? '0' : '0.5rem',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#e8e8e8';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#f5f5f5';
            }}
          >
            <i className="fas fa-home" style={{ fontSize: '1rem' }}></i>
            {!sidebarCollapsed && <span>Home</span>}
          </button>
        </div>
      </div>

      {/* Main Content Area (with left margin for fixed sidebar) */}
      <div className={`admin-main-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Scrollable Content */}
        <div className="admin-content-area">
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>}>
            {activeTab === 'inbox' && <AdminInbox />}
            {activeTab === 'products' && <AdminProducts />}
            {activeTab === 'stocks' && <AdminStocks />}
            {activeTab === 'emergency-sales' && <AdminEmergencySales />}
            {activeTab === 'emergency-sales-reports' && <AdminEmergencySalesReports />}
            {activeTab === 'system' && <AdminSystem />}
            {activeTab === 'security' && <AdminSecurity />}
            {activeTab === 'promotions' && <AdminPromotions />}
            {activeTab === 'pos-management' && <AdminPOSManagement />}
            {activeTab === 'orders' && <AdminOrders />}
            {activeTab === 'users' && <AdminUsers />}
            {activeTab === 'sales' && <AdminSales />}
            {activeTab === 'refunds' && <AdminRefunds />}
            {activeTab === 'support' && <SupportDashboard />}
            {activeTab === 'drivers' && <AdminDrivers />}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
