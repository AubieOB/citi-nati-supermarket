import React, { useState, useEffect } from 'react';
import { getSocket } from '../../utils/socket.js';
import api from '../../utils/api.js';

/**
 * 🎉 PROMOTION BANNER
 * Displays global promotion at the top of the page
 * Updates in real-time when promotions are enabled/disabled
 */
const PromotionBanner = () => {
  const [promotion, setPromotion] = useState(null);
  const [loading, setLoading] = useState(true);

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
      } else {
        setPromotion(null);
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
          } else {
            setPromotion(null);
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

  // Only render if there's an active global promotion
  if (loading || !promotion) {
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
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <i className="fas fa-star" style={{ fontSize: '1.2rem', color: '#FF6B6B' }}></i>
        <div>
          <span>🎉 Special Offer! Get </span>
          <strong style={{ fontSize: '1.2rem', color: '#FF6B6B' }}>{discountPercentage}% OFF</strong>
          <span> on all products!</span>
        </div>
        <i className="fas fa-star" style={{ fontSize: '1.2rem', color: '#FF6B6B' }}></i>
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
