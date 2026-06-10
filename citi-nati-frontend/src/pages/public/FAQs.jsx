import React, { useState } from 'react';
import Container from '../../components/ui/Container.jsx';
import { FAQ_KNOWLEDGE_BASE, FAQ_TOTAL_QUESTIONS } from '../../data/faqKnowledgeBase.js';
import '../../styles/global.css';

const FAQs = () => {
  const [expandedId, setExpandedId] = useState(null);

  const toggleFAQ = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const jumpToCategory = (category) => {
    const anchorId = `faq-section-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="page public-info-page faqs-page">
      <Container>
        <div style={{ marginTop: '2rem', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Frequently Asked Questions</h1>
          <p style={{ color: '#666' }}>
            Explore our knowledge base by category. Answers are aligned to how ordering, delivery, pricing, payments, and account security currently work in the system.
          </p>
          <p style={{ color: '#4b5563', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            {FAQ_TOTAL_QUESTIONS} questions across {FAQ_KNOWLEDGE_BASE.length} categories
          </p>
        </div>

        <div style={{ maxWidth: '980px', margin: '0 auto', fontSize: 'clamp(0.9rem, 2vw, 1rem)' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            marginBottom: '1.5rem',
            padding: '0.85rem',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            backgroundColor: '#f8fafc'
          }}>
            {FAQ_KNOWLEDGE_BASE.map((section) => (
              <button
                key={section.category}
                onClick={() => jumpToCategory(section.category)}
                style={{
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  borderRadius: '999px',
                  padding: '0.45rem 0.85rem',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#334155'
                }}
              >
                {section.category}
              </button>
            ))}
          </div>

          {FAQ_KNOWLEDGE_BASE.map((section) => {
            const sectionAnchorId = `faq-section-${section.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            return (
              <section key={section.category} id={sectionAnchorId} style={{ marginBottom: '2rem' }}>
                <div style={{
                  marginBottom: '0.9rem',
                  paddingBottom: '0.6rem',
                  borderBottom: '2px solid #e5e7eb'
                }}>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#1f2937' }}>{section.category}</h2>
                  <p style={{ margin: '0.35rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                    {section.questions.length} questions
                  </p>
                </div>

                {section.questions.map((faq) => (
                  <div
                    key={faq.id}
                    style={{
                      marginBottom: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      overflow: 'hidden'
                    }}
                  >
                    <button
                      onClick={() => toggleFAQ(faq.id)}
                      style={{
                        width: '100%',
                        padding: '1.05rem 1.1rem',
                        backgroundColor: expandedId === faq.id ? '#f1f5f9' : '#fff',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: '600',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.9rem',
                        color: '#0f172a'
                      }}
                    >
                      <span>{faq.question}</span>
                      <span style={{ fontSize: '1.1rem', color: '#64748b', flexShrink: 0 }}>
                        {expandedId === faq.id ? '−' : '+'}
                      </span>
                    </button>

                    {expandedId === faq.id && (
                      <div
                        style={{
                          padding: '0 1.1rem 1rem',
                          backgroundColor: '#fafcff',
                          borderTop: '1px solid #e2e8f0',
                          color: '#334155',
                          lineHeight: '1.65'
                        }}
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            );
          })}

          <div style={{
            marginTop: '3rem',
            padding: '2rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3>Still need help?</h3>
            <p style={{ color: '#666', marginBottom: '1rem' }}>
              If you still need support, contact us and include your order number (if available) so we can assist faster.
            </p>
            <a href="/help-center" style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#0f766e',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontWeight: '600'
            }}>
              Open Help Center
            </a>
          </div>
        </div>
      </Container>
    </div>
  );
};

export default FAQs;
