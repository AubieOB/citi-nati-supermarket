import React, { useState, useEffect } from 'react';
import { getSocket } from '../../utils/socket.js';
import api from '../../utils/api.js';

/**
 * 🎉 PROMOTION BANNER
 * Displays global promotion at the top of the page
 * User can dismiss, persists across navigation and reloads
 * Resets when promotion changes
 */
const PromotionBanner = () => {
  const [promotion, setPromotion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  /**
   * Get localStorage key for this promotion
   */
  const getDismissalKey = (promo) => {
    return `promotionBannerDismissed_${promo?.percentage || 'default'}`;
  };

  /**
   * Fetch current global promotion
   */
  const fetchPromotion = async () => {
    try {
      const response = await api.get('/promotions');
      const promotions = response.data.promotions || {};
      
      // Check if global promotion is enabled
      if (promotions.global && promotions.global.enabled) {
        setPromotion(promotions.global);
        // Reset dismissed state when promotion changes
        setIsDismissed(false);
      } else {
        setPromotion(null);
        setIsDismissed(false);
      }
    } catch (err) {
      console.error('[PromotionBanner] Error fetching promotion:', err.message);
      setPromotion(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch promotion on mount
  useEffect(() => {
    fetchPromotion();
  }, []);

  // Load dismissed state from localStorage when promotion changes
  useEffect(() => {
    if (promotion) {
      const dismissalKey = getDismissalKey(promotion);
      const wasDismissed = localStorage.getItem(dismissalKey) === 'true';
      setIsDismissed(wasDismissed);
      console.log(`[PromotionBanner] Loaded dismissed state for promotion: ${wasDismissed}`);
    }
  }, [promotion]);

  // Listen for real-time promotion updates
  useEffect(() => {
    try {
      const socket = getSocket();
      
      if (!socket) {
        console.log('[PromotionBanner] Socket not available yet');
        return;
      }

      const handlePromotionUpdated = (promotionData) => {
        console.log('[PromotionBanner] 🎯 Promotion updated:', promotionData.type);
        
        // Check if it's a global promotion update
        if (promotionData.type === 'global') {
          if (promotionData.enabled) {
            setPromotion(promotionData);
            // Reset dismissed state when promotion changes
            setIsDismissed(false);
          } else {
            setPromotion(null);
            setIsDismissed(false);
          }
        }
      };

      socket.on('promotionUpdated', handlePromotionUpdated);
      console.log('[PromotionBanner] Socket.io listener attached for promotionUpdated');

      return () => {
        socket.off('promotionUpdated', handlePromotionUpdated);
        console.log('[PromotionBanner] Socket.io listener removed');
      };
    } catch (err) {
      console.warn('[PromotionBanner] Socket.io setup error:', err.message);
    }
  }, []);

  /**
   * Handle banner dismissal
   */
  const handleDismiss = () => {
    if (promotion) {
      const dismissalKey = getDismissalKey(promotion);
      localStorage.setItem(dismissalKey, 'true');
      setIsDismissed(true);
      console.log('[PromotionBanner] Banner dismissed and saved to localStorage');
    }
  };

  // Only render if there's an active global promotion and it hasn't been dismissed
  if (loading || !promotion || isDismissed) {
    return null;
  }

  const discountPercentage = promotion.percentage || 0;

  return (
    <div
      style={{
        backgroundColor: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
        color: '#333',
        padding: '1rem',
        textAlign: 'center',
        fontWeight: '600',
        fontSize: '1rem',
        animation: 'slideDown 0.3s ease-out',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        zIndex: 100,
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', position: 'relative' }}>
        <i className="fas fa-star" style={{ fontSize: '1.2rem', color: '#FF6B6B' }}></i>
        <div>
          <span>🎉 Special Offer! Get </span>
          <strong style={{ fontSize: '1.2rem', color: '#FF6B6B' }}>{discountPercentage}% OFF</strong>
          <span> on all products!</span>
        </div>
        <i className="fas fa-star" style={{ fontSize: '1.2rem', color: '#FF6B6B' }}></i>
        
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            right: '1rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255, 255, 255, 0.3)',
            border: 'none',
            color: '#333',
            cursor: 'pointer',
            fontSize: '1.5rem',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'all 0.2s ease',
            padding: 0,
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.5)';
            e.target.style.transform = 'translateY(-50%) scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            e.target.style.transform = 'translateY(-50%) scale(1)';
          }}
          title="Dismiss banner"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default PromotionBanner;
