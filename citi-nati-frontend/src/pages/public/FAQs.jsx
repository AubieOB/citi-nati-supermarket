import React, { useState } from 'react';
import Container from '../../components/ui/Container.jsx';
import '../../styles/global.css';

const FAQs = () => {
  const [expandedId, setExpandedId] = useState(null);

  const faqs = [
    {
      id: 1,
      question: 'How do I place an order?',
      answer: 'Browsing is simple: go to our Products page, select your items and add them to your cart. Once done, proceed to checkout. You can either sign in to an existing account or create a new one to complete your purchase.'
    },
    {
      id: 2,
      question: 'What is the delivery time?',
      answer: 'We deliver most orders within 24 hours. Exact delivery times depend on your location and the size of your order.'
    },
    {
      id: 3,
      question: 'Do you offer same-day delivery?',
      answer: 'Yes! Orders placed before 6:00 PM can be delivered the same day, subject to location and product availability.'
    },
    {
      id: 4,
      question: 'What payment methods do you accept?',
      answer: 'We accept credit cards, debit cards, mobile money (Airtel Money & TNM Mpamba), and bank transfers. All transactions are secure.'
    },
    {
      id: 5,
      question: 'Can I modify my order after placing it?',
      answer: 'Unfortunately, orders cannot be modified once placed. Please review all details carefully before confirming your purchase.'
    },
    {
      id: 6,
      question: 'What is your refund policy?',
      answer: 'We issue full refunds for defective or damaged items. Refunds are processed within 3–5 business days after approval and inspection.'
    },
    {
      id: 7,
      question: 'How can I track my order?',
      answer: 'Track your order in real-time through your account dashboard under "My Orders" after you place an order.'
    },
    {
      id: 8,
      question: 'Do you deliver to remote areas?',
      answer: 'We deliver to most areas in the city. Check our delivery map during checkout to see if we serve your location.'
    },
    {
      id: 9,
      question: 'What should I do if my order arrives damaged?',
      answer: 'Contact us immediately with photos of the damaged items. We will arrange a replacement or refund right away.'
    },
    {
      id: 10,
      question: 'Is there a minimum order value?',
      answer: 'Yes, the minimum order is MWK 10,000. This ensures we can deliver efficiently while maintaining quality service.'
    }
  ];

  const toggleFAQ = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="page">
      <Container>
        <div style={{ marginTop: '2rem', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Frequently Asked Questions</h1>
          <p style={{ color: '#666' }}>Find answers to common questions about our services.</p>
        </div>

        <div style={{ maxWidth: '800px', margin: '0 auto', fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>
          {faqs.map((faq) => (
            <div
              key={faq.id}
              style={{
                marginBottom: '1rem',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              <button
                onClick={() => toggleFAQ(faq.id)}
                style={{
                  width: '100%',
                  padding: '1.25rem',
                  backgroundColor: expandedId === faq.id ? '#f0f0f0' : '#fff',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#f9f9f9'}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = expandedId === faq.id ? '#f0f0f0' : '#fff';
                }}
              >
                <span>{faq.question}</span>
                <span style={{ fontSize: '1.25rem', color: '#666' }}>
                  {expandedId === faq.id ? '−' : '+'}
                </span>
              </button>
              
              {expandedId === faq.id && (
                <div
                  style={{
                    padding: '0 1.25rem 1.25rem',
                    backgroundColor: '#fafafa',
                    borderTop: '1px solid #e0e0e0',
                    color: '#555',
                    lineHeight: '1.6'
                  }}
                >
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: '3rem', padding: '2rem', backgroundColor: '#f8f9fa', borderRadius: '8px', textAlign: 'center' }}>
          <h3>Still have questions?</h3>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Can't find the answer you're looking for? Our customer service team is here to help.
          </p>
          <a href="/contact" style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#007bff',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: '500'
          }}>
            Contact Us
          </a>
        </div>
      </Container>
    </div>
  );
};

export default FAQs;
