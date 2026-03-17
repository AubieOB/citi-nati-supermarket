import React from 'react';
import { Link } from 'react-router-dom';

const MaintenanceMode = ({ message }) => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #fff8f1 0%, #f4f0ff 100%)',
      padding: '2rem',
      position: 'relative'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '720px',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: '18px',
        padding: '2rem',
        boxShadow: '0 18px 60px rgba(0,0,0,0.10)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>We'll Be Back Soon</div>
        <p style={{ color: '#555', fontSize: '1.05rem', lineHeight: 1.7, margin: 0 }}>
          {message}
        </p>
      </div>

      <Link
        to="/admin-login"
        style={{
          position: 'fixed',
          right: '1rem',
          bottom: '1rem',
          color: '#5B4B8A',
          textDecoration: 'none',
          fontWeight: 700,
          backgroundColor: '#fff',
          borderRadius: '999px',
          padding: '0.65rem 1rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
        }}
      >
        Admin
      </Link>
    </div>
  );
};

export default MaintenanceMode;
