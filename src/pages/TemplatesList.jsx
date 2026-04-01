import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api/client';
import TemplateMiniPreview from '../components/editor/TemplateMiniPreview';
import { getTemplateStats, normalizePages } from '../components/editor/templateUtils';

export default function TemplatesList() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const res = await getTemplates();
      setTemplates(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this template?')) return;

    try {
      await deleteTemplate(id);
      loadTemplates();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, gap: 20 }}>
        <div>
          <h1 className="page-title">Layout Templates</h1>
          <p className="page-subtitle">Design, preview, and reuse page systems for album production.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/templates/new')}>
          Create Template
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">T</div>
          <h2 className="empty-state-title">No templates yet</h2>
          <p className="empty-state-text">Create your first reusable layout and start building a real template library.</p>
          <button className="btn btn-primary" onClick={() => navigate('/templates/new')}>
            Create New
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
          {templates.map((template) => {
            const pages = normalizePages(template.layout_json?.pages);
            const stats = getTemplateStats(template.layout_json);

            return (
              <div
                key={template.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  overflow: 'hidden',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  minHeight: 320,
                }}
                onClick={() => navigate(`/templates/${template.id}`)}
              >
                <div
                  style={{
                    minHeight: 190,
                    borderRadius: 18,
                    padding: 16,
                    background:
                      'radial-gradient(circle at top right, rgba(124, 92, 252, 0.14), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <TemplateMiniPreview page={pages[0]} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{template.name}</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {stats.pageCount} pages | {stats.frameCount} frames | {stats.textCount} text blocks
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={(e) => handleDelete(template.id, e)}
                  >
                    Delete
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {pages.slice(0, 3).map((page, index) => (
                    <span
                      key={page.id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        border: '1px solid var(--border)',
                      }}
                    >
                      {index + 1}. {page.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
