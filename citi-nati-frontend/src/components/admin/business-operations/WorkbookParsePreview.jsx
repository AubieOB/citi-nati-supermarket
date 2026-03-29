import React from 'react';
import { ImportWarningsList, ImportErrorsList } from './ImportWarningsList.jsx';

const WorkbookParsePreview = ({ parseResult, loading = false, error = '' }) => {
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: '1.5rem', marginBottom: '0.75rem', display: 'block' }}></i>
        Analyzing workbook structure...
      </div>
    );
  }

  if (error) {
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
        <i className="fas fa-circle-exclamation" style={{ marginRight: '0.5rem' }}></i>
        {error}
      </div>
    );
  }

  if (!parseResult) return null;

  const { summary, detectedSheets, lowConfidenceSheets, warnings, errors, confidence } = parseResult;

  const confidenceTone = confidence?.level === 'high'
    ? { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' }
    : confidence?.level === 'medium'
      ? { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' }
      : { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>Parse Preview</h3>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
          Review what will be imported from the workbook.
        </p>
      </div>

      {confidence && (
        <div
          style={{
            backgroundColor: confidenceTone.bg,
            border: `1px solid ${confidenceTone.border}`,
            borderRadius: '12px',
            padding: '0.9rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ color: confidenceTone.text }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Parse Confidence
            </div>
            <div style={{ marginTop: '0.2rem', fontWeight: 700, fontSize: '0.92rem' }}>
              {confidence.summary}
            </div>
          </div>
          <div style={{ color: confidenceTone.text, fontWeight: 800, fontSize: '1.05rem' }}>
            Score: {confidence.score}/100 ({confidence.level})
          </div>
        </div>
      )}

      {/* Summary */}
      {summary && Object.keys(summary).length > 0 && (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem',
          }}
        >
          <h4 style={{ margin: 0, color: '#0f172a', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            Detected Entities
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {Object.entries(summary).map(([key, count]) => (
              <div
                key={key}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '0.75rem',
                  textAlign: 'center',
                }}
              >
                <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div style={{ marginTop: '0.3rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                  {Number(count).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detected Sheets */}
      {detectedSheets && detectedSheets.length > 0 && (
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem',
          }}
        >
          <h4 style={{ margin: 0, color: '#0f172a', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            Detected Sheets
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            {detectedSheets.map((sheet, idx) => (
              <span
                key={idx}
                style={{
                  backgroundColor: '#dbeafe',
                  color: '#0c4a6e',
                  borderRadius: '20px',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                <i className="fas fa-check-circle" style={{ marginRight: '0.35rem' }}></i>
                {sheet}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Low Confidence Sheets */}
      {lowConfidenceSheets && lowConfidenceSheets.length > 0 && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: '12px',
            padding: '1rem',
          }}
        >
          <h4 style={{ margin: 0, color: '#92400e', fontSize: '0.95rem', marginBottom: '0.75rem' }}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.4rem' }}></i>
            Sheet Variants Detected
          </h4>
          <p style={{ margin: '0.5rem 0 0', color: '#92400e', fontSize: '0.88rem', lineHeight: 1.5 }}>
            The following sheets were found but are not directly imported in this phase. They will be processed if standard sheet names are recognized.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.75rem' }}>
            {lowConfidenceSheets.map((sheet, idx) => (
              <span
                key={idx}
                style={{
                  backgroundColor: '#fef3c7',
                  color: '#78350f',
                  borderRadius: '20px',
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                <i className="fas fa-question-circle" style={{ marginRight: '0.35rem' }}></i>
                {sheet}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      <ImportWarningsList warnings={warnings} title="Import Warnings" />

      {/* Errors */}
      <ImportErrorsList errors={errors} title="Parse Errors" />
    </div>
  );
};

export default WorkbookParsePreview;
