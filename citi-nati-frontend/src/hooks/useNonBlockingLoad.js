import { useState, useEffect } from 'react';

/**
 * useNonBlockingLoad Hook
 * 
 * Renders component immediately while loading data in background
 * Prevents "Loading..." spinners from blocking the UI
 * 
 * Usage:
 * const { data, loading, error } = useNonBlockingLoad(
 *   async () => {
 *     const response = await api.get('/endpoint');
 *     return response.data.items;
 *   }
 * );
 */
export const useNonBlockingLoad = (fetchFn, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetchFn();
        
        if (isMounted) {
          setData(result);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.error || err.message || 'Failed to load');
          setLoading(false);
        }
      }
    };

    // Start loading immediately in background
    load();

    // Cleanup on unmount
    return () => {
      isMounted = false;
    };
  }, dependencies);

  return { data, loading, error };
};

export default useNonBlockingLoad;
