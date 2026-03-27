import os
import sqlite3
import numpy as np
import cv2
from pathlib import Path
from sklearn.cluster import DBSCAN

from database import get_connection

def process_project_faces(project_id: int, project_dir: str):
    """
    Background worker that:
    1. Detects faces in all unprocessed images for the project.
    2. Extracts embeddings.
    3. Saves face crops and embeddings.
    4. Runs clustering algorithms over all embeddings.
    """
    conn = get_connection()
    try:
        # Mark project as processing
        conn.execute("UPDATE projects SET status = 'processing' WHERE id = ?", (project_id,))
        conn.commit()

        # Get all unprocessed images
        images = conn.execute(
            "SELECT id, original_path, filename FROM images WHERE project_id = ? AND processed = 0",
            (project_id,)
        ).fetchall()

        faces_dir = Path(project_dir) / "faces"
        emb_dir = Path(project_dir) / "embeddings"
        faces_dir.mkdir(exist_ok=True)
        emb_dir.mkdir(exist_ok=True)

        cursor = conn.cursor()
        
        # Initialize OpenCV Haarcascade for face detection
        face_cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        face_cascade = cv2.CascadeClassifier(face_cascade_path)
        
        # Initialize HOG descriptor for embedding extraction (flattened to 1D)
        # Using a fixed 64x64 window for faces
        hog = cv2.HOGDescriptor((64, 64), (16, 16), (8, 8), (8, 8), 9)
        
        for img_row in images:
            img_id = img_row["id"]
            img_path = img_row["original_path"]
            
            try:
                img_cv = cv2.imread(img_path)
                if img_cv is None: continue
                gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
                
                # Detect faces
                faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                
                for (x, y, w, h) in faces:
                    # Extract face crop
                    face_crop = img_cv[y:y+h, x:x+w]
                    
                    # Estimate sharpness
                    face_gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
                    sharpness = cv2.Laplacian(face_gray, cv2.CV_64F).var()
                    face_size = w * h
                    
                    # Compute HOG embedding
                    resized_face = cv2.resize(face_crop, (64, 64))
                    embedding = hog.compute(resized_face).flatten()
                    
                    # Save DB record to get face ID
                    cursor.execute(
                        """
                        INSERT INTO faces (image_id, project_id, bbox_x, bbox_y, bbox_w, bbox_h, sharpness, face_size)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (img_id, project_id, int(x), int(y), int(w), int(h), sharpness, int(face_size))
                    )
                    face_id = cursor.lastrowid
                    
                    # Save crop
                    crop_filename = f"face_{face_id}.jpg"
                    crop_path = faces_dir / crop_filename
                    cv2.imwrite(str(crop_path), face_crop)
                    
                    # Save embedding
                    emb_filename = f"emb_{face_id}.npy"
                    emb_path = emb_dir / emb_filename
                    np.save(str(emb_path), np.array(embedding))
                    
                    cursor.execute(
                        "UPDATE faces SET thumbnail_path = ?, embedding_path = ? WHERE id = ?",
                        (str(crop_path), str(emb_path), face_id)
                    )
            
                # Mark image as processed
                cursor.execute("UPDATE images SET processed = 1 WHERE id = ?", (img_id,))
                conn.commit()
                
            except Exception as e:
                print(f"Error processing image {img_path}: {e}")
                
        # --- CLUSTERING PHASE ---
        run_clustering(project_id, conn)
        
        # Mark project as draft/ready
        conn.execute("UPDATE projects SET status = 'draft' WHERE id = ?", (project_id,))
        conn.commit()
        
    except Exception as e:
        print(f"Error in face worker: {e}")
        conn.execute("UPDATE projects SET status = 'error' WHERE id = ?", (project_id,))
        conn.commit()
    finally:
        conn.close()

def run_clustering(project_id: int, conn: sqlite3.Connection):
    """
    Cluster all faces for a project using DBSCAN on their embeddings.
    """
    faces = conn.execute(
        "SELECT id, embedding_path FROM faces WHERE project_id = ?",
        (project_id,)
    ).fetchall()
    
    if not faces:
        return
        
    embeddings = []
    face_ids = []
    
    for row in faces:
        try:
            emb = np.load(row["embedding_path"])
            embeddings.append(emb)
            face_ids.append(row["id"])
        except Exception as e:
            print(f"Failed to load embedding {row['embedding_path']}: {e}")
            
    if not embeddings:
        return
        
    X = np.array(embeddings)
    
    # Normalize embeddings to unit length for cosine-like comparison
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1  # avoid division by zero
    X = X / norms
    
    # Determine optimal number of clusters (K)
    # First, try to count imported students
    student_count_row = conn.execute("SELECT COUNT(*) as c FROM students WHERE project_id = ?", (project_id,)).fetchone()
    student_count = student_count_row["c"] if student_count_row else 0
    
    total_faces = len(embeddings)
    
    if student_count > 0:
        k = min(student_count, total_faces)
    else:
        # Heuristic: roughly 5 photos per person on average
        k = max(2, total_faces // 5)
        k = min(k, total_faces)
        
    if k == 0: k = 1

    from sklearn.cluster import KMeans
    kmeans = KMeans(n_clusters=k, n_init='auto', random_state=42).fit(X)
    labels = kmeans.labels_
    
    cursor = conn.cursor()
    
    # First, clear existing clusters
    cursor.execute("UPDATE faces SET cluster_id = NULL WHERE project_id = ?", (project_id,))
    cursor.execute("DELETE FROM clusters WHERE project_id = ?", (project_id,))
    
    # Group by label
    label_to_face_ids = {}
    for face_id, label in zip(face_ids, labels):
        if label not in label_to_face_ids:
            label_to_face_ids[label] = []
        label_to_face_ids[label].append(face_id)
    
    noise_faces = [] # KMeans doesn't produce noise, but keep var for compatibility
    
    cluster_idx = 0
    # Create clusters for grouped faces
    for label, ids in label_to_face_ids.items():
        # Representative face is the one with highest sharpness and size
        rep_face_id = ids[0]
        max_score = -1
        
        for fid in ids:
            f_row = conn.execute("SELECT sharpness, face_size FROM faces WHERE id = ?", (fid,)).fetchone()
            if f_row:
                # Simple composite score
                score = f_row["sharpness"] * f_row["face_size"]
                if score > max_score:
                    max_score = score
                    rep_face_id = fid
                    
        cursor.execute(
            "INSERT INTO clusters (project_id, name, face_count, representative_face_id) VALUES (?, ?, ?, ?)",
            (project_id, f"Cluster {cluster_idx + 1}", len(ids), rep_face_id)
        )
        cluster_id = cursor.lastrowid
        cluster_idx += 1
        
        # Update faces
        for fid in ids:
            cursor.execute("UPDATE faces SET cluster_id = ? WHERE id = ?", (cluster_id, fid))
    
    # Create individual clusters for noise faces
    for fid in noise_faces:
        cursor.execute(
            "INSERT INTO clusters (project_id, name, face_count, representative_face_id) VALUES (?, ?, ?, ?)",
            (project_id, f"Cluster {cluster_idx + 1}", 1, fid)
        )
        cluster_id = cursor.lastrowid
        cluster_idx += 1
        cursor.execute("UPDATE faces SET cluster_id = ? WHERE id = ?", (cluster_id, fid))
            
    conn.commit()
