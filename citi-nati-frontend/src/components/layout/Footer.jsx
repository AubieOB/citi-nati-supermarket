import React from 'react';
import { Link } from 'react-router-dom';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../../styles/global.css';

const Footer = () => {
  return (
    <footer className="footer" data-nosnippet>
      <div className="footer__content">
        <div className="footer__brand">
          <h2>Citi-Nati Supermarket</h2>
          <p>Convenient grocery shopping for customers, with clear ordering and delivery support.</p>
          <div className="footer__contact">
            <span><i className="fas fa-envelope"></i> info@citinati.com</span>
            <span><i className="fas fa-phone"></i> (+265) 888857188</span>
            <span><i className="fas fa-location-dot"></i> PO Box 32334, Chinyonga, Blantyre 3</span>
          </div>
        </div>

        <div className="footer__section">
          <h3>Shop</h3>
          <div className="footer__links">
            <Link to="/" className="footer__link">Home</Link>
            <Link to="/products" className="footer__link">Products</Link>
            <Link to="/cart" className="footer__link">Cart</Link>
            <Link to="/my-orders" className="footer__link">My Orders</Link>
          </div>
        </div>

        <div className="footer__section">
          <h3>Customer Care</h3>
          <div className="footer__links">
            <Link to="/help-center" className="footer__link">Help Center</Link>
            <Link to="/returns" className="footer__link">Returns</Link>
            <Link to="/faqs" className="footer__link">FAQs</Link>
            <Link to="/contact" className="footer__link">Contact</Link>
            <Link to="/terms" className="footer__link">Terms & Conditions</Link>
          </div>
        </div>

        <div className="footer__section">
          <h3>Social</h3>
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
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="social-link youtube" title="YouTube">
              <i className="fab fa-youtube"></i>
            </a>
            <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" className="social-link whatsapp" title="WhatsApp">
              <i className="fab fa-whatsapp"></i>
            </a>
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        <p className="footer__copyright">
          &copy; {new Date().getFullYear()} Citi-Nati Supermarket. All rights reserved.
        </p>
        <p className="footer__powered-by">Powered by AubieOB Digital Solutions</p>
      </div>
    </footer>
  );
};

export default Footer;
