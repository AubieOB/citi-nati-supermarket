import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';

const AdminMaintenanceLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      if (user.role !== 'admin') {
        setError('Only admin accounts can sign in during maintenance mode.');
        setLoading(false);
        return;
      }

      login(user, token);
      navigate('/admin');
    } catch (err) {
      setError(err.response?.data?.error || 'Admin login failed');
    } finally {
      setLoading(false);
    }
  };

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
        <h1 style={{ marginTop: 0, color: '#333', fontSize: '1.6rem' }}>Admin Login</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>Maintenance mode is active. Only admin accounts can continue.</p>

        {error && (
          <div style={{ marginBottom: '1rem', backgroundColor: '#fdecea', color: '#b91c1c', borderRadius: '8px', padding: '0.75rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Admin email"
            required
            style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
            style={{ width: '100%', padding: '0.85rem', borderRadius: '8px', border: '1px solid #ddd' }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ border: 'none', borderRadius: '8px', padding: '0.85rem 1rem', backgroundColor: loading ? '#94a3b8' : '#5B4B8A', color: '#fff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Signing in...' : 'Sign In as Admin'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', textAlign: 'right' }}>
          <Link to="/maintenance" style={{ color: '#5B4B8A', textDecoration: 'none', fontWeight: 600 }}>Back</Link>
        </div>
      </div>
    </div>
  );
};

export default AdminMaintenanceLogin;
