import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProject, uploadImages, getProjectImages, uploadStudentList, getStudents, createStudent, updateStudent, deleteStudent, startProcessing, getClusters, assignClusterName, getProgress, getUnassignedFaces, assignFaceToCluster, createClusterFromFace, deleteImage, deleteCluster, deleteFace, getClusterFaces } from '../api/client';
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

  // Student edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', class_name: '', student_number: '' });
  const [showNewRow, setShowNewRow] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState({ name: '', class_name: '', student_number: '' });
  const [savingStudent, setSavingStudent] = useState(false);
  
  const [clusters, setClusters] = useState([]);
  const [unassignedFaces, setUnassignedFaces] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ total: 0, processed: 0 });
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedClusterFaces, setSelectedClusterFaces] = useState([]);
  const [loadingClusterFaces, setLoadingClusterFaces] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
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
    if (activeTab === 'faces') { loadClusters(); loadUnassignedFaces(); }
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

  async function loadUnassignedFaces() {
    try {
      const res = await getUnassignedFaces(id);
      setUnassignedFaces(res.data);
    } catch (err) {
      console.error('Failed to load unassigned faces:', err);
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

  async function handleDeleteImage(imageId) {
    if (!window.confirm('Are you sure you want to delete this photo and its detected faces?')) return;
    try {
      await deleteImage(id, imageId);
      loadImages();
      loadProject();
      if (activeTab === 'faces') {
        loadClusters();
        loadUnassignedFaces();
      }
    } catch (err) {
      console.error('Failed to delete image:', err);
      alert('Failed to delete image.');
    }
  }

  async function handleDeleteCluster(clusterId) {
    if (!window.confirm('Are you sure you want to delete this identity group? All its faces will be sent back to the review queue.')) return;
    try {
      await deleteCluster(id, clusterId);
      if (selectedCluster?.id === clusterId) handleCloseModal();
      loadClusters();
      loadUnassignedFaces();
    } catch (err) {
      console.error('Failed to delete cluster:', err);
      alert('Failed to delete cluster.');
    }
  }

  async function handleDeleteFace(faceId, isFromCluster = false) {
    if (!window.confirm('Are you sure you want to permanently delete this face?')) return;
    try {
      await deleteFace(id, faceId);
      if (isFromCluster && selectedCluster) {
        handleOpenClusterModal(selectedCluster);
        loadClusters();
      } else {
        loadUnassignedFaces();
      }
    } catch (err) {
      console.error('Failed to delete face:', err);
      alert('Failed to delete face.');
    }
  }

  async function handleOpenClusterModal(cluster) {
    setSelectedCluster(cluster);
    setIsModalOpen(true);
    setLoadingClusterFaces(true);
    try {
      const res = await getClusterFaces(id, cluster.id);
      setSelectedClusterFaces(res.data);
    } catch(err) {
      console.error('Failed to load cluster faces:', err);
    } finally {
      setLoadingClusterFaces(false);
    }
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setTimeout(() => {
      setSelectedCluster(null);
      setSelectedClusterFaces([]);
    }, 300); // match transition duration
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

  function startEditStudent(student) {
    setEditingStudentId(student.id);
    setEditForm({
      name: student.name,
      class_name: student.class_name || '',
      student_number: student.student_number || '',
    });
  }

  function cancelEdit() {
    setEditingStudentId(null);
    setEditForm({ name: '', class_name: '', student_number: '' });
  }

  async function saveEditStudent() {
    if (!editForm.name.trim()) return;
    setSavingStudent(true);
    try {
      await updateStudent(id, editingStudentId, editForm);
      setEditingStudentId(null);
      setEditForm({ name: '', class_name: '', student_number: '' });
      loadStudents();
    } catch (err) {
      console.error('Failed to update student:', err);
      alert(err.response?.data?.detail || 'Failed to update student.');
    } finally {
      setSavingStudent(false);
    }
  }

  async function handleAddStudent() {
    if (!newStudentForm.name.trim()) return;
    setSavingStudent(true);
    try {
      await createStudent(id, newStudentForm);
      setNewStudentForm({ name: '', class_name: '', student_number: '' });
      setShowNewRow(false);
      loadStudents();
      loadProject();
    } catch (err) {
      console.error('Failed to add student:', err);
      alert(err.response?.data?.detail || 'Failed to add student.');
    } finally {
      setSavingStudent(false);
    }
  }

  async function handleDeleteStudent(studentId) {
    if (!confirm('Are you sure you want to remove this student?')) return;
    try {
      await deleteStudent(id, studentId);
      loadStudents();
      loadProject();
    } catch (err) {
      console.error('Failed to delete student:', err);
      alert(err.response?.data?.detail || 'Failed to delete student.');
    }
  }

  function toggleEditMode() {
    setEditMode(prev => !prev);
    setEditingStudentId(null);
    setEditForm({ name: '', class_name: '', student_number: '' });
    setShowNewRow(false);
    setNewStudentForm({ name: '', class_name: '', student_number: '' });
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
                    border: '1px solid var(--border)',
                    position: 'relative'
                  }}>
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <div style={{ padding: 12, fontSize: 11, wordBreak: 'break-word', color: 'var(--text-muted)' }}>{img.filename}</div>
                    )}
                    <button 
                      onClick={() => handleDeleteImage(img.id)}
                      style={{
                        position: 'absolute', top: 4, right: 4, 
                        background: 'rgba(0,0,0,0.5)', color: 'white', 
                        border: 'none', borderRadius: '50%', width: 24, height: 24, 
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                      title="Delete Image"
                    >×</button>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className={`btn btn-sm ${editMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={toggleEditMode}
                style={editMode ? { 
                  background: 'rgba(124, 92, 252, 0.15)', 
                  color: 'var(--accent-hover)',
                  border: '1px solid rgba(124, 92, 252, 0.3)',
                  boxShadow: 'none'
                } : {}}
              >
                {editMode ? '✓ Done Editing' : '✏️ Edit Mode'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={loadStudents}>Refresh</button>
            </div>
          </div>

          {students.length === 0 && !editMode ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-icon">👥</div>
              <h2 className="empty-state-title">No students yet</h2>
              <div className="empty-state-text">Import from Excel or add students manually.</div>
              <button className="btn btn-primary" onClick={() => { setEditMode(true); setShowNewRow(true); }}>
                + Add First Student
              </button>
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13.5 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Class</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>Number</th>
                    {editMode && <th style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600, width: 100, textAlign: 'center' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr 
                      key={s.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border)',
                        background: editingStudentId === s.id ? 'rgba(124, 92, 252, 0.04)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      {editingStudentId === s.id ? (
                        <>
                          <td style={{ padding: '8px 12px' }}>
                            <input 
                              className="form-input"
                              value={editForm.name}
                              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditStudent(); if (e.key === 'Escape') cancelEdit(); }}
                              placeholder="Student name..."
                              autoFocus
                              style={{ padding: '6px 10px', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input 
                              className="form-input"
                              value={editForm.class_name}
                              onChange={e => setEditForm(f => ({ ...f, class_name: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditStudent(); if (e.key === 'Escape') cancelEdit(); }}
                              placeholder="Class..."
                              style={{ padding: '6px 10px', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <input 
                              className="form-input"
                              value={editForm.student_number}
                              onChange={e => setEditForm(f => ({ ...f, student_number: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') saveEditStudent(); if (e.key === 'Escape') cancelEdit(); }}
                              placeholder="Number..."
                              style={{ padding: '6px 10px', fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button 
                                className="btn btn-primary btn-sm"
                                onClick={saveEditStudent}
                                disabled={savingStudent || !editForm.name.trim()}
                                style={{ padding: '4px 10px', fontSize: 11.5 }}
                              >
                                {savingStudent ? '...' : '✓'}
                              </button>
                              <button 
                                className="btn btn-ghost btn-sm"
                                onClick={cancelEdit}
                                style={{ padding: '4px 10px', fontSize: 11.5 }}
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td 
                            style={{ 
                              padding: '12px 16px', 
                              fontWeight: 500,
                              cursor: editMode ? 'pointer' : 'default',
                            }}
                            onClick={() => editMode && startEditStudent(s)}
                          >
                            {s.name}
                          </td>
                          <td 
                            style={{ 
                              padding: '12px 16px', 
                              color: 'var(--text-secondary)',
                              cursor: editMode ? 'pointer' : 'default',
                            }}
                            onClick={() => editMode && startEditStudent(s)}
                          >
                            {s.class_name || '-'}
                          </td>
                          <td 
                            style={{ 
                              padding: '12px 16px', 
                              color: 'var(--text-secondary)',
                              cursor: editMode ? 'pointer' : 'default',
                            }}
                            onClick={() => editMode && startEditStudent(s)}
                          >
                            {s.student_number || '-'}
                          </td>
                          {editMode && (
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button 
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => startEditStudent(s)}
                                  title="Edit student"
                                  style={{ padding: '4px 8px', fontSize: 12 }}
                                >
                                  ✏️
                                </button>
                                <button 
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleDeleteStudent(s.id)}
                                  title="Delete student"
                                  style={{ padding: '4px 8px', fontSize: 12 }}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}

                  {/* New student row */}
                  {editMode && showNewRow && (
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(52, 211, 153, 0.04)' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <input 
                          className="form-input"
                          value={newStudentForm.name}
                          onChange={e => setNewStudentForm(f => ({ ...f, name: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddStudent(); if (e.key === 'Escape') { setShowNewRow(false); setNewStudentForm({ name: '', class_name: '', student_number: '' }); } }}
                          placeholder="New student name..."
                          autoFocus
                          style={{ padding: '6px 10px', fontSize: 13 }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input 
                          className="form-input"
                          value={newStudentForm.class_name}
                          onChange={e => setNewStudentForm(f => ({ ...f, class_name: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddStudent(); if (e.key === 'Escape') { setShowNewRow(false); setNewStudentForm({ name: '', class_name: '', student_number: '' }); } }}
                          placeholder="Class..."
                          style={{ padding: '6px 10px', fontSize: 13 }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input 
                          className="form-input"
                          value={newStudentForm.student_number}
                          onChange={e => setNewStudentForm(f => ({ ...f, student_number: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddStudent(); if (e.key === 'Escape') { setShowNewRow(false); setNewStudentForm({ name: '', class_name: '', student_number: '' }); } }}
                          placeholder="Number..."
                          style={{ padding: '6px 10px', fontSize: 13 }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button 
                            className="btn btn-primary btn-sm"
                            onClick={handleAddStudent}
                            disabled={savingStudent || !newStudentForm.name.trim()}
                            style={{ padding: '4px 10px', fontSize: 11.5 }}
                          >
                            {savingStudent ? '...' : '+ Add'}
                          </button>
                          <button 
                            className="btn btn-ghost btn-sm"
                            onClick={() => { setShowNewRow(false); setNewStudentForm({ name: '', class_name: '', student_number: '' }); }}
                            style={{ padding: '4px 10px', fontSize: 11.5 }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Add student button at the bottom of table */}
              {editMode && !showNewRow && (
                <button
                  onClick={() => setShowNewRow(true)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderTop: '1px dashed var(--border)',
                    color: 'var(--accent-hover)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'background 0.15s ease',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-subtle)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Student
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'faces' && (
        <div>
          {/* Auto-Clustered Identities */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Auto-Clustered Identities ({clusters.length})</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>High-confidence identity groups detected automatically</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { loadClusters(); loadUnassignedFaces(); }}>Refresh</button>
          </div>
          
          {clusters.length === 0 && unassignedFaces.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h2 className="empty-state-title">No faces detected yet</h2>
              <p className="empty-state-text">Upload photos first, then click "Run Face Detection" on the Overview tab.</p>
            </div>
          ) : (
            <>
              {clusters.length === 0 && unassignedFaces.length > 0 && (
                <div style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 28, textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No strong identity groups found. All detected faces are in the review queue below.</p>
                </div>
              )}
              
              {clusters.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, marginBottom: 36 }}>
                  {clusters.map(cluster => (
                    <div key={cluster.id} className="card" style={{ padding: 16 }}>
                      <div 
                        style={{ display: 'flex', gap: 16, marginBottom: 16, cursor: 'pointer', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s', padding: 4, margin: -4 }} 
                        onClick={() => handleOpenClusterModal(cluster)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ 
                          width: 80, height: 80, borderRadius: 'var(--radius-sm)', 
                          background: 'var(--bg-card)', overflow: 'hidden', flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
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
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, display: 'inline-flex', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 12 }}>
                              {cluster.face_count} faces
                            </span>
                            {cluster.confidence && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {Math.round(cluster.confidence * 100)}% conf
                              </span>
                            )}
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
                        <button 
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0 10px', color: 'var(--danger)', marginLeft: 'auto' }}
                          onClick={() => handleDeleteCluster(cluster.id)}
                          title="Delete Identity Group"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Review Queue — unassigned singletons */}
              {unassignedFaces.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>Review Queue</h3>
                    <span style={{ 
                      fontSize: 11, fontWeight: 600, 
                      background: 'rgba(251, 191, 36, 0.12)', color: 'var(--warning)',
                      padding: '2px 10px', borderRadius: 12 
                    }}>
                      {unassignedFaces.length} faces
                    </span>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    These faces passed quality gates but weren't confidently matched to any identity group. 
                    Assign them to an existing cluster or create a new one.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                    {unassignedFaces.map(face => (
                      <div key={face.id} className="card" style={{ padding: 12 }}>
                        <div style={{ 
                          width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-sm)', 
                          background: 'var(--bg-tertiary)', overflow: 'hidden', marginBottom: 10 
                        }}>
                          <img 
                            src={`${API_BASE}/files/${project.name.replace(/ /g, "_").toLowerCase()}/faces/face_${face.id}.jpg`}
                            alt={`Face #${face.id}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Face #{face.id} &middot; {Math.round(face.detector_confidence * 100)}% conf</span>
                          <button 
                            onClick={() => handleDeleteFace(face.id, false)}
                            style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}
                            title="Drop face"
                          >🗑️</button>
                        </div>
                        
                        {/* Suggested Match */}
                        {face.suggested_cluster_id && clusters.find(c => c.id === face.suggested_cluster_id) && (
                          <button
                            className="btn"
                            style={{ width: '100%', marginBottom: 6, fontSize: 11.5, background: 'var(--primary)', color: 'white', border: 'none' }}
                            onClick={async () => {
                              try {
                                await assignFaceToCluster(id, face.id, face.suggested_cluster_id);
                                loadClusters();
                                loadUnassignedFaces();
                              } catch (err) {
                                alert('Failed to assign suggested face.');
                              }
                            }}
                          >
                            ✨ Match: {clusters.find(c => c.id === face.suggested_cluster_id).name}
                          </button>
                        )}

                        {/* Assign to existing cluster */}
                        {clusters.length > 0 && (
                          <select 
                            className="form-input"
                            defaultValue=""
                            onChange={async (e) => {
                              if (!e.target.value) return;
                              try {
                                await assignFaceToCluster(id, face.id, parseInt(e.target.value));
                                loadClusters();
                                loadUnassignedFaces();
                              } catch (err) {
                                alert('Failed to assign face.');
                              }
                            }}
                            style={{ padding: '6px 8px', fontSize: 12, marginBottom: 6 }}
                          >
                            <option value="">Assign to existing...</option>
                            {clusters.map(c => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.face_count} faces)
                              </option>
                            ))}
                          </select>
                        )}
                        
                        {/* Create new cluster */}
                        <button 
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', justifyContent: 'center', fontSize: 11.5 }}
                          onClick={async () => {
                            const name = prompt('Name for this person (or leave empty):');
                            if (name === null) return;
                            try {
                              await createClusterFromFace(id, face.id, name || '');
                              loadClusters();
                              loadUnassignedFaces();
                            } catch (err) {
                              alert('Failed to create cluster.');
                            }
                          }}
                        >
                          + New Identity
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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

      {/* Cluster Detail Modal */}
      {(isModalOpen || selectedCluster) && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          opacity: isModalOpen ? 1 : 0,
          visibility: selectedCluster ? 'visible' : 'hidden',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backdropFilter: 'blur(4px)'
        }} onClick={handleCloseModal}>
          <div 
            style={{
              background: 'var(--bg-card)',
              width: '90%',
              maxWidth: 900,
              maxHeight: '85vh',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              flexDirection: 'column',
              transform: isModalOpen ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 600 }}>{selectedCluster?.name || 'Identity Group'}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>ID: #{selectedCluster?.id} &middot; {selectedCluster?.face_count} faces matched together</p>
              </div>
              <button 
                onClick={handleCloseModal}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', fontSize: 20, cursor: 'pointer', color: 'var(--text-primary)', width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
              >×</button>
            </div>
            
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, background: 'var(--bg-tertiary)' }}>
              {loadingClusterFaces ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading faces...</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 }}>
                  {selectedClusterFaces.map(face => (
                    <div key={face.id} style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--bg-card)', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                      <img 
                        src={`${API_BASE}/files/${project?.name.replace(/ /g, "_").toLowerCase()}/faces/face_${face.id}.jpg`}
                        alt={`Face #${face.id}`}
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div style={{ padding: '8px 10px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>#{face.id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text-secondary)' }} title="Cluster Membership Confidence">
                            {Math.round(face.cluster_confidence * 100)}%
                          </span>
                          <button 
                            onClick={() => handleDeleteFace(face.id, true)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: 13 }}
                            title="Delete Face Crop"
                          >🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
