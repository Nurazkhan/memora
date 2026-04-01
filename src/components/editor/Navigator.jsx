import React from 'react';
import TemplateMiniPreview from './TemplateMiniPreview';

export default function Navigator({ pages, activePageIndex, onPageSelect, onAddPage, onDeletePage, onDuplicatePage }) {
  return (
    <div
      className="editor-navigator"
      style={{
        width: 220,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '16px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Pages</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {pages.length} layout{pages.length === 1 ? '' : 's'}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onAddPage} title="Add Page">
          Add
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {pages.map((page, index) => (
          <div
            key={page.id}
            className={`navigator-item ${activePageIndex === index ? 'active' : ''}`}
            onClick={() => onPageSelect(index)}
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 14,
              cursor: 'pointer',
              border: `1px solid ${activePageIndex === index ? 'rgba(124, 92, 252, 0.45)' : 'var(--border)'}`,
              background: activePageIndex === index ? 'rgba(124, 92, 252, 0.08)' : 'rgba(255, 255, 255, 0.01)',
              transition: 'all 0.2s',
            }}
          >
            <TemplateMiniPreview page={page} selected={activePageIndex === index} showLabel label={`P${index + 1}`} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 10, gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {page.name || `Page ${index + 1}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {page.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
                </div>
              </div>

              <div className="navigator-actions" style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicatePage(index);
                  }}
                  title="Duplicate"
                >
                  Copy
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', color: 'var(--danger)' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePage(index);
                  }}
                  disabled={pages.length <= 1}
                  title="Delete"
                >
                  Del
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
