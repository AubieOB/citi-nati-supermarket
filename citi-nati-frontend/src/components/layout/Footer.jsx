import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../../styles/global.css';

const Footer = () => {
  return (
    <footer className="footer" data-nosnippet>
      <div className="footer__content">
        
        {/* LEFT SIDE */}
        <div className="footer__left">

          {/* QUICK LINKS */}
          <div className="footer__section">
            <h3>Quick Links</h3>
            <div className="footer__links">
              <a href="/" className="footer__link">Home</a>
              <a href="/products" className="footer__link">Products</a>
              <a href="/cart" className="footer__link">Cart</a>
              <a href="/about" className="footer__link">About Us</a>
              <a href="/contact" className="footer__link">Contact Us</a>
            </div>
          </div>

          {/* CUSTOMER SERVICE */}
          <div className="footer__section">
            <h3>Customer Service</h3>
            <div className="footer__links">
              <a href="/help-center" className="footer__link">Help Center</a>
              <a href="/returns" className="footer__link">Returns</a>
              <a href="/faqs" className="footer__link">FAQs</a>
              <a href="/terms" className="footer__link">Terms & Conditions</a>
            </div>
          </div>

          {/* CONTACT */}
          <div className="footer__section">
            <h3>Contact</h3>
            <div className="footer__links">
              <p>Email: info@citinati.com</p>
              <p>Phone: (+265) 888857188</p>
              <p>Address: Citi-Nati Supermarket, PO Box 32334, Chichiri, Blantyre 3</p>
            </div>
          </div>

        </div>

        {/* RIGHT SIDE */}
        <div className="footer__right">
          <div className="footer__section">
            <h3>Follow Citi-Nati</h3>
            <div className="footer__social-links">

              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="social-link facebook" title="Facebook">
                <i className="fab fa-facebook"></i>
              </a>

              <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="social-link x" title="X">
                <i className="fab fa-x-twitter"></i>
              </a>

              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="social-link instagram" title="Instagram">
                <i className="fab fa-instagram"></i>
              </a>

              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="social-link linkedin" title="LinkedIn">
                <i className="fab fa-linkedin-in"></i>
              </a>

              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="social-link youtube" title="YouTube">
                <i className="fab fa-youtube"></i>
              </a>

              <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="social-link whatsapp" title="WhatsApp">
                <i className="fab fa-whatsapp"></i>
              </a>

            </div>
          </div>
        </div>

      </div>

      {/* BOTTOM */}
      <div className="footer__bottom">
        <p className="footer__copyright">
          &copy; {new Date().getFullYear()} Citi-Nati Supermarket. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;