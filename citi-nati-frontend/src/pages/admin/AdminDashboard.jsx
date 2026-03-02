import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminProducts from '../../components/admin/AdminProducts.jsx';
import AdminOrders from '../../components/admin/AdminOrders.jsx';
import AdminUsers from '../../components/admin/AdminUsers.jsx';
import AdminDrivers from '../../components/admin/AdminDrivers.jsx';
import AdminSales from '../../components/admin/AdminSales.jsx';
import AdminInbox from '../../components/admin/AdminInbox.jsx';
import AdminRefunds from '../../components/admin/AdminRefunds.jsx';
import SupportDashboard from './SupportDashboard.jsx';
import { useOrderUpdates } from '../../hooks/useOrderUpdates.js';
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
  const [activeTab, setActiveTab] = useState('inbox');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: 'fa-inbox' },
    { id: 'products', label: 'Products', icon: 'fa-box' },
    { id: 'orders', label: 'Orders', icon: 'fa-list' },
    { id: 'users', label: 'Users', icon: 'fa-users' },
    { id: 'drivers', label: 'Drivers', icon: 'fa-car' },
    { id: 'sales', label: 'Sales', icon: 'fa-dollar-sign' },
    { id: 'refunds', label: 'Refunds', icon: 'fa-undo' },
    { id: 'support', label: 'Support', icon: 'fa-life-ring' },
  ];

  /**
   * Handle real-time order updates (for refreshing orders list)
   */
  const handleOrderUpdated = useCallback((updatedOrder) => {
    console.log('[ADMIN] Order updated - refreshing orders:', updatedOrder.id);
    // Orders will be refetched in AdminOrders component via the hook
  }, []);

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
      <div className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Sidebar Logo/Title */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e0e0e0',
          marginBottom: '1rem',
          color: '#5B4B8A',
          fontWeight: '700',
          fontSize: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          flexShrink: 0
        }}>
          <i className="fas fa-shield-alt"></i>
          <span>Citi-Nati - Admin</span>
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
                padding: '1rem 1.5rem',
                border: 'none',
                backgroundColor: 'transparent',
                borderLeft: activeTab === tab.id ? '4px solid #5B4B8A' : '4px solid transparent',
                color: activeTab === tab.id ? '#5B4B8A' : '#666',
                fontWeight: activeTab === tab.id ? '600' : '500',
                cursor: 'pointer',
                fontSize: '0.95rem',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
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
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Sidebar Footer - Home Button */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e0e0e0',
          backgroundColor: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
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
              gap: '0.5rem',
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
            <span>Home</span>
          </button>
        </div>
      </div>

      {/* Main Content Area (with left margin for fixed sidebar) */}
      <div className="admin-main-content">
        {/* Scrollable Content */}
        <div className="admin-content-area">
          {activeTab === 'inbox' && <AdminInbox />}
          {activeTab === 'products' && <AdminProducts />}
          {activeTab === 'orders' && <AdminOrders />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'sales' && <AdminSales />}
          {activeTab === 'refunds' && <AdminRefunds />}
          {activeTab === 'support' && <SupportDashboard />}
          {activeTab === 'drivers' && <AdminDrivers />}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
