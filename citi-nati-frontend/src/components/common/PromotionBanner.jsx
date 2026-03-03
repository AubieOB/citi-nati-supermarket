import React, { useState, useEffect } from 'react';
import { getSocket } from '../../utils/socket.js';
import api from '../../utils/api.js';

/**
 * 🎉 PROMOTION BANNER
 * Displays global or category-specific promotions at the top of the page
 * User can dismiss, persists across navigation and reloads
 * Resets when promotion changes
 * 
 * @param {string} category - Optional category name to check for category promotions
 */
const PromotionBanner = ({ category = null }) => {
  const [promotion, setPromotion] = useState(null);
  const [promotionType, setPromotionType] = useState(null); // Track if promotion is 'global' or 'category'
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  /**
   * Get localStorage key for this promotion
   */
  const getDismissalKey = (promo, type) => {
    return `promotionBannerDismissed_${type}_${promo?.percentage || 'default'}`;
  };

  /**
   * Fetch current promotions (global and category-specific)
   */
  const fetchPromotion = async () => {
    try {
      const response = await api.get('/promotions');
      const promotions = response.data.promotions || {};
      
      let activePromotion = null;
      let activeType = null;

      // Check if category promotion applies to current category
      if (category && promotions.category && promotions.category.enabled && promotions.category.categoryId === category) {
        activePromotion = promotions.category;
        activeType = 'category';
        console.log(`[PromotionBanner] 🏷️  Category promotion found for: ${category}`);
      } 
      // Fall back to global promotion
      else if (promotions.global && promotions.global.enabled) {
        activePromotion = promotions.global;
        activeType = 'global';
        console.log('[PromotionBanner] 🌍 Using global promotion');
      }

      if (activePromotion) {
        setPromotion(activePromotion);
        setPromotionType(activeType);
        // Reset dismissed state when promotion changes
        setIsDismissed(false);
      } else {
        setPromotion(null);
        setPromotionType(null);
        setIsDismissed(false);
      }
    } catch (err) {
      console.error('[PromotionBanner] Error fetching promotion:', err.message);
      setPromotion(null);
      setPromotionType(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch promotion on mount and when category changes
  useEffect(() => {
    fetchPromotion();
  }, [category]);

  // Load dismissed state from localStorage when promotion changes
  useEffect(() => {
    if (promotion && promotionType) {
      const dismissalKey = getDismissalKey(promotion, promotionType);
      const wasDismissed = localStorage.getItem(dismissalKey) === 'true';
      setIsDismissed(wasDismissed);
      console.log(`[PromotionBanner] Loaded dismissed state for ${promotionType} promotion: ${wasDismissed}`);
    }
  }, [promotion, promotionType]);

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
            setPromotionType('global');
            // Reset dismissed state when promotion changes
            setIsDismissed(false);
          } else {
            setPromotion(null);
            setPromotionType(null);
            setIsDismissed(false);
          }
        }
        // Check if it's a category promotion update for the current category
        else if (promotionData.type === 'category' && category && promotionData.categoryId === category) {
          if (promotionData.enabled) {
            setPromotion(promotionData);
            setPromotionType('category');
            // Reset dismissed state when promotion changes
            setIsDismissed(false);
          } else {
            // Category promotion was disabled, revert to global if available
            setPromotion(null);
            setPromotionType(null);
            setIsDismissed(false);
            fetchPromotion(); // Re-fetch to check for global promotion
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
  }, [category]);

  /**
   * Handle banner dismissal
   */
  const handleDismiss = () => {
    if (promotion && promotionType) {
      const dismissalKey = getDismissalKey(promotion, promotionType);
      localStorage.setItem(dismissalKey, 'true');
      setIsDismissed(true);
      console.log(`[PromotionBanner] ${promotionType} banner dismissed and saved to localStorage`);
    }
  };

  // Only render if there's an active promotion and it hasn't been dismissed
  if (loading || !promotion || !promotionType || isDismissed) {
    return null;
  }

  const discountPercentage = promotion.percentage || 0;
  const isCategory = promotionType === 'category';
  const promotionTitle = isCategory ? `🏷️ Category Sale` : `🎉 Special Offer`;
  const promotionMessage = isCategory ? `Get ${discountPercentage}% OFF on ${category}!` : `Get ${discountPercentage}% OFF on all products!`;

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
        <i className={`fas ${isCategory ? 'fa-tag' : 'fa-star'}`} style={{ fontSize: '1.2rem', color: '#FF6B6B' }}></i>
        <div>
          <span>{promotionTitle}! </span>
          <strong style={{ fontSize: '1.2rem', color: '#FF6B6B' }}>{discountPercentage}% OFF</strong>
          <span> {isCategory ? `on ${category}!` : 'on all products!'}</span>
        </div>
        <i className={`fas ${isCategory ? 'fa-tag' : 'fa-star'}`} style={{ fontSize: '1.2rem', color: '#FF6B6B' }}></i>
        
        {/* Close Button */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '0.5rem',
            transform: 'translateY(0)',
            background: 'rgba(255, 255, 255, 0.4)',
            border: 'none',
            color: '#333',
            cursor: 'pointer',
            fontSize: '0.875rem',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'all 0.2s ease',
            padding: 0,
            minWidth: '24px',
            minHeight: '24px',
          }}
          onMouseOver={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
            e.target.style.transform = 'scale(1.15)';
          }}
          onMouseOut={(e) => {
            e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
            e.target.style.transform = 'scale(1)';
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
