import React, { useState, useCallback } from 'react';
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ 
        padding: '2rem', 
        backgroundColor: '#fff',
        borderBottom: '1px solid #e0e0e0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        <h1 style={{ color: '#5B4B8A', margin: 0 }}>
          <i className="fas fa-shield-alt" style={{ marginRight: '0.5rem' }}></i>
          Admin Dashboard
        </h1>
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar Navigation */}
        <div style={{
          width: '250px',
          backgroundColor: '#fff',
          borderRight: '1px solid #e0e0e0',
          padding: '1rem 0',
          overflowY: 'auto',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                width: '100%',
                padding: '1rem 1.5rem',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#f0f0f0' : 'transparent',
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
                  e.target.style.backgroundColor = '#f9f9f9';
                }
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) {
                  e.target.style.backgroundColor = 'transparent';
                }
              }}
            >
              <i className={`fas ${tab.icon}`} style={{ width: '20px', textAlign: 'center' }}></i>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '2rem',
          backgroundColor: '#f5f5f5'
        }}>
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
