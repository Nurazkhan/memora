import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  getProject, uploadImages, getProjectImages, uploadStudentList, 
  getStudents, createStudent, updateStudent, deleteStudent, 
  startProcessing, getClusters, assignClusterName, getProgress, 
  getUnassignedFaces, assignFaceToCluster, createClusterFromFace, 
  deleteImage, deleteCluster, deleteFace, getClusterFaces,
  unassignFace, getImage, exportAlbumPdf
} from '../api/client';
import Dropzone from '../components/Dropzone';
import AlbumGenModal from '../components/modals/AlbumGenModal';
import PhotoPreviewSidebar from '../components/editor/PhotoPreviewSidebar';
import HTMLFlipBook from 'react-pageflip';

const API_BASE = 'http://127.0.0.1:8599';

const BookPage = React.forwardRef((props, ref) => {
  return (
    <div className="page" ref={ref} style={{ ...props.style, backgroundColor: 'white', overflow: 'hidden', boxShadow: 'inset 0 0 20px rgba(0,0,0,0.02)' }}>
      {props.children}
    </div>
  );
});

function FullImageOverlay({ image, onClose }) {
  if (!image) return null;
  return (
    <div 
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.9)', zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40, cursor: 'zoom-out'
      }}
      onClick={onClose}
    >
      <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%' }} onClick={e => e.stopPropagation()}>
        <img 
          src={image.url} 
          alt={image.filename}
          style={{ maxWidth: '100vw', maxHeight: '90vh', objectFit: 'contain', boxShadow: '0 0 50px rgba(0,0,0,0.5)' }}
        />
        <div style={{ position: 'absolute', top: -40, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', color: 'white' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{image.filename}</span>
          <button 
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer' }}
          >×</button>
        </div>
      </div>
    </div>
  );
}

function UnassignedFaceCard({ face, project, clusters, projectId, onRefresh, onDelete, onViewImage }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creatingIdentity, setCreatingIdentity] = useState(false);
  const [identityName, setIdentityName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (creatingIdentity && inputRef.current) {
      setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 100);
    }
  }, [creatingIdentity]);

  const handleCreate = async () => {
    const finalName = identityName.trim() || 'Unknown';
    if (!identityName.trim() && !window.confirm("Create identity without a name?")) return;
    
    setLoading(true); setError(null);
    try {
      await createClusterFromFace(projectId, face.id, finalName);
      onRefresh(); // Refresh the parent (this card will unmount since it's no longer unassigned)
    } catch (err) {
      setError('API Error: Failed to create identity');
      setLoading(false);
    }
  };

  const handleAssign = async (clusterId) => {
    if (!clusterId) return;
    setLoading(true); setError(null);
    try {
      await assignFaceToCluster(projectId, face.id, clusterId);
      onRefresh(); // Refresh the parent
    } catch (err) {
      setError('API Error: Failed to assign face');
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ padding: 12 }}>
      <div 
        style={{ 
          width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-sm)', 
          background: 'var(--bg-tertiary)', overflow: 'hidden', marginBottom: 10,
          cursor: 'zoom-in' 
        }}
        onClick={() => onViewImage(face)}
      >
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
          onClick={onDelete}
          style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}
          title="Drop face"
        >🗑️</button>
      </div>

      {loading ? (
        <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          <span className="spinner" style={{ marginRight: 8, width: 14, height: 14, borderWidth: 2 }}></span> Working...
        </div>
      ) : (
        <>
          {error && <div style={{ color: 'var(--danger)', fontSize: 11, marginBottom: 8 }}>{error}</div>}

          {/* Suggested Match */}
          {face.suggested_cluster_id && clusters.find(c => c.id === face.suggested_cluster_id) && (
            <button
              className="btn"
              style={{ width: '100%', marginBottom: 6, fontSize: 11.5, background: 'var(--primary)', color: 'white', border: 'none' }}
              onClick={() => handleAssign(face.suggested_cluster_id)}
            >
              ✨ Match: {clusters.find(c => c.id === face.suggested_cluster_id).name}
            </button>
          )}

          {/* Assign to existing cluster */}
          {clusters.length > 0 && (
            <select 
              className="form-input"
              value={""}
              onChange={(e) => handleAssign(parseInt(e.target.value))}
              style={{ padding: '6px 8px', fontSize: 12, marginBottom: 6 }}
            >
              <option value="" disabled>Assign to existing...</option>
              {clusters.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.face_count} faces)
                </option>
              ))}
            </select>
          )}
          
          {/* Create new cluster */}
          {creatingIdentity ? (
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input 
                ref={inputRef}
                className="form-input"
                style={{ flex: 1, padding: '4px 6px', fontSize: 11 }}
                placeholder="Name..."
                value={identityName}
                onChange={e => setIdentityName(e.target.value)}
                onKeyDown={e => { if(e.key === 'Enter') handleCreate() }}
              />
              <button className="btn btn-primary btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={handleCreate}>Save</button>
              <button className="btn btn-secondary btn-sm" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => {setCreatingIdentity(false); setIdentityName('');}}>✕</button>
            </div>
          ) : (
            <button 
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', justifyContent: 'center', fontSize: 11.5 }}
              onClick={() => { setCreatingIdentity(true); setIdentityName(''); }}
            >
              + New Identity
            </button>
          )}
        </>
      )}
    </div>
  );
}

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
  const newStudentRef = useRef(null);

  useEffect(() => {
    if (showNewRow && newStudentRef.current) {
      setTimeout(() => { if (newStudentRef.current) newStudentRef.current.focus(); }, 100);
    }
  }, [showNewRow]);
  
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
  const [exportingAlbum, setExportingAlbum] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [showGenModal, setShowGenModal] = useState(false);
  
  const [pickingPhotoFor, setPickingPhotoFor] = useState(null);
  const [hoverPreviewImage, setHoverPreviewImage] = useState(null);
  const [albumViewMode, setAlbumViewMode] = useState('grid');
  const [photosSearch, setPhotosSearch] = useState('');
  const [photosSort, setPhotosSort] = useState('date');
  const [clustersSearch, setClustersSearch] = useState('');
  const [clustersSort, setClustersSort] = useState('count');
  const [studentsSearch, setStudentsSearch] = useState('');
  const [studentsSort, setStudentsSort] = useState('name');

  const projectSlug = (project?.name || '').replace(/ /g, "_").toLowerCase();

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
    if (activeTab === 'album') loadImages();
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

  async function handleViewFaceImage(face) {
    try {
      const res = await getImage(id, face.image_id);
      const imgData = res.data;
      // Construct URL. e.g. "projects_data/test/originals/abc.jpg" 
      const relPath = imgData.original_path.replace(/\\/g, '/').split('/projects_data/')[1];
      setViewingImage({
        url: `${API_BASE}/files/${relPath}`,
        filename: imgData.filename
      });
    } catch (err) {
      console.error('Failed to load full image:', err);
    }
  }

  async function handleUnassignFace(faceId) {
    if (!window.confirm('Remove this face from this identity group? It will return to the review queue.')) return;
    try {
      await unassignFace(id, faceId);
      if (selectedCluster) {
        handleOpenClusterModal(selectedCluster);
        loadClusters();
      } else {
        loadUnassignedFaces();
      }
    } catch (err) {
      console.error('Failed to unassign face:', err);
      alert('Failed to unassign face.');
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

  const getOriginalImageUrl = (photo) => {
    const fileName =
      photo?.disk_filename ||
      (photo?.original_path || photo?.image_original || '').split(/[\\/]/).pop() ||
      photo?.filename ||
      '';
    return fileName ? `${API_BASE}/files/${projectSlug}/originals/${fileName}` : '';
  };

  const openImagePicker = (pIdx, itemIdx) => {
    setPickingPhotoFor({ pIdx, itemIdx });
    setHoverPreviewImage(null);
  };

  async function handleExportAlbum() {
    if (albumPages.length === 0) return;

    setExportingAlbum(true);
    try {
      const res = await exportAlbumPdf(id, { pages: albumPages });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectSlug || 'album'}_draft.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export album:', err);
      alert('Failed to export the current album draft.');
    } finally {
      setExportingAlbum(false);
    }
  }

  const renderTemplateFrame = (item, idx, itemIdx) => {
    const basePhoto = item?.target_photo;
    const isTarget = pickingPhotoFor && pickingPhotoFor.pIdx === idx && pickingPhotoFor.itemIdx === itemIdx;
    const displayPhoto = isTarget && hoverPreviewImage ? hoverPreviewImage : basePhoto;
    const imageUrl = displayPhoto ? getOriginalImageUrl(displayPhoto) : '';
    const frameShape = item?.shape === 'circle' ? '50%' : 12;

    return (
      <div
        key={item?.id || `${idx}-${itemIdx}`}
        style={{
          position: 'absolute',
          left: `${(item?.x || 0) * 100}%`,
          top: `${(item?.y || 0) * 100}%`,
          width: `${(item?.width || 0) * 100}%`,
          height: `${(item?.height || 0) * 100}%`,
          zIndex: item?.type === 'text' ? 4 : 2,
          transform: `rotate(${item?.rotation || 0}deg)`,
          opacity: item?.opacity ?? 1,
        }}
      >
        {item?.type === 'frame' ? (
          <button
            type="button"
            onClick={() => openImagePicker(idx, itemIdx)}
            style={{
              width: '100%',
              height: '100%',
              padding: 0,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: frameShape,
              overflow: 'hidden',
              boxShadow: '0 10px 24px rgba(15,23,42,0.12)',
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Album slot"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  transition: 'transform 120ms ease, filter 120ms ease',
                  filter: isTarget && hoverPreviewImage ? 'saturate(1.05)' : 'none',
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, #e5e7eb, #cbd5e1)',
                  color: '#475569',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Add photo
              </div>
            )}
          </button>
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                item?.align === 'right' ? 'flex-end' : item?.align === 'center' ? 'center' : 'flex-start',
              textAlign: item?.align || 'left',
              fontSize: `${Math.max(10, (item?.font_size || item?.fontSize || 16) / 4)}px`,
              color: item?.fill || '#111827',
              fontWeight: 700,
              padding: 6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {item?.resolved_content || item?.content || ''}
          </div>
        )}
      </div>
    );
  };

  const renderAlbumPageContent = (page, idx) => {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', backgroundColor: '#ffffff', overflow: 'hidden' }}>
        {page?.background && (
          <img 
            src={`${API_BASE}/files/templates_assets/${page.background.split(/[\\/]/).pop()}`}
            alt="Page Background"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ position: 'relative', zIndex: 2, height: '100%', padding: page?.type === 'template_page' ? 0 : '40px' }}>
                  
        {page?.type === 'individual' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, height: '100%' }}>
            {(page?.items || []).map(item => (
              <div key={item?.student_id || Math.random()} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ 
                  flex: 1, background: '#e0e0e8', overflow: 'hidden', position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}>
                  {item?.face_thumb && (
                    <img 
                      src={`${API_BASE}/files/${(project?.name || '').replace(/ /g, "_").toLowerCase()}/faces/face_${item?.face_id}.jpg`}
                      alt={item?.student_name || 'Student'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onClick={() => handleViewFaceImage({ image_id: item?.image_id })}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                </div>
                <div style={{ textAlign: 'center', marginTop: 12, padding: '8px 0', background: 'white', color: '#1a1a28', fontWeight: 600, fontSize: 13, borderBottom: '2px solid var(--accent)' }}>
                  {item?.student_name || 'Unknown'}
                </div>
              </div>
            ))}
          </div>
        )}

        {page?.type === 'group' && (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {(page?.items || []).map((item, i) => (
              <div key={i} style={{ width: '80%', height: '80%', background: '#e0e0e8', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', position: 'relative' }}>
                {item?.image_original && (
                  <img 
                    src={getOriginalImageUrl(item)}
                    alt="Group"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => setViewingImage({
                      url: getOriginalImageUrl(item),
                      filename: "Group Photo"
                    })}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', color: 'white' }}>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>Featuring: {item?.metadata || 'Unknown'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {page?.type === 'template_page' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
             {(page?.items || []).map((item, itemIdx) => renderTemplateFrame(item, idx, itemIdx))}
          </div>
        )}
        </div>
      </div>
    );
  };

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Gallery ({images.length})</h3>
              <input type="text" className="form-input" placeholder="Search filename..." value={photosSearch} onChange={e => setPhotosSearch(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, width: 160 }} />
              <select className="form-input" value={photosSort} onChange={e => setPhotosSort(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
              </select>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadImages}>Refresh</button>
          </div>
          {images.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <div className="empty-state-text">No photos uploaded yet.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {images
                 .filter(img => (img.filename || '').toLowerCase().includes(photosSearch.toLowerCase()))
                 .sort((a,b) => {
                    if (photosSort === 'name') return (a.filename || '').localeCompare(b.filename || '');
                    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                 })
                 .map(img => {
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Students ({students.length})</h3>
              <input type="text" className="form-input" placeholder="Search students..." value={studentsSearch} onChange={e => setStudentsSearch(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, width: 160 }} />
              <select className="form-input" value={studentsSort} onChange={e => setStudentsSort(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                <option value="name">Sort by Name</option>
                <option value="number">Sort by Number</option>
              </select>
            </div>
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
                  {students.filter(s => (s.name || '').toLowerCase().includes(studentsSearch.toLowerCase()) || (s.student_number || '').includes(studentsSearch))
                    .sort((a,b) => {
                      if (studentsSort === 'name') return (a.name || '').localeCompare(b.name || '');
                      if (studentsSort === 'number') return (a.student_number || '').localeCompare(b.student_number || '');
                      return 0;
                    }).map(s => (
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
                          ref={newStudentRef}
                          className="form-input"
                          value={newStudentForm.name}
                          onChange={e => setNewStudentForm(f => ({ ...f, name: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddStudent(); if (e.key === 'Escape') { setShowNewRow(false); setNewStudentForm({ name: '', class_name: '', student_number: '' }); } }}
                          placeholder="New student name..."
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

      <datalist id="student_identities_list">
        {students.map(s => <option key={s.id} value={s.name} />)}
      </datalist>

      {activeTab === 'faces' && (
        <div>
          {/* Auto-Clustered Identities */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>Auto-Clustered Identities ({clusters.length})</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>High-confidence identity groups detected automatically</p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input type="text" className="form-input" placeholder="Search identities..." value={clustersSearch} onChange={e => setClustersSearch(e.target.value)} style={{ padding: '6px 10px', fontSize: 12, width: 180 }} />
              <select className="form-input" value={clustersSort} onChange={e => setClustersSort(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }}>
                <option value="count">Sort by Face Count</option>
                <option value="name">Sort by Name</option>
                <option value="confidence">Sort by Confidence</option>
              </select>
              <button className="btn btn-secondary btn-sm" onClick={() => { loadClusters(); loadUnassignedFaces(); }}>Refresh</button>
            </div>
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
                  {clusters.filter(c => (c.name || 'Unknown').toLowerCase().includes(clustersSearch.toLowerCase())).sort((a,b) => {
                    if (clustersSort === 'count') return b.face_count - a.face_count;
                    if (clustersSort === 'name') return (a.name || 'Unknown').localeCompare(b.name || 'Unknown');
                    if (clustersSort === 'confidence') return (b.confidence || 0) - (a.confidence || 0);
                    return 0;
                  }).map(cluster => (
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
                          list="student_identities_list"
                          type="text" 
                          className="form-input" 
                          placeholder="Enter name..."
                          defaultValue={cluster.name.startsWith("Cluster") ? "" : cluster.name}
                          onPointerDown={(e) => { e.currentTarget.focus(); }}
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
                      <UnassignedFaceCard 
                        key={face.id}
                        face={face}
                        project={project}
                        clusters={clusters}
                        projectId={id}
                        onRefresh={() => {
                          loadClusters();
                          loadUnassignedFaces();
                        }}
                        onDelete={() => handleDeleteFace(face.id, false)}
                        onViewImage={handleViewFaceImage}
                      />
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
              {albumPages.length > 0 && (
                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: 4 }}>
                  <button 
                    style={{ 
                      padding: '8px 16px', background: albumViewMode === 'grid' ? 'white' : 'transparent', 
                      border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      boxShadow: albumViewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: albumViewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onClick={() => setAlbumViewMode('grid')}
                  >Grid Editor</button>
                  <button 
                    style={{ 
                      padding: '8px 16px', background: albumViewMode === 'book' ? 'white' : 'transparent', 
                      border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      boxShadow: albumViewMode === 'book' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', color: albumViewMode === 'book' ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onClick={() => setAlbumViewMode('book')}
                  >Book Preview</button>
                </div>
              )}
              <button 
                className="btn btn-secondary" 
                onClick={handleExportAlbum}
                disabled={albumPages.length === 0 || exportingAlbum}
              >
                {exportingAlbum ? 'Exporting...' : 'Export PDF'}
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setShowGenModal(true)}
                disabled={generatingAlbum}
              >
                {generatingAlbum ? 'Building...' : (albumPages.length > 0 ? '🛠️ Re-design Layout' : '🛠️ Design & Generate Album')}
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
              <div style={{ width: '100%', maxWidth: 1180, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Grid Editor is for editing</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Replace photos in grid mode. Book preview is read-only so the album does not keep flipping while you edit.
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{albumPages.length} pages</div>
              </div>
              {albumViewMode === 'book' ? (
                <div style={{ width: '100%', maxWidth: 1000, margin: '20px auto', display: 'flex', justifyContent: 'center' }}>
                  <HTMLFlipBook 
                    width={500} 
                    height={707} 
                    size="stretch"
                    minWidth={315}
                    maxWidth={1000}
                    minHeight={400}
                    maxHeight={1414}
                    showCover={true}
                    maxShadowOpacity={0.5}
                    className="custom-flipbook"
                    style={{ boxShadow: 'var(--shadow-2xl)', borderRadius: 4, margin: '0 auto' }}
                    disableFlipByClick={true}
                    mobileScrollSupport={false}
                  >
                    {albumPages.map((page, idx) => (
                      <BookPage key={idx}>
                         {renderAlbumPageContent(page, idx)}
                      </BookPage>
                    ))}
                  </HTMLFlipBook>
                </div>
              ) : (
                <div style={{ width: '100%', display: 'grid', gap: 28 }}>
                  {albumPages.map((page, idx) => (
                    <div key={idx} style={{ width: '100%', maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18, alignItems: 'start' }}>
                      <div className="card" style={{ padding: 18 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Page {idx + 1}</div>
                        <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700 }}>
                          {page?.orientation === 'portrait' ? 'Portrait layout' : 'Landscape layout'}
                        </div>
                        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {(page?.items || []).filter((item) => item?.type === 'frame').length} replaceable photo slots
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ width: '100%', marginTop: 16 }}
                          onClick={() => {
                            const firstFrameIndex = (page?.items || []).findIndex((item) => item?.type === 'frame');
                            if (firstFrameIndex >= 0) openImagePicker(idx, firstFrameIndex);
                          }}
                          disabled={(page?.items || []).findIndex((item) => item?.type === 'frame') < 0}
                        >
                          Replace Photos
                        </button>
                      </div>

                      <div style={{ 
                        width: '100%', maxWidth: '900px', 
                        aspectRatio: page?.orientation === 'portrait' ? '0.707' : '1.414',
                        background: 'white',
                        boxShadow: 'var(--shadow-lg)',
                        borderRadius: 'var(--radius-sm)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        {renderAlbumPageContent(page, idx)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                        onClick={() => handleViewFaceImage(face)}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div style={{ padding: '8px 10px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>#{face.id}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button 
                            onClick={() => handleUnassignFace(face.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, fontSize: 13 }}
                            title="Remove from this identity (return to queue)"
                          >↩️</button>
                          <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
                            {Math.round(face.cluster_confidence * 100)}%
                          </span>
                          <button 
                            onClick={() => handleDeleteFace(face.id, true)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: 13 }}
                            title="Delete Face Crop Permanently"
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

      {/* Full Image Overlay */}
      <FullImageOverlay image={viewingImage} onClose={() => setViewingImage(null)} />

      {showGenModal && (
        <AlbumGenModal 
          projectId={id} 
          onClose={() => setShowGenModal(false)}
          onGenerated={(result) => {
            setAlbumPages(result);
            loadProject();
          }}
        />
      )}

      <PhotoPreviewSidebar
        isOpen={!!pickingPhotoFor}
        projectId={id}
        project={project}
        images={images}
        currentImage={pickingPhotoFor ? albumPages?.[pickingPhotoFor.pIdx]?.items?.[pickingPhotoFor.itemIdx]?.target_photo : null}
        slotContext={pickingPhotoFor ? albumPages?.[pickingPhotoFor.pIdx]?.items?.[pickingPhotoFor.itemIdx]?.recommendation_context : null}
        onClose={() => { setPickingPhotoFor(null); setHoverPreviewImage(null); }}
        onHoverImage={(img) => setHoverPreviewImage(img)}
        onLeaveImage={() => setHoverPreviewImage(null)}
        onSelectImage={(newImage) => {
          if (!pickingPhotoFor) return;
          const newPages = [...albumPages];
          const pathParts = (newImage.original_path || '').replace(/\\/g, '/').split('/');
          const diskFilename = pathParts[pathParts.length - 1] || newImage.filename;
          newPages[pickingPhotoFor.pIdx].items[pickingPhotoFor.itemIdx].target_photo = {
            ...newImage,
            disk_filename: diskFilename
          };
          setAlbumPages(newPages);
          setPickingPhotoFor(null);
          setHoverPreviewImage(null);
        }}
      />
    </div>
  );
}
