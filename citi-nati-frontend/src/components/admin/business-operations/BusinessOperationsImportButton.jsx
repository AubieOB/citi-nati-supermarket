import React from 'react';

const BusinessOperationsImportButton = ({ onClick, disabled = false }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: 'none',
        backgroundColor: '#5B4B8A',
        color: '#fff',
        borderRadius: '10px',
        padding: '0.7rem 1.15rem',
        fontWeight: 700,
        fontSize: '0.9rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 12px rgba(91, 75, 138, 0.25)',
      }}
      title="Upload and import Excel workbooks with employee, payroll, supplier, and expense data"
    >
      <i className="fas fa-file-excel"></i>
      Import Workbook
    </button>
  );
};

export default BusinessOperationsImportButton;
