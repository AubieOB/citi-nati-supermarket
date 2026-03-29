import React, { useCallback, useState } from 'react';
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

const BusinessOperationsImportModal = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(STEPS.SELECT_TYPE);

  // Step 1: Type Selection
  const [workbookType, setWorkbookType] = useState(null);

  // Step 2: File Upload
  const [selectedFile, setSelectedFile] = useState(null);

  // Step 3: Parse Preview
  const [parseResult, setParseResult] = useState(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState('');

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
    setSelectedSections([]);
    setImportLoading(false);
    setImportError('');
    setImportResult(null);
  }, []);

  // Step 1: Select Type
  const handleTypeSelect = (type) => {
    setWorkbookType(type);
    setCurrentStep(STEPS.UPLOAD_FILE);
  };

  // Step 2: Upload File
  const handleFileSelect = (file) => {
    setSelectedFile(file);
  };

  const handleParseClick = async () => {
    if (!workbookType || !selectedFile) return;

    setParseLoading(true);
    setParseError('');

    try {
      const formData = new FormData();
      formData.append('workbook', selectedFile);
      formData.append('workbookType', workbookType);

      const response = await api.post('/business-operations/imports/parse-only', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data?.data) {
        setParseResult(response.data.data);
        // Pre-select all available sections
        const summary = response.data.data.summary || {};
        const allSections = Object.keys(summary).map((key) => {
          // Convert camelCase to camelCase id
          return key.charAt(0).toLowerCase() + key.slice(1);
        });
        setSelectedSections(allSections);
        setCurrentStep(STEPS.SELECT_SECTIONS);
      } else {
        setParseError(response.data?.error || 'Failed to parse workbook');
      }
    } catch (error) {
      setParseError(error.response?.data?.error || 'Failed to parse workbook. Please check the file format.');
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
        break;
      case STEPS.SELECT_SECTIONS:
        setCurrentStep(STEPS.UPLOAD_FILE);
        setParseResult(null);
        setParseError('');
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
                <div
                  style={{
                    marginTop: '1rem',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '10px',
                    padding: '0.85rem 1rem',
                    color: '#b91c1c',
                    fontSize: '0.9rem',
                  }}
                >
                  <i className="fas fa-circle-exclamation" style={{ marginRight: '0.5rem' }}></i>
                  {parseError}
                </div>
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
            <WorkbookImportResults importResult={importResult} workbookType={workbookType} onClose={handleImportAnother} />
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
