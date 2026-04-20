import { useState, useEffect } from 'react';

const MOBILE_MAX_WIDTH = 768;

/**
 * Hook to detect if viewport is mobile-sized (≤768px)
 * @returns {boolean} True if viewport is mobile-sized
 */
export const useMobileViewport = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_MAX_WIDTH;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= MOBILE_MAX_WIDTH);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

export default useMobileViewport;
