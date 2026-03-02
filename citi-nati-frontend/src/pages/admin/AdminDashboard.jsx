import React, { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import Container from '../../components/ui/Container.jsx';
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
    <div className="page admin-dashboard">
      <Container>
        <h1 style={{ marginTop: '2rem', marginBottom: '2rem' }}>Admin Dashboard</h1>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '2rem',
          borderBottom: '2px solid #eee',
          flexWrap: 'wrap',
        }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '1rem 1.5rem',
                border: 'none',
                backgroundColor: activeTab === tab.id ? '#5B4B8A' : 'transparent',
                color: activeTab === tab.id ? '#fff' : '#666',
                fontWeight: activeTab === tab.id ? '600' : '500',
                cursor: 'pointer',
                fontSize: '1rem',
                transition: 'all 0.2s ease',
                borderBottom: activeTab === tab.id ? '3px solid #5B4B8A' : 'none',
                marginBottom: '-2px',
              }}
            >
              <i className={`fas ${tab.icon}`} style={{ marginRight: '0.5rem' }}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ marginBottom: '3rem' }}>
          {activeTab === 'inbox' && <AdminInbox />}
          {activeTab === 'products' && <AdminProducts />}
          {activeTab === 'orders' && <AdminOrders />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'sales' && <AdminSales />}
          {activeTab === 'refunds' && <AdminRefunds />}
          {activeTab === 'support' && <SupportDashboard />}
          {activeTab === 'drivers' && <AdminDrivers />}
        </div>
      </Container>
    </div>
  );
};

export default AdminDashboard;
