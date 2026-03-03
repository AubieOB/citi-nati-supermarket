import React, { useEffect } from 'react';
import { useWindowManager } from '../../hooks/useWindowManager';
import Desktop from './Desktop';
import WindowedOrders from './WindowedOrders';
import WindowedPromotions from './WindowedPromotions';
import WindowedStocks from './WindowedStocks';
import WindowedMessages from './WindowedMessages';

/**
 * 🎯 ADMIN DASHBOARD
 * Main dashboard with Windows-style interface
 * Spawns draggable windows for Orders, Promotions, Stocks, and Help Tickets
 */
const AdminDashboard = () => {
  const { createWindow, windows } = useWindowManager();

  // Initialize default windows on first load
  useEffect(() => {
    if (Object.keys(windows).length === 0) {
      // Create default windows (staggered positions)
      createWindow('orders', {
        title: 'Orders',
        component: WindowedOrders,
        width: 600,
        height: 500,
        x: 50,
        y: 50,
      });

      createWindow('promotions', {
        title: 'Promotions',
        component: WindowedPromotions,
        width: 650,
        height: 500,
        x: 680,
        y: 80,
      });

      createWindow('stocks', {
        title: 'Inventory',
        component: WindowedStocks,
        width: 600,
        height: 500,
        x: 350,
        y: 300,
      });

      createWindow('tickets', {
        title: 'Help Tickets',
        component: WindowedMessages,
        width: 700,
        height: 550,
        x: 1000,
        y: 300,
      });
    }
  }, [createWindow, windows]);

  return (
    <div>
      <Desktop />
      
      {/* Launcher Menu - Floating button in top-left for opening windows */}
      <div
        style={{
          position: 'fixed',
          top: '70px',
          left: '20px',
          zIndex: 8999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '15px',
            borderRadius: '8px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(91, 75, 138, 0.5)',
          }}
        >
          <p style={{ color: '#fff', margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: 'bold' }}>
            Admin Tools
          </p>
          <button
            onClick={() => {
              if (!windows.orders) {
                createWindow('orders', {
                  title: 'Orders',
                  component: WindowedOrders,
                  width: 600,
                  height: 500,
                });
              }
            }}
            style={{
              display: 'block',
              width: '140px',
              padding: '8px 12px',
              margin: '5px 0',
              backgroundColor: '#5B4B8A',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#6B5B9A'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#5B4B8A'}
          >
            <i className="fas fa-box" style={{ marginRight: '6px' }}></i>
            Orders
          </button>
          <button
            onClick={() => {
              if (!windows.promotions) {
                createWindow('promotions', {
                  title: 'Promotions',
                  component: WindowedPromotions,
                  width: 650,
                  height: 500,
                });
              }
            }}
            style={{
              display: 'block',
              width: '140px',
              padding: '8px 12px',
              margin: '5px 0',
              backgroundColor: '#5B4B8A',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#6B5B9A'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#5B4B8A'}
          >
            <i className="fas fa-tags" style={{ marginRight: '6px' }}></i>
            Promotions
          </button>
          <button
            onClick={() => {
              if (!windows.stocks) {
                createWindow('stocks', {
                  title: 'Inventory',
                  component: WindowedStocks,
                  width: 600,
                  height: 500,
                });
              }
            }}
            style={{
              display: 'block',
              width: '140px',
              padding: '8px 12px',
              margin: '5px 0',
              backgroundColor: '#5B4B8A',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#6B5B9A'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#5B4B8A'}
          >
            <i className="fas fa-boxes" style={{ marginRight: '6px' }}></i>
            Inventory
          </button>
          <button
            onClick={() => {
              if (!windows.tickets) {
                createWindow('tickets', {
                  title: 'Help Tickets',
                  component: WindowedMessages,
                  width: 700,
                  height: 550,
                });
              }
            }}
            style={{
              display: 'block',
              width: '140px',
              padding: '8px 12px',
              margin: '5px 0',
              backgroundColor: '#5B4B8A',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#6B5B9A'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#5B4B8A'}
          >
            <i className="fas fa-life-ring" style={{ marginRight: '6px' }}></i>
            Help Tickets
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
