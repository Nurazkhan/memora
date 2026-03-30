import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTemplates, deleteTemplate } from '../api/client';

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 className="page-title">Layout Templates</h1>
          <p className="page-subtitle">Design your reusable album page structures.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/templates/new')}>
          + Create Template
        </button>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
           <div className="empty-state-icon">📐</div>
           <h2 className="empty-state-title">No templates yet</h2>
           <p className="empty-state-text">Create your first structured layout to speed up your workflow.</p>
           <button className="btn btn-primary" onClick={() => navigate('/templates/new')}>Create New</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {templates.map(t => (
            <div 
              key={t.id} 
              className="card" 
              style={{ cursor: 'pointer', overflow: 'hidden', padding: 0 }}
              onClick={() => navigate(`/templates/${t.id}`)}
            >
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
                📐
              </div>
              <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.page_size} &middot; {t.layout_json.frames?.length || 0} frames</p>
                </div>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: 8, color: 'var(--danger)' }}
                  onClick={(e) => handleDelete(t.id, e)}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
