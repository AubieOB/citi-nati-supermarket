import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api.js';
import WorkbookTypeSelector from './WorkbookTypeSelector.jsx';
import WorkbookFileUploader from './WorkbookFileUploader.jsx';
import WorkbookParsePreview from './WorkbookParsePreview.jsx';
import WorkbookSectionSelector from './WorkbookSectionSelector.jsx';
import WorkbookImportResults from './WorkbookImportResults.jsx';

const STEPS = {
  SELECT_TYPE: 'select-type',
  UPLOAD_FILE: 'upload-file',
  PARSE_PREVIEW: 'parse-preview',
  SELECT_SECTIONS: 'select-sections',
  IMPORT: 'import',
  RESULTS: 'results',
};

const STAGE_SUGGESTIONS = {
  upload: [
    'Use multipart/form-data and ensure the file field is named workbook.',
    'Re-upload the file and confirm the selected file is an Excel workbook (.xlsx or .xls).',
  ],
  'workbook-type-validation': [
    'Confirm workbook type matches the file content (Payroll Workbook vs Business Workbook).',
    'Choose a workbook type again, then retry preview.',
  ],
  'workbook-read': [
    'Confirm the file is a valid Excel workbook and not a renamed CSV or text file.',
    'Open and resave the workbook in Excel, then upload again.',
  ],
  'sheet-detection': [
    'Check workbook sheet names and headers against the supported import format.',
    'Try selecting the other workbook type and preview again.',
  ],
  parsing: [
    'Check that required headers exist and are not heavily renamed.',
    'Re-upload the workbook after removing malformed rows in detected sheets.',
  ],
  'import-orchestration': [
    'Retry import for selected sections only to isolate the failing section.',
    'Preview parse again to confirm mapped entities before re-importing.',
  ],
};

function getStageSuggestions(stage) {
  return STAGE_SUGGESTIONS[stage] || [
    'Re-upload the file and retry parse preview.',
    'Confirm file is a real Excel workbook and workbook type is correct.',
  ];
}

function getParsePayload(responseData) {
  if (!responseData) return null;
  if (responseData.data && typeof responseData.data === 'object') return responseData.data;
  return responseData;
}

function toParseDiagnostic(responseLike, fallbackMessage) {
  const data = responseLike || {};
  const stage = data.stage || null;
  const message = data.message || data.error || fallbackMessage;
  return {
    stage,
    message,
    details: data.details || {},
    detectedSheets: Array.isArray(data.detectedSheets) ? data.detectedSheets : [],
    workbookTypeReceived: data.workbookTypeReceived || null,
    fileMeta: data.fileMeta || null,
    suggestions: getStageSuggestions(stage),
  };
}

const ParseDiagnosticPanel = ({ diagnostic }) => {
  if (!diagnostic) return null;

  return (
    <div
      style={{
        marginTop: '1rem',
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: '12px',
        padding: '1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#b91c1c' }}>
        <i className="fas fa-circle-exclamation"></i>
        <strong>Parse Preview Failed</strong>
      </div>

      <div style={{ color: '#7f1d1d', fontSize: '0.9rem' }}>{diagnostic.message}</div>

      {diagnostic.stage && (
        <div style={{ fontSize: '0.84rem', color: '#991b1b' }}>
          <strong>Failure stage:</strong> {diagnostic.stage}
        </div>
      )}

      {diagnostic.detectedSheets.length > 0 && (
        <div style={{ display: 'grid', gap: '0.4rem' }}>
          <div style={{ fontSize: '0.84rem', color: '#991b1b', fontWeight: 700 }}>Detected sheets</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
            {diagnostic.detectedSheets.map((sheet) => (
              <span
                key={sheet}
                style={{
                  backgroundColor: '#fee2e2',
                  color: '#7f1d1d',
                  border: '1px solid #fecaca',
                  borderRadius: '999px',
                  padding: '0.28rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {sheet}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <div style={{ fontSize: '0.84rem', color: '#991b1b', fontWeight: 700 }}>What to try next</div>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#7f1d1d', fontSize: '0.85rem' }}>
          {diagnostic.suggestions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const BusinessOperationsImportModal = ({ isOpen, onClose, onImportSuccess, onViewImportedData }) => {
  const [currentStep, setCurrentStep] = useState(STEPS.SELECT_TYPE);

  // Step 1: Type Selection
  const [workbookType, setWorkbookType] = useState(null);

  // Step 2: File Upload
  const [selectedFile, setSelectedFile] = useState(null);

  // Step 3: Parse Preview
  const [parseResult, setParseResult] = useState(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parseDiagnostic, setParseDiagnostic] = useState(null);

  // Step 4: Section Selection
  const [selectedSections, setSelectedSections] = useState([]);

  // Step 5: Import
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // Step 6: Results
  const [importResult, setImportResult] = useState(null);

  // Reset workflow
  const resetWorkflow = useCallback(() => {
    setCurrentStep(STEPS.SELECT_TYPE);
    setWorkbookType(null);
    setSelectedFile(null);
    setParseResult(null);
    setParseLoading(false);
    setParseError('');
    setParseDiagnostic(null);
    setSelectedSections([]);
    setImportLoading(false);
    setImportError('');
    setImportResult(null);
  }, []);

  // Step 1: Select Type
  const handleTypeSelect = (type) => {
    setWorkbookType(type);
    setSelectedFile(null);
    setParseResult(null);
    setParseError('');
    setParseDiagnostic(null);
    setSelectedSections([]);
    setImportResult(null);
    setCurrentStep(STEPS.UPLOAD_FILE);
  };

  // Step 2: Upload File
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    setParseResult(null);
    setParseError('');
    setParseDiagnostic(null);
    setSelectedSections([]);
    setImportResult(null);
  };

  const handleParseClick = async () => {
    if (!workbookType || !selectedFile) return;

    setParseLoading(true);
    setParseError('');
    setParseDiagnostic(null);

    try {
      const formData = new FormData();
      formData.append('workbook', selectedFile);
      formData.append('workbookType', workbookType);

      const response = await api.post('/business-operations/imports/parse-only', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const payload = getParsePayload(response.data);

      if (payload?.success === false) {
        const diagnostic = toParseDiagnostic(payload, 'Workbook parse failed');
        setParseError(diagnostic.message);
        setParseDiagnostic(diagnostic);
        return;
      }

      if (payload && payload.summary) {
        setParseResult(payload);
        // Pre-select all available sections
        const summary = payload.summary || {};
        const allSections = Object.keys(summary).map((key) => {
          // Convert camelCase to camelCase id
          return key.charAt(0).toLowerCase() + key.slice(1);
        });
        setSelectedSections(allSections);
        setCurrentStep(STEPS.SELECT_SECTIONS);
      } else {
        const diagnostic = toParseDiagnostic(payload, 'Workbook parse did not return a valid summary');
        setParseError(diagnostic.message);
        setParseDiagnostic(diagnostic);
      }
    } catch (error) {
      const diagnostic = toParseDiagnostic(
        error.response?.data,
        'Workbook parse failed. Please check workbook type and file format.'
      );
      setParseError(diagnostic.message);
      setParseDiagnostic(diagnostic);
    } finally {
      setParseLoading(false);
    }
  };

  // Step 4: Import
  const handleImportClick = async () => {
    if (!workbookType || !selectedFile) return;

    setImportLoading(true);
    setImportError('');

    try {
      const formData = new FormData();
      formData.append('workbook', selectedFile);
      formData.append('sections', JSON.stringify(selectedSections));

      const endpoint =
        workbookType === 'payroll' ? '/business-operations/imports/payroll-workbook' : '/business-operations/imports/business-workbook';

      const response = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        setImportResult(response.data);
        onImportSuccess?.(response.data, workbookType);
        setCurrentStep(STEPS.RESULTS);
      } else {
        setImportError('Import failed. Please try again.');
      }
    } catch (error) {
      setImportError(error.response?.data?.error || 'Import failed. Please check your workbook and try again.');
    } finally {
      setImportLoading(false);
    }
  };

  // Step 6: Completion
  const handleImportAnother = () => {
    resetWorkflow();
  };

  const handleViewData = () => {
    if (!importResult) return;
    onViewImportedData?.({ importResult, workbookType });
    resetWorkflow();
    onClose();
  };

  // Close modal
  const handleClose = () => {
    resetWorkflow();
    onClose();
  };

  // Navigation buttons
  const goBack = () => {
    switch (currentStep) {
      case STEPS.UPLOAD_FILE:
        setCurrentStep(STEPS.SELECT_TYPE);
        setSelectedFile(null);
        setParseResult(null);
        setParseError('');
        setParseDiagnostic(null);
        break;
      case STEPS.SELECT_SECTIONS:
        setCurrentStep(STEPS.UPLOAD_FILE);
        setParseResult(null);
        setParseError('');
        setParseDiagnostic(null);
        setSelectedSections([]);
        break;
      case STEPS.RESULTS:
        setCurrentStep(STEPS.SELECT_SECTIONS);
        setImportResult(null);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          maxWidth: '700px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            borderBottom: '1px solid #e2e8f0',
            padding: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.25rem' }}>Import Excel Workbook</h2>
            <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.88rem' }}>
              {currentStep === STEPS.SELECT_TYPE && 'Step 1 of 3: Choose workbook type'}
              {currentStep === STEPS.UPLOAD_FILE && 'Step 1 of 3: Select and upload file'}
              {currentStep === STEPS.SELECT_SECTIONS && 'Step 2 of 3: Select sections to import'}
              {currentStep === STEPS.RESULTS && 'Import complete'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#64748b',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
          {currentStep === STEPS.SELECT_TYPE && (
            <WorkbookTypeSelector selectedType={workbookType} onSelect={handleTypeSelect} disabled={false} />
          )}

          {currentStep === STEPS.UPLOAD_FILE && (
            <>
              <WorkbookFileUploader
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                disabled={parseLoading}
                isLoading={parseLoading}
              />
              {parseError && (
                <ParseDiagnosticPanel diagnostic={parseDiagnostic || { message: parseError, suggestions: getStageSuggestions(null), detectedSheets: [] }} />
              )}
            </>
          )}

          {currentStep === STEPS.SELECT_SECTIONS && (
            <>
              <WorkbookParsePreview parseResult={parseResult} loading={false} error={parseError} />
              <div style={{ marginTop: '1.5rem' }}>
                <WorkbookSectionSelector
                  workbookType={workbookType}
                  selectedSections={selectedSections}
                  onSelectionChange={setSelectedSections}
                  summary={parseResult?.summary || {}}
                  disabled={importLoading}
                />
              </div>
            </>
          )}

          {currentStep === STEPS.RESULTS && (
            <WorkbookImportResults
              importResult={importResult}
              workbookType={workbookType}
              onClose={handleImportAnother}
              onViewData={handleViewData}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #e2e8f0',
            padding: '1.5rem',
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          {currentStep !== STEPS.RESULTS && (
            <button
              type="button"
              onClick={goBack}
              disabled={currentStep === STEPS.SELECT_TYPE}
              style={{
                border:
                  currentStep === STEPS.SELECT_TYPE ? '1px solid #e2e8f0' : '1px solid #cbd5e1',
                backgroundColor: '#fff',
                color: '#0f172a',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: currentStep === STEPS.SELECT_TYPE ? 'not-allowed' : 'pointer',
                opacity: currentStep === STEPS.SELECT_TYPE ? 0.5 : 1,
              }}
            >
              Back
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
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
            {currentStep === STEPS.RESULTS ? 'Close' : 'Cancel'}
          </button>

          {currentStep === STEPS.SELECT_TYPE && (
            <button
              type="button"
              onClick={() => setCurrentStep(STEPS.UPLOAD_FILE)}
              disabled={!workbookType}
              style={{
                border: 'none',
                backgroundColor: workbookType ? '#5B4B8A' : '#cbd5e1',
                color: '#fff',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: workbookType ? 'pointer' : 'not-allowed',
              }}
            >
              Continue
            </button>
          )}

          {currentStep === STEPS.UPLOAD_FILE && (
            <button
              type="button"
              onClick={handleParseClick}
              disabled={!selectedFile || parseLoading}
              style={{
                border: 'none',
                backgroundColor: selectedFile && !parseLoading ? '#5B4B8A' : '#cbd5e1',
                color: '#fff',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: selectedFile && !parseLoading ? 'pointer' : 'not-allowed',
              }}
            >
              {parseLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.4rem' }}></i>
                  Analyzing...
                </>
              ) : (
                <>
                  <i className="fas fa-search" style={{ marginRight: '0.4rem' }}></i>
                  Preview Parse
                </>
              )}
            </button>
          )}

          {currentStep === STEPS.SELECT_SECTIONS && (
            <button
              type="button"
              onClick={handleImportClick}
              disabled={selectedSections.length === 0 || importLoading}
              style={{
                border: 'none',
                backgroundColor: selectedSections.length > 0 && !importLoading ? '#059669' : '#cbd5e1',
                color: '#fff',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: selectedSections.length > 0 && !importLoading ? 'pointer' : 'not-allowed',
              }}
            >
              {importLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '0.4rem' }}></i>
                  Importing...
                </>
              ) : (
                <>
                  <i className="fas fa-upload" style={{ marginRight: '0.4rem' }}></i>
                  Import Now
                </>
              )}
            </button>
          )}

          {currentStep === STEPS.RESULTS && (
            <button
              type="button"
              onClick={handleImportAnother}
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
              Import Another
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BusinessOperationsImportModal;
