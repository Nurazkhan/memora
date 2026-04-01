import React, { useState, useEffect } from 'react';
import { getTemplates, getClusters, generateAlbum } from '../../api/client';
import TemplateMiniPreview from '../editor/TemplateMiniPreview';
import { normalizePages } from '../editor/templateUtils';

export default function AlbumGenModal({ projectId, onClose, onGenerated }) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [targetClusterId, setTargetClusterId] = useState('');
  const [clusterSearch, setClusterSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [templatesRes, clustersRes] = await Promise.all([getTemplates(), getClusters(projectId)]);
      setTemplates(templatesRes.data);
      setClusters(clustersRes.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load templates or identities.');
    }
  }

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId);
    setSelectedTemplate(templates.find((item) => item.id === Number(templateId)) || null);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateAlbum(projectId, {
        template_id: Number(selectedTemplateId),
        target_cluster_id: Number(targetClusterId),
      });
      onGenerated(res.data.pages || []);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Generation failed. Please check the selected template and identity.');
    } finally {
      setLoading(false);
    }
  };

  const visibleClusters = clusters.filter(
    (cluster) =>
      cluster.name &&
      cluster.name !== 'Unknown' &&
      cluster.name.toLowerCase().includes(clusterSearch.toLowerCase())
  );

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content" style={{ background: 'var(--bg-card)', width: 760, maxHeight: '90vh', borderRadius: 'var(--radius-lg)', padding: 24, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Build Album Draft</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
              Choose a layout template, then choose the identity this album should focus on.
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>

        {error && <div style={{ marginBottom: 16, color: 'var(--danger)' }}>{error}</div>}

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
          {step === 1 && (
            <div>
              <p style={{ marginBottom: 14, color: 'var(--text-secondary)' }}>Choose a template to use for this project.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template.id)}
                    style={{
                      padding: 14,
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${selectedTemplateId === template.id ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      background: selectedTemplateId === template.id ? 'var(--bg-tertiary)' : 'transparent',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                      <TemplateMiniPreview page={normalizePages(template.layout_json?.pages)[0]} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{template.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {normalizePages(template.layout_json?.pages).length} pages
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && selectedTemplate && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, marginBottom: 18 }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                    Selected Template
                  </div>
                  <TemplateMiniPreview page={normalizePages(selectedTemplate.layout_json?.pages)[0]} />
                  <div style={{ marginTop: 10, fontWeight: 700 }}>{selectedTemplate.name}</div>
                </div>

                <div style={{ background: 'var(--bg-tertiary)', padding: 24, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>Target Identity</label>
                  <input
                    className="form-input"
                    style={{ marginBottom: 10 }}
                    placeholder="Search identity name..."
                    value={clusterSearch}
                    onChange={(e) => setClusterSearch(e.target.value)}
                  />
                  <select
                    className="form-input"
                    style={{ width: '100%', padding: '10px 12px', fontSize: 14 }}
                    value={targetClusterId}
                    onChange={(e) => setTargetClusterId(e.target.value)}
                  >
                    <option value="">-- Select Identity --</option>
                    {visibleClusters.map((cluster) => (
                      <option key={cluster.id} value={cluster.id}>
                        {cluster.name} ({cluster.face_count} faces)
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Portrait frames get the best single-person shots. Group frames get photos that include the same identity.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {step === 2 && <button className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>}
          {step === 1 ? (
            <button className="btn btn-primary" disabled={!selectedTemplateId} onClick={() => setStep(2)}>
              Next: Select Identity
            </button>
          ) : (
            <button className="btn btn-primary" disabled={loading || !targetClusterId} onClick={handleGenerate}>
              {loading ? 'Generating...' : 'Generate Album Draft'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
