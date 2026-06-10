import React from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import '../../styles/global.css';

const About = () => {
  return (
    <div className="page public-info-page about-page">
      {/* Page Header */}
      <section className="page__section">
        <Container>
          <h1 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#5B4B8A', fontSize: '2.5rem' }}>
            Who We Are
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '2rem' }}>
            Citi-Nati Supermarket helps households shop groceries, essentials, and everyday items with clear prices and reliable service.
          </p>
        </Container>
      </section>

      {/* Mission and Vision Section */}
      <section className="page__section" style={{ backgroundColor: '#f5f5f5' }}>
        <Container>
          <div 
            className="mission-vision-grid"
          >
            <div style={{
              padding: '2.5rem',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <i className="fas fa-bullseye" style={{ fontSize: '2rem', color: '#5B4B8A', marginRight: '0.75rem', flexShrink: 0 }}></i>
                <h3 style={{ color: '#5B4B8A', margin: 0, fontSize: '1.5rem' }}>Our Mission</h3>
              </div>
              <p style={{ color: '#555', fontSize: '1rem', lineHeight: '1.8' }}>
                To provide our community with access to quality groceries, fresh produce, and everyday essentials 
                at affordable prices, with exceptional customer service and convenience. We strive to make grocery 
                shopping easy, enjoyable, and accessible to everyone.
              </p>
            </div>

            <div style={{
              padding: '2.5rem',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <i className="fas fa-star" style={{ fontSize: '2rem', color: '#2D8659', marginRight: '0.75rem', flexShrink: 0 }}></i>
                <h3 style={{ color: '#333', margin: 0, fontSize: '1.5rem' }}>Our Vision</h3>
              </div>
              <p style={{ color: '#555', fontSize: '1rem', lineHeight: '1.8' }}>
                To become the most trusted and preferred supermarket in our region, known for outstanding quality, 
                innovation, and customer care. We envision a future where every customer feels valued, and where we 
                continue to grow as a community-focused business that makes a positive difference.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Our Story Section */}
      <section className="page__section" style={{ backgroundColor: '#f9f9f9' }}>
        <Container>
          <div style={{ maxWidth: '800px' }}>
            <h2 style={{ color: '#5B4B8A', marginBottom: '1.5rem' }}>Our Story</h2>
            <p style={{ fontSize: '1rem', lineHeight: '1.8', color: '#555', marginBottom: '1rem' }}>
              Citi-Nati Supermarket was founded with a simple mission: to make quality groceries and essentials 
              accessible to everyone in our community. We believe that shopping should be convenient, affordable, 
              and enjoyable.
            </p>
            <p style={{ fontSize: '1rem', lineHeight: '1.8', color: '#555' }}>
              Over the years, we've grown from a small local store to a trusted supermarket serving thousands of 
              satisfied customers. Our commitment to quality, service, and customer satisfaction remains unchanged.
            </p>
          </div>
        </Container>
      </section>

      {/* Our Values Section */}
      <section className="page__section">
        <Container>
          <h2 style={{ color: '#5B4B8A', marginBottom: '2rem', textAlign: 'center' }}>Our Values</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '2rem'
          }}>
            <div style={{
              padding: '2rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <i className="fas fa-leaf" style={{ fontSize: '3rem', color: '#2D8659', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Quality</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>
                We source only the finest products and ensure they meet the highest standards before reaching your door.
              </p>
            </div>

            <div style={{
              padding: '2rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <i className="fas fa-handshake" style={{ fontSize: '3rem', color: '#5B4B8A', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Trust</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>
                Your satisfaction and trust are our foundation. We're committed to honest practices and exceptional service.
              </p>
            </div>

            <div style={{
              padding: '2rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <i className="fas fa-rocket" style={{ fontSize: '3rem', color: '#ff6b6b', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Innovation</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>
                We continuously improve our services and technology to provide you with the best shopping experience.
              </p>
            </div>

            <div style={{
              padding: '2rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <i className="fas fa-users" style={{ fontSize: '3rem', color: '#4CAF50', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Community</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>
                We believe in giving back and supporting our local community in every way we can.
              </p>
            </div>

            <div style={{
              padding: '2rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <i className="fas fa-dollar-sign" style={{ fontSize: '3rem', color: '#FFC107', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Affordability</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>
                Quality products at competitive prices - everyone deserves access to the best.
              </p>
            </div>

            <div style={{
              padding: '2rem',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center'
            }}>
              <i className="fas fa-utensils" style={{ fontSize: '3rem', color: '#8B4513', marginBottom: '1rem' }}></i>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Convenience</h3>
              <p style={{ color: '#666', fontSize: '0.95rem' }}>
                Fast delivery and easy ordering - grocery shopping that fits your busy lifestyle.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Why Choose Us Section */}
      <section className="page__section" style={{ backgroundColor: '#f9f9f9' }}>
        <Container>
          <h2 style={{ color: '#5B4B8A', marginBottom: '2rem' }}>Why Choose Citi-Nati?</h2>
          <div 
            className="why-choose-grid"
          >
            <div>
              <h4 style={{ color: '#333', marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-check-circle" style={{ color: '#2D8659', marginRight: '0.5rem' }}></i>
                Wide Selection
              </h4>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                From fresh produce to pantry staples, we have everything you need for your household.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#333', marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-check-circle" style={{ color: '#2D8659', marginRight: '0.5rem' }}></i>
                Fast Delivery
              </h4>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                Get your order delivered within 24 hours right to your doorstep.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#333', marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-check-circle" style={{ color: '#2D8659', marginRight: '0.5rem' }}></i>
                Best Prices
              </h4>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                Competitive pricing and regular promotions to help you save more.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#333', marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-check-circle" style={{ color: '#2D8659', marginRight: '0.5rem' }}></i>
                Easy Online Ordering
              </h4>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                Simple, secure, and user-friendly platform for stress-free shopping.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#333', marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-check-circle" style={{ color: '#2D8659', marginRight: '0.5rem' }}></i>
                24/7 Support
              </h4>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                Our customer service team is always ready to help you with any questions.
              </p>
            </div>

            <div>
              <h4 style={{ color: '#333', marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                <i className="fas fa-check-circle" style={{ color: '#2D8659', marginRight: '0.5rem' }}></i>
                Quality Guarantee
              </h4>
              <p style={{ color: '#666', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
                Fresh, high-quality products guaranteed or your money back.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Call-to-Action Section */}
      <section className="page__section">
        <Container>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ color: '#5B4B8A', marginBottom: '1rem' }}>Ready to Experience Citi-Nati?</h2>
            <p style={{ fontSize: '1rem', color: '#666', marginBottom: '2rem' }}>
              Join thousands of satisfied customers and start shopping today
            </p>
            <Link to="/products">
              <Button variant="primary" size="large">
                Browse Our Products
              </Button>
            </Link>
          </div>
        </Container>
      </section>
    </div>
  );
};

export default About;
