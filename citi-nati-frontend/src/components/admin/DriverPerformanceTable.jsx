import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { getDriverPerformance, clearDriverPerformance } from '../../utils/salesService.js';
import { useAuth } from '../../context/AuthContext.jsx';

const DriverPerformanceTable = ({ refreshTrigger }) => {
  const { token } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    const fetchPerformance = async () => {
      if (!token) return;

      try {
        setLoading(true);
        const data = await getDriverPerformance(token);
        setDrivers(data.drivers || []);
        setSummary(data.summary);
      } catch (error) {
        console.error('Error fetching driver performance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPerformance();
  }, [token, refreshTrigger]);

  const handleClearPerformance = async () => {
    if (!token) return;

    try {
      setClearing(true);
      await clearDriverPerformance(token);
      setDrivers([]);
      setSummary(null);
      setShowClearConfirm(false);
      toast.success('Driver performance cleared successfully', { position: 'top-right' });
    } catch (error) {
      console.error('Error clearing driver performance:', error);
      const message = error.response?.data?.message || 'Failed to clear driver performance';
      toast.error(message, { position: 'top-right' });
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '2rem',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <p>Loading driver performance...</p>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#f5f5f5',
      padding: '2rem',
      borderRadius: '8px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <h2 style={{ marginTop: 0, marginBottom: 0, color: '#333' }}>
          Driver Performance
        </h2>
        {drivers.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={clearing}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: clearing ? '#ccc' : '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: clearing ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => {
              if (!clearing) e.target.style.backgroundColor = '#c82333';
            }}
            onMouseOut={(e) => {
              if (!clearing) e.target.style.backgroundColor = '#dc3545';
            }}
          >
            <i className="fas fa-redo" style={{ marginRight: '0.5rem' }}></i>
            {clearing ? 'Clearing...' : 'Clear Performance'}
          </button>
        )}
      </div>

      {/* Summary Stats */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '1rem',
            borderRadius: '4px',
            textAlign: 'center',
            border: 'none'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2D8659' }}>
              {summary.totalDrivers ?? 0}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>Total Drivers</div>
          </div>

          <div style={{
            backgroundColor: '#fff',
            padding: '1rem',
            borderRadius: '4px',
            textAlign: 'center',
            border: 'none'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2D8659' }}>
              {summary.totalDeliveries ?? 0}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>Total Deliveries</div>
          </div>

          <div style={{
            backgroundColor: '#fff',
            padding: '1rem',
            borderRadius: '4px',
            textAlign: 'center',
            border: 'none'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2D8659' }}>
              MWK {summary.totalEarnings?.toFixed(2) ?? '0.00'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#666' }}>Total Revenue</div>
          </div>
        </div>
      )}

      {/* Driver Table */}
      {drivers.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#fff'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>Driver Name</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>Email</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'left',
                  fontWeight: '600',
                  color: '#333'
                }}>Phone</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#333'
                }}>Deliveries</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'right',
                  fontWeight: '600',
                  color: '#333'
                }}>Earnings</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver, idx) => (
                <tr
                  key={driver.id}
                  style={{
                    borderBottom: '1px solid #eee',
                    backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa'
                  }}
                >
                  <td style={{
                    padding: '1rem',
                    color: '#333'
                  }}>
                    <strong>{driver.name}</strong>
                  </td>
                  <td style={{
                    padding: '1rem',
                    color: '#666',
                    fontSize: '0.9rem'
                  }}>
                    {driver.email || 'N/A'}
                  </td>
                  <td style={{
                    padding: '1rem',
                    color: '#666',
                    fontSize: '0.9rem'
                  }}>
                    {driver.phone || 'N/A'}
                  </td>
                  <td style={{
                    padding: '1rem',
                    textAlign: 'center',
                    color: '#2D8659',
                    fontWeight: '600'
                  }}>
                    {driver.totalDeliveries}
                  </td>
                  <td style={{
                    padding: '1rem',
                    textAlign: 'right',
                    color: '#2D8659',
                    fontWeight: '600'
                  }}>
                    MWK {driver.totalEarnings?.toFixed(2) ?? '0.00'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#fff',
          padding: '2rem',
          textAlign: 'center',
          borderRadius: '4px',
          color: '#666'
        }}>
          No drivers found
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showClearConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '400px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            textAlign: 'center'
          }}>
            <i className="fas fa-exclamation-triangle" style={{
              fontSize: '2.5rem',
              color: '#dc3545',
              marginBottom: '1rem',
              display: 'block'
            }}></i>
            <h3 style={{ margin: '1rem 0', color: '#333' }}>
              Clear Driver Performance?
            </h3>
            <p style={{ margin: '1rem 0', color: '#666', fontSize: '0.9rem' }}>
              This will unassign {drivers.length} driver{drivers.length !== 1 ? 's' : ''} from current orders and reset their performance metrics.
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginTop: '1.5rem'
            }}>
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                style={{
                  padding: '0.75rem',
                  backgroundColor: '#f0f0f0',
                  color: '#333',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: clearing ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!clearing) e.target.style.backgroundColor = '#e0e0e0';
                }}
                onMouseOut={(e) => {
                  if (!clearing) e.target.style.backgroundColor = '#f0f0f0';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearPerformance}
                disabled={clearing}
                style={{
                  padding: '0.75rem',
                  backgroundColor: clearing ? '#ccc' : '#dc3545',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: clearing ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!clearing) e.target.style.backgroundColor = '#c82333';
                }}
                onMouseOut={(e) => {
                  if (!clearing) e.target.style.backgroundColor = '#dc3545';
                }}
              >
                {clearing ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverPerformanceTable;
