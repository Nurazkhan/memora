import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, createProject, checkHealth } from '../api/client';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimeout;

    async function tryConnect() {
      try {
        await checkHealth();
        if (!cancelled) {
          setBackendReady(true);
          loadProjects();
        }
      } catch (err) {
        if (!cancelled) {
          retryTimeout = setTimeout(tryConnect, 2000);
        }
      }
    }

    tryConnect();
    return () => { cancelled = true; clearTimeout(retryTimeout); };
  }, []);

  async function loadProjects() {
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setCreating(true);
    try {
      const res = await createProject(formData);
      setShowModal(false);
      setFormData({ name: '', description: '' });
      navigate(`/project/${res.data.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (showModal && inputRef.current) {
      setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 100);
    }
  }, [showModal]);

  if (!backendReady) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)' }}>Connecting to backend...</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Waiting for the Python server to start</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="dashboard-header">
          <div>
            <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 8 }}></div>
            <div className="skeleton" style={{ width: 300, height: 16 }}></div>
          </div>
        </div>
        <div className="project-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ width: 80, height: 20, marginBottom: 16 }}></div>
              <div className="skeleton" style={{ width: '100%', height: 20, marginBottom: 8 }}></div>
              <div className="skeleton" style={{ width: '60%', height: 14 }}></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Projects</h1>
          <p className="dashboard-subtitle">
            Manage your photo album projects
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <span>+</span> New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📷</div>
          <h2 className="empty-state-title">No projects yet</h2>
          <p className="empty-state-text">
            Create your first project to start organizing photos into beautiful albums automatically.
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => setShowModal(true)}>
            <span>+</span> Create First Project
          </button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map(project => (
            <div
              key={project.id}
              className="card card-clickable project-card"
              onClick={() => navigate(`/project/${project.id}`)}
            >
              <span className={`project-card-badge badge-${project.status || 'draft'}`}>
                <span className={`status-dot status-dot-${project.status === 'processing' ? 'processing' : 'active'}`}></span>
                {project.status || 'Draft'}
              </span>
              <h3 className="project-card-title">{project.name}</h3>
              <p className="project-card-meta">
                {project.description || 'No description'}
              </p>
              <div className="project-card-stats">
                <div className="project-card-stat">
                  <div className="project-card-stat-value">{project.image_count || 0}</div>
                  <div className="project-card-stat-label">Photos</div>
                </div>
                <div className="project-card-stat">
                  <div className="project-card-stat-value">{project.student_count || 0}</div>
                  <div className="project-card-stat-label">Students</div>
                </div>
                <div className="project-card-stat">
                  <div className="project-card-stat-value">{project.cluster_count || 0}</div>
                  <div className="project-card-stat-label">Clusters</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">New Project</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label className="form-label">Project Name</label>
                <input
                  ref={inputRef}
                  className="form-input"
                  type="text"
                  placeholder="e.g. Class of 2026"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Brief description of this project..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating || !formData.name.trim()}>
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
