import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const VerifyEmail = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [canResend, setCanResend] = useState(true);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    // Get email from query params or session
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email') || sessionStorage.getItem('registrationEmail');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, []);

  // Countdown timer for resend
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0 && !canResend) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [countdown, canResend]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !code) {
      setError('Please enter your email and verification code');
      return;
    }

    if (code.length !== 6) {
      setError('Verification code must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/verify-email', {
        email,
        code,
      });

      // Email verified - clear storage and redirect to login
      sessionStorage.removeItem('registrationEmail');
      setError('');
      
      // Show success and redirect to login after a short delay
      setResendSuccess('✓ Email verified successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResendSuccess('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setResending(true);
    setCanResend(false);
    setCountdown(60); // 60 second cooldown

    try {
      await api.post('/auth/resend-verification-code', { email });
      setResendSuccess('Verification code resent! Check your email.');
      setCode(''); // Clear code field
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend code. Please try again.');
      setCanResend(true);
      setCountdown(0);
    } finally {
      setResending(false);
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
              <i className="fas fa-envelope" style={{ fontSize: '3rem', color: '#0638dc', marginBottom: '1rem' }}></i>
              <h1 style={{ color: '#0638dc', marginBottom: '0.5rem' }}>Verify Your Email</h1>
              <p style={{ color: '#666', marginBottom: 0 }}>
                We've sent a 6-digit code to {email || 'your email'}
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

            <form onSubmit={handleVerify}>
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

              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#333',
                }}>
                  Verification Code
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
                  Enter the 6-digit code sent to your email
                </p>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="large"
                disabled={loading || !email || code.length !== 6}
                style={{ width: '100%' }}
              >
                {loading ? <><i className="fas fa-spinner fa-spin" style={{marginRight: '0.5rem'}}></i>Verifying...</> : 'Verify Email'}
              </Button>
            </form>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
              <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Didn't receive the code?
              </p>
              <button
                onClick={handleResend}
                disabled={resending || !canResend}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'transparent',
                  border: '2px solid #0638dc',
                  color: '#0638dc',
                  borderRadius: '4px',
                  cursor: resending || !canResend ? 'not-allowed' : 'pointer',
                  opacity: resending || !canResend ? 0.6 : 1,
                  fontWeight: '500',
                  fontSize: '0.9rem',
                }}
              >
                {resending ? 'Resending...' : canResend ? 'Resend Code' : `Resend in ${countdown}s`}
              </button>
            </div>

            <div style={{
              marginTop: '2rem',
              paddingTop: '1rem',
              borderTop: '1px solid #eee',
              textAlign: 'center',
            }}>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>
                Already verified? <Link to="/login" style={{ color: '#12b600', textDecoration: 'none', fontWeight: '700' }}>Login here</Link>
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default VerifyEmail;
