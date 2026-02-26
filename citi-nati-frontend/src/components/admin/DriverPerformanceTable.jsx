import React, { useState, useEffect } from 'react';
import { getDriverPerformance } from '../../utils/salesService.js';
import { useAuth } from '../../context/AuthContext.jsx';

const DriverPerformanceTable = ({ refreshTrigger }) => {
  const { token } = useAuth();
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

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
      <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#333' }}>
        Driver Performance
      </h2>

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
    </div>
  );
};

export default DriverPerformanceTable;
