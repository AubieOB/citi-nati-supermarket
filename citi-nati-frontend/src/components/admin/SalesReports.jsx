import React, { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getSalesDayHistory } from '../../utils/salesService.js';
import {
  generateSummaryReportPDF,
  generateProductSalesReportPDF,
  generateDriverSalesReportPDF,
} from '../../utils/pdfReports.js';
import { useAuth } from '../../context/AuthContext.jsx';

const SalesReports = ({ refreshTrigger }) => {
  const { token } = useAuth();

  const [salesDays, setSalesDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);
  const [activeReport, setActiveReport] = useState('byProduct');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);

  const [filterBarLayout, setFilterBarLayout] = useState({ left: 0, width: 0, top: 0 });
  const [filterBarHeight, setFilterBarHeight] = useState(0);
  const filterBarRef = useRef(null);

  useEffect(() => {
    let resizeObserver;

    const updateFilterBarLayout = () => {
      const contentArea = document.querySelector('.admin-content-area');
      if (!contentArea) return;

      const rect = contentArea.getBoundingClientRect();
      const mobileTopOffset = 56;

      setFilterBarLayout({
        left: rect.left,
        width: rect.width,
        top: window.innerWidth <= 768 ? mobileTopOffset : 0,
      });

      if (filterBarRef.current) {
        setFilterBarHeight(filterBarRef.current.offsetHeight);
      }
    };

    updateFilterBarLayout();
    window.addEventListener('resize', updateFilterBarLayout);

    const contentArea = document.querySelector('.admin-content-area');
    if (contentArea && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateFilterBarLayout);
      resizeObserver.observe(contentArea);
    }

    return () => {
      window.removeEventListener('resize', updateFilterBarLayout);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;

      try {
        setLoading(true);
        const daysData = await getSalesDayHistory(token);
        setSalesDays(daysData || []);
      } catch (error) {
        console.error('Error fetching reports data:', error);
        toast.error('Failed to load reports');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, refreshTrigger]);

  const filteredSalesDays = useMemo(() => {
    if (!fromDate && !toDate) return salesDays;

    return salesDays.filter((day) => {
      const dayDate = new Date(day.closedAt);
      const from = fromDate ? new Date(fromDate) : new Date('1900-01-01');
      const to = toDate ? new Date(toDate) : new Date('2100-12-31');
      to.setHours(23, 59, 59, 999);
      return dayDate >= from && dayDate <= to;
    });
  }, [salesDays, fromDate, toDate]);

  const productSales = useMemo(() => {
    const productMap = {};

    filteredSalesDays.forEach((day) => {
      if (!Array.isArray(day.orders)) return;

      day.orders.forEach((order) => {
        if (!Array.isArray(order.items)) return;

        order.items.forEach((item) => {
          const productName = item.product?.name || item.productName || 'Unknown Product';
          if (!productMap[productName]) {
            productMap[productName] = {
              name: productName,
              quantity: 0,
              totalRevenue: 0,
            };
          }
          productMap[productName].quantity += item.quantity || 0;
          productMap[productName].totalRevenue += (item.price * item.quantity) || 0;
        });
      });
    });

    return Object.values(productMap).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredSalesDays]);

  const driverSales = useMemo(() => {
    const driverMap = {};

    filteredSalesDays.forEach((day) => {
      if (!Array.isArray(day.orders)) return;

      day.orders.forEach((order) => {
        if (!order.driver) return;

        const driverId = order.driver.id;
        const driverName = order.driver.name || 'Unknown Driver';
        const driverEmail = order.driver.email || order.driver.phone || 'N/A';

        if (!driverMap[driverId]) {
          driverMap[driverId] = {
            id: driverId,
            name: driverName,
            email: driverEmail,
            totalDeliveries: 0,
            totalEarnings: 0,
          };
        }

        driverMap[driverId].totalDeliveries += 1;
        driverMap[driverId].totalEarnings += order.total || 0;
      });
    });

    return Object.values(driverMap).sort((a, b) => b.totalEarnings - a.totalEarnings);
  }, [filteredSalesDays]);

  const filteredProductOptions = useMemo(() => {
    const query = productSearchTerm.trim().toLowerCase();
    if (!query) {
      return productSales;
    }

    return productSales.filter((product) =>
      String(product.name || '').toLowerCase().includes(query)
    );
  }, [productSales, productSearchTerm]);

  const visibleProductSales = useMemo(() => {
    if (selectedProducts.length === 0) {
      return productSales;
    }

    const selectedSet = new Set(selectedProducts);
    return productSales.filter((product) => selectedSet.has(product.name));
  }, [productSales, selectedProducts]);

  useEffect(() => {
    const availableNames = new Set(productSales.map((product) => product.name));
    setSelectedProducts((previous) => previous.filter((name) => availableNames.has(name)));
  }, [productSales]);

  const handleExportDetailedReport = () => {
    if (filteredSalesDays.length === 0) {
      toast.error('No sales data available for selected dates', { position: 'top-right' });
      return;
    }

    if (visibleProductSales.length === 0) {
      toast.error('No product sales match your selected product filters', { position: 'top-right' });
      return;
    }

    try {
      setExporting('product-report');
      generateProductSalesReportPDF(visibleProductSales, filteredSalesDays, {
        fromDate: fromDate ? new Date(fromDate).toLocaleDateString() : 'All Time',
        toDate: toDate ? new Date(toDate).toLocaleDateString() : 'All Time',
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
        toDate: toDate ? new Date(toDate).toLocaleDateString() : 'All Time',
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
        toDate: toDate ? new Date(toDate).toLocaleDateString() : 'All Time',
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
      <div style={{ backgroundColor: '#f5f5f5', padding: '2rem', borderRadius: '8px', textAlign: 'center' }}>
        <p>Loading reports...</p>
      </div>
    );
  }

  const reportsFilterSpacerHeight = Math.max(Math.min(filterBarHeight, 110) - 8, 0);

  return (
    <div style={{ position: 'relative' }}>
      <h2 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#1f2937' }}>Reports & Downloads</h2>
      <p style={{ marginTop: 0, marginBottom: '1rem', color: '#6b7280', fontSize: '0.92rem' }}>
        Generate polished sales reports with date filtering and export options.
      </p>

      <div
        ref={filterBarRef}
        style={{
          position: 'fixed',
          top: `${filterBarLayout.top}px`,
          left: `${filterBarLayout.left}px`,
          width: `${filterBarLayout.width}px`,
          zIndex: 81,
          backgroundColor: '#fff',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.88rem', color: '#4b5563', fontWeight: '700', minWidth: '110px' }}>
            <i className="fas fa-sliders-h" style={{ marginRight: '0.45rem' }}></i>
            Report Filters
          </div>

          <select
            value={activeReport}
            onChange={(e) => setActiveReport(e.target.value)}
            style={{
              padding: '0.7rem 0.8rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.92rem',
              minWidth: '220px',
              backgroundColor: '#fff',
              color: '#374151',
            }}
          >
            <option value="byProduct">Sales by Product</option>
            <option value="byDriver">Sales by Driver</option>
            <option value="totalSales">Total Sales Summary</option>
          </select>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#4b5563' }}>From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                padding: '0.65rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.88rem',
                boxSizing: 'border-box',
              }}
            />
            <label style={{ fontSize: '0.82rem', fontWeight: '700', color: '#4b5563' }}>To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                padding: '0.65rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.88rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            style={{
              padding: '0.65rem 0.95rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.82rem',
            }}
          >
            <i className="fas fa-redo" style={{ marginRight: '0.4rem' }}></i>
            Reset
          </button>

          <div style={{ marginLeft: 'auto', fontSize: '0.84rem', color: '#2D8659', fontWeight: '700' }}>
            {filteredSalesDays.length} sales day{filteredSalesDays.length === 1 ? '' : 's'} in range
          </div>
        </div>
      </div>

      <div style={{ height: `${reportsFilterSpacerHeight}px` }}></div>

      <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '1.25rem' }}>
        {activeReport === 'totalSales' && (
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
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
                  fontSize: '0.9rem',
                }}
              >
                <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>
                {exporting === 'summary-all' ? 'Generating...' : 'Download PDF'}
              </button>
            </div>

            {filteredSalesDays.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>Date</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>Orders</th>
                      <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#333' }}>Revenue</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalesDays.map((day, idx) => {
                      const opened = new Date(day.openedAt);
                      const closed = new Date(day.closedAt);
                      const duration = Math.round((closed - opened) / 1000 / 60);

                      return (
                        <tr key={day.id} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '1rem', color: '#333' }}>{opened.toLocaleDateString()}</td>
                          <td style={{ padding: '1rem', textAlign: 'center', color: '#333', fontWeight: '600' }}>{day.totalOrders || 0}</td>
                          <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659', fontWeight: '600' }}>
                            MWK {(day.totalSales || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '1rem', textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>{duration}m</td>
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
              <div style={{ backgroundColor: '#f5f5f5', padding: '2rem', textAlign: 'center', borderRadius: '4px', color: '#666' }}>
                No closed sales days available. Start and close a sales day to generate reports.
              </div>
            )}
          </div>
        )}

        {activeReport === 'byProduct' && (
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, color: '#333' }}>
                Sales by Product
                {visibleProductSales.length > 0 && (
                  <span style={{ fontSize: '0.85rem', color: '#666', marginLeft: '1rem' }}>
                    ({visibleProductSales.length} product{visibleProductSales.length === 1 ? '' : 's'})
                  </span>
                )}
              </h3>
              <button
                onClick={handleExportDetailedReport}
                disabled={exporting === 'product-report' || visibleProductSales.length === 0}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: exporting === 'product-report' ? '#ccc' : '#2D8659',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: exporting === 'product-report' || visibleProductSales.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                }}
              >
                <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>
                {exporting === 'product-report' ? 'Generating...' : 'Download PDF'}
              </button>
            </div>

            <div style={{
              marginBottom: '1.25rem',
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              backgroundColor: '#f9fafb',
            }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: '700', color: '#374151', fontSize: '0.9rem' }}>
                  Product Filter
                </div>
                <input
                  type="text"
                  placeholder="Search product name..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '220px',
                    padding: '0.6rem 0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSelectedProducts([])}
                  style={{
                    padding: '0.6rem 0.85rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: '#fff',
                    color: '#374151',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                  }}
                >
                  Clear Selected
                </button>
              </div>

              <div style={{
                maxHeight: '180px',
                overflowY: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '0.35rem',
              }}>
                {filteredProductOptions.length === 0 ? (
                  <div style={{ padding: '0.6rem', color: '#6b7280', fontSize: '0.85rem' }}>
                    No products match your search.
                  </div>
                ) : (
                  filteredProductOptions.map((product) => {
                    const isChecked = selectedProducts.includes(product.name);

                    return (
                      <label
                        key={product.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          padding: '0.45rem 0.55rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          backgroundColor: isChecked ? '#eef2ff' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProducts((previous) => [...previous, product.name]);
                            } else {
                              setSelectedProducts((previous) => previous.filter((name) => name !== product.name));
                            }
                          }}
                        />
                        <span style={{ fontSize: '0.86rem', color: '#111827', flex: 1 }}>
                          {product.name}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '600' }}>
                          Qty {product.quantity}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div style={{ marginTop: '0.6rem', fontSize: '0.82rem', color: '#4b5563' }}>
                {selectedProducts.length > 0
                  ? `${selectedProducts.length} product${selectedProducts.length === 1 ? '' : 's'} selected`
                  : 'No products selected (showing all products)'}
              </div>
            </div>

            {visibleProductSales.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>Product</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>Quantity Sold</th>
                      <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#333' }}>Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProductSales.map((product, idx) => (
                      <tr key={`${product.name}-${idx}`} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '1rem', color: '#333', fontWeight: '500' }}>{product.name}</td>
                        <td style={{ padding: '1rem', textAlign: 'center', color: '#333', fontWeight: '600' }}>{product.quantity}</td>
                        <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659', fontWeight: '600' }}>
                          MWK {product.totalRevenue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ backgroundColor: '#f0f9f6', fontWeight: '700', borderTop: '2px solid #ddd' }}>
                      <td style={{ padding: '1rem', color: '#333' }}>TOTAL</td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#333' }}>
                        {visibleProductSales.reduce((sum, p) => sum + p.quantity, 0)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right', color: '#2D8659' }}>
                        MWK {visibleProductSales.reduce((sum, p) => sum + p.totalRevenue, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ backgroundColor: '#f5f5f5', padding: '2rem', textAlign: 'center', borderRadius: '4px', color: '#666' }}>
                No product sales data available for the selected period and product filter.
              </div>
            )}
          </div>
        )}

        {activeReport === 'byDriver' && (
          <div style={{ backgroundColor: '#fff', padding: '2rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
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
                  fontSize: '0.9rem',
                }}
              >
                <i className="fas fa-download" style={{ marginRight: '0.5rem' }}></i>
                {exporting === 'driver-sales' ? 'Generating...' : 'Download PDF'}
              </button>
            </div>

            {driverSales.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>Driver</th>
                      <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', color: '#333' }}>Email</th>
                      <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', color: '#333' }}>Deliveries</th>
                      <th style={{ padding: '1rem', textAlign: 'right', fontWeight: '600', color: '#333' }}>Total Earnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverSales.map((driver, idx) => (
                      <tr key={driver.id} style={{ borderBottom: '1px solid #eee', backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '1rem', color: '#333', fontWeight: '500' }}>{driver.name || 'N/A'}</td>
                        <td style={{ padding: '1rem', color: '#666', fontSize: '0.9rem' }}>{driver.email || 'N/A'}</td>
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
              <div style={{ backgroundColor: '#f5f5f5', padding: '2rem', textAlign: 'center', borderRadius: '4px', color: '#666' }}>
                No driver data available for the selected period.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesReports;
