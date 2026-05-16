import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const normalizeRole = (role) => String(role || '').toLowerCase();
const isAllowedRole = (userRole, allowedRoles = []) => {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return true;
  const normalizedRole = normalizeRole(userRole);
  if (allowedRoles.includes('admin') && ['admin', 'super_admin', 'administrator', 'system_administrator'].includes(normalizedRole)) {
    return true;
  }
  return allowedRoles.map((role) => normalizeRole(role)).includes(normalizedRole);
};

const RoleLoginForm = ({ roleLabel, allowedRoles = [], redirectPath }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      if (!isAllowedRole(user.role, allowedRoles)) {
        setError(`This app is for ${roleLabel} users only.`);
        return;
      }

      login(user, token);
      navigate(redirectPath, { replace: true });
    } catch (err) {
      const backendMessage = String(err.response?.data?.error || err.response?.data?.message || '').trim();
      if (backendMessage) {
        setError(backendMessage);
      } else if (err.response?.status === 400) {
        setError('Email and password are required.');
      } else if (err.response?.status === 401) {
        setError('Invalid email or password.');
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = roleLabel === 'Admin' ? 'Sign In as Admin' : `Sign In as ${roleLabel}`;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f6f8fb 0%, #f5f1ff 100%)',
      padding: '1.5rem'
    }}>
      <div style={{ width: '100%', maxWidth: '420px', backgroundColor: '#fff', borderRadius: '14px', padding: '1.75rem', boxShadow: '0 18px 40px rgba(0,0,0,0.12)' }}>
        <h1 style={{ marginTop: 0, color: '#333', fontSize: '1.6rem' }}>{roleLabel} Login</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>{roleLabel} users sign in here.</p>

        {error && (
          <div style={{ marginBottom: '1rem', backgroundColor: '#fdecea', color: '#b91c1c', borderRadius: '8px', padding: '0.75rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <input
            type="email"
            value={email}
            onChange={(evt) => setEmail(evt.target.value)}
            placeholder={`${roleLabel} email`}
            required
            style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <input
            type="password"
            value={password}
            onChange={(evt) => setPassword(evt.target.value)}
            placeholder="Password"
            required
            style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              border: 'none',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              backgroundColor: loading ? '#94a3b8' : '#5B4B8A',
              color: '#fff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Signing in...' : buttonLabel}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RoleLoginForm;
