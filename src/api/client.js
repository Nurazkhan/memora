import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8599';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Health check
export const checkHealth = () => api.get('/health');

// Projects
export const createProject = (data) => api.post('/projects', data);
export const getProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// Images
export const uploadImages = (id, formData, onUploadProgress) => {
  return api.post(`/projects/${id}/images`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    onUploadProgress,
  });
};
export const getProjectImages = (id) => api.get(`/projects/${id}/images`);

// Students
export const uploadStudentList = (id, formData) =>
  api.post(`/projects/${id}/students/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const getStudents = (id) => api.get(`/projects/${id}/students`);
export const createStudent = (id, data) => api.post(`/projects/${id}/students`, data);
export const updateStudent = (id, studentId, data) => api.put(`/projects/${id}/students/${studentId}`, data);
export const deleteStudent = (id, studentId) => api.delete(`/projects/${id}/students/${studentId}`);

// Processing
export const startProcessing = (id) => api.post(`/projects/${id}/process`);
export const getProgress = (id) => api.get(`/projects/${id}/progress`);

// Clusters
export const getClusters = (id) => api.get(`/projects/${id}/clusters`);
export const getClusterFaces = (projectId, clusterId) => api.get(`/projects/${projectId}/clusters/${clusterId}/faces`);
export const assignClusterName = (projectId, clusterId, name) =>
  api.put(`/projects/${projectId}/clusters/${clusterId}`, { name });
export const deleteCluster = (projectId, clusterId) => api.delete(`/projects/${projectId}/clusters/${clusterId}`);

// Review Queue (unassigned faces) & individual face management
export const getUnassignedFaces = (id) => api.get(`/projects/${id}/unassigned-faces`);
export const assignFaceToCluster = (projectId, faceId, clusterId) =>
  api.post(`/projects/${projectId}/faces/${faceId}/assign`, { cluster_id: clusterId });
export const createClusterFromFace = (projectId, faceId, name) =>
  api.post(`/projects/${projectId}/faces/${faceId}/create-cluster`, { name });
export const deleteFace = (projectId, faceId) => api.delete(`/projects/${projectId}/faces/${faceId}`);

// Image Deletion
export const deleteImage = (projectId, imageId) => api.delete(`/projects/${projectId}/images/${imageId}`);

export default api;
