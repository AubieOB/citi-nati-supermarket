import React, { useEffect, useState } from 'react';
import api from '../../../utils/api.js';

const InventoryActivityLedger = ({ selectedLocationId, selectedLocationCode }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [productCode, setProductCode] = useState('');
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        periodType: 'day',
        date: new Date().toISOString().split('T')[0],
        locationId: selectedLocationId,
        locationCode: selectedLocationCode,
        productCode: productCode || undefined,
      };

      const res = await api.get('/business-operations/inventory-activity/ledger', { params });

      setData(res.data.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load inventory activity');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLocationId) fetchData();
  }, [selectedLocationId]);

  const summary = data?.summary;
  const movements = data?.movements || [];

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Inventory Activity</h2>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <input
          placeholder="Enter Product Code"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          style={{
            padding: '0.6rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
          }}
        />

        <button
          onClick={fetchData}
          style={{
            padding: '0.6rem 1rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Load
        </button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Summary */}
      {summary && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Card label="Opening Stock" value={summary.openingBalance} />
          <Card label="Qty In" value={summary.totalQtyIn} />
          <Card label="Qty Out" value={summary.totalQtyOut} />
          <Card label="Closing Stock" value={summary.calculatedClosingBalance} />
          <Card label="Current Stock" value={summary.currentProductStock} />
          <Card label="Variance" value={summary.variance} />
        </div>
      )}

      {/* Table */}
      {movements.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Time</th>
                <th style={th}>Type</th>
                <th style={th}>Reference</th>
                <th style={th}>Cashier</th>
                <th style={th}>Qty In</th>
                <th style={th}>Qty Out</th>
                <th style={th}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m, i) => (
                <tr key={i}>
                  <td style={td}>{new Date(m.movementDate).toLocaleString()}</td>
                  <td style={td}>
                    <span
                      style={{
                        color: m.movementType === 'SALE' ? 'red' : 'green',
                        fontWeight: 'bold',
                      }}
                    >
                      {m.movementType}
                    </span>
                  </td>
                  <td style={td}>{m.referenceNo}</td>
                  <td style={td}>{m.cashierName}</td>
                  <td style={td}>{m.qtyIn}</td>
                  <td style={td}>{m.qtyOut}</td>
                  <td style={td}>{m.runningBalance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Card = ({ label, value }) => (
  <div
    style={{
      padding: '1rem',
      background: '#f9fafb',
      borderRadius: '10px',
      minWidth: '140px',
    }}
  >
    <div style={{ fontSize: '12px', color: '#6b7280' }}>{label}</div>
    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{value}</div>
  </div>
);

const th = {
  textAlign: 'left',
  padding: '8px',
  borderBottom: '1px solid #ddd',
};

const td = {
  padding: '8px',
  borderBottom: '1px solid #eee',
};

export default InventoryActivityLedger;