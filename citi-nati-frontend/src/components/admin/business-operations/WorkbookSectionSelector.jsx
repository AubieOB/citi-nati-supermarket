import React, { useState, useMemo } from 'react';

const PAYROLL_SECTIONS = [
  { id: 'employees', label: 'Employees', icon: 'fa-id-badge' },
  { id: 'salaryStructures', label: 'Salary Structures', icon: 'fa-layer-group' },
  { id: 'payrollPeriods', label: 'Payroll Periods', icon: 'fa-calendar-week' },
  { id: 'payrollEntries', label: 'Payroll Entries', icon: 'fa-table' },
  { id: 'loans', label: 'Loans', icon: 'fa-money-bill' },
  { id: 'loanTransactions', label: 'Loan Transactions', icon: 'fa-arrow-right-arrow-left' },
  { id: 'terminations', label: 'Terminations', icon: 'fa-person-hiking' },
  { id: 'reengagements', label: 'Reengagements', icon: 'fa-person-circle-plus' },
];

const BUSINESS_SECTIONS = [
  { id: 'suppliers', label: 'Suppliers', icon: 'fa-truck' },
  { id: 'supplierTransactions', label: 'Supplier Transactions', icon: 'fa-receipt' },
  { id: 'expenseCategories', label: 'Expense Categories', icon: 'fa-sitemap' },
  { id: 'expenses', label: 'Expenses', icon: 'fa-file-invoice-dollar' },
];

const WorkbookSectionSelector = ({
  workbookType,
  selectedSections,
  onSelectionChange,
  summary = {},
  disabled = false,
}) => {
  const sectionList = workbookType === 'payroll' ? PAYROLL_SECTIONS : BUSINESS_SECTIONS;
  const [selectAll, setSelectAll] = useState(false);

  // Determine available sections based on what was parsed
  const availableSections = useMemo(() => {
    return sectionList.filter((section) => {
      const countKey = section.id.charAt(0).toUpperCase() + section.id.slice(1);
      return summary[countKey] > 0 || summary[section.id] > 0;
    });
  }, [sectionList, summary]);

  const handleSectionToggle = (sectionId) => {
    const updated = selectedSections.includes(sectionId)
      ? selectedSections.filter((id) => id !== sectionId)
      : [...selectedSections, sectionId];
    onSelectionChange(updated);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      onSelectionChange([]);
      setSelectAll(false);
    } else {
      onSelectionChange(availableSections.map((s) => s.id));
      setSelectAll(true);
    }
  };

  const getCountForSection = (sectionId) => {
    const key = sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
    return summary[key] || summary[sectionId] || 0;
  };

  if (availableSections.length === 0) {
    return (
      <div
        style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          padding: '1rem',
          color: '#b91c1c',
        }}
      >
        <i className="fas fa-exclamation-circle" style={{ marginRight: '0.5rem' }}></i>
        No recognized data sections were found in the workbook. Please verify the file format.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>Select Sections to Import</h3>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
          Choose which data sections to import. You can import all at once or select specific sections.
        </p>
      </div>

      {/* Select All / Clear All */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <button
          type="button"
          onClick={handleSelectAll}
          disabled={disabled}
          style={{
            border: selectAll ? 'none' : '1px solid #cbd5e1',
            backgroundColor: selectAll ? '#5B4B8A' : '#fff',
            color: selectAll ? '#fff' : '#0f172a',
            borderRadius: '8px',
            padding: '0.55rem 1rem',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <i className={`fas ${selectAll ? 'fa-check' : 'fa-square'}`} style={{ marginRight: '0.4rem' }}></i>
          {selectAll ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      {/* Section Checkboxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        {availableSections.map((section) => {
          const isSelected = selectedSections.includes(section.id);
          const count = getCountForSection(section.id);
          return (
            <label
              key={section.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem',
                border: isSelected ? '2px solid #5B4B8A' : '2px solid #e2e8f0',
                backgroundColor: isSelected ? '#f8f6ff' : '#fff',
                borderRadius: '12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleSectionToggle(section.id)}
                disabled={disabled}
                style={{
                  width: '18px',
                  height: '18px',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  accentColor: '#5B4B8A',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                  <i className={`fas ${section.icon}`} style={{ marginRight: '0.4rem', color: '#5B4B8A' }}></i>
                  {section.label}
                </div>
                {count > 0 && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                    {Number(count).toLocaleString()} records
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {selectedSections.length > 0 && (
        <div
          style={{
            backgroundColor: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: '10px',
            padding: '0.75rem 1rem',
            color: '#0c4a6e',
            fontSize: '0.88rem',
          }}
        >
          <i className="fas fa-info-circle" style={{ marginRight: '0.4rem' }}></i>
          {selectedSections.length} section{selectedSections.length !== 1 ? 's' : ''} selected for import
        </div>
      )}
    </div>
  );
};

export default WorkbookSectionSelector;
