import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const ResetPassword = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!email || !code || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (code.length !== 6) {
      setError('Reset code must be 6 digits');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword === confirmPassword && newPassword.length > 0) {
      // Additional check: passwords should have some complexity
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        setError('Password should contain uppercase, lowercase, and numbers');
        return;
      }
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/reset-password', {
        email,
        code,
        newPassword,
      });

      // Password reset successful - redirect to login
      setError('');
      setResendSuccess('✓ Password reset successful! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Password reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <Container>
        <div style={{ maxWidth: '500px', margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <i className="fas fa-key" style={{ fontSize: '3rem', color: '#5B4B8A', marginBottom: '1rem' }}></i>
              <h1 style={{ color: '#5B4B8A', marginBottom: '0.5rem' }}>Reset Password</h1>
              <p style={{ color: '#666', marginBottom: 0 }}>
                Enter your reset code and new password
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

            {resendSuccess && (
              <div style={{
                backgroundColor: '#d4edda',
                color: '#155724',
                padding: '1rem',
                borderRadius: '4px',
                marginBottom: '1.5rem',
                borderLeft: '4px solid #c3e6cb',
              }}>
                <i className="fas fa-check-circle" style={{marginRight: '0.5rem'}}></i>{resendSuccess}
              </div>
            )}

            <form onSubmit={handleResetPassword}>
              {/* Email */}
              <div style={{ marginBottom: '1.5rem' }}>
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

              {/* Reset Code */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#333',
                }}>
                  Reset Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  pattern="\d{6}"
                  maxLength="6"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1.5rem',
                    letterSpacing: '0.5rem',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    boxSizing: 'border-box',
                  }}
                />
                <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '0.5rem', textAlign: 'center' }}>
                  6-digit code from your email
                </p>
              </div>

              {/* New Password */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#333',
                }}>
                  New Password
                </label>
                <div style={{ position: 'relative', width: '100%', display: 'block' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      paddingRight: '50px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      cursor: 'pointer',
                      color: '#5B4B8A',
                      fontSize: '18px',
                      padding: '6px',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      pointerEvents: 'auto'
                    }}
                    role="button"
                    tabIndex="0"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas fa-eye${showPassword ? '-slash' : ''}`}></i>
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#999', marginTop: '0.5rem' }}>
                  At least 6 characters, with uppercase, lowercase, and numbers
                </p>
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#333',
                }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative', width: '100%', display: 'block' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      paddingRight: '50px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      cursor: 'pointer',
                      color: '#5B4B8A',
                      fontSize: '18px',
                      padding: '6px',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      pointerEvents: 'auto'
                    }}
                    role="button"
                    tabIndex="0"
                    title={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    <i className={`fas fa-eye${showConfirm ? '-slash' : ''}`}></i>
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="large"
                disabled={loading || !email || code.length !== 6 || !newPassword || !confirmPassword}
                style={{ width: '100%' }}
              >
                {loading ? <><i className="fas fa-spinner fa-spin" style={{marginRight: '0.5rem'}}></i>Resetting...</> : 'Reset Password'}
              </Button>
            </form>

            <div style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px solid #eee',
              textAlign: 'center',
            }}>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
                Ready to login? <Link to="/login" style={{ color: '#5B4B8A', textDecoration: 'none', fontWeight: '500' }}>Go to login</Link>
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default ResetPassword;
