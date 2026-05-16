import React, { useEffect, Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Layout from './components/layout/Layout.jsx';
import ChunkErrorBoundary from './components/ChunkErrorBoundary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import SessionExpiredModal from './components/SessionExpiredModal.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { initSocket, identifySocket } from './utils/socket.js';
import api, { initializeAuth } from './utils/api.js';
import { useGlobalNotifications } from './hooks/useGlobalNotifications.js';
import { PERMISSION_KEYS, hasPermission } from './utils/permissions.js';

// Public Pages (lazy loaded)
const Home = React.lazy(() => import('./pages/public/Home.jsx'));
const Login = React.lazy(() => import('./pages/public/Login.jsx'));
const Register = React.lazy(() => import('./pages/public/Register.jsx'));
const VerifyEmail = React.lazy(() => import('./pages/public/VerifyEmail.jsx'));
const ForgotPassword = React.lazy(() => import('./pages/public/ForgotPassword.jsx'));
const ResetPassword = React.lazy(() => import('./pages/public/ResetPassword.jsx'));
const Products = React.lazy(() => import('./pages/public/Products.jsx'));
const Cart = React.lazy(() => import('./pages/public/Cart.jsx'));
const Checkout = React.lazy(() => import('./pages/public/Checkout.jsx'));
const MyOrders = React.lazy(() => import('./pages/public/MyOrders.jsx'));
const PaymentSuccess = React.lazy(() => import('./pages/public/PaymentSuccess.jsx'));
const About = React.lazy(() => import('./pages/public/About.jsx'));
const HelpCenter = React.lazy(() => import('./pages/public/HelpCenter.jsx'));
const Contact = React.lazy(() => import('./pages/public/Contact.jsx'));
const FAQs = React.lazy(() => import('./pages/public/FAQs.jsx'));
const Terms = React.lazy(() => import('./pages/public/Terms.jsx'));
const Returns = React.lazy(() => import('./pages/public/Returns.jsx'));
const MaintenanceMode = React.lazy(() => import('./pages/public/MaintenanceMode.jsx'));
const AdminLogin = React.lazy(() => import('./pages/public/AdminLogin.jsx'));
const CashierLogin = React.lazy(() => import('./pages/public/CashierLogin.jsx'));
const DriverLogin = React.lazy(() => import('./pages/public/DriverLogin.jsx'));

// Admin Pages (lazy loaded)
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard.jsx'));

// Driver Pages (lazy loaded)
const DriverDashboard = React.lazy(() => import('./pages/driver/DriverDashboard.jsx'));

// Cashier Pages (lazy loaded)
const CashierDashboard = React.lazy(() => import('./pages/cashier/CashierDashboard.jsx'));

// Not Found
const NotFound = React.lazy(() => import('./pages/NotFound.jsx'));

// Import global styles
import './styles/global.css';

const MAINTENANCE_EXEMPT_PATHS = ['/admin', '/admin-login', '/cashier', '/cashier-login', '/driver-login', '/maintenance'];
const DEFAULT_MAINTENANCE_MESSAGE = 'We are currently carrying out scheduled maintenance. We apologize for the inconvenience and appreciate your patience.';

function AppInner() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [maintenanceState, setMaintenanceState] = useState({
    checked: false,
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE
  });

  // Initialize API authentication on app startup (FIRST EFFECT - must run before other API calls)
  useEffect(() => {
    try {
      initializeAuth();
      console.log('[APP] API authentication initialized from localStorage');
    } catch (err) {
      console.error('[APP] API authentication initialization failed:', err);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchMaintenanceState = async () => {
      try {
        const response = await api.get('/system/status');
        const data = response.data || {};

        if (!isMounted) {
          return;
        }

        setMaintenanceState({
          checked: true,
          enabled: Boolean(data.maintenanceMode),
          message: data.maintenanceMessage || DEFAULT_MAINTENANCE_MESSAGE
        });
      } catch (err) {
        console.error('[APP] Failed to fetch maintenance status:', err);

        if (!isMounted) {
          return;
        }

        // Keep the last known maintenance state on transient failures to avoid UI flicker.
        setMaintenanceState((prev) => ({
          checked: true,
          enabled: prev.enabled,
          message: prev.message || DEFAULT_MAINTENANCE_MESSAGE
        }));
      }
    };

    fetchMaintenanceState();
    const intervalId = window.setInterval(fetchMaintenanceState, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Initialize WebSocket on app startup
  useEffect(() => {
    try {
      initSocket();
      console.log('[APP] WebSocket initialized');
    } catch (err) {
      console.error('[APP] WebSocket initialization failed:', err);
    }
  }, []);

  // Identify socket when user is authenticated
  useEffect(() => {
    if (!isLoading && user && user.id) {
      console.log('[APP] Identifying socket with user:', user.id, user.role, user.email);
      identifySocket(user.id, user.role || 'user', user.email);
    }
  }, [user, isLoading]);

  // Set up global notifications for all pages
  useGlobalNotifications();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const appTarget = params.get('app');
    const appRouteMap = {
      admin: '/admin-login',
      cashier: '/cashier-login',
      driver: '/driver-login',
    };

    if (
      !isLoading &&
      location.pathname === '/' &&
      appTarget &&
      appRouteMap[appTarget] &&
      location.pathname !== appRouteMap[appTarget]
    ) {
      navigate(appRouteMap[appTarget], { replace: true });
    }
  }, [isLoading, location.pathname, location.search, navigate]);

  const loadingFallback = <div className="storefront-loading-state">Loading...</div>;


  const isMaintenanceRoute = location.pathname === '/maintenance';
  const isExemptPath = MAINTENANCE_EXEMPT_PATHS.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));
  const isAdminDuringMaintenance = hasPermission(user, PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS);

  if (!maintenanceState.checked) {
    return loadingFallback;
  }

  if (maintenanceState.enabled && !isExemptPath && !isAdminDuringMaintenance) {
    return <Navigate to="/maintenance" replace state={{ from: location.pathname }} />;
  }

  if (!maintenanceState.enabled && isMaintenanceRoute) {
    return <Navigate to="/" replace />;
  }

  return (
    <ChunkErrorBoundary>
      <Suspense fallback={loadingFallback}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Suspense fallback={loadingFallback}><Home /></Suspense>} />
          <Route path="/login" element={<Suspense fallback={loadingFallback}><Login /></Suspense>} />
          <Route path="/register" element={<Suspense fallback={loadingFallback}><Register /></Suspense>} />
          <Route path="/verify-email" element={<Suspense fallback={loadingFallback}><VerifyEmail /></Suspense>} />
          <Route path="/forgot-password" element={<Suspense fallback={loadingFallback}><ForgotPassword /></Suspense>} />
          <Route path="/reset-password" element={<Suspense fallback={loadingFallback}><ResetPassword /></Suspense>} />
          <Route path="/products" element={<Suspense fallback={loadingFallback}><Products /></Suspense>} />
          <Route path="/cart" element={<Suspense fallback={loadingFallback}><Cart /></Suspense>} />
          <Route path="/checkout" element={<Suspense fallback={loadingFallback}><Checkout /></Suspense>} />
          <Route path="/payment-success" element={<Suspense fallback={loadingFallback}><PaymentSuccess /></Suspense>} />
          <Route path="/my-orders" element={<Suspense fallback={loadingFallback}><MyOrders /></Suspense>} />
          <Route path="/about" element={<Suspense fallback={loadingFallback}><About /></Suspense>} />
          <Route path="/help-center" element={<Suspense fallback={loadingFallback}><HelpCenter /></Suspense>} />
          <Route path="/contact" element={<Suspense fallback={loadingFallback}><Contact /></Suspense>} />
          <Route path="/faqs" element={<Suspense fallback={loadingFallback}><FAQs /></Suspense>} />
          <Route path="/terms" element={<Suspense fallback={loadingFallback}><Terms /></Suspense>} />
          <Route path="/returns" element={<Suspense fallback={loadingFallback}><Returns /></Suspense>} />
          <Route
            path="/maintenance"
            element={
              maintenanceState.enabled && !isAdminDuringMaintenance ? (
                <Suspense fallback={loadingFallback}>
                  <MaintenanceMode message={maintenanceState.message} />
                </Suspense>
              ) : (
                <Navigate to={isAdminDuringMaintenance ? "/admin" : "/"} replace />
              )
            }
          />
          <Route
            path="/admin-login"
            element={
              <Suspense fallback={loadingFallback}>
                <AdminLogin />
              </Suspense>
            }
          />
          <Route
            path="/cashier-login"
            element={
              <Suspense fallback={loadingFallback}>
                <CashierLogin />
              </Suspense>
            }
          />
          <Route
            path="/driver-login"
            element={
              <Suspense fallback={loadingFallback}>
                <DriverLogin />
              </Suspense>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredPermission={PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS}>
                <Suspense fallback={loadingFallback}>
                  <AdminDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/emergency-sales"
            element={
              <ProtectedRoute requiredPermission={PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS}>
                <Suspense fallback={loadingFallback}>
                  <AdminDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/business-operations"
            element={
              <ProtectedRoute requiredPermission={PERMISSION_KEYS.ADMIN_DASHBOARD_ACCESS}>
                <Suspense fallback={loadingFallback}>
                  <AdminDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Driver Routes */}
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRoles={["driver"]}>
                <Suspense fallback={loadingFallback}>
                  <DriverDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Cashier Routes */}
          <Route
            path="/cashier"
            element={
              <ProtectedRoute allowedRoles={["cashier"]}>
                <Suspense fallback={loadingFallback}>
                  <CashierDashboard />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* 404 Not Found */}
          <Route path="*" element={<Suspense fallback={loadingFallback}><NotFound /></Suspense>} />
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
}

function App() {
  // Get Google Client ID from environment variables
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    console.warn('⚠️ VITE_GOOGLE_CLIENT_ID not set in environment variables');
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId || 'placeholder'}>
      <>
        <Toaster position="top-right" />
        <SessionExpiredModal />
        <Router>
          <ScrollToTop />
          <Layout>
            <AppInner />
          </Layout>
        </Router>
      </>
    </GoogleOAuthProvider>
  );
}

export default App;




