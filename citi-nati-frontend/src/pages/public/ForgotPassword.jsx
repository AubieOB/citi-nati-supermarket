import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSuccess('Check your email for password reset instructions!');
      setEmail('');
      // Redirect to reset password page after 2 seconds
      setTimeout(() => navigate('/reset-password'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page--compact">
      <Container>
        <div style={{ maxWidth: '500px', margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <i className="fas fa-lock" style={{ fontSize: '3rem', color: '#5B4B8A', marginBottom: '1rem' }}></i>
              <h1 style={{ color: '#5B4B8A', marginBottom: '0.5rem' }}>Forgot Password?</h1>
              <p style={{ color: '#666', marginBottom: 0 }}>
                Enter your email address and we'll send you a code to reset your password
              </p>
            </div>

            {error && (
              <div style={{
                backgroundColor: '#f8d7da',
                color: '#721c24',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #f5c6cb',
              }}>
                <i className="fas fa-exclamation-circle" style={{marginRight: '0.5rem'}}></i>{error}
              </div>
            )}

            {success && (
              <div style={{
                backgroundColor: '#d4edda',
                color: '#155724',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #c3e6cb',
              }}>
                <i className="fas fa-check-circle" style={{marginRight: '0.5rem'}}></i>{success}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#333',
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="large"
                disabled={loading || !email}
                style={{ width: '100%' }}
              >
                {loading ? <><i className="fas fa-spinner fa-spin" style={{marginRight: '0.5rem'}}></i>Sending...</> : 'Send Reset Code'}
              </Button>
            </form>

            <div style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px solid #eee',
              textAlign: 'center',
            }}>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
                Remember your password? <Link to="/login" style={{ color: '#5B4B8A', textDecoration: 'none', fontWeight: '500' }}>Login here</Link>
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default ForgotPassword;
