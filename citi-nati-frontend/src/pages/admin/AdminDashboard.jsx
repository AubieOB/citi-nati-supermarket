import React, { useState, useCallback, Suspense, useRef } from 'react';
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
const AdminDeliveryCoverage = React.lazy(() => import('../../components/admin/AdminDeliveryCoverage.jsx'));

import { useOrderUpdates } from '../../hooks/useOrderUpdates.js';
import { getSpeechAlertsEnabled, setSpeechAlertsEnabled } from '../../utils/notifications.js';
import api from '../../utils/api.js';
import { getSocket } from '../../utils/socket.js';
import { filterProductsForOperationalLocation, getOperationalScopeOptions, normalizeOperationalScopeCode, resolveOperationalScope } from '../../utils/operationalScope.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PERMISSION_KEYS, hasPermission } from '../../utils/permissions.js';
import '../../styles/global.css';
import '../../styles/admin-dashboard.css';

const ADMIN_THEME_KEY = 'adminDashboardTheme';
const ADMIN_PRODUCTS_SILENT_REFRESH_STALE_MS = 30000;
const ADMIN_PRODUCTS_SILENT_REFRESH_INTERVAL_MS = 45000;

const ADMIN_DARK_BG = '#1e1e1e';
const ADMIN_DARK_BORDER = '#333333';
const ADMIN_DARK_TEXT = '#dbe7f8';

const SIDEBAR_SCOPES = [
  { id: 'all', label: 'All', icon: 'fa-border-all' },
  { id: 'online-store', label: 'Online', icon: 'fa-store' },
  { id: 'shared-catalog', label: 'Shared', icon: 'fa-boxes-stacked' },
  { id: 'physical-store', label: 'POS', icon: 'fa-cash-register' },
  { id: 'business', label: 'Business', icon: 'fa-briefcase' },
  { id: 'administration', label: 'Admin', icon: 'fa-shield-halved' },
];

const OPERATIONAL_SCOPES = getOperationalScopeOptions();

const SIDEBAR_TABS = [
  { id: 'inbox', label: 'Inbox', icon: 'fa-inbox', scope: 'online-store', permission: PERMISSION_KEYS.ADMIN_INBOX_VIEW },
  { id: 'orders', label: 'Orders', icon: 'fa-list', scope: 'online-store', permission: PERMISSION_KEYS.ADMIN_ORDERS_VIEW },
  { id: 'refunds', label: 'Online Refunds', icon: 'fa-undo', scope: 'online-store', permission: PERMISSION_KEYS.ADMIN_REFUNDS_MANAGE },
  { id: 'support', label: 'Online Support', icon: 'fa-life-ring', scope: 'online-store', permission: PERMISSION_KEYS.ADMIN_SUPPORT_MANAGE },
  { id: 'quotations', label: 'Quotations', icon: 'fa-file-invoice', scope: 'business', permission: PERMISSION_KEYS.ADMIN_QUOTATIONS_MANAGE },
  { id: 'sales', label: 'Online Sales', icon: 'fa-dollar-sign', scope: 'online-store', permission: PERMISSION_KEYS.ADMIN_SALES_VIEW },
  { id: 'users', label: 'Online Users', icon: 'fa-users', scope: 'online-store', permission: PERMISSION_KEYS.USERS_MANAGEMENT_ACCESS },
  { id: 'drivers', label: 'Derivery Drivers', icon: 'fa-car', scope: 'online-store', permission: PERMISSION_KEYS.ADMIN_DRIVERS_MANAGE },
  { id: 'products', label: 'Products', icon: 'fa-box', scope: 'shared-catalog', permission: PERMISSION_KEYS.PRODUCTS_ACCESS },
  { id: 'stocks', label: 'Stocks', icon: 'fa-warehouse', scope: 'shared-catalog', permission: PERMISSION_KEYS.STOCKS_ACCESS },
  { id: 'promotions', label: 'Promotions', icon: 'fa-tags', scope: 'shared-catalog', permission: PERMISSION_KEYS.PROMOTIONS_ACCESS },
  { id: 'emergency-sales', label: 'Emergency Sale', icon: 'fa-cash-register', scope: 'physical-store', permission: PERMISSION_KEYS.EMERGENCY_SALES_ACCESS },
  { id: 'emergency-sales-reports', label: 'Emergency Reports', icon: 'fa-file-alt', scope: 'physical-store', permission: PERMISSION_KEYS.ADMIN_EMERGENCY_REPORTS_VIEW },
  { id: 'pos-management', label: 'POS Management', icon: 'fa-database', scope: 'physical-store', permission: PERMISSION_KEYS.ADMIN_POS_MANAGEMENT },
  { id: 'pos-sync-monitor', label: 'POS Sync Monitor', icon: 'fa-chart-line', scope: 'physical-store', permission: PERMISSION_KEYS.ADMIN_POS_SYNC_MANAGE },
  { id: 'cashiers', label: 'Emergency Cashiers', icon: 'fa-user-tag', scope: 'physical-store', permission: PERMISSION_KEYS.ADMIN_CASHIERS_MANAGE },
  { id: 'business-operations', label: 'Business Operations', icon: 'fa-briefcase', scope: 'business', permission: PERMISSION_KEYS.BUSINESS_OPERATIONS_ACCESS },
  { id: 'delivery-coverage', label: 'Delivery Coverage', icon: 'fa-location-dot', scope: 'administration', permission: PERMISSION_KEYS.ADMIN_SYSTEM_MANAGE },
  { id: 'system', label: 'System', icon: 'fa-cogs', scope: 'administration', permission: PERMISSION_KEYS.ADMIN_SYSTEM_MANAGE },
  { id: 'security', label: 'Security', icon: 'fa-key', scope: 'administration', permission: PERMISSION_KEYS.ADMIN_SECURITY_MANAGE },
];

const TAB_SCOPE_BY_ID = SIDEBAR_TABS.reduce((accumulator, tab) => {
  accumulator[tab.id] = tab.scope;
  return accumulator;
}, {});

const MOBILE_MAX_WIDTH = 768;
const MOBILE_SAFE_TAB_IDS = new Set([
  'inbox',
  'orders',
  'emergency-sales-reports',
  'pos-sync-monitor',
  'business-operations',
  'system',
  'security',
]);

const MOBILE_BLOCKED_MESSAGE_BY_TAB = {
  products: 'Product catalog management is desktop-only on mobile for safety and usability.',
  stocks: 'Stock management tools are desktop-only on mobile for safety and usability.',
  promotions: 'Promotion management is desktop-only on mobile for safety and usability.',
  users: 'User and permissions administration is desktop-only on mobile.',
  drivers: 'Driver administration is desktop-only on mobile.',
  sales: 'Sales analytics are desktop-only on mobile.',
  quotations: 'Quotation management is desktop-only on mobile.',
  'pos-management': 'POS management is desktop-only on mobile.',
  cashiers: 'Cashier account management is desktop-only on mobile.',
  refunds: 'Refund management is desktop-only on mobile.',
  support: 'Support management is desktop-only on mobile.',
};

const ADMIN_PRODUCTS_AUTO_REFRESH_TAB_IDS = new Set([
  'products',
  'stocks',
  'promotions',
  'pos-management',
  'emergency-sales',
]);

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

const formatAgeCompact = (ageMs) => {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';
  if (ageMs < 5000) return 'just now';
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
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
  const { user } = useAuth();
  const location = useLocation();
  const initialTab = location.pathname === '/admin/emergency-sales'
    ? 'emergency-sales'
    : location.pathname === '/admin/business-operations'
      ? 'business-operations'
      : 'inbox';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showPanelFilters, setShowPanelFilters] = useState(false);
  const [sidebarScope, setSidebarScope] = useState('all');
  const scopePillsRef = useRef(null);
  const isScopePillsDraggingRef = useRef(false);
  const scopePillsDragStartXRef = useRef(0);
  const scopePillsStartScrollLeftRef = useRef(0);
  const [speechAlertsEnabled, setSpeechAlertsPreference] = useState(() => getSpeechAlertsEnabled());
  const [selectedOperationalLocationCode, setSelectedOperationalLocationCode] = useState('BLANTYRE_SH');
  const [adminProductsCacheByLocation, setAdminProductsCacheByLocation] = useState({});
  const [adminProductsCacheMetaByLocation, setAdminProductsCacheMetaByLocation] = useState({});
  const adminProductsFetchRequestRef = useRef({});
  const realtimeProductsRefreshGuardRef = useRef({});
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light';
  });
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_MAX_WIDTH;
  });
  const isDarkTheme = theme === 'dark';
  const [freshnessClockMs, setFreshnessClockMs] = useState(() => Date.now());
  const selectedOperationalScope = resolveOperationalScope(selectedOperationalLocationCode);
  const selectedOperationalLocationLabel = selectedOperationalScope.label;
  const selectedOperationalBranchCode = selectedOperationalScope.branchCode;
  const selectedOperationalPosLocationCode = selectedOperationalScope.locationCode;
  const navigate = useNavigate();

  const updateProductsCacheMeta = useCallback((locationCode, patch) => {
    setAdminProductsCacheMetaByLocation((prev) => ({
      ...prev,
      [locationCode]: {
        ...(prev[locationCode] || {}),
        ...patch,
      },
    }));
  }, []);

  const preloadAdminProductsForLocation = useCallback(async (locationCode, options = {}) => {
    const safeLocationCode = normalizeOperationalScopeCode(locationCode);
    const scope = resolveOperationalScope(safeLocationCode);
    const forceRefresh = options?.force === true;
    const preferSilentRefresh = options?.silent === true;
    const cacheMeta = adminProductsCacheMetaByLocation[safeLocationCode] || {};
    const hasCachedItems = Boolean(cacheMeta.lastLoadedAt);

    if (!forceRefresh) {
      if (cacheMeta.isLoading || cacheMeta.isBackgroundLoading) {
        return;
      }
      if (cacheMeta.lastLoadedAt) {
        return;
      }
    }

    const requestId = Date.now();
    adminProductsFetchRequestRef.current[safeLocationCode] = requestId;

    const perPage = 100;
    let page = 1;
    let allItems = [];

    const fetchProductsPage = async (pageNumber) => {
      const params = new URLSearchParams({ page: String(pageNumber), pageSize: String(perPage) });
      params.append('locationCode', scope.locationCode);
      params.append('branchCode', scope.branchCode);
      return api.get(`/products?${params.toString()}`);
    };

    const normalizeAdminPosProduct = (product) => ({
      ...product,
      id: product.id,
      name: product.name,
      sourceCode: product.sourceCode || null,
      productCode: product.sourceCode || null,
      category: product.category || 'Uncategorized',
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      image: product.image || null,
    });

    try {
      const useBackgroundLoading = preferSilentRefresh || (forceRefresh && hasCachedItems);
      updateProductsCacheMeta(safeLocationCode, {
        isLoading: !useBackgroundLoading,
        isBackgroundLoading: useBackgroundLoading,
        error: null,
      });

      const firstResp = await fetchProductsPage(page);
      const firstItems = Array.isArray(firstResp?.data?.products) ? firstResp.data.products : [];

      if (firstItems.length === 0) {
        try {
          const params = new URLSearchParams({ page: '1', limit: '5000' });
          params.append('locationCode', scope.locationCode);
          params.append('branchCode', scope.branchCode);
          const adminResp = await api.get(`/admin/pos-products?${params.toString()}`);
          const adminItems = Array.isArray(adminResp?.data?.products)
            ? adminResp.data.products.map(normalizeAdminPosProduct)
            : [];
          allItems = filterProductsForOperationalLocation(adminItems, safeLocationCode);
        } catch (fallbackErr) {
          console.warn('[AdminDashboard] /admin/pos-products fallback failed:', fallbackErr?.response?.data || fallbackErr.message);
          allItems = [];
        }
      } else {
        allItems = filterProductsForOperationalLocation(firstItems, safeLocationCode);
      }

      if (adminProductsFetchRequestRef.current[safeLocationCode] !== requestId) {
        return;
      }

      setAdminProductsCacheByLocation((prev) => ({
        ...prev,
        [safeLocationCode]: allItems,
      }));

      console.log('[ADMIN DASHBOARD][PRODUCT SCOPE]', {
        uiScope: safeLocationCode,
        branchCode: scope.branchCode,
        locationCode: scope.locationCode,
        cachedCount: allItems.length,
      });

      updateProductsCacheMeta(safeLocationCode, {
        isLoading: false,
        isBackgroundLoading: firstItems.length === perPage,
        error: null,
        lastLoadedAt: Date.now(),
      });

      if (firstItems.length === perPage) {
        (async () => {
          try {
            page += 1;
            while (true) {
              const response = await fetchProductsPage(page);
              const items = Array.isArray(response?.data?.products) ? response.data.products : [];
              if (items.length === 0) {
                break;
              }

              allItems = filterProductsForOperationalLocation(allItems.concat(items), safeLocationCode);
              if (adminProductsFetchRequestRef.current[safeLocationCode] !== requestId) {
                return;
              }

              setAdminProductsCacheByLocation((prev) => ({
                ...prev,
                [safeLocationCode]: allItems,
              }));
              updateProductsCacheMeta(safeLocationCode, {
                isBackgroundLoading: true,
                lastLoadedAt: Date.now(),
              });

              if (items.length < perPage) {
                break;
              }

              page += 1;
            }

            if (adminProductsFetchRequestRef.current[safeLocationCode] !== requestId) {
              return;
            }

            updateProductsCacheMeta(safeLocationCode, {
              isBackgroundLoading: false,
              lastLoadedAt: Date.now(),
            });
          } catch (bgErr) {
            console.warn('[AdminDashboard] Background products loading error:', bgErr.message);
            if (adminProductsFetchRequestRef.current[safeLocationCode] !== requestId) {
              return;
            }
            updateProductsCacheMeta(safeLocationCode, {
              isBackgroundLoading: false,
            });
          }
        })();
      }
    } catch (error) {
      console.error('[AdminDashboard] Failed to preload admin products cache:', error);
      if (adminProductsFetchRequestRef.current[safeLocationCode] !== requestId) {
        return;
      }
      updateProductsCacheMeta(safeLocationCode, {
        isLoading: false,
        isBackgroundLoading: false,
        error: error?.response?.data?.error || error.message || 'Failed to load products',
      });
    }
  }, [adminProductsCacheMetaByLocation, updateProductsCacheMeta]);

  React.useEffect(() => {
    OPERATIONAL_SCOPES.forEach((scope) => {
      preloadAdminProductsForLocation(scope.uiCode);
    });
  }, [preloadAdminProductsForLocation]);

  const activeLocationCachedProductsMeta = adminProductsCacheMetaByLocation[selectedOperationalLocationCode] || {};
  const shouldAutoRefreshAdminProducts = ADMIN_PRODUCTS_AUTO_REFRESH_TAB_IDS.has(activeTab);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    if (!shouldAutoRefreshAdminProducts) {
      return undefined;
    }

    let disposed = false;

    const refreshIfStale = () => {
      if (disposed || document.visibilityState !== 'visible') {
        return;
      }

      if (activeLocationCachedProductsMeta.isLoading || activeLocationCachedProductsMeta.isBackgroundLoading) {
        return;
      }

      const lastLoadedAt = Number(activeLocationCachedProductsMeta.lastLoadedAt || 0);
      if (lastLoadedAt && (Date.now() - lastLoadedAt) < ADMIN_PRODUCTS_SILENT_REFRESH_STALE_MS) {
        return;
      }

      void preloadAdminProductsForLocation(selectedOperationalLocationCode, { force: true, silent: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfStale();
      }
    };

    refreshIfStale();

    const intervalId = window.setInterval(refreshIfStale, ADMIN_PRODUCTS_SILENT_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshIfStale);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfStale);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    activeLocationCachedProductsMeta.isBackgroundLoading,
    activeLocationCachedProductsMeta.isLoading,
    activeLocationCachedProductsMeta.lastLoadedAt,
    preloadAdminProductsForLocation,
    selectedOperationalLocationCode,
    shouldAutoRefreshAdminProducts,
  ]);

  React.useEffect(() => {
    try {
      const socket = getSocket();
      if (!socket) {
        return;
      }

      const resolveUiScopeCodesFromPosLocation = (locationCode) => {
        const normalized = normalizeOperationalScopeCode(locationCode);
        if (!normalized) return [];
        return OPERATIONAL_SCOPES
          .filter((scope) => normalizeOperationalScopeCode(scope.locationCode) === normalized)
          .map((scope) => scope.uiCode);
      };

      const scheduleSilentRefresh = (uiScopeCode, reason) => {
        if (!uiScopeCode) return;

        const now = Date.now();
        const lastRunAt = Number(realtimeProductsRefreshGuardRef.current[uiScopeCode] || 0);
        if ((now - lastRunAt) < 8000) {
          return;
        }
        realtimeProductsRefreshGuardRef.current[uiScopeCode] = now;

        console.log('[ADMIN PRODUCTS CACHE][INVALIDATE]', {
          uiScopeCode,
          reason,
          strategy: 'silent_background_refresh',
        });

        void preloadAdminProductsForLocation(uiScopeCode, { force: true, silent: true });
      };

      const applyRealtimeProductPatch = (product, sourceEvent) => {
        const targetUiScopeCodes = resolveUiScopeCodesFromPosLocation(product?.locationCode);
        if (targetUiScopeCodes.length === 0) {
          return;
        }

        for (const uiScopeCode of targetUiScopeCodes) {
          setAdminProductsCacheByLocation((prev) => {
            const list = Array.isArray(prev[uiScopeCode]) ? prev[uiScopeCode] : null;
            if (!list || list.length === 0) {
              return prev;
            }

            const updated = list.map((row) => {
              const idMatches = product?.id && row?.id === product.id;
              const sourceMatches = product?.sourceCode && row?.sourceCode && String(row.sourceCode) === String(product.sourceCode);
              if (!idMatches && !sourceMatches) {
                return row;
              }

              return {
                ...row,
                ...(Number.isFinite(Number(product?.stock)) ? { stock: Number(product.stock) } : {}),
                ...(Number.isFinite(Number(product?.price)) ? { price: Number(product.price) } : {}),
                ...(product?.name ? { name: product.name } : {}),
                ...(product?.updatedAt ? { updatedAt: product.updatedAt } : {}),
              };
            });

            return {
              ...prev,
              [uiScopeCode]: updated,
            };
          });

          updateProductsCacheMeta(uiScopeCode, {
            lastRealtimeUpdateAt: Date.now(),
          });

          scheduleSilentRefresh(uiScopeCode, `${sourceEvent}:targeted_patch`);
        }
      };

      const handlePosProductUpdated = (payload) => {
        applyRealtimeProductPatch(payload, 'pos-product-updated');
      };

      const handleProductUpdated = (payload) => {
        applyRealtimeProductPatch(payload, 'product_updated');
      };

      const handlePosProductsSynced = (payload = {}) => {
        const locations = Array.isArray(payload.affectedLocations)
          ? payload.affectedLocations
          : [];

        const targetUiScopes = new Set();
        locations.forEach((locationCode) => {
          resolveUiScopeCodesFromPosLocation(locationCode).forEach((scopeCode) => targetUiScopes.add(scopeCode));
        });

        // Fallback to selected scope when payload misses per-location metadata.
        if (targetUiScopes.size === 0) {
          targetUiScopes.add(selectedOperationalLocationCode);
        }

        console.log('[ADMIN PRODUCTS CACHE][POS_SYNC_EVENT]', {
          synced: payload.synced,
          stockChangedCount: payload.stockChangedCount,
          priceChangedCount: payload.priceChangedCount,
          affectedLocations: locations,
          targetUiScopes: Array.from(targetUiScopes.values()),
        });

        targetUiScopes.forEach((uiScopeCode) => {
          scheduleSilentRefresh(uiScopeCode, 'pos-products-synced');
        });
      };

      socket.on('pos-product-updated', handlePosProductUpdated);
      socket.on('product_updated', handleProductUpdated);
      socket.on('pos-products-synced', handlePosProductsSynced);

      return () => {
        socket.off('pos-product-updated', handlePosProductUpdated);
        socket.off('product_updated', handleProductUpdated);
        socket.off('pos-products-synced', handlePosProductsSynced);
      };
    } catch (socketErr) {
      console.warn('[ADMIN PRODUCTS CACHE] socket listener setup failed:', socketErr.message);
    }
  }, [preloadAdminProductsForLocation, selectedOperationalLocationCode, updateProductsCacheMeta]);

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
    if (typeof window === 'undefined') return;

    const updateViewportState = () => {
      setIsMobileViewport(window.innerWidth <= MOBILE_MAX_WIDTH);
    };

    updateViewportState();
    window.addEventListener('resize', updateViewportState);

    return () => {
      window.removeEventListener('resize', updateViewportState);
    };
  }, []);

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

  const allowedTabs = SIDEBAR_TABS.filter((tab) => hasPermission(user, tab.permission));
  const mobileAllowedTabs = allowedTabs.filter((tab) => MOBILE_SAFE_TAB_IDS.has(tab.id));
  const navigationTabs = isMobileViewport ? mobileAllowedTabs : allowedTabs;
  const defaultAllowedTabId = navigationTabs[0]?.id || 'inbox';
  const isActiveTabMobileBlocked = isMobileViewport && !MOBILE_SAFE_TAB_IDS.has(activeTab);

  React.useEffect(() => {
    if (!allowedTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(defaultAllowedTabId);
    }
  }, [activeTab, allowedTabs, defaultAllowedTabId]);

  React.useEffect(() => {
    if (location.pathname === '/admin/emergency-sales' && activeTab !== 'emergency-sales' && hasPermission(user, PERMISSION_KEYS.EMERGENCY_SALES_ACCESS)) {
      setActiveTab('emergency-sales');
      return;
    }

    if (location.pathname === '/admin/business-operations' && activeTab !== 'business-operations' && hasPermission(user, PERMISSION_KEYS.BUSINESS_OPERATIONS_ACCESS)) {
      setActiveTab('business-operations');
      return;
    }

    if (location.pathname === '/admin/emergency-sales' && !hasPermission(user, PERMISSION_KEYS.EMERGENCY_SALES_ACCESS)) {
      navigate('/admin');
      return;
    }

    if (location.pathname === '/admin/business-operations' && !hasPermission(user, PERMISSION_KEYS.BUSINESS_OPERATIONS_ACCESS)) {
      navigate('/admin');
      return;
    }

    if (location.pathname === '/admin' && (activeTab === 'emergency-sales' || activeTab === 'business-operations')) {
      setActiveTab(defaultAllowedTabId);
    }
  }, [location.pathname, activeTab, defaultAllowedTabId, navigate, user]);

  const handleTabSelect = useCallback((tabId) => {
    const selectedTab = SIDEBAR_TABS.find((tab) => tab.id === tabId);
    if (!selectedTab || !hasPermission(user, selectedTab.permission)) {
      toast.error('You do not have access to that section');
      return;
    }

    if (isMobileViewport && !MOBILE_SAFE_TAB_IDS.has(tabId)) {
      toast.error('This section is desktop-only on mobile.');
      return;
    }

    setActiveTab(tabId);
    if (tabId === 'emergency-sales') {
      navigate('/admin/emergency-sales');
    } else if (tabId === 'business-operations') {
      navigate('/admin/business-operations');
    } else if (location.pathname !== '/admin') {
      navigate('/admin');
    }
  }, [isMobileViewport, location.pathname, navigate, user]);

  const visibleTabs = navigationTabs.filter((tab) => sidebarScope === 'all' || tab.scope === sidebarScope);
  const selectedScopeMeta = SIDEBAR_SCOPES.find((scope) => scope.id === sidebarScope) || SIDEBAR_SCOPES[0];
  const activeTabMeta = SIDEBAR_TABS.find((tab) => tab.id === activeTab);
  const activeTabBlockedReason = activeTabMeta
    ? (MOBILE_BLOCKED_MESSAGE_BY_TAB[activeTabMeta.id] || 'This admin module is desktop-only on mobile.')
    : 'This admin module is desktop-only on mobile.';
  const activeLocationCachedProducts = adminProductsCacheByLocation[selectedOperationalLocationCode] || [];
  const handleRefreshAdminProductsCache = useCallback(async (options = {}) => {
    await preloadAdminProductsForLocation(selectedOperationalLocationCode, {
      force: true,
      silent: options?.silent === true,
    });
  }, [preloadAdminProductsForLocation, selectedOperationalLocationCode]);

  const activeLocationLastLoadedAt = Number(activeLocationCachedProductsMeta.lastLoadedAt || 0);
  const activeLocationLastRealtimeUpdateAt = Number(activeLocationCachedProductsMeta.lastRealtimeUpdateAt || 0);
  const activeLocationLastStockRefreshAt = Math.max(activeLocationLastLoadedAt, activeLocationLastRealtimeUpdateAt);
  const activeLocationStockFreshnessAgeMs = activeLocationLastStockRefreshAt > 0
    ? Math.max(0, freshnessClockMs - activeLocationLastStockRefreshAt)
    : null;
  const activeLocationStockFreshnessLabel = activeLocationCachedProductsMeta.isLoading
    ? 'updating...'
    : (activeLocationStockFreshnessAgeMs == null
      ? 'not loaded yet'
      : formatAgeCompact(activeLocationStockFreshnessAgeMs));
  const activeLocationStockFreshnessSource = activeLocationLastRealtimeUpdateAt > activeLocationLastLoadedAt
    ? 'realtime event'
    : (activeLocationLastStockRefreshAt > 0 ? 'silent refresh' : 'none');

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setFreshnessClockMs(Date.now());
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div
      className={`admin-dashboard-root ${isDarkTheme ? 'theme-dark' : 'theme-light'} ${(isMobileViewport && !showPanelFilters) ? 'admin-panel-filters-hidden' : ''}`}
      data-admin-theme={theme}
    >
      {/* Fixed Left Sidebar Navigation - Desktop Only */}
      {!isMobileViewport && (
        <div className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
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
            onChange={(event) => setSelectedOperationalLocationCode(normalizeOperationalScopeCode(event.target.value))}
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
            {sidebarCollapsed ? (
              <>
                <option value="BLANTYRE_SH">BT SH</option>
                <option value="ZOMBA_SH">ZA SH</option>
                <option value="ZOMBA_BAR">ZA BAR</option>
                <option value="ZOMBA_RES">ZA RES</option>
              </>
            ) : (
              <>
                <option value="BLANTYRE_SH">Blantyre SH</option>
                <option value="ZOMBA_SH">Zomba SH</option>
                <option value="ZOMBA_BAR">Zomba BAR</option>
                <option value="ZOMBA_RES">Zomba RES</option>
              </>
            )}
          </select>
          {!sidebarCollapsed && (
            <div
              style={{
                marginTop: '0.45rem',
                padding: '0.35rem 0.45rem',
                borderRadius: '6px',
                border: `1px solid ${isDarkTheme ? '#2f3d55' : '#dbeafe'}`,
                backgroundColor: isDarkTheme ? 'rgba(29, 78, 216, 0.12)' : '#eff6ff',
                color: isDarkTheme ? '#bfdbfe' : '#1d4ed8',
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minHeight: '30px',
              }}
              title={`Stock cache source: ${activeLocationStockFreshnessSource}`}
            >
              <i className={`fas ${activeLocationCachedProductsMeta.isLoading ? 'fa-sync-alt fa-spin' : 'fa-clock'}`} aria-hidden="true"></i>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Stock/Price: {activeLocationStockFreshnessLabel}
              </span>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <div style={{
            padding: '0.5rem 0',
            borderBottom: `1px solid ${isDarkTheme ? '#2e2e2e' : '#ece7f7'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            {/* Left scroll arrow */}
            <button
              onClick={() => scopePillsRef.current?.scrollBy({ left: -120, behavior: 'smooth' })}
              style={{
                flexShrink: 0,
                border: 'none',
                background: 'transparent',
                color: isDarkTheme ? '#9dafc8' : '#8878a9',
                cursor: 'pointer',
                padding: '0.2rem 0.45rem',
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Scroll left"
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            {/* Scrollable pills */}
            <div
              ref={scopePillsRef}
              onMouseDown={(event) => {
                if (!scopePillsRef.current) return;
                isScopePillsDraggingRef.current = true;
                scopePillsDragStartXRef.current = event.clientX;
                scopePillsStartScrollLeftRef.current = scopePillsRef.current.scrollLeft;
                scopePillsRef.current.style.cursor = 'grabbing';
                scopePillsRef.current.style.userSelect = 'none';
              }}
              onMouseMove={(event) => {
                if (!isScopePillsDraggingRef.current || !scopePillsRef.current) return;
                event.preventDefault();
                const deltaX = event.clientX - scopePillsDragStartXRef.current;
                scopePillsRef.current.scrollLeft = scopePillsStartScrollLeftRef.current - deltaX;
              }}
              onMouseUp={() => {
                isScopePillsDraggingRef.current = false;
                if (!scopePillsRef.current) return;
                scopePillsRef.current.style.cursor = 'grab';
                scopePillsRef.current.style.userSelect = 'auto';
              }}
              onMouseLeave={() => {
                isScopePillsDraggingRef.current = false;
                if (!scopePillsRef.current) return;
                scopePillsRef.current.style.cursor = 'grab';
                scopePillsRef.current.style.userSelect = 'auto';
              }}
              onDragStart={(event) => event.preventDefault()}
              style={{
                display: 'flex',
                flexWrap: 'nowrap',
                overflowX: 'auto',
                overflowY: 'hidden',
                gap: '0.4rem',
                flex: 1,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                cursor: 'grab',
              }}
            >
            {SIDEBAR_SCOPES.map((scope) => {
              const active = sidebarScope === scope.id;
              return (
                <button
                  key={scope.id}
                  onClick={() => setSidebarScope(scope.id)}
                  style={{
                    border: `1px solid ${active ? (isDarkTheme ? '#7c71f5' : '#5B4B8A') : (isDarkTheme ? '#343434' : '#ddd5ee')}`,
                    backgroundColor: active ? (isDarkTheme ? 'rgba(124, 113, 245, 0.14)' : '#f3f0fa') : 'transparent',
                    color: active ? (isDarkTheme ? '#e3ddff' : '#5B4B8A') : (isDarkTheme ? '#afbdd1' : '#6f668a'),
                    borderRadius: '999px',
                    padding: '0.3rem 0.55rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <i className={`fas ${scope.icon}`} style={{ fontSize: '0.7rem' }}></i>
                  <span>{scope.label}</span>
                </button>
              );
            })}
            </div>
            {/* Right scroll arrow */}
            <button
              onClick={() => scopePillsRef.current?.scrollBy({ left: 120, behavior: 'smooth' })}
              style={{
                flexShrink: 0,
                border: 'none',
                background: 'transparent',
                color: isDarkTheme ? '#9dafc8' : '#8878a9',
                cursor: 'pointer',
                padding: '0.2rem 0.45rem',
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Scroll right"
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        )}

        {/* Sidebar Menu Items Container - Grows to fill space */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0.4rem 0 0'
        }}>
          {!sidebarCollapsed && (
            <div style={{
              padding: '0.45rem 1.5rem 0.55rem',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              color: isDarkTheme ? '#9dafc8' : '#7a7098',
              textTransform: 'uppercase',
            }}>
              {selectedScopeMeta.label}
            </div>
          )}

          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabSelect(tab.id)}
              title={sidebarCollapsed ? tab.label : undefined}
              style={{
                width: '100%',
                padding: sidebarCollapsed ? '0.95rem 0.75rem' : '0.9rem 1.5rem',
                border: 'none',
                backgroundColor: activeTab === tab.id
                  ? (isDarkTheme ? 'rgba(124, 113, 245, 0.10)' : '#faf7ff')
                  : 'transparent',
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
            title={sidebarCollapsed ? (speechAlertsEnabled ? 'Spoken Alerts On' : 'Spoken Alerts Off') : undefined}
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
            title={sidebarCollapsed ? `Switch to ${isDarkTheme ? 'light' : 'dark'} mode` : undefined}
          >
            <i className={`fas ${isDarkTheme ? 'fa-sun' : 'fa-moon'}`}></i>
            {!sidebarCollapsed && <span>{isDarkTheme ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* Home Link */}
          <button
            onClick={() => navigate('/')}
            title={sidebarCollapsed ? 'Home' : undefined}
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
      )}

      {/* Main Content Area (with left margin for fixed sidebar) */}
      <div className={`admin-main-content ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {isMobileViewport && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 85,
            backgroundColor: isDarkTheme ? '#121212' : '#ffffff',
            borderBottom: `1px solid ${isDarkTheme ? '#2e2e2e' : '#e5e7eb'}`,
            padding: '0.55rem 0.75rem',
          }}>
            <div style={{
              display: 'flex',
              gap: '0.45rem',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}>
              <button
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                style={{
                  border: `1px solid ${isDarkTheme ? '#323232' : '#d1d5db'}`,
                  backgroundColor: 'transparent',
                  color: isDarkTheme ? '#b7c6da' : '#4b5563',
                  borderRadius: '999px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <i className={`fas ${isDarkTheme ? 'fa-sun' : 'fa-moon'}`} style={{ fontSize: '0.72rem' }}></i>
                <span>{isDarkTheme ? 'Light' : 'Dark'}</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  border: `1px solid ${isDarkTheme ? '#323232' : '#d1d5db'}`,
                  backgroundColor: 'transparent',
                  color: isDarkTheme ? '#b7c6da' : '#4b5563',
                  borderRadius: '999px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title="Home"
              >
                <i className="fas fa-home" style={{ fontSize: '0.72rem' }}></i>
                <span>Home</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPanelFilters((prev) => !prev)}
                style={{
                  border: `1px solid ${showPanelFilters ? (isDarkTheme ? '#7c71f5' : '#5B4B8A') : (isDarkTheme ? '#323232' : '#d1d5db')}`,
                  backgroundColor: showPanelFilters ? (isDarkTheme ? 'rgba(124, 113, 245, 0.18)' : '#ede9fe') : 'transparent',
                  color: showPanelFilters ? (isDarkTheme ? '#ece9ff' : '#4c1d95') : (isDarkTheme ? '#b7c6da' : '#4b5563'),
                  borderRadius: '999px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title={showPanelFilters ? 'Hide filters' : 'Show filters'}
              >
                <i className={`fas ${showPanelFilters ? 'fa-eye-slash' : 'fa-sliders-h'}`} style={{ fontSize: '0.72rem' }}></i>
                <span>{showPanelFilters ? 'Hide Filters' : 'Show Filters'}</span>
              </button>
              {navigationTabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={`mobile-tab-${tab.id}`}
                    type="button"
                    onClick={() => handleTabSelect(tab.id)}
                    style={{
                      border: `1px solid ${active ? (isDarkTheme ? '#7c71f5' : '#5B4B8A') : (isDarkTheme ? '#323232' : '#d1d5db')}`,
                      backgroundColor: active ? (isDarkTheme ? 'rgba(124, 113, 245, 0.18)' : '#ede9fe') : 'transparent',
                      color: active ? (isDarkTheme ? '#ece9ff' : '#4c1d95') : (isDarkTheme ? '#b7c6da' : '#4b5563'),
                      borderRadius: '999px',
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <i className={`fas ${tab.icon}`} style={{ fontSize: '0.72rem' }}></i>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
            {isActiveTabMobileBlocked ? (
              <div style={{
                maxWidth: '760px',
                margin: '0 auto',
                backgroundColor: isDarkTheme ? '#161616' : '#ffffff',
                border: `1px solid ${isDarkTheme ? '#333333' : '#e5e7eb'}`,
                borderRadius: '14px',
                padding: '1.25rem',
                boxShadow: isDarkTheme ? '0 14px 28px rgba(0,0,0,0.35)' : '0 8px 20px rgba(15, 23, 42, 0.08)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
                  <i className="fas fa-desktop" style={{ color: isDarkTheme ? '#a78bfa' : '#6d28d9' }}></i>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: isDarkTheme ? '#e2e8f0' : '#1f2937' }}>Desktop Required</h3>
                </div>
                <p style={{ margin: 0, color: isDarkTheme ? '#a8b6c9' : '#4b5563', lineHeight: 1.55 }}>
                  {activeTabBlockedReason}
                </p>
                <button
                  type="button"
                  onClick={() => handleTabSelect('inbox')}
                  style={{
                    marginTop: '0.85rem',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#5B4B8A',
                    color: '#fff',
                    padding: '0.55rem 0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Go To Inbox
                </button>
              </div>
            ) : (
              <>
                {activeTab === 'inbox' && <AdminInbox selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'quotations' && <AdminQuotations selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'products' && (
                  <AdminProducts
                    selectedLocationCode={selectedOperationalPosLocationCode}
                    selectedBranchCode={selectedOperationalBranchCode}
                    cachedProducts={activeLocationCachedProducts}
                    cachedProductsMeta={activeLocationCachedProductsMeta}
                    onRefreshProductsCache={handleRefreshAdminProductsCache}
                  />
                )}
                {activeTab === 'stocks' && (
                  <AdminStocks
                    selectedLocationCode={selectedOperationalPosLocationCode}
                    selectedBranchCode={selectedOperationalBranchCode}
                    cachedProducts={activeLocationCachedProducts}
                    cachedProductsMeta={activeLocationCachedProductsMeta}
                    onRefreshProductsCache={handleRefreshAdminProductsCache}
                  />
                )}
                {activeTab === 'emergency-sales' && <AdminEmergencySales selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'emergency-sales-reports' && <AdminEmergencySalesReports selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'system' && <AdminSystem />}
                {activeTab === 'security' && <AdminSecurity />}
                {activeTab === 'promotions' && (
                  <AdminPromotions
                    selectedLocationCode={selectedOperationalPosLocationCode}
                    selectedBranchCode={selectedOperationalBranchCode}
                    cachedProducts={activeLocationCachedProducts}
                    cachedProductsMeta={activeLocationCachedProductsMeta}
                    onRefreshProductsCache={handleRefreshAdminProductsCache}
                  />
                )}
                {activeTab === 'pos-management' && (
                  <AdminPOSManagement
                    selectedLocationCode={selectedOperationalPosLocationCode}
                    selectedBranchCode={selectedOperationalBranchCode}
                    cachedProducts={activeLocationCachedProducts}
                    cachedProductsMeta={activeLocationCachedProductsMeta}
                    onRefreshProductsCache={handleRefreshAdminProductsCache}
                  />
                )}
                {activeTab === 'pos-sync-monitor' && <AdminPOSSyncMonitor selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'orders' && <AdminOrders selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'users' && <AdminUsers />}
                {activeTab === 'sales' && <AdminSales selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
                {activeTab === 'business-operations' && <AdminBusinessOperations />}
                {activeTab === 'delivery-coverage' && <AdminDeliveryCoverage />}
                {activeTab === 'refunds' && <AdminRefunds />}
                {activeTab === 'support' && <SupportDashboard />}
                {activeTab === 'drivers' && <AdminDrivers />}
                {activeTab === 'cashiers' && <AdminCashiers selectedLocationCode={selectedOperationalPosLocationCode} selectedBranchCode={selectedOperationalBranchCode} />}
              </>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
