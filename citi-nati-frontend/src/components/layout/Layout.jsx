import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import CookieConsentBanner from '../common/CookieConsentBanner.jsx';
import '../../styles/global.css';

const Layout = ({ children }) => {
  const location = useLocation();
  
  // Hide header only on products page and admin/driver dashboards
  const hideHeader = location.pathname.startsWith('/admin') || 
                     location.pathname.startsWith('/driver') ||
                     location.pathname.startsWith('/cashier') ||
                     location.pathname === '/products' ||
                     location.pathname === '/maintenance' ||
                     location.pathname === '/admin-login';
  const hideFooter = location.pathname.startsWith('/admin') ||
                     location.pathname.startsWith('/driver') ||
                     location.pathname.startsWith('/cashier') ||
                     location.pathname === '/maintenance' ||
                     location.pathname === '/admin-login';

  return (
    <div className={`layout${hideHeader ? ' layout--no-header' : ''}`}>
      {!hideHeader && (
        <div className="layout__header">
          <Header />
        </div>
      )}
      <div className="layout__content">
        <main className="layout__main">
          {children}
        </main>
      </div>
      {!hideFooter && (
        <div className="layout__footer">
          <Footer />
        </div>
      )}
      <CookieConsentBanner />
    </div>
  );
};

export default Layout;

