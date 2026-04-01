import React from 'react';

export default function PhotoPreviewSidebar({ isOpen, onClose, images, project, onSelectImage, onHoverImage, onLeaveImage }) {
  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100vh',
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        transform: 'translateX(0)',
        transition: 'transform var(--transition)'
      }}
    >
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Choose Replacement</h3>
        <button className="btn-icon" onClick={onClose} style={{ pointerEvents: 'auto' }}>×</button>
      </div>

      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Hover over an image to temporarily preview it in the selected frame. Click to apply permanently.
        </p>
        
        {images.length === 0 ? (
           <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No alternative images found.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {images.map((img, i) => (
              <div 
                key={i} 
                style={{ 
                  aspectRatio: '1', 
                  borderRadius: 'var(--radius-sm)', 
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: '2px solid transparent',
                  background: 'var(--bg-card)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  if (onHoverImage) onHoverImage(img);
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  if (onLeaveImage) onLeaveImage();
                }}
                onClick={() => onSelectImage(img)}
              >
                <img 
                  src={`http://127.0.0.1:8599/files/${(project?.name || '').replace(/ /g, "_").toLowerCase()}/originals/${(img.original_path || '').split(/[\\/]/).pop()}`} 
                  alt="Candidate"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
