import React from 'react';

export default function Navigator({ pages, activePageIndex, onPageSelect, onAddPage, onDeletePage, onDuplicatePage }) {
  return (
    <div className="editor-navigator" style={{ width: 180, borderRight: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Pages</h3>
        <button className="btn-icon" onClick={onAddPage} title="Add Page">+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {pages.map((page, index) => (
          <div 
            key={page.id} 
            className={`navigator-item ${activePageIndex === index ? 'active' : ''}`}
            onClick={() => onPageSelect(index)}
            style={{ 
              marginBottom: 12, 
              padding: 8, 
              borderRadius: 6, 
              cursor: 'pointer',
              border: `2px solid ${activePageIndex === index ? 'var(--accent)' : 'transparent'}`,
              background: activePageIndex === index ? 'var(--bg-tertiary)' : 'var(--bg-card)',
              transition: 'all 0.2s'
            }}
          >
            {/* Miniature Page Preview Placeholder */}
            <div style={{ 
              width: '100%', 
              aspectRatio: page.orientation === 'landscape' ? '1.414' : '0.707',
              background: 'white', 
              boxShadow: 'var(--shadow-sm)',
              marginBottom: 8,
              position: 'relative',
              overflow: 'hidden'
            }}>
               <div style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, color: 'var(--text-muted)' }}>{index + 1}</div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
                {page.name || `Page ${index + 1}`}
              </span>
              <div className="navigator-actions">
                <button 
                  style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', fontSize: 12 }} 
                  onClick={(e) => { e.stopPropagation(); onDuplicatePage(index); }}
                  title="Duplicate"
                >👯</button>
                <button 
                  style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', fontSize: 12 }} 
                  onClick={(e) => { e.stopPropagation(); onDeletePage(index); }}
                  disabled={pages.length <= 1}
                  title="Delete"
                >🗑️</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
