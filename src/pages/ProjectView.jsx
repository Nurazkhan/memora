import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, uploadImages, getProjectImages, uploadStudentList, getStudents, startProcessing, getClusters, assignClusterName, getProgress } from '../api/client';
import Dropzone from '../components/Dropzone';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8599';

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  const [images, setImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [students, setStudents] = useState([]);
  const [uploadingStudents, setUploadingStudents] = useState(false);
  const studentInputRef = useRef(null);
  
  const [clusters, setClusters] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ total: 0, processed: 0 });
  
  const [albumPages, setAlbumPages] = useState([]);
  const [generatingAlbum, setGeneratingAlbum] = useState(false);

  useEffect(() => {
    loadProject();
  }, [id]);

  useEffect(() => {
    let interval;
    if (project?.status === 'processing') {
      interval = setInterval(async () => {
        try {
          const res = await getProgress(id);
          setProcessingProgress(res.data);
          if (res.data.total > 0 && res.data.processed === res.data.total) {
            loadProject();
          }
        } catch (e) {}
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [project?.status, id]);

  useEffect(() => {
    if (activeTab === 'photos') loadImages();
    if (activeTab === 'students') loadStudents();
    if (activeTab === 'faces') loadClusters();
  }, [activeTab]);

  async function loadProject() {
    try {
      const res = await getProject(id);
      setProject(res.data);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadImages() {
    try {
      const res = await getProjectImages(id);
      setImages(res.data);
    } catch (err) {
      console.error('Failed to load images:', err);
    }
  }

  async function loadStudents() {
    try {
      const res = await getStudents(id);
      setStudents(res.data);
    } catch (err) {
      console.error('Failed to load students:', err);
    }
  }

  async function loadClusters() {
    try {
      const res = await getClusters(id);
      setClusters(res.data);
    } catch (err) {
      console.error('Failed to load clusters:', err);
    }
  }

  async function handleStartProcessing() {
    setProcessing(true);
    try {
      await startProcessing(id);
      loadProject();
      alert('Face detection and clustering started in background! Check back later.');
    } catch (err) {
      console.error('Processing failed:', err);
      alert('Failed to start processing.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleAssignName(clusterId, name) {
    if (!name.trim()) return;
    try {
      await assignClusterName(id, clusterId, name);
      loadClusters();
    } catch (err) {
      console.error('Failed to assign name:', err);
    }
  }

  async function handleGenerateAlbum() {
    setGeneratingAlbum(true);
    try {
      const res = await axios.post(`${API_BASE}/projects/${id}/album/generate`);
      setAlbumPages(res.data.pages || []);
      loadProject();
    } catch (err) {
      console.error('Failed to generate album:', err);
      alert('Failed to generate album.');
    } finally {
      setGeneratingAlbum(false);
    }
  }

  async function handleImageDrop(files) {
    if (files.length === 0) return;
    setUploadingImages(true);
    setUploadProgress(0);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    try {
      await uploadImages(id, formData, (evt) => {
        if (evt.total) {
          setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      });
      // Wait a moment for background processing to start generating thumbnails
      setTimeout(() => {
        loadImages();
        loadProject();
      }, 1000);
    } catch (err) {
      console.error('Failed to upload images:', err);
      alert('Failed to upload images.');
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleStudentExcel(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingStudents(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await uploadStudentList(id, formData);
      loadStudents();
      loadProject();
    } catch (err) {
      console.error('Failed to upload students:', err);
      alert(err.response?.data?.detail || 'Failed to import Excel file.');
    } finally {
      setUploadingStudents(false);
      e.target.value = null; // reset input
    }
  }

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 16 }}></div>
        <div className="skeleton" style={{ width: '100%', height: 200 }}></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <h2 className="empty-state-title">Project not found</h2>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '📋' },
    { key: 'photos', label: 'Photos', icon: '🖼️' },
    { key: 'students', label: 'Students', icon: '👥' },
    { key: 'faces', label: 'Faces & Clusters', icon: '🔍' },
    { key: 'album', label: 'Album', icon: '📖' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 12 }}>
          ← Back to Projects
        </button>
        <div className="dashboard-header" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="dashboard-title">{project.name}</h1>
            <p className="dashboard-subtitle">{project.description || 'No description'}</p>
          </div>
          <span className={`project-card-badge badge-${project.status || 'draft'}`}>
            {project.status || 'Draft'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--border)',
        marginBottom: 28,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`btn btn-ghost btn-sm`}
            style={{
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: 0,
              color: activeTab === tab.key ? 'var(--accent-hover)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="project-grid">
          <div className="card">
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>PROJECT STATS</h3>
            <div style={{ display: 'flex', gap: 32 }}>
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

          <div className="card">
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>WORKFLOW</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { step: 1, label: 'Upload Photos', done: (project.image_count || 0) > 0 },
                { step: 2, label: 'Import Student List', done: (project.student_count || 0) > 0 },
                { step: 3, label: 'Face Detection & Clustering', done: (project.cluster_count || 0) > 0 },
                { step: 4, label: 'Tag Clusters', done: false },
                { step: 5, label: 'Build Album', done: false },
                { step: 6, label: 'Export', done: false },
              ].map(s => (
                <div key={s.step} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: s.done ? 1 : 0.5
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: s.done ? 'var(--success)' : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: s.done ? 'white' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}>
                    {s.done ? '✓' : s.step}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: s.done ? 500 : 400 }}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
            {(project.image_count > 0 || project.student_count > 0) && (
              <div style={{ marginTop: 20 }}>
                {project.status === 'processing' ? (
                  <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
                      <span>Extracting Faces & Clustering...</span>
                      <span>{processingProgress.processed} / {processingProgress.total}</span>
                    </div>
                    <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                       <div style={{ width: `${processingProgress.total > 0 ? (processingProgress.processed / processingProgress.total) * 100 : 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }}></div>
                    </div>
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleStartProcessing}
                    disabled={processing}
                  >
                    Run Face Detection
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'photos' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <Dropzone onDrop={handleImageDrop} label={uploadingImages ? `Uploading... ${uploadProgress}%` : "Drag & drop photos here, or click to upload"} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Gallery ({images.length})</h3>
            <button className="btn btn-secondary btn-sm" onClick={loadImages}>Refresh</button>
          </div>
          {images.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-text">No photos uploaded yet.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {images.map(img => {
                // Determine relative path for static serving
                // e.g. "projects_data/<project_name>/thumbnails/xyz.jpg" -> project path part
                const thumbPathParts = img.thumbnail_path.replace(/\\/g, '/').split('/projects_data/');
                const thumbUrl = thumbPathParts.length > 1 ? `${API_BASE}/files/${thumbPathParts[1]}` : null;
                return (
                  <div key={img.id} style={{ 
                    aspectRatio: '1', 
                    borderRadius: 'var(--radius-sm)', 
                    overflow: 'hidden',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)'
                  }}>
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <div style={{ padding: 12, fontSize: 11, wordBreak: 'break-word', color: 'var(--text-muted)' }}>{img.filename}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'students' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, padding: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Import Student List</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Upload an Excel file (.xlsx) with columns: <strong>Name</strong>, Class (optional), Number (optional)</p>
            </div>
            <div>
              <input 
                type="file" 
                ref={studentInputRef} 
                accept=".xlsx, .xls, .csv" 
                style={{ display: 'none' }}
                onChange={handleStudentExcel}
              />
              <button 
                className="btn btn-primary" 
                onClick={() => studentInputRef.current?.click()}
                disabled={uploadingStudents}
              >
                {uploadingStudents ? 'Uploading...' : 'Upload Excel'}
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Students ({students.length})</h3>
            <button className="btn btn-secondary btn-sm" onClick={loadStudents}>Refresh</button>
          </div>
          {students.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-text">No students imported yet.</div>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Class</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Number</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{s.name}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{s.class_name || '-'}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{s.student_number || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'faces' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600 }}>Face Clusters ({clusters.length})</h3>
            <button className="btn btn-secondary btn-sm" onClick={loadClusters}>Refresh</button>
          </div>
          
          {clusters.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h2 className="empty-state-title">No faces detected yet</h2>
              <p className="empty-state-text">Upload photos first, then click "Run Face Detection" on the Overview tab.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
              {clusters.map(cluster => (
                <div key={cluster.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <div style={{ 
                      width: 80, height: 80, borderRadius: 'var(--radius-sm)', 
                      background: 'var(--bg-tertiary)', overflow: 'hidden', flexShrink: 0 
                    }}>
                      <img 
                        src={`${API_BASE}/files/${project.name.replace(/ /g, "_").toLowerCase()}/faces/face_${cluster.representative_face_id}.jpg`} 
                        alt={cluster.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>ID: #{cluster.id}</div>
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: cluster.student_id ? 'var(--success)' : 'var(--text-primary)' }}>
                        {cluster.name || 'Unknown'}
                      </div>
                      <div style={{ fontSize: 12, display: 'inline-flex', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 12 }}>
                        {cluster.face_count} faces
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="Enter name..."
                      defaultValue={cluster.name.startsWith("Cluster") ? "" : cluster.name}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAssignName(cluster.id, e.target.value);
                      }}
                      style={{ padding: '8px 12px', fontSize: 13 }}
                    />
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={(e) => handleAssignName(cluster.id, e.target.previousSibling.value)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'album' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700 }}>Album Draft</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                Review and edit the automatically generated layout.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => window.open(`${API_BASE}/projects/${id}/album/export`, '_blank')}
                disabled={albumPages.length === 0}
              >
                Export PDF
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleGenerateAlbum}
                disabled={generatingAlbum}
              >
                {generatingAlbum ? 'Building...' : (albumPages.length > 0 ? 'Re-generate Layout' : 'Generate Album')}
              </button>
            </div>
          </div>

          {albumPages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📖</div>
              <h2 className="empty-state-title">Album not created yet</h2>
              <p className="empty-state-text">Click the button above to automatically place the best photos based on AI clustering and tagging.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40, alignItems: 'center' }}>
              {albumPages.map((page, idx) => (
                <div key={idx} style={{ 
                  width: '100%', maxWidth: '800px', 
                  aspectRatio: '1.414', // A4 Landscape ratio
                  background: '#f0f0f5', // White-ish for print preview
                  padding: 40,
                  boxShadow: 'var(--shadow-lg)',
                  borderRadius: 'var(--radius-sm)',
                  position: 'relative'
                }}>
                  <h4 style={{ color: '#12121a', fontSize: 24, fontWeight: 700, marginBottom: 24, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 2 }}>{page.title}</h4>
                  
                  {page.type === 'individual' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, height: 'calc(100% - 60px)' }}>
                      {page.items.map(item => (
                        <div key={item.student_id} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div style={{ 
                            flex: 1, 
                            background: '#e0e0e8',
                            overflow: 'hidden',
                            position: 'relative',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                          }}>
                            {item.face_thumb && (
                              <img 
                                src={`${API_BASE}/files/${project.name.replace(/ /g, "_").toLowerCase()}/faces/face_${item.face_id}.jpg`}
                                alt={item.student_name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            )}
                          </div>
                          <div style={{ textAlign: 'center', marginTop: 12, padding: '8px 0', background: 'white', color: '#1a1a28', fontWeight: 600, fontSize: 13, borderBottom: '2px solid var(--accent)' }}>
                            {item.student_name}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {page.type === 'group' && (
                    <div style={{ height: 'calc(100% - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {page.items.map((item, i) => (
                        <div key={i} style={{ width: '80%', height: '80%', background: '#e0e0e8', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', position: 'relative' }}>
                          <img 
                            src={`${API_BASE}/files/${project.name.replace(/ /g, "_").toLowerCase()}/thumbnails/${item.image_thumb.split('/').pop().split('\\').pop()}`}
                            alt="Group"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', color: 'white' }}>
                            <p style={{ fontSize: 14, fontWeight: 500 }}>Featuring: {item.metadata}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div style={{ position: 'absolute', bottom: 16, right: 24, fontSize: 12, color: '#a0a0b8' }}>
                    Page {idx + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
