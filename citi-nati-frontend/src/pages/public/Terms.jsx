import React from 'react';
import Container from '../../components/ui/Container.jsx';
import '../../styles/global.css';

const Terms = () => {
  return (
    <div className="page">
      <Container>
        <div style={{ marginTop: '2rem', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Terms & Conditions</h1>
          <p style={{ color: '#666' }}>Last updated: February 25, 2026</p>
        </div>

        <div style={{ maxWidth: '900px', lineHeight: '1.8', color: '#555' }}>
          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>1. Agreement to Terms</h2>
            <p>
              By accessing and using the Citi-Nati Supermarket website and services, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>2. Use License</h2>
            <p>
              Permission is granted to temporarily download one copy of the materials (information or software) on Citi-Nati Supermarket's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul style={{ marginLeft: '2rem', marginTop: '1rem' }}>
              <li>Modifying or copying the materials</li>
              <li>Using the materials for any commercial purpose or for any public display</li>
              <li>Attempting to decompile or reverse engineer any software contained on the website</li>
              <li>Removing any copyright or other proprietary notations from the materials</li>
              <li>Transferring the materials to another person or "mirroring" the materials on any other server</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>3. Disclaimer</h2>
            <p>
              The materials on Citi-Nati Supermarket's website are provided "as is". Citi-Nati Supermarket makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>4. Limitations</h2>
            <p>
              In no event shall Citi-Nati Supermarket or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Citi-Nati Supermarket's website, even if authorized in writing.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>5. Accuracy of Materials</h2>
            <p>
              The materials appearing on Citi-Nati Supermarket's website could include technical, typographical, or photographic errors. Citi-Nati Supermarket does not warrant that any of the materials on its website are accurate, complete, or current. Citi-Nati Supermarket may make changes to the materials contained on its website at any time without notice.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>6. Links</h2>
            <p>
              Citi-Nati Supermarket has not reviewed all of the sites linked to its website and is not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by Citi-Nati Supermarket of the site. Use of any such linked website is at the user's own risk.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>7. Modifications</h2>
            <p>
              Citi-Nati Supermarket may revise these terms and conditions for its website at any time without notice. By using this website, you are agreeing to be bound by the then current version of these terms and conditions.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>8. Governing Law</h2>
            <p>
              These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction in which Citi-Nati Supermarket is located, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>9. User Accounts</h2>
            <p>
              When you create an account with us, you must provide accurate, complete, and current information. You are responsible for maintaining the confidentiality of your account and password and for restricting access to your account. You agree to accept responsibility for all activities that occur under your account.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>10. Product Pricing and Availability</h2>
            <p>
              All prices are subject to change without notice. We reserve the right to limit quantities and to discontinue any product without notice. Products are subject to availability. We reserve the right to refuse or cancel any order.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#333' }}>11. Contact Us</h2>
            <p>
              If you have any questions about these Terms & Conditions, please contact us at:
            </p>
            <p style={{ marginTop: '1rem' }}>
              Email: info@citinati.com<br />
              Phone: (555) 123-4567<br />
              Address: 123 Market Street, City, State 12345
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
};

export default Terms;
