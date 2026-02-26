import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  getSalesDayHistory,
  exportSalesDayCSV
} from '../../utils/salesService.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SalesHistoryTable = ({ refreshTrigger }) => {
  const { token } = useAuth();
  const [salesDays, setSalesDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!token) return;

      try {
        setLoading(true);
        const data = await getSalesDayHistory(token);
        setSalesDays(data || []);
      } catch (error) {
        console.error('Error fetching sales history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [token, refreshTrigger]);

  const handleExportCSV = async (salesDayId, date) => {
    if (!token) return;

    try {
      setExporting(salesDayId);
      const blob = await exportSalesDayCSV(salesDayId, token);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${new Date(date).toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('CSV exported successfully', { position: 'top-right' });
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV', { position: 'top-right' });
    } finally {
      setExporting(null);
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
        <p>Loading sales history...</p>
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
        Sales History
      </h2>

      {salesDays.length > 0 ? (
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
                }}>Date</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#333'
                }}>Total Orders</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'right',
                  fontWeight: '600',
                  color: '#333'
                }}>Revenue</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#333'
                }}>Duration</th>
                <th style={{
                  padding: '1rem',
                  textAlign: 'center',
                  fontWeight: '600',
                  color: '#333'
                }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {salesDays.map((day, idx) => {
                const opened = new Date(day.openedAt);
                const closed = new Date(day.closedAt);
                const duration = Math.round((closed - opened) / 1000 / 60); // minutes

                return (
                  <tr
                    key={day.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa'
                    }}
                  >
                    <td style={{
                      padding: '1rem',
                      color: '#333'
                    }}>
                      <strong>{opened.toLocaleDateString()}</strong>
                      <br />
                      <span style={{ fontSize: '0.85rem', color: '#666' }}>
                        {opened.toLocaleTimeString()} - {closed.toLocaleTimeString()}
                      </span>
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      color: '#333',
                      fontWeight: '600'
                    }}>
                      {day.totalOrders}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'right',
                      color: '#2D8659',
                      fontWeight: '600',
                      fontSize: '1.1rem'
                    }}>
                      MWK {day.totalSales?.toFixed(2) ?? '0.00'}
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center',
                      color: '#666',
                      fontSize: '0.85rem'
                    }}>
                      {duration}m
                    </td>
                    <td style={{
                      padding: '1rem',
                      textAlign: 'center'
                    }}>
                      <button
                        onClick={() => handleExportCSV(day.id, day.closedAt)}
                        disabled={exporting === day.id}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: exporting === day.id ? '#ccc' : '#2D8659',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: exporting === day.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        <i className="fas fa-download" style={{ marginRight: '0.3rem' }}></i>
                        {exporting === day.id ? 'Exporting...' : 'Export CSV'}
                      </button>
                    </td>
                  </tr>
                );
              })}
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
          No sales history available
        </div>
      )}
    </div>
  );
};

export default SalesHistoryTable;
