import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  getCurrentSalesDay,
  startSalesDay,
  endSalesDay,
  getDriverPerformance,
  getDriverPerformanceByDay
} from '../../utils/salesService.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SalesDayControls = ({ currentSalesDay, onSalesDayChange }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [driverPerf, setDriverPerf] = useState(null);

  // Fetch driver performance when sales day is open
  useEffect(() => {
    const fetchPerformance = async () => {
      if (!currentSalesDay || !token) return;

      try {
        const perf = await getDriverPerformanceByDay(currentSalesDay.id, token);
        setDriverPerf(perf);
      } catch (error) {
        console.error('Error fetching driver performance:', error);
      }
    };

    fetchPerformance();
  }, [currentSalesDay, token]);

  const handleStart = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const newDay = await startSalesDay(token);
      toast.success('Sales day started', { position: 'top-right' });
      onSalesDayChange(newDay);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to start sales day';
      toast.error(message, { position: 'top-right' });
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!token) return;
    setLoading(true);

    try {
      const closedDay = await endSalesDay(token);
      toast.success('Sales day closed successfully', { position: 'top-right' });
      onSalesDayChange(null);
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to end sales day';
      toast.error(message, { position: 'top-right' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      padding: '2rem',
      borderRadius: '8px',
      marginBottom: '2rem'
    }}>
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#333' }}>
        Sales Day Management
      </h2>

      {/* Status Section */}
      {currentSalesDay ? (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            color: '#155724',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            <strong>✓ Sales Day OPEN</strong>
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              Started: {new Date(currentSalesDay.openedAt).toLocaleString()}
            </p>
          </div>

          {/* Live Stats */}
          {driverPerf && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{
                backgroundColor: '#fff',
                padding: '1rem',
                borderRadius: '4px',
                textAlign: 'center',
                border: 'none'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2D8659' }}>
                  {driverPerf.summary?.totalDeliveries ?? 0}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>Deliveries</div>
              </div>

              <div style={{
                backgroundColor: '#fff',
                padding: '1rem',
                borderRadius: '4px',
                textAlign: 'center',
                border: 'none'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2D8659' }}>
                  MWK {driverPerf.summary?.totalEarnings?.toFixed(2) ?? '0.00'}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>Revenue</div>
              </div>

              <div style={{
                backgroundColor: '#fff',
                padding: '1rem',
                borderRadius: '4px',
                textAlign: 'center',
                border: 'none'
              }}>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2D8659' }}>
                  {driverPerf.summary?.totalDriversActive ?? 0}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>Active Drivers</div>
              </div>
            </div>
          )}

          <button
            onClick={handleEnd}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Closing...' : 'Close Sales Day'}
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            color: '#721c24',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            <strong><i className="fas fa-exclamation-triangle" style={{marginRight: '0.5rem'}}></i>Sales Day CLOSED</strong>
            <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
              No orders can be placed until a new sales day is started
            </p>
          </div>

          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2D8659',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? 'Starting...' : 'Start New Sales Day'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SalesDayControls;
