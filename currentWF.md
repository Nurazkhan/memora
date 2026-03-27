# Memora: Current Technical Workflow

Memora is a desktop application for photography studios to automate school album creation. This document outlines the technical architecture and the end-to-end data processing workflow.

## 1. Architecture Overview
- **Frontend**: React + Vite + Vanilla CSS (Modern, dark-themed UI).
- **Desktop Wrapper**: Electron.
- **Backend**: Python FastAPI (Uvicorn).
- **Database**: SQLite (managed with a single database file at `backend/data/memora.db`).
- **Processing**: OpenCV + Scikit-Learn (Face detection, HOG embeddings, KMeans clustering).

## 2. Startup & Integration
1. **Electron Main Process**: Launches the backend Python server (`backend/main.py`) on port 8599.
2. **Health Check**: Electron polls `http://127.0.0.1:8599/health` until the backend is responsive before showing the main window.
3. **API Client**: The React frontend uses a unified Axios instance (`src/api/client.js`) to communicate with the FastAPI server.

## 3. Core Data Workflow

### A. Project Management
- Users create projects which are folders in `backend/projects_data/{project_name}/`.
- Metadata is stored in the `projects` table in SQLite.

### B. Image Upload & Processing
1. **Upload**: Images are uploaded via `ProjectView.jsx` (Photos tab) using a custom `Dropzone`.
2. **Backend Storage**: Original images are saved to `originals/`, and 400px thumbnails are generated in `thumbnails/` using PIL.
3. **Face Extraction (Face Worker)**:
    - **Detection**: Uses OpenCV Haarcascades to detect faces in images.
    - **Cropping**: Detected faces are cropped and saved to `faces/`.
    - **Embeddings**: Generates HOG (Histogram of Oriented Gradients) descriptors for each face, saved as `.npy` files in `embeddings/`.
    - **Quality Scoring**: Calculates sharpness (Laplacian variance) and face size to identify the "best" photos later.

### C. Student Import
- Users upload an Excel (`.xlsx`) or CSV file.
- The backend parses the file using `pandas`.
- Raw bytes are wrapped in `io.BytesIO` for safe reading.
- Student data is stored in the `students` table, linked to the project.

### D. Face Clustering (KMeans)
- **Algorithm**: Replaced DBSCAN with `KMeans` to handle high baseline similarity in HOG features.
- **Dynamic K**: The number of clusters `K` is determined by:
    - If students are imported: `K = number of students`.
    - Otherwise: `K = total_faces / 5` (heuristic estimate).
- **Result**: Faces are assigned a `cluster_id`, grouping the same person across different photos.

### E. Album Generation & Layout
1. **Best Photo Selection**: For each cluster/student, the backend picks the face with the highest (sharpness * face_size).
2. **Co-occurrence Analysis**: Analyzes which clusters appear together in the same group photos.
3. **Layout Logic**:
    - **Individual Pages**: 2x2 grid of student portraits.
    - **Group Pages**: Full-page layouts for photos containing multiple recognized students.
4. **PDF Export**: Uses `ReportLab` to render a high-resolution PDF (`landscape(A4)`) which is then served as a download to the frontend.

## 4. Directory Structure (projects_data)
```text
projects_data/
└── {project_name}/
    ├── originals/     # High-res uploaded photos
    ├── thumbnails/    # Small previews for UI
    ├── faces/         # Cropped face images
    └── embeddings/    # Numerical face data (.npy)
```
