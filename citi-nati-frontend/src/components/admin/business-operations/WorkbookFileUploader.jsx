import React, { useRef, useState } from 'react';

const WorkbookFileUploader = ({ selectedFile, onFileSelect, disabled, isLoading }) => {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');

  const validateFile = (file) => {
    const validExtensions = ['.xlsx', '.xls'];
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const maxSize = 20 * 1024 * 1024; // 20MB

    if (!validExtensions.includes(extension)) {
      setFileError(`Invalid file type. Supported: ${validExtensions.join(', ')}`);
      return false;
    }

    if (file.size > maxSize) {
      setFileError('File too large. Maximum size is 20MB.');
      return false;
    }

    setFileError('');
    return true;
  };

  const handleFileSelect = (file) => {
    if (validateFile(file)) {
      onFileSelect(file);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isLoading) {
      setDragActive(e.type === 'dragenter' || e.type === 'dragover');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (!disabled && !isLoading && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.1rem' }}>Upload Workbook File</h3>
        <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.92rem' }}>
          Select an .xlsx or .xls file to upload. File size limit is 20MB.
        </p>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !disabled && !isLoading && fileInputRef.current?.click()}
        style={{
          border: dragActive ? '2px solid #5B4B8A' : '2px dashed #cbd5e1',
          backgroundColor: dragActive ? '#f8f6ff' : '#f8fafc',
          borderRadius: '16px',
          padding: '2rem',
          textAlign: 'center',
          cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
          opacity: disabled || isLoading ? 0.6 : 1,
          transition: 'all 0.2s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          disabled={disabled || isLoading}
          style={{ display: 'none' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              backgroundColor: '#e2e8f0',
              color: '#5B4B8A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
            }}
          >
            <i className="fas fa-cloud-arrow-up"></i>
          </div>

          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>
              {selectedFile ? selectedFile.name : 'Click to select or drag and drop'}
            </div>
            {selectedFile && (
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
            {!selectedFile && (
              <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                Your Excel workbook file
              </p>
            )}
          </div>

          {!selectedFile && (
            <button
              type="button"
              disabled={disabled || isLoading}
              style={{
                border: 'none',
                backgroundColor: '#5B4B8A',
                color: '#fff',
                borderRadius: '8px',
                padding: '0.55rem 1rem',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                marginTop: '0.5rem',
                opacity: disabled || isLoading ? 0.6 : 1,
              }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Choose File
            </button>
          )}
        </div>
      </div>

      {fileError && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            color: '#b91c1c',
            fontSize: '0.9rem',
          }}
        >
          <i className="fas fa-exclamation-circle" style={{ marginRight: '0.5rem' }}></i>
          {fileError}
        </div>
      )}

      {selectedFile && (
        <button
          type="button"
          onClick={() => {
            onFileSelect(null);
            setFileError('');
          }}
          disabled={disabled || isLoading}
          style={{
            border: '1px solid #cbd5e1',
            backgroundColor: '#f8fafc',
            color: '#0f172a',
            borderRadius: '8px',
            padding: '0.55rem 1rem',
            fontWeight: 700,
            fontSize: '0.88rem',
            cursor: 'pointer',
            opacity: disabled || isLoading ? 0.6 : 1,
          }}
        >
          Clear Selection
        </button>
      )}
    </div>
  );
};

export default WorkbookFileUploader;
