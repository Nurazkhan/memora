import React, { useState, useEffect } from 'react';
import { getTemplates, getClusters, generateAlbum } from '../../api/client';

export default function AlbumGenModal({ projectId, onClose, onGenerated }) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [targetClusterId, setTargetClusterId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [tRes, cRes] = await Promise.all([getTemplates(), getClusters(projectId)]);
      setTemplates(tRes.data);
      setClusters(cRes.data);
    } catch (err) {
      console.error(err);
      setError("Failed to load templates or identities.");
    }
  }

  const handleTemplateSelect = (tId) => {
    setSelectedTemplateId(tId);
    const t = templates.find(item => item.id === parseInt(tId));
    setSelectedTemplate(t);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateAlbum(projectId, {
        template_id: parseInt(selectedTemplateId),
        target_cluster_id: parseInt(targetClusterId)
      });
      onGenerated(res.data.pages || []);
      onClose();
    } catch (err) {
      console.error(err);
      setError("Generation failed. Please check your mapping.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" style={{ background: 'var(--bg-card)', width: 600, maxHeight: '90vh', borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Generate Album</h2>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: 24 }}>×</button>
        </div>

        {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
          {step === 1 && (
            <div>
              <p style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>Choose a template to use for this project.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {templates.map(t => (
                  <div 
                    key={t.id} 
                    onClick={() => handleTemplateSelect(t.id)}
                    style={{ 
                      padding: 16, borderRadius: 'var(--radius-md)', border: '2px solid', 
                      borderColor: selectedTemplateId === t.id ? 'var(--accent)' : 'var(--border)',
                      cursor: 'pointer', background: selectedTemplateId === t.id ? 'var(--bg-tertiary)' : 'transparent',
                      textAlign: 'center', transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && selectedTemplate && (
            <div>
              <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>Select the primary identity (student) to feature in this album.</p>
              
              <div style={{ background: 'var(--bg-tertiary)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Target Identity</label>
                <select 
                  className="form-input" 
                  style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                  value={targetClusterId}
                  onChange={e => setTargetClusterId(e.target.value)}
                >
                  <option value="">-- Select Identity --</option>
                  {clusters.filter(c => c.name && c.name !== 'Unknown').map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.face_count} faces)</option>
                  ))}
                </select>
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                  Individual portrait frames will be filled with the highest-quality crop. Group frames will be filled by group photos containing this identity.
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
           {step === 2 && (
             <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
           )}
           {step === 1 ? (
             <button className="btn btn-primary" disabled={!selectedTemplateId} onClick={() => setStep(2)}>Next: Select User</button>
           ) : (
             <button className="btn btn-primary" disabled={loading || !targetClusterId} onClick={handleGenerate}>
                {loading ? 'Generating...' : 'Generate Final Album'}
             </button>
           )}
        </div>
      </div>
    </div>
  );
}
