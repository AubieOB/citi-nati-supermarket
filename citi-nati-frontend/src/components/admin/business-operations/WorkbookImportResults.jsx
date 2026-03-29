import React from 'react';
import { ImportWarningsList, ImportErrorsList } from './ImportWarningsList.jsx';

const WorkbookImportResults = ({ importResult, workbookType, onClose }) => {
  if (!importResult) return null;

  const { success, data, errors, warnings, message } = importResult;

  // Group results by entity type
  const resultsByEntity = data || {};

  const renderEntityResult = (entityName, entityData) => {
    if (!entityData || typeof entityData !== 'object') return null;

    const { parsed = 0, inserted = 0, updated = 0, skipped = 0, warnings: entityWarnings = [], errors: entityErrors = [] } = entityData;
    const total = inserted + updated + skipped;

    return (
      <div
        key={entityName}
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '1rem',
        }}
      >
        <div style={{ marginBottom: '0.85rem' }}>
          <h4 style={{ margin: 0, color: '#0f172a', fontSize: '0.95rem' }}>{entityName}</h4>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <div style={{ backgroundColor: '#f0fdf4', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ color: '#65a30d', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Parsed</div>
            <div style={{ marginTop: '0.3rem', fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>
              {parsed}
            </div>
          </div>
          <div style={{ backgroundColor: '#dbeafe', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ color: '#0c4a6e', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Inserted</div>
            <div style={{ marginTop: '0.3rem', fontSize: '1.25rem', fontWeight: 800, color: '#0284c7' }}>
              {inserted}
            </div>
          </div>
          <div style={{ backgroundColor: '#fef3c7', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ color: '#92400e', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Updated</div>
            <div style={{ marginTop: '0.3rem', fontSize: '1.25rem', fontWeight: 800, color: '#ca8a04' }}>
              {updated}
            </div>
          </div>
          <div style={{ backgroundColor: '#f3f4f6', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Skipped</div>
            <div style={{ marginTop: '0.3rem', fontSize: '1.25rem', fontWeight: 800, color: '#6b7280' }}>
              {skipped}
            </div>
          </div>
        </div>

        {(entityWarnings.length > 0 || entityErrors.length > 0) && (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {entityWarnings.length > 0 && <ImportWarningsList warnings={entityWarnings} title={`${entityName} Warnings`} />}
            {entityErrors.length > 0 && <ImportErrorsList errors={entityErrors} title={`${entityName} Errors`} />}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>Import Complete</h3>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
          {message || 'Review the details of your import below.'}
        </p>
      </div>

      {/* Success/Status Banner */}
      <div
        style={{
          backgroundColor: success ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${success ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: '12px',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <i
          className={`fas ${success ? 'fa-check-circle' : 'fa-exclamation-circle'}`}
          style={{ fontSize: '1.25rem', color: success ? '#16a34a' : '#b91c1c' }}
        ></i>
        <div>
          <div style={{ fontWeight: 700, color: success ? '#16a34a' : '#b91c1c', fontSize: '0.95rem' }}>
            {success ? 'Import Successful' : 'Import Completed with Warnings'}
          </div>
          <p style={{ margin: '0.25rem 0 0', color: success ? '#166534' : '#7f1d1d', fontSize: '0.88rem' }}>
            {success
              ? 'Your data has been imported successfully.'
              : 'Some records were imported, but there were issues. Review the details below.'}
          </p>
        </div>
      </div>

      {/* Global Warnings and Errors */}
      {warnings && warnings.length > 0 && <ImportWarningsList warnings={warnings} />}
      {errors && errors.length > 0 && <ImportErrorsList errors={errors} />}

      {/* Entity Results */}
      {Object.keys(resultsByEntity).length > 0 && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>Import Results by Section</h4>
          {Object.entries(resultsByEntity).map(([entityName, entityData]) => renderEntityResult(entityName, entityData))}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            backgroundColor: '#5B4B8A',
            color: '#fff',
            borderRadius: '8px',
            padding: '0.65rem 1.25rem',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          <i className="fas fa-upload" style={{ marginRight: '0.4rem' }}></i>
          Import Another Workbook
        </button>
        <button
          type="button"
          onClick={() => {
            /* Could navigate to relevant tabs like /admin/business-operations?tab=suppliers */
          }}
          style={{
            border: '1px solid #cbd5e1',
            backgroundColor: '#fff',
            color: '#0f172a',
            borderRadius: '8px',
            padding: '0.65rem 1.25rem',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
          }}
        >
          <i className="fas fa-eye" style={{ marginRight: '0.4rem' }}></i>
          View Imported Data
        </button>
      </div>
    </div>
  );
};

export default WorkbookImportResults;
