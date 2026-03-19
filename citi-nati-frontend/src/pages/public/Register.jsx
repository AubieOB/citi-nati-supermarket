import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { userValidation } from '../../utils/backendAlignment.js';
import '../../styles/global.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // ⚠️ CHECK: Terms and conditions agreement
    if (!formData.agreedToTerms) {
      setError('You must agree to the terms and conditions');
      return;
    }

    // ⚠️ FRONTEND CHECK: Passwords match
    // (Backend doesn't accept confirmPassword, so check before sending)
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // ✅ VALIDATE: Check required fields
    const validation = userValidation.validateRegister({
      name: formData.name,
      email: formData.email,
      password: formData.password,
    });
    if (!validation.isValid) {
      setError(validation.errors[0]);
      return;
    }

    setLoading(true);

    try {
      // ✅ SUBMIT: POST /api/auth/register
      // Body: { name, email, password }
      // ⚠️ Contract: DO NOT send role, confirmPassword, or any other fields
      const response = await api.post('/auth/register', {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });

      // ✅ SUCCESS: Response includes user and requiresVerification flag
      const { user } = response.data;
      
      // ✅ REDIRECT: Go to email verification page immediately (no success message)
      sessionStorage.setItem('registrationEmail', user.email);
      navigate(`/verify-email?email=${user.email}`);
    } catch (err) {
      // ❌ ERROR HANDLING
      if (err.response?.status === 400) {
        // Could be missing fields or user already exists
        const errorMsg = err.response.data?.error || 'Invalid input';
        setError(errorMsg);
      } else if (err.response?.status >= 500) {
        const errorMsg = err.response?.data?.error || 'Server error. Please try again later';
        setError(errorMsg);
      } else {
        const errorMsg = err.response?.data?.error || 'Registration failed. Please try again';
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleRegisterClick = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      setError('');
      setLoading(true);
      try {
        const response = await api.post('/auth/google', {
          token: codeResponse.access_token,
        });
        const { token, user } = response.data;
        
        // Check if email needs verification
        if (!user.emailVerified) {
          sessionStorage.setItem('registrationEmail', user.email);
          navigate(`/verify-email?email=${user.email}`);
          setLoading(false);
          return;
        }
        
        login(user, token);
        setSuccess(response.data.isNewUser ? 'Account created and logged in!' : 'Logged in successfully!');
        setTimeout(() => {
          navigate(user.role === 'admin' ? '/admin' : '/products');
        }, 500);
      } catch (err) {
        setError(err.response?.data?.error || 'Authentication failed. Please try again.');
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google authentication failed. Please try again.');
      setLoading(false);
    },
  });

  return (
    <div className="auth-page">
      <Container>
        <div className="auth-page__container">
          <h1 className="auth-page__title">Create Account</h1>
          <p className="auth-page__subtitle">Join Citi-Nati today and start shopping</p>

          {error && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '0.75rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              border: '1px solid #f5c6cb'
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              backgroundColor: '#d4edda',
              color: '#155724',
              padding: '0.75rem',
              borderRadius: '4px',
              marginBottom: '1rem',
              border: '1px solid #c3e6cb'
            }}>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="form">
            <div className="form__group">
              <label className="form__label" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                name="name"
                className="form__input"
                placeholder="Aubrey Banda"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form__group">
              <label className="form__label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                name="email"
                className="form__input"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form__group">
              <label className="form__label" htmlFor="password">
                Password
              </label>
              <div style={{ position: 'relative', width: '100%', display: 'block' }}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  className="form__input"
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    paddingRight: '50px',
                    boxSizing: 'border-box'
                  }}
                  required
                />
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                    color: '#666',
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
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </span>
              </div>
            </div>

            <div className="form__group">
              <label className="form__label" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <div style={{ position: 'relative', width: '100%', display: 'block' }}>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  className="form__input"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    paddingRight: '50px',
                    boxSizing: 'border-box'
                  }}
                  required
                />
                <span
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    cursor: 'pointer',
                    color: '#666',
                    fontSize: '18px',
                    padding: '6px',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    pointerEvents: 'auto'
                  }}
                  role="button"
                  tabIndex="0"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`fas ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </span>
              </div>
            </div>

            {/* Terms and Conditions Checkbox */}
            <div className="form__group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minHeight: '24px' }}>
              <input
                id="agreedToTerms"
                type="checkbox"
                name="agreedToTerms"
                checked={formData.agreedToTerms}
                onChange={handleChange}
                style={{
                  cursor: 'pointer',
                  width: '18px',
                  height: '18px',
                  minWidth: '18px',
                  minHeight: '18px',
                  accentColor: '#5B4B8A',
                  flexShrink: 0
                }}
              />
              <label htmlFor="agreedToTerms" style={{ fontSize: '0.9rem', color: '#555', cursor: 'pointer', margin: 0 }}>
                I agree to the{' '}
                <Link to="/terms" style={{ color: '#5B4B8A', textDecoration: 'none', fontWeight: '500' }}>
                  terms and conditions
                </Link>
              </label>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              style={{ width: '100%', padding: '0.75rem' }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '1.5rem 0',
            gap: '1rem'
          }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd' }}></div>
            <span style={{ color: '#999', fontSize: '0.9rem' }}>or</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd' }}></div>
          </div>

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={() => handleGoogleRegisterClick()}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#333',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'all 0.3s ease',
              marginBottom: '1rem'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9f9f9';
              e.currentTarget.style.borderColor = '#999';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#fff';
              e.currentTarget.style.borderColor = '#ddd';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="form__link">
            Already have an account?{' '}
            <Link to="/login">Login here</Link>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default Register;
