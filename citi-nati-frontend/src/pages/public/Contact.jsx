import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import api from '../../utils/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import '../../styles/global.css';

const Contact = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    // If user is logged in, submit as support ticket
    if (user) {
      setLoading(true);
      try {
        const ticketMessage = `Customer Contact Information:\n━━━━━━━━━━━━━━━━━━━━━━\nName: ${formData.name}\nEmail: ${formData.email}\nPhone: ${formData.phone}\n\nMessage:\n━━━━━━━━━━━━━━━━━━━━━━\n${formData.message}`;
        
        await api.post('/support/tickets', {
          subject: formData.subject,
          message: ticketMessage,
          priority: 'MEDIUM'
        });
        setSuccessMessage('Your message has been received! We will get back to you soon.');
        setFormData({
          name: '',
          email: '',
          phone: '',
          subject: '',
          message: ''
        });
        setTimeout(() => {
          navigate('/help-center');
        }, 2000);
      } catch (err) {
        setErrorMessage(err.response?.data?.error || 'Failed to send message. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      // For non-logged-in users, show message and suggest login
      setSuccessMessage('Thank you for contacting us! Please log in to track your message in our system.');
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      });
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    }
  };

  return (
    <div className="page">
      <Container>
        <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Contact Us</h1>
          <p style={{ color: '#666' }}>We'd love to hear from you. Get in touch with us today.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginBottom: '3rem' }}>
          {/* Contact Information */}
          <div>
            <h2 style={{ marginBottom: '1.5rem' }}>Get In Touch</h2>
            
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Email</h3>
              <p style={{ color: '#666' }}>info@citinati.com</p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Phone</h3>
              <p style={{ color: '#666' }}>(555) 123-4567</p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Address</h3>
              <p style={{ color: '#666' }}>123 Market Street<br />City, State 12345<br />Malawi</p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Business Hours</h3>
              <p style={{ color: '#666' }}>
                Monday - Friday: 8:00 AM - 6:00 PM<br />
                Saturday: 9:00 AM - 5:00 PM<br />
                Sunday: 10:00 AM - 4:00 PM
              </p>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <h2 style={{ marginBottom: '1.5rem' }}>Send us a Message</h2>
            {successMessage && (
              <div style={{
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#d4edda',
                color: '#155724',
                borderRadius: '4px',
                border: '1px solid #c3e6cb'
              }}>
                {successMessage}
              </div>
            )}
            {errorMessage && (
              <div style={{
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: '#f8d7da',
                color: '#721c24',
                borderRadius: '4px',
                border: '1px solid #f5c6cb'
              }}>
                {errorMessage}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    opacity: loading ? 0.6 : 1
                  }}
                  placeholder="Your name"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    opacity: loading ? 0.6 : 1
                  }}
                  placeholder="your@email.com"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    opacity: loading ? 0.6 : 1
                  }}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Subject</label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    opacity: loading ? 0.6 : 1
                  }}
                  placeholder="Subject of your message"
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Message</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  disabled={loading}
                  rows="5"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    opacity: loading ? 0.6 : 1
                  }}
                  placeholder="Tell us how we can help..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: loading ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => !loading && (e.target.style.backgroundColor = '#218838')}
                onMouseOut={(e) => !loading && (e.target.style.backgroundColor = '#28a745')}
              >
                {loading ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default Contact;
