import React, { useState } from 'react';

const API_BASE = 'http://127.0.0.1:8599';

export default function PhotoPickerModal({ project, images, onClose, onSelect }) {
  const [search, setSearch] = useState("");

  const filtered = images.filter(img => 
    img.filename.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="modal-content" style={{ background: 'var(--bg-card)', width: 800, height: '80vh', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>Choose Replacement Photo</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>Select an image from the project to fill this frame.</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: 20, cursor: 'pointer', color: 'var(--text-primary)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}>×</button>
        </div>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Search by filename..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: 300, padding: '8px 12px', fontSize: 13 }}
          />
        </div>

        <div style={{ flex: 1, padding: 24, overflowY: 'auto', background: 'var(--bg-card)' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>No images found.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 }}>
              {filtered.map(img => (
                <div 
                  key={img.id} 
                  style={{ 
                    cursor: 'pointer', 
                    borderRadius: 'var(--radius-sm)', 
                    overflow: 'hidden', 
                    boxShadow: 'var(--shadow-sm)', 
                    border: '2px solid transparent',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-primary)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  onClick={() => onSelect(img)}
                >
                  <img 
                    src={`${API_BASE}/files/${project.name.replace(/ /g, "_").toLowerCase()}/originals/${img.filename}`}
                    alt={img.filename}
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <div style={{ padding: '8px 10px', fontSize: 11, background: 'var(--bg-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.filename}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
