import React from 'react';
import Container from '../../components/ui/Container.jsx';
import '../../styles/global.css';

const Returns = () => {
  return (
    <div className="page public-info-page returns-page">
      <Container>
        <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Returns & Refunds</h1>
          <p style={{ color: '#666' }}>Learn about our return and refund policy.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
          {/* Return Policy */}
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#333' }}>Return Policy</h2>
            
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Return Window</h3>
              <p style={{ color: '#666' }}>
                You have 7 days from the date of delivery to initiate a return or exchange. Items must be in their original condition with all packaging intact.
              </p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>What Can Be Returned?</h3>
              <ul style={{ color: '#666', marginLeft: '1.5rem' }}>
                <li>Damaged products</li>
                <li>Defective items</li>
                <li>Products that don't match the description</li>
                <li>Expired goods</li>
              </ul>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Non-Returnable Items</h3>
              <ul style={{ color: '#666', marginLeft: '1.5rem' }}>
                <li>Fresh produce items that are opened or damaged by customer</li>
                <li>Items past their expiry date due to customer storage</li>
                <li>Items without original packaging</li>
                <li>Items used or consumed by customer</li>
              </ul>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>How to Request a Return</h3>
              <ol style={{ color: '#666', marginLeft: '1.5rem' }}>
                <li>Log in to your account</li>
                <li>Go to "Help Center"</li>
                <li>Create a new support ticket with subject "Return Request"</li>
                <li>Describe the product and reason for return</li>
                <li>Upload relevant photos in the ticket</li>
                <li>Our team will review and respond with return instructions</li>
              </ol>
            </div>
          </div>

          {/* Refund Policy */}
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#333' }}>Refund Policy</h2>
            
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Refund Timeline</h3>
              <p style={{ color: '#666' }}>
                Once your return is approved, we will arrange pickup. Refunds are processed within 3-5 business days after we receive and inspect the returned items.
              </p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Refund Methods</h3>
              <p style={{ color: '#666' }}>
                Refunds will be credited to the original payment method used during purchase. For mobile money payments, refunds appear in your account immediately after processing.
              </p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Partial Refunds</h3>
              <p style={{ color: '#666' }}>
                Refunds for individual items in a multi-item order may be processed separately. Delivery fees are non-refundable unless the entire order is returned.
              </p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Damaged on Arrival</h3>
              <p style={{ color: '#666' }}>
                If items arrive damaged, report within 24 hours with photographic evidence. We will process a full refund or replacement immediately.
              </p>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ color: '#333', marginBottom: '0.5rem' }}>Expired Products</h3>
              <p style={{ color: '#666' }}>
                Any product received past its expiry date will be fully refunded with no questions asked. Please report immediately upon delivery.
              </p>
            </div>
          </div>
        </div>

        {/* Exchange Information */}
        <div style={{ backgroundColor: '#f8f9fa', padding: '2rem', borderRadius: '8px', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>Exchanges</h2>
          <p style={{ color: '#666' }}>
            We offer exchanges for defective or damaged items. You can request an exchange instead of a refund, and we'll send a replacement as soon as it's available. There are no additional fees for exchanges for faulty products. If the replacement costs more than the original item, you pay the difference. If it costs less, you receive credit for your account.
          </p>
        </div>

        {/* Need Help */}
        <div style={{ backgroundColor: '#e7f3ff', padding: '2rem', borderRadius: '8px', textAlign: 'center' }}>
          <h3 style={{ marginBottom: '1rem', color: '#333' }}>Ready to Request a Return?</h3>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Start the return process through our Help Center support system. Our team will guide you through every step.
          </p>
          <a href="/help-center" style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: '500'
          }}>
            Go to Help Center
          </a>
        </div>
      </Container>
    </div>
  );
};

export default Returns;
