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
const AdminCashiers = React.lazy(() => import('../../components/admin/AdminCashiers.jsx'));
const AdminPOSManagement = React.lazy(() => import('./AdminPOSManagement.jsx'));
const AdminPOSSyncMonitor = React.lazy(() => import('./AdminPOSSyncMonitor.jsx'));
const SupportDashboard = React.lazy(() => import('./SupportDashboard.jsx'));
const AdminQuotations = React.lazy(() => import('../../components/admin/AdminQuotations.jsx'));
const AdminBusinessOperations = React.lazy(() => import('../../components/admin/AdminBusinessOperations.jsx'));

import { useOrderUpdates } from '../../hooks/useOrderUpdates.js';
import { getSpeechAlertsEnabled, setSpeechAlertsEnabled } from '../../utils/notifications.js';
import '../../styles/global.css';
import '../../styles/admin-dashboard.css';

const ADMIN_THEME_KEY = 'adminDashboardTheme';

const ADMIN_DARK_BG = '#1e1e1e';
const ADMIN_DARK_BORDER = '#333333';
const ADMIN_DARK_TEXT = '#dbe7f8';

const extractColorToken = (value) => {
  if (!value || typeof value !== 'string') return null;
  const rgbMatch = value.match(/rgba?\([^)]*\)/i);
  if (rgbMatch) return rgbMatch[0];
  const hexMatch = value.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hexMatch) return hexMatch[0];
  return null;
};

const parseColor = (value) => {
  if (!value || typeof value !== 'string') return null;
  const token = extractColorToken(value) || value.trim();

  const rgbMatch = token.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => Number(part.trim()));
    if (parts.length < 3 || parts.some((part, index) => index < 3 && Number.isNaN(part))) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }

  const hexMatch = token.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: Number.parseInt(`${hex[0]}${hex[0]}`, 16),
        g: Number.parseInt(`${hex[1]}${hex[1]}`, 16),
        b: Number.parseInt(`${hex[2]}${hex[2]}`, 16),
      };
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
};

const getRelativeLuminance = ({ r, g, b }) => {
  const normalize = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const rr = normalize(r);
  const gg = normalize(g);
  const bb = normalize(b);
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
};

const getSaturation = ({ r, g, b }) => {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
};

const isLightNeutralTone = (rgb) => {
  if (!rgb) return false;
  const luminance = getRelativeLuminance(rgb);
  const saturation = getSaturation(rgb);
  return luminance >= 0.66 && saturation <= 0.62;
};

const isDarkNeutralTone = (rgb) => {
  if (!rgb) return false;
  const luminance = getRelativeLuminance(rgb);
  const saturation = getSaturation(rgb);
  return luminance <= 0.32 && saturation <= 0.38;
};

const rememberOriginalStyle = (element, key, value) => {
  const attr = `data-admin-dark-${key}-original`;
  if (!element.hasAttribute(attr)) {
    element.setAttribute(attr, value || '__none__');
  }
};

const restoreInlineDarkOverrides = (root) => {
  if (!root) return;
  // Restore elements with tracking attributes
  const nodes = root.querySelectorAll('[data-admin-dark-bg-original], [data-admin-dark-border-original], [data-admin-dark-color-original]');
  nodes.forEach((element) => {
    const originalBg = element.getAttribute('data-admin-dark-bg-original');
    if (originalBg !== null) {
      element.style.backgroundColor = originalBg === '__none__' ? '' : originalBg;
      element.removeAttribute('data-admin-dark-bg-original');
    }

    const originalBorder = element.getAttribute('data-admin-dark-border-original');
    if (originalBorder !== null) {
      element.style.borderColor = originalBorder === '__none__' ? '' : originalBorder;
      element.removeAttribute('data-admin-dark-border-original');
    }

    const originalColor = element.getAttribute('data-admin-dark-color-original');
    if (originalColor !== null) {
      element.style.color = originalColor === '__none__' ? '' : originalColor;
      element.removeAttribute('data-admin-dark-color-original');
    }

    const originalShadow = element.getAttribute('data-admin-dark-shadow-original');
    if (originalShadow !== null) {
      element.style.boxShadow = originalShadow === '__none__' ? '' : originalShadow;
      element.removeAttribute('data-admin-dark-shadow-original');
    }
  });

  // Force recompute of all styled elements to clear any residual dark mode colors
  const allStyled = root.querySelectorAll('[style*="background"], [style*="color"], [style*="border"]');
  allStyled.forEach((el) => {
    // Trigger style recomputation by forcing a layout recalc
    void el.offsetHeight;
  });
};

const applyInlineDarkOverrides = (element) => {
  if (!(element instanceof HTMLElement)) return;
  if (!element.hasAttribute('style')) return;

  const inlineBg = element.style.backgroundColor || element.style.background;
  const inlineBorder = element.style.borderColor || element.style.border;
  const inlineText = element.style.color;
  const inlineBoxShadow = element.style.boxShadow;

  if (inlineBg) {
    const bgRgb = parseColor(inlineBg);
    if (isLightNeutralTone(bgRgb)) {
      rememberOriginalStyle(element, 'bg', element.style.backgroundColor);
      element.style.backgroundColor = ADMIN_DARK_BG;

      const textRgb = parseColor(inlineText);
      if (inlineText && isDarkNeutralTone(textRgb)) {
        rememberOriginalStyle(element, 'color', inlineText);
        element.style.color = ADMIN_DARK_TEXT;
      }
    }
  }

  if (inlineBorder) {
    const borderRgb = parseColor(inlineBorder);
    if (isLightNeutralTone(borderRgb)) {
      rememberOriginalStyle(element, 'border', element.style.borderColor);
      element.style.borderColor = ADMIN_DARK_BORDER;
    }
  }

  // Handle box shadows with light theme colors
  if (inlineBoxShadow && inlineBoxShadow.includes('rgba(15, 23, 42')) {
    rememberOriginalStyle(element, 'shadow', inlineBoxShadow);
    element.style.boxShadow = inlineBoxShadow.replace(/rgba\(15,\s*23,\s*42/g, 'rgba(0, 0, 0');
  }
};

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
  const initialTab = location.pathname === '/admin/emergency-sales'
    ? 'emergency-sales'
    : location.pathname === '/admin/business-operations'
      ? 'business-operations'
      : 'inbox';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [speechAlertsEnabled, setSpeechAlertsPreference] = useState(() => getSpeechAlertsEnabled());
  const [selectedOperationalLocationCode, setSelectedOperationalLocationCode] = useState('BT');
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light';
  });
  const isDarkTheme = theme === 'dark';
  const selectedOperationalLocationLabel = selectedOperationalLocationCode === 'ZA' ? 'Zomba' : 'Blantyre';
  const navigate = useNavigate();
  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: 'fa-inbox' },
    { id: 'orders', label: 'Orders', icon: 'fa-list' },
    { id: 'refunds', label: 'Refunds', icon: 'fa-undo' },
    { id: 'support', label: 'Support', icon: 'fa-life-ring' },
    { id: 'products', label: 'Products', icon: 'fa-box' },
    { id: 'stocks', label: 'Stocks', icon: 'fa-warehouse' },
    { id: 'quotations', label: 'Quotations', icon: 'fa-file-invoice' },
    { id: 'emergency-sales', label: 'Emergency Sale', icon: 'fa-cash-register' },
    { id: 'emergency-sales-reports', label: 'Emergency Reports', icon: 'fa-file-alt' },
    { id: 'system', label: 'System', icon: 'fa-cogs' },
    { id: 'promotions', label: 'Promotions', icon: 'fa-tags' },
    { id: 'pos-management', label: 'POS Management', icon: 'fa-database' },
    { id: 'pos-sync-monitor', label: 'POS Sync Monitor', icon: 'fa-chart-line' },
    { id: 'users', label: 'Users', icon: 'fa-users' },
    { id: 'drivers', label: 'Drivers', icon: 'fa-car' },
    { id: 'cashiers', label: 'Cashiers', icon: 'fa-user-tag' },
    { id: 'sales', label: 'Sales', icon: 'fa-dollar-sign' },
    { id: 'business-operations', label: 'Business Operations', icon: 'fa-briefcase' },
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

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_THEME_KEY, theme);
  }, [theme]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const body = document.body;
    const isDark = theme === 'dark';
    body.classList.toggle('admin-theme-dark', isDark);
    body.classList.toggle('admin-theme-light', !isDark);

    return () => {
      body.classList.remove('admin-theme-dark');
      body.classList.remove('admin-theme-light');
    };
  }, [theme]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.querySelector('.admin-dashboard-root');
    if (!root) return;

    if (theme !== 'dark') {
      restoreInlineDarkOverrides(root);
      return;
    }

    const scanAndApply = (node) => {
      if (!(node instanceof HTMLElement)) return;
      applyInlineDarkOverrides(node);
      node.querySelectorAll('[style]').forEach((child) => applyInlineDarkOverrides(child));
    };

    // Initial scan and apply
    scanAndApply(root);

    // Re-scan after a short delay to catch elements rendered after effect
    const delayedScanTimer = setTimeout(() => {
      scanAndApply(root);
    }, 100);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          applyInlineDarkOverrides(mutation.target);
          return;
        }

        mutation.addedNodes.forEach((addedNode) => {
          if (addedNode instanceof HTMLElement) {
            scanAndApply(addedNode);
          }
        });
      });
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => {
      clearTimeout(delayedScanTimer);
      observer.disconnect();
      if (theme !== 'dark') {
        restoreInlineDarkOverrides(root);
      }
    };
  }, [theme, activeTab]);

  React.useEffect(() => {
    if (location.pathname === '/admin/emergency-sales' && activeTab !== 'emergency-sales') {
      setActiveTab('emergency-sales');
      return;
    }

    if (location.pathname === '/admin/business-operations' && activeTab !== 'business-operations') {
      setActiveTab('business-operations');
      return;
    }

    if (location.pathname === '/admin' && (activeTab === 'emergency-sales' || activeTab === 'business-operations')) {
      setActiveTab('inbox');
    }
  }, [location.pathname, activeTab]);

  return (
    <div className={`admin-dashboard-root ${isDarkTheme ? 'theme-dark' : 'theme-light'}`} data-admin-theme={theme}>
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
          borderBottom: `1px solid ${isDarkTheme ? '#2e2e2e' : '#e0e0e0'}`,
          marginBottom: '1rem',
          color: isDarkTheme ? '#c7baff' : '#5B4B8A',
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
              backgroundColor: isDarkTheme ? '#252525' : '#f3f0fa',
              color: isDarkTheme ? '#d7ccff' : '#5B4B8A',
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

        <div style={{
          padding: sidebarCollapsed ? '0.75rem' : '0.75rem 1.5rem',
          borderBottom: `1px solid ${isDarkTheme ? '#2e2e2e' : '#ece7f7'}`,
          marginBottom: '0.5rem',
        }}>
          {!sidebarCollapsed && (
            <label htmlFor="admin-operational-location" style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: isDarkTheme ? '#b9c5d8' : '#6b5fa2', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
              OPERATIONAL LOCATION
            </label>
          )}
          <select
            id="admin-operational-location"
            value={selectedOperationalLocationCode}
            onChange={(event) => setSelectedOperationalLocationCode(event.target.value)}
            title={`Operational scope: ${selectedOperationalLocationLabel}`}
            style={{
              width: '100%',
              borderRadius: '6px',
              border: `1px solid ${isDarkTheme ? '#3b4252' : '#d9cfee'}`,
              backgroundColor: isDarkTheme ? '#1f2430' : '#f5f2fb',
              color: isDarkTheme ? '#e6ecff' : '#4a3f74',
              padding: sidebarCollapsed ? '0.45rem' : '0.5rem 0.6rem',
              fontSize: sidebarCollapsed ? '0.72rem' : '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: sidebarCollapsed ? 'center' : 'left',
            }}
          >
            <option value="BT">Blantyre</option>
            <option value="ZA">Zomba</option>
          </select>
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
                if (tab.id === 'emergency-sales') {
                  navigate('/admin/emergency-sales');
                } else if (tab.id === 'business-operations') {
                  navigate('/admin/business-operations');
                } else if (location.pathname !== '/admin') {
                  navigate('/admin');
                }
                setSidebarOpen(false); // Close sidebar on mobile after selection
              }}
              style={{
                width: '100%',
                padding: sidebarCollapsed ? '1rem 0.75rem' : '1rem 1.5rem',
                border: 'none',
                backgroundColor: 'transparent',
                borderLeft: activeTab === tab.id
                  ? `4px solid ${isDarkTheme ? '#7c71f5' : '#5B4B8A'}`
                  : '4px solid transparent',
                color: activeTab === tab.id
                  ? (isDarkTheme ? '#ddd8ff' : '#5B4B8A')
                  : (isDarkTheme ? '#a4b2c5' : '#666'),
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
                  e.currentTarget.style.color = isDarkTheme ? '#d3ccff' : '#5B4B8A';
                }
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = isDarkTheme ? '#a4b2c5' : '#666';
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
          borderTop: `1px solid ${isDarkTheme ? '#2e2e2e' : '#e0e0e0'}`,
          backgroundColor: isDarkTheme ? '#181818' : '#fff',
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
              backgroundColor: speechAlertsEnabled
                ? (isDarkTheme ? '#19342a' : '#e8f7ee')
                : (isDarkTheme ? '#222222' : '#f5f5f5'),
              color: speechAlertsEnabled
                ? (isDarkTheme ? '#8be3b2' : '#1f7a45')
                : (isDarkTheme ? '#a4b2c5' : '#666'),
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

          <button
            onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              border: 'none',
              backgroundColor: isDarkTheme ? '#282828' : '#f3f0fa',
              color: isDarkTheme ? '#e0d6ff' : '#5B4B8A',
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
            title={`Switch to ${isDarkTheme ? 'light' : 'dark'} mode`}
          >
            <i className={`fas ${isDarkTheme ? 'fa-sun' : 'fa-moon'}`}></i>
            {!sidebarCollapsed && <span>{isDarkTheme ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* Home Link */}
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              border: 'none',
              backgroundColor: isDarkTheme ? '#222222' : '#f5f5f5',
              color: isDarkTheme ? '#a4b2c5' : '#666',
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
              e.currentTarget.style.backgroundColor = isDarkTheme ? '#24344b' : '#e8e8e8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = isDarkTheme ? '#222222' : '#f5f5f5';
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
        <div
          className="admin-content-area"
          style={activeTab === 'inbox'
            ? {
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }
            : undefined}
        >
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>Loading...</div>}>
            {activeTab === 'inbox' && <AdminInbox selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'quotations' && <AdminQuotations />}
            {activeTab === 'products' && <AdminProducts selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'stocks' && <AdminStocks selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'emergency-sales' && <AdminEmergencySales selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'emergency-sales-reports' && <AdminEmergencySalesReports selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'system' && <AdminSystem />}
            {activeTab === 'security' && <AdminSecurity />}
            {activeTab === 'promotions' && <AdminPromotions selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'pos-management' && <AdminPOSManagement selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'pos-sync-monitor' && <AdminPOSSyncMonitor selectedLocationCode={selectedOperationalLocationCode} />}
            {activeTab === 'orders' && <AdminOrders />}
            {activeTab === 'users' && <AdminUsers />}
            {activeTab === 'sales' && <AdminSales />}
            {activeTab === 'business-operations' && <AdminBusinessOperations />}
            {activeTab === 'refunds' && <AdminRefunds />}
            {activeTab === 'support' && <SupportDashboard />}
            {activeTab === 'drivers' && <AdminDrivers />}
            {activeTab === 'cashiers' && <AdminCashiers />}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
