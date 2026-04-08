import React, { useState } from 'react';
import ExpensesEmptyState from './ExpensesEmptyState.jsx';
import { boConfirm } from '../../../utils/boDialogBus.js';

const thStyle = {
  textAlign: 'left',
  padding: '0.85rem 0.9rem',
  color: '#475569',
  fontSize: '0.76rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const tdStyle = {
  padding: '0.88rem 0.9rem',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  verticalAlign: 'top',
};

const statusBadge = (isActive) => ({
  display: 'inline-flex',
  borderRadius: '999px',
  padding: '0.3rem 0.65rem',
  fontSize: '0.76rem',
  fontWeight: 800,
  backgroundColor: isActive ? '#dcfce7' : '#f1f5f9',
  color: isActive ? '#166534' : '#475569',
});

const ExpenseCategoriesPanel = ({ categories, loading, error, onAddCategory, onEditCategory, onDeleteCategory }) => {
  const [statusFilter, setStatusFilter] = useState('');

  const filteredCategories = categories.filter((cat) => {
    if (statusFilter === 'active') return cat.isActive;
    if (statusFilter === 'inactive') return !cat.isActive;
    return true;
  });

  return (
    <div>
      <div style={{ padding: '1rem 1.05rem', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#0f172a' }}>Expense Categories</strong>
          <p style={{ margin: '0.3rem 0 0', color: '#64748b', fontSize: '0.87rem' }}>
            Manage categories used to organize expense entries.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.55rem 0.9rem', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.88rem', backgroundColor: '#fff' }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            type="button"
            onClick={onAddCategory}
            style={{ border: 'none', backgroundColor: '#5B4B8A', color: '#fff', borderRadius: '10px', padding: '0.6rem 0.95rem', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
          >
            <i className="fas fa-plus" style={{ marginRight: '0.4rem' }} />
            Add Category
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ padding: '1rem', color: '#b91c1c', fontSize: '0.9rem' }}>{error}</div>
      ) : loading ? (
        <ExpensesEmptyState title="Loading categories" message="Fetching expense categories." icon="fa-spinner fa-spin" />
      ) : !filteredCategories.length ? (
        <ExpensesEmptyState
          title="No categories found"
          message="Add the first expense category to get started."
          icon="fa-tags"
          actionLabel="Add Category"
          onAction={onAddCategory}
        />
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: '520px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((cat) => (
                <tr key={cat.id}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.84rem', color: '#5B4B8A', fontWeight: 700 }}>
                    {cat.code}
                  </td>
                  <td style={tdStyle}>
                    <strong>{cat.name}</strong>
                  </td>
                  <td style={{ ...tdStyle, color: '#64748b', fontSize: '0.87rem', maxWidth: '160px' }}>
                    {cat.description || '—'}
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadge(cat.isActive)}>{cat.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => onEditCategory(cat)}
                        style={{
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#fff',
                          color: '#475569',
                          borderRadius: '8px',
                          padding: '0.38rem 0.7rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = await boConfirm({
                            title: 'Delete Expense Category',
                            message: `Delete category "${cat.name}"? This cannot be undone.`,
                            confirmText: 'Delete',
                            cancelText: 'Cancel',
                          });
                          if (confirmed) {
                            onDeleteCategory(cat);
                          }
                        }}
                        style={{
                          border: '1px solid #fca5a5',
                          backgroundColor: '#fff',
                          color: '#b91c1c',
                          borderRadius: '8px',
                          padding: '0.38rem 0.7rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpenseCategoriesPanel;
