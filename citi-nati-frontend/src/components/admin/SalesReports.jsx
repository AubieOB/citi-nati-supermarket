import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  getSalesDayHistory,
  getDriverPerformance
} from '../../utils/salesService.js';
import {
  generateSummaryReportPDF,
  generateProductSalesReportPDF,
  generateDriverSalesReportPDF
} from '../../utils/pdfReports.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SalesReports = ({ refreshTrigger }) => {
  const { token } = useAuth();
  const [salesDays, setSalesDays] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  const [activeReport, setActiveReport] = useState('byProduct');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Function to filter sales days by date range
  const getFilteredSalesDays = () => {
    if (!fromDate && !toDate) return salesDays;

    return salesDays.filter(day => {
      const dayDate = new Date(day.closedAt);
      const from = fromDate ? new Date(fromDate) : new Date('1900-01-01');
      const to = toDate ? new Date(toDate) : new Date('2100-12-31');

      // Set time to end of day for 'to' date
      to.setHours(23, 59, 59, 999);

      return dayDate >= from && dayDate <= to;
    });
  };

  const filteredSalesDays = getFilteredSalesDays();

  // Calculate product sales from filtered sales days
  const getProductSales = () => {
    const productMap = {};
    
    filteredSalesDays.forEach(day => {
      if (day.orders && Array.isArray(day.orders)) {
        day.orders.forEach(order => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
              const productName = item.product?.name || item.productName || 'Unknown Product';
              if (!productMap[productName]) {
                productMap[productName] = {
                  name: productName,
                  quantity: 0,
                  totalRevenue: 0
                };
              }
              productMap[productName].quantity += item.quantity || 0;
              productMap[productName].totalRevenue += (item.price * item.quantity) || 0;
            });
          }
        });
      }
    });

    return Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  const productSales = getProductSales();

  // Calculate driver sales from filtered sales days
  const getDriverSales = () => {
    const driverMap = {};
    
    filteredSalesDays.forEach(day => {
      if (day.orders && Array.isArray(day.orders)) {
        day.orders.forEach(order => {
          if (order.driver) {
            const driverId = order.driver.id;
            const driverName = order.driver.name || 'Unknown Driver';
            const driverEmail = order.driver.email || order.driver.phone || 'N/A';
            
            if (!driverMap[driverId]) {
              driverMap[driverId] = {
                id: driverId,
                name: driverName,
                email: driverEmail,
                totalDeliveries: 0,
                totalEarnings: 0
              };
            }
            
            driverMap[driverId].totalDeliveries += 1;
            driverMap[driverId].totalEarnings += order.total || 0;
          }
        });
      }
    });

    return Object.values(driverMap).sort((a, b) => b.totalEarnings - a.totalEarnings);
  };

  const driverSales = getDriverSales();

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      try {
        setLoading(true);
        const [daysData, driversData] = await Promise.all([
          getSalesDayHistory(token),
          getDriverPerformance(token)
        ]);
        setSalesDays(daysData || []);
        setDrivers(driversData || []);
      } catch (error) {
        console.error('Error fetching reports data:', error);
        toast.error('Failed to load reports');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, refreshTrigger]);

  const handleExportDetailedReport = () => {
    if (filteredSalesDays.length === 0) {
      toast.error('No sales data available for selected dates', { position: 'top-right' });
      return;
    }

    try {
      setExporting('product-report');
      generateProductSalesReportPDF(productSales, filteredSalesDays, {
        fromDate: fromDate ? new Date(fromDate).toLocaleDateString() : 'All Time',
        toDate: toDate ? new Date(toDate).toLocaleDateString() : 'All Time'
      });
      toast.success('Product sales report downloaded', { position: 'top-right' });
    } catch (error) {
      console.error('Error generating product report:', error);
      toast.error('Failed to generate product report', { position: 'top-right' });
    } finally {
      setExporting(null);
    }
  };

  const handleExportSummaryReport = () => {
    if (filteredSalesDays.length === 0) {
      toast.error('No sales data available for selected dates', { position: 'top-right' });
      return;
    }

    try {
      setExporting('summary-all');
      generateSummaryReportPDF(filteredSalesDays, {
        fromDate: fromDate ? new Date(fromDate).toLocaleDateString() : 'All Time',
        toDate: toDate ? new Date(toDate).toLocaleDateString() : 'All Time'
      });
      toast.success('Summary report downloaded', { position: 'top-right' });
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error('Failed to generate summary report', { position: 'top-right' });
    } finally {
      setExporting(null);
    }
  };

  const handleExportDriverReport = () => {
    if (driverSales.length === 0) {
      toast.error('No driver data available for selected dates', { position: 'top-right' });
      return;
    }

    try {
      setExporting('driver-sales');
      generateDriverSalesReportPDF(driverSales, {
        fromDate: fromDate ? new Date(fromDate).toLocaleDateString() : 'All Time',
        toDate: toDate ? new Date(toDate).toLocaleDateString() : 'All Time'
      });
      toast.success('Driver sales report downloaded', { position: 'top-right' });
    } catch (error) {
      console.error('Error exporting driver report:', error);
      toast.error('Failed to export driver report', { position: 'top-right' });
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
        <p>Loading reports...</p>
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
        Reports & Downloads
      </h2>

      {/* Date Range Filter */}
      <div style={{
        backgroundColor: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '2rem',
        border: 'none'
      }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#333' }}>
          <i className="fas fa-calendar" style={{ marginRight: '0.5rem', color: '#2D8659' }}></i>
          Filter by Date Range
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          alignItems: 'flex-end'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>
              From Date
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', color: '#333', fontSize: '0.9rem' }}>
              To Date
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div>
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#f0f0f0',
                color: '#333',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem',
                width: '100%',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.target.style.backgroundColor = '#e0e0e0';
              }}
              onMouseOut={(e) => {
                e.target.style.backgroundColor = '#f0f0f0';
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: '0.5rem' }}></i>
              Reset
            </button>
          </div>
        </div>
        {(fromDate || toDate) && (
          <p style={{ margin: '1rem 0 0 0', fontSize: '0.85rem', color: '#2D8659', fontWeight: '600' }}>
            <i className="fas fa-check-circle" style={{ marginRight: '0.5rem' }}></i>
            Showing {filteredSalesDays.length} sales day{filteredSalesDays.length !== 1 ? 's' : ''} for selected period
          </p>
        )}
      </div>

      {/* Report Type Selector */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        {/* Sales by Product Card */}
        <div style={{
          backgroundColor: '#fff',
          padding: '1.5rem',
          borderRadius: '8px',
          border: activeReport === 'byProduct' ? '2px solid #2D8659' : '1px solid #ddd',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: activeReport === 'byProduct' ? '0 4px 12px rgba(45, 134, 89, 0.15)' : 'none'
        }}
        onClick={() => setActiveReport('byProduct')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            <i className="fas fa-box" style={{ color: '#2D8659' }}></i>
          </div>
          <h3 style={{ margin: '0.5rem 0', fontSize: '1rem', color: '#333' }}>
            Sales by Product
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            Products sold & revenue
          </p>
        </div>

        {/* Sales by Driver Card */}
        <div style={{
          backgroundColor: '#fff',
          padding: '1.5rem',
          borderRadius: '8px',
          border: activeReport === 'byDriver' ? '2px solid #5B4B8A' : '1px solid #ddd',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: activeReport === 'byDriver' ? '0 4px 12px rgba(91, 75, 138, 0.15)' : 'none'
        }}
        onClick={() => setActiveReport('byDriver')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            <i className="fas fa-users" style={{ color: '#5B4B8A' }}></i>
          </div>
          <h3 style={{ margin: '0.5rem 0', fontSize: '1rem', color: '#333' }}>
            Sales by Driver
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            Driver performance & earnings
          </p>
        </div>

        {/* Total Sales Card */}
        <div style={{
          backgroundColor: '#fff',
          padding: '1.5rem',
          borderRadius: '8px',
          border: activeReport === 'totalSales' ? '2px solid #FF6B6B' : '1px solid #ddd',
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: activeReport === 'totalSales' ? '0 4px 12px rgba(255, 107, 107, 0.15)' : 'none'
        }}
        onClick={() => setActiveReport('totalSales')}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            <i className="fas fa-chart-line" style={{ color: '#FF6B6B' }}></i>
          </div>
          <h3 style={{ margin: '0.5rem 0', fontSize: '1rem', color: '#333' }}>
            Total Sales
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
            Overall summary & metrics
          </p>
        </div>
      </div>

      {/* Report Content */}
      {activeReport === 'totalSales' && (
        <div style={{
          backgroundColor: '#fff',
          padding: '2rem',
          borderRadius: '8px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: 0, color: '#333' }}>
              Total Sales Summary
              {filteredSalesDays.length > 0 && (
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1rem' }}>
                  ({filteredSalesDays.length} days)
                </span>
              )}
            </h3>
            <button
              onClick={handleExportSummaryReport}
              disabled={exporting === 'summary-all' || filteredSalesDays.length === 0}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: exporting === 'summary-all' ? '#ccc' : '#FF6B6B',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: exporting === 'summary-all' || filteredSalesDays.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem'
              }}
            >
              <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>
              {exporting === 'summary-all' ? 'Generating...' : 'Download PDF'}
            </button>
          </div>

          {filteredSalesDays.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>
                      Date
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>
                      Orders
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#333' }}>
                      Revenue
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>
                      Duration
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalesDays.map((day, idx) => {
                    const opened = new Date(day.openedAt);
                    const closed = new Date(day.closedAt);
                    const duration = Math.round((closed - opened) / 1000 / 60);

                    return (
                      <tr
                        key={day.id}
                        style={{
                          borderBottom: '1px solid #eee',
                          backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa'
                        }}
                      >
                        <td style={{ padding: '1rem', color: '#333' }}>
                          {opened.toLocaleDateString()}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#333', fontWeight: '600' }}>
                          {day.totalOrders || 0}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659', fontWeight: '600' }}>
                          MWK {(day.totalSales || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                          {duration}m
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ backgroundColor: '#f0f9f6', fontWeight: '700', borderTop: '2px solid #ddd' }}>
                    <td style={{ padding: '1rem', color: '#333' }}>TOTAL</td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#333' }}>
                      {filteredSalesDays.reduce((sum, day) => sum + (day.totalOrders || 0), 0)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659' }}>
                      MWK {filteredSalesDays.reduce((sum, day) => sum + (day.totalSales || 0), 0).toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '2rem',
              textAlign: 'center',
              borderRadius: '4px',
              color: '#666'
            }}>
              No closed sales days available. Start and close a sales day to generate reports.
            </div>
          )}
        </div>
      )}

      {activeReport === 'byProduct' && (
        <div style={{
          backgroundColor: '#fff',
          padding: '2rem',
          borderRadius: '8px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: 0, color: '#333' }}>
              Sales by Product
              {productSales.length > 0 && (
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1rem' }}>
                  ({productSales.length} products)
                </span>
              )}
            </h3>
            <button
              onClick={handleExportDetailedReport}
              disabled={exporting === 'product-report' || productSales.length === 0}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: exporting === 'product-report' ? '#ccc' : '#2D8659',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: exporting === 'product-report' || productSales.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem'
              }}
            >
              <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>
              {exporting === 'product-report' ? 'Generating...' : 'Download PDF'}
            </button>
          </div>

          {productSales.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>
                      Product
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>
                      Quantity Sold
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#333' }}>
                      Total Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productSales.map((product, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #eee',
                        backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa'
                      }}
                    >
                      <td style={{ padding: '1rem', color: '#333', fontWeight: '500' }}>
                        {product.name}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#333', fontWeight: '600' }}>
                        {product.quantity}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659', fontWeight: '600' }}>
                        MWK {product.totalRevenue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#f0f9f6', fontWeight: '700', borderTop: '2px solid #ddd' }}>
                    <td style={{ padding: '1rem', color: '#333' }}>TOTAL</td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#333' }}>
                      {productSales.reduce((sum, p) => sum + p.quantity, 0)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659' }}>
                      MWK {productSales.reduce((sum, p) => sum + p.totalRevenue, 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '2rem',
              textAlign: 'center',
              borderRadius: '4px',
              color: '#666'
            }}>
              No product sales data available for the selected period.
            </div>
          )}
        </div>
      )}

      {activeReport === 'byDriver' && (
        <div style={{
          backgroundColor: '#fff',
          padding: '2rem',
          borderRadius: '8px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ margin: 0, color: '#333' }}>
              Sales by Driver
              {driverSales.length > 0 && (
                <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1rem' }}>
                  ({driverSales.length} drivers)
                </span>
              )}
            </h3>
            <button
              onClick={handleExportDriverReport}
              disabled={exporting === 'driver-sales' || driverSales.length === 0}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: exporting === 'driver-sales' ? '#ccc' : '#5B4B8A',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: exporting === 'driver-sales' || driverSales.length === 0 ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '0.9rem'
              }}
            >
              <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>
              {exporting === 'driver-sales' ? 'Generating...' : 'Download PDF'}
            </button>
          </div>

          {driverSales.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>
                      Driver
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>
                      Email
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>
                      Deliveries
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#333' }}>
                      Total Earnings
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {driverSales.map((driver, idx) => (
                    <tr
                      key={driver.id}
                      style={{
                        borderBottom: '1px solid #eee',
                        backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa'
                      }}
                    >
                      <td style={{ padding: '1rem', color: '#333', fontWeight: '500' }}>
                        {driver.name || 'N/A'}
                      </td>
                      <td style={{ padding: '1rem', color: '#666', fontSize: '0.9rem' }}>
                        {driver.email || 'N/A'}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#333', fontWeight: '600' }}>
                        {driver.totalDeliveries || 0}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#5B4B8A', fontWeight: '600' }}>
                        MWK {(driver.totalEarnings || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ backgroundColor: '#f4f0f7', fontWeight: '700', borderTop: '2px solid #ddd' }}>
                    <td colSpan="2" style={{ padding: '1rem', color: '#333' }}>TOTAL</td>
                    <td style={{ padding: '1rem', textAlign: 'center', color: '#333' }}>
                      {driverSales.reduce((sum, d) => sum + (d.totalDeliveries || 0), 0)}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right', color: '#5B4B8A' }}>
                      MWK {driverSales.reduce((sum, d) => sum + (d.totalEarnings || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#f5f5f5',
              padding: '2rem',
              textAlign: 'center',
              borderRadius: '4px',
              color: '#666'
            }}>
              No driver data available for the selected period.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SalesReports;
