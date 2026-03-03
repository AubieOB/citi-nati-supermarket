import React from 'react';
import { WindowManagerProvider } from '../../context/WindowManagerContext.jsx';
import AdminDashboardWindows from '../../components/dashboard/AdminDashboard.jsx';
import '../../styles/global.css';
import '../../styles/admin-dashboard.css';


/**
 * 🛡️ ADMIN DASHBOARD
 * 
 * Windows-style dashboard with draggable, resizable windows for:
 * - Orders management
 * - Promotions management  
 * - Inventory/Stocks management
 * - Help tickets/Support
 * 
 * Real-time updates via WebSocket for all sections
 */
const AdminDashboard = () => {
  return (
    <WindowManagerProvider>
      <AdminDashboardWindows />
    </WindowManagerProvider>
  );
};

export default AdminDashboard;
