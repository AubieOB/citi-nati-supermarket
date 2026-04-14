import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import PromotionBanner from '../../components/common/PromotionBanner.jsx';
import api from '../../utils/api.js';
import '../../styles/global.css';

const STOREFRONT_LOCATION_CODE = String(import.meta.env.VITE_STOREFRONT_LOCATION_CODE || 'BT').trim().toUpperCase();

const Home = () => {
  useEffect(() => {
    // Warm up the backend - silent health check to wake Render free tier
    const warmupBackend = async () => {
      try {
        await api.get('/health');
        console.log('[WARMUP] Backend warmed up successfully');
      } catch (err) {
        console.warn('[WARMUP] Backend warmup failed (non-critical):', err.message);
      }
    };

    // Prefetch first page of products silently for instant navigation
    const prefetchProducts = async () => {
      try {
        await api.get('/products', {
          params: {
            page: 1,
            pageSize: 20,
            locationCode: STOREFRONT_LOCATION_CODE,
          },
        });
        console.log('[PREFETCH] Products prefetched successfully');
      } catch (err) {
        console.warn('[PREFETCH] Product prefetch failed (non-critical):', err.message);
      }
    };

    // Run both operations on component mount
    warmupBackend();
    prefetchProducts();
  }, []);
  return (
    <div className="page">
      {/* Promotion Banner - Appears at top if global promotion is active */}
      <PromotionBanner />

      {/* Hero Section */}
      <section className="hero">
        <h1 className="hero__title">Welcome to Citi-Nati Supermarket</h1>
        <p className="hero__subtitle">
          The Brand of Choice That Offers Convenient Shopping Experience.
        </p>
        <div className="hero__buttons">
          <Link to="/products" className="hero__button hero__button--primary">
            Browse Products
          </Link>
          <Link to="/about" className="hero__button hero__button--secondary">
            Learn More
          </Link>
        </div>
      </section>

      {/* Promotional Section */}
      <section className="page__section">
        <Container>
          <div className="cta">
            <h2 className="cta__title">Why Choose Citi-Nati?</h2>
            <p className="cta__description">
              We bring quality groceries and essentials right to your door, with our wide selection and competitive prices.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem',
            marginTop: '2rem'
          }}>
            <div style={{
              textAlign: 'center',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa'
            }}>
              <h3><i className="fas fa-truck" style={{ marginRight: '0.5rem' }}></i>Fast Delivery</h3>
              <p>Get your groceries delivered within 24 hours</p>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa'
            }}>
              <h3><i className="fas fa-check-circle" style={{ marginRight: '0.5rem' }}></i>Quality Assured</h3>
              <p>Fresh and high-quality products guaranteed</p>
            </div>
            <div style={{
              textAlign: 'center',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor: '#f8f9fa'
            }}>
              <h3><i className="fas fa-money-bill-wave" style={{ marginRight: '0.5rem' }}></i>Best Prices</h3>
              <p>Competitive prices on all your favorite items</p>
            </div>
          </div>
        </Container>
      </section>

      {/* Call-to-Action Section */}
      <section className="page__section">
        <Container>
          <div className="cta">
            <h2 className="cta__title">Ready to Shop?</h2>
            <p className="cta__description">
              Browse our wide selection of fresh groceries and get started with your next order.
            </p>
            <Link to="/products">
              <Button variant="primary" size="large">
                Start Shopping Now
              </Button>
            </Link>
          </div>
        </Container>
      </section>
    </div>
  );
};

export default Home;
