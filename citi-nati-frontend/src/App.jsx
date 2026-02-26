import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Layout from './components/layout/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { initSocket, identifySocket } from './utils/socket.js';
import { useGlobalNotifications } from './hooks/useGlobalNotifications.js';

// Public Pages
import Home from './pages/public/Home.jsx';
import Login from './pages/public/Login.jsx';
import Register from './pages/public/Register.jsx';
import VerifyEmail from './pages/public/VerifyEmail.jsx';
import ForgotPassword from './pages/public/ForgotPassword.jsx';
import ResetPassword from './pages/public/ResetPassword.jsx';
import Products from './pages/public/Products.jsx';
import Cart from './pages/public/Cart.jsx';
import Checkout from './pages/public/Checkout.jsx';
import MyOrders from './pages/public/MyOrders.jsx';
import PaymentSuccess from './pages/public/PaymentSuccess.jsx';
import About from './pages/public/About.jsx';
import HelpCenter from './pages/public/HelpCenter.jsx';
import Contact from './pages/public/Contact.jsx';
import FAQs from './pages/public/FAQs.jsx';
import Terms from './pages/public/Terms.jsx';
import Returns from './pages/public/Returns.jsx';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

// Driver Pages
import DriverDashboard from './pages/driver/DriverDashboard.jsx';

// Not Found
import NotFound from './pages/NotFound.jsx';

// Import global styles
import './styles/global.css';

function AppInner() {
  const { user, isLoading } = useAuth();

  // Initialize WebSocket on app startup
  useEffect(() => {
    try {
      const socket = initSocket();
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

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/products" element={<Products />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/my-orders" element={<MyOrders />} />
      <Route path="/about" element={<About />} />
      <Route path="/help-center" element={<HelpCenter />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/faqs" element={<FAQs />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/returns" element={<Returns />} />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Driver Routes */}
      <Route
        path="/driver"
        element={
          <ProtectedRoute allowedRoles={["driver"]}>
            <DriverDashboard />
          </ProtectedRoute>
        }
      />

      {/* 404 Not Found */}
      <Route path="*" element={<NotFound />} />
    </Routes>
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
        <Router>
          <Layout>
            <AppInner />
          </Layout>
        </Router>
      </>
    </GoogleOAuthProvider>
  );
}

export default App;
