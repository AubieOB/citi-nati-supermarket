import React from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header.jsx';
import Footer from './Footer.jsx';
import '../../styles/global.css';

const Layout = ({ children }) => {
  const location = useLocation();
  
  // Hide footer on admin and driver dashboards
  const hideFooter = location.pathname.startsWith('/admin') || location.pathname.startsWith('/driver');

  return (
    <div className="layout">
      <div className="layout__header">
        <Header />
      </div>
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
    </div>
  );
};

export default Layout;
