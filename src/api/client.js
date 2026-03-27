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

// Processing
export const startProcessing = (id) => api.post(`/projects/${id}/process`);
export const getProgress = (id) => api.get(`/projects/${id}/progress`);

// Clusters
export const getClusters = (id) => api.get(`/projects/${id}/clusters`);
export const assignClusterName = (projectId, clusterId, name) =>
  api.put(`/projects/${projectId}/clusters/${clusterId}`, { name });

export default api;
