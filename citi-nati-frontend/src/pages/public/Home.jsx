import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../../components/ui/Container.jsx';
import Button from '../../components/ui/Button.jsx';
import PromotionBanner from '../../components/common/PromotionBanner.jsx';
import Modal from '../../components/common/Modal.jsx';
import api from '../../utils/api.js';
import { formatMWK } from '../../utils/currency.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { useModal } from '../../hooks/useModal.js';
import { cartValidation } from '../../utils/backendAlignment.js';
import { resolveEffectiveStock } from '../../utils/stockResolver.js';
import heroOriginal from '../../assets/hero-bg.jpg.jpg';
import heroProduce from '../../assets/home-hero-produce.jpg';
import heroAisle from '../../assets/home-hero-aisle.jpg';
import heroDelivery from '../../assets/home-hero-delivery.jpg';
import heroShopper from '../../assets/home-hero-shopper.jpg';
import '../../styles/global.css';

const STOREFRONT_LOCATION_CODE = String(import.meta.env.VITE_STOREFRONT_LOCATION_CODE || 'SH').trim().toUpperCase();
const STOREFRONT_BRANCH_CODE = String(import.meta.env.VITE_STOREFRONT_BRANCH_CODE || 'BLANTYRE').trim().toUpperCase();

const heroSlides = [
  {
    image: heroProduce,
    label: 'Fresh groceries',
    title: 'Fresh Groceries. Everyday Value. Delivered with Care.',
    text: 'Shop Citi-Nati Supermarket online for groceries, household essentials, drinks, pantry items, and reliable local delivery.',
  },
  {
    image: heroAisle,
    label: 'Everyday essentials',
    title: 'Your Everyday Supermarket, Now Online.',
    text: 'Browse stocked aisles, compare essentials quickly, and build your order from wherever you are.',
  },
  {
    image: heroShopper,
    label: 'Local shopping',
    title: 'Made for Everyday Shopping in Malawi.',
    text: 'Find familiar essentials, fresh picks, and household items in a fast online store built for local customers.',
  },
  {
    image: heroDelivery,
    label: 'Local service',
    title: 'Shop Fresh, Stock Up, and Save Time.',
    text: 'Order the items your home needs and continue through a delivery-aware checkout flow.',
  },
  {
    image: heroOriginal,
    label: 'Citi-Nati Supermarket',
    title: 'The Brand of Choice for Convenient Shopping.',
    text: 'Quality products, friendly local service, and a simple way to shop for everyday needs.',
  },
];

const Home = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [addedProductId, setAddedProductId] = useState(null);
  const addedFeedbackTimerRef = useRef(null);
  const { isAuthenticated, logout } = useAuth();
  const { updateCartCount } = useCart();
  const { modal, closeModal, showError } = useModal();

  const trackProductInteraction = (product, action) => {
    if (!product?.id) return;
    api.post('/products/interactions', {
      productId: product.id,
      action,
      branchCode: STOREFRONT_BRANCH_CODE,
      locationCode: STOREFRONT_LOCATION_CODE,
    }).catch(() => {});
  };

  const handleAddFeaturedToCart = async (product) => {
    if (!isAuthenticated) {
      showError('Authentication Required', 'Please log in to add items to your cart');
      return;
    }

    const availableStock = resolveEffectiveStock(product);
    if (availableStock <= 0) {
      showError('Out of Stock', `${product.name} is out of stock`);
      return;
    }

    const validation = cartValidation.validateAddToCart({
      productId: product.id,
      quantity: 1,
    });

    if (!validation.isValid) {
      showError('Invalid Request', 'Invalid cart request:\n' + validation.errors.join('\n'));
      return;
    }

    try {
      setAddedProductId(product.id);
      if (addedFeedbackTimerRef.current) {
        window.clearTimeout(addedFeedbackTimerRef.current);
      }
      await api.post('/cart', { productId: product.id, quantity: 1 });
      trackProductInteraction(product, 'add_to_cart');
      addedFeedbackTimerRef.current = window.setTimeout(() => {
        setAddedProductId(null);
      }, 1600);
      await updateCartCount();
    } catch (err) {
      if (err.response?.status === 401) {
        showError('Session Expired', 'Session expired. Please log in again.');
        logout();
        return;
      }
      showError('Error', `Error adding to cart: ${err.response?.data?.error || 'Unknown error'}`);
    }
  };

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
        const response = await api.get('/products/popular', {
          params: {
            limit: 8,
            branchCode: STOREFRONT_BRANCH_CODE,
            locationCode: STOREFRONT_LOCATION_CODE,
          },
        });
        const visibleProducts = (response.data?.products || [])
          .filter((product) => !product.hideFromProductsPage)
          .slice(0, 8);
        if (visibleProducts.length > 0) {
          setFeaturedProducts(visibleProducts);
          return;
        }

        const fallbackResponse = await api.get('/products', {
          params: {
            page: 1,
            pageSize: 8,
            branchCode: STOREFRONT_BRANCH_CODE,
            locationCode: STOREFRONT_LOCATION_CODE,
          },
        });
        setFeaturedProducts((fallbackResponse.data?.products || []).filter((product) => !product.hideFromProductsPage).slice(0, 8));
        console.log('[PREFETCH] Products prefetched successfully');
      } catch (err) {
        console.warn('[PREFETCH] Product prefetch failed (non-critical):', err.message);
      }
    };

    // Run both operations on component mount
    warmupBackend();
    prefetchProducts();
  }, []);

  useEffect(() => {
    return () => {
      if (addedFeedbackTimerRef.current) {
        window.clearTimeout(addedFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 6500);

    return () => window.clearInterval(intervalId);
  }, []);

  const activeHero = heroSlides[activeSlide];

  return (
    <div className="page home-page">
      <PromotionBanner />

      <section className="home-hero-carousel" aria-label="Citi-Nati Supermarket highlights">
        {heroSlides.map((slide, index) => (
          <img
            key={slide.title}
            className={`home-hero-carousel__image${index === activeSlide ? ' home-hero-carousel__image--active' : ''}`}
            src={slide.image}
            alt=""
            aria-hidden={index !== activeSlide}
          />
        ))}
        <div className="home-hero-carousel__overlay"></div>
        <Container>
          <div className="home-hero-carousel__content">
            <span className="home-hero-carousel__label">{activeHero.label}</span>
            <h1>{activeHero.title}</h1>
            <p>{activeHero.text}</p>
            <div className="home-hero-carousel__actions">
              <Link to="/products" className="hero__button hero__button--primary">
                Browse Products
              </Link>
              <Link to="/about" className="hero__button hero__button--secondary">
                About Us
              </Link>
            </div>
            <div className="home-hero-carousel__dots" aria-label="Hero slides">
              {heroSlides.map((slide, index) => (
                <button
                  key={slide.label}
                  type="button"
                  className={index === activeSlide ? 'is-active' : ''}
                  onClick={() => setActiveSlide(index)}
                  aria-label={`Show ${slide.label}`}
                ></button>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="home-service-strip" aria-label="Store benefits">
        <Container>
          <div className="home-service-list">
            <div className="home-service-item">
              <i className="fas fa-truck"></i>
              <span>Fast local delivery</span>
            </div>
            <div className="home-service-item">
              <i className="fas fa-check-circle"></i>
              <span>Quality products</span>
            </div>
            <div className="home-service-item">
              <i className="fas fa-lock"></i>
              <span>Secure checkout</span>
            </div>
            <div className="home-service-item">
              <i className="fas fa-headset"></i>
              <span>Friendly support</span>
            </div>
          </div>
        </Container>
      </section>

      <section className="home-confidence-section">
        <Container>
          <div className="home-confidence">
            <div>
              <span>Easy grocery shopping</span>
              <h2>Everything your home needs, without the extra trip.</h2>
              <p>
                From pantry basics to household essentials, Citi-Nati helps you shop faster, compare what is available, and place your order with confidence.
              </p>
              <Link to="/products" className="home-confidence__cta">
                Start shopping
              </Link>
            </div>

            <div className="home-confidence__points">
              <div>
                <i className="fas fa-magnifying-glass"></i>
                <strong>Find items quickly</strong>
                <p>Search for the groceries, drinks, and essentials you already have in mind.</p>
              </div>
              <div>
                <i className="fas fa-cart-plus"></i>
                <strong>Build your basket</strong>
                <p>Add products as you browse and keep going until your shopping list is done.</p>
              </div>
              <div>
                <i className="fas fa-tags"></i>
                <strong>Shop everyday value</strong>
                <p>Check prices clearly before you checkout, with no confusion at the end.</p>
              </div>
              <div>
                <i className="fas fa-truck"></i>
                <strong>Order for delivery</strong>
                <p>Send your order through and let Citi-Nati help you get it where it needs to go.</p>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {featuredProducts.length > 0 && (
        <section className="home-featured-section">
          <Container>
            <div className="home-section-title home-section-title--inline">
              <div>
                <span>Popular right now</span>
                <h2>Featured products from the live store.</h2>
              </div>
              <Link to="/products">View all products</Link>
            </div>
            <div className="home-featured-products">
              {featuredProducts.map((product) => {
                const price = Number(product.finalPrice || product.price || 0);
                const availableStock = resolveEffectiveStock(product);
                const wasAdded = addedProductId === product.id;
                const stockLabel = availableStock > 0 ? `In stock (${availableStock})` : 'Out of stock';
                return (
                  <article key={product.id} className="home-featured-product">
                    <Link
                      to={`/products?productId=${encodeURIComponent(product.id)}&search=${encodeURIComponent(product.name)}`}
                      className="home-featured-product__main"
                      onClick={() => trackProductInteraction(product, 'view')}
                    >
                      <div className="home-featured-product__image">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} crossOrigin="anonymous" />
                        ) : (
                          <i className="fas fa-basket-shopping"></i>
                        )}
                      </div>
                      <span className={product.isOnSale ? 'home-featured-product__badge home-featured-product__badge--sale' : 'home-featured-product__badge'}>
                        {product.isOnSale ? 'Promotion' : (product.popularityLabel || product.category || 'Popular')}
                      </span>
                      <strong>{product.name}</strong>
                    </Link>
                    <div className="home-featured-product__footer">
                      <span className={availableStock > 0 ? 'home-featured-product__stock' : 'home-featured-product__stock home-featured-product__stock--out'}>
                        {stockLabel}
                      </span>
                      <em>{formatMWK(price)}</em>
                      <button
                        type="button"
                        className={`home-featured-product__cart${wasAdded ? ' is-added' : ''}`}
                        onClick={() => handleAddFeaturedToCart(product)}
                        disabled={availableStock <= 0}
                        aria-label={`Add ${product.name} to cart`}
                        title={availableStock > 0 ? 'Add to cart' : 'Out of stock'}
                      >
                        <i className={`fas ${wasAdded ? 'fa-check' : 'fa-cart-plus'}`} aria-hidden="true"></i>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </Container>
        </section>
      )}

      <section className="home-process-section">
        <Container>
          <div className="home-section-title">
            <span>How it works</span>
            <h2>A simple grocery order flow.</h2>
          </div>
          <div className="home-process-list">
            <div>
              <strong>01</strong>
              <h3>Browse products</h3>
              <p>Search the store or open departments to find the items you need.</p>
            </div>
            <div>
              <strong>02</strong>
              <h3>Add to cart</h3>
              <p>Review quantities, stock status, VAT, and totals before checkout.</p>
            </div>
            <div>
              <strong>03</strong>
              <h3>Checkout for delivery</h3>
              <p>Enter your delivery details and continue through the existing order flow.</p>
            </div>
          </div>
        </Container>
      </section>

      <section className="home-delivery-section">
        <Container>
          <div className="home-delivery-band">
            <div>
              <span>Delivery & support</span>
              <h2>Built for local grocery convenience.</h2>
              <p>
                Citi-Nati helps customers shop everyday essentials online with live product browsing, clear cart totals, delivery area selection, and customer support when it matters.
              </p>
            </div>
            <Link to="/help-center">
              <Button variant="primary" size="medium">
                Get Help
              </Button>
            </Link>
          </div>
        </Container>
      </section>
      <Modal
        isOpen={modal.isOpen}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
        onCancel={modal.onCancel}
        confirmText={modal.confirmText}
        cancelText={modal.cancelText}
        showCancelButton={modal.showCancelButton}
      />
    </div>
  );
};

export default Home;
