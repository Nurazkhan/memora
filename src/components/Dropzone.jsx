import React, { useState, useRef } from 'react';

export default function Dropzone({ onDrop, accept = "image/*", multiple = true, label = "Drag & drop files here, or click to select" }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDrop(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      onDrop(Array.from(e.target.files));
      // Reset input value so same files can be selected again if needed
      e.target.value = null;
    }
  };

  return (
    <div 
      className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '60px 20px',
        textAlign: 'center',
        background: isDragActive ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
        transition: 'all var(--transition)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px'
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <div style={{ fontSize: '32px' }}>📂</div>
      <div style={{ fontSize: '15px', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
        Supports {multiple ? 'multiple files' : 'single file'}
      </div>
    </div>
  );
}
