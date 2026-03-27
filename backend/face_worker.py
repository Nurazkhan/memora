import os
import sqlite3
import numpy as np
import cv2
from pathlib import Path
import hdbscan

from database import get_connection

# Lazy load InsightFace to avoid blocking server startup or memory issues
_face_app = None

def get_face_app():
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis
        # buffalo_l includes detection, alignment, gender/age, and recognition (ArcFace 512D)
        _face_app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection', 'alignment', 'recognition'])
        # ctx_id=-1 forces CPU to avoid CUDA errors out of the box on Windows. 
        _face_app.prepare(ctx_id=-1, det_size=(640, 640))
    return _face_app

def process_project_faces(project_id: int, project_dir: str):
    """
    Background worker that:
    1. Detects faces in all unprocessed images using InsightFace.
    2. Applies strict quality gating (size, blur, pose, confidence).
    3. Extracts ArcFace embeddings and saves crops.
    4. Runs HDBSCAN clustering over all valid embeddings.
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
        
        # Load the deep learning model
        app = get_face_app()
        
        for img_row in images:
            img_id = img_row["id"]
            img_path = img_row["original_path"]
            
            try:
                img_cv = cv2.imread(img_path)
                if img_cv is None: continue
                
                # InsightFace detection + alignment + embedding in one pass
                faces = app.get(img_cv)
                
                for face in faces:
                    # 1. Detector Confidence Gate
                    det_score = float(face.det_score)
                    if det_score < 0.60:
                        continue
                        
                    # Bounding Box
                    bbox = face.bbox.astype(int)
                    x1, y1, x2, y2 = bbox
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(img_cv.shape[1], x2), min(img_cv.shape[0], y2)
                    w, h = x2 - x1, y2 - y1
                    
                    # 2. Minimum Face Size Gate (e.g. 40x40)
                    if w < 40 or h < 40:
                        continue
                        
                    # Extract face crop
                    face_crop = img_cv[y1:y2, x1:x2]
                    if face_crop.size == 0: continue
                    
                    # 3. Blur / Sharpness Gate
                    face_gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
                    sharpness = float(cv2.Laplacian(face_gray, cv2.CV_64F).var())
                    # Adaptive/strict blur threshold
                    if sharpness < 100.0:
                        continue
                        
                    face_size = w * h
                    
                    # 4. Pose Gate (pitch, yaw, roll)
                    pitch, yaw, roll = 0.0, 0.0, 0.0
                    if face.pose is not None:
                        pitch, yaw, roll = face.pose
                        if abs(yaw) > 45 or abs(pitch) > 45:
                            continue
                        
                    # Ensure embedding exists and is normalized
                    embedding = face.normed_embedding
                    if embedding is None:
                        continue
                        
                    # Save DB record
                    cursor.execute(
                        """
                        INSERT INTO faces (
                            image_id, project_id, bbox_x, bbox_y, bbox_w, bbox_h, 
                            sharpness, face_size, detector_confidence, 
                            pose_pitch, pose_yaw, pose_roll
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (img_id, project_id, int(x1), int(y1), int(w), int(h), 
                         sharpness, int(face_size), det_score, 
                         float(pitch), float(yaw), float(roll))
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
    Cluster all faces for a project using HDBSCAN on ArcFace embeddings.
    HDBSCAN naturally rejects noise (label -1) and supports soft membership scores.
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
            
    if not embeddings or len(embeddings) < 2:
        return
        
    X = np.array(embeddings)
    
    # ArcFace embeddings are already L2 normalized, but we ensure it just in case
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1
    X = X / norms
    
    # Run HDBSCAN
    # min_cluster_size=5 ensures we only group if we have enough confident matches
    # min_samples=2 or 3 makes it conservative about joining clusters.
    # metric='euclidean' works well on L2-normalized vectors (proportional to cosine distance)
    # allow_single_cluster is useful if all faces are actually the same person
    try:
        clusterer = hdbscan.HDBSCAN(min_cluster_size=min(5, len(X)), min_samples=2, metric='euclidean', allow_single_cluster=True)
        clusterer.fit(X)
        labels = clusterer.labels_
        probabilities = clusterer.probabilities_
    except Exception as e:
        print(f"HDBSCAN clustering failed: {e}")
        return

    cursor = conn.cursor()
    
    # First, clear existing clusters
    cursor.execute("UPDATE faces SET cluster_id = NULL, cluster_confidence = 0.0 WHERE project_id = ?", (project_id,))
    cursor.execute("DELETE FROM clusters WHERE project_id = ?", (project_id,))
    
    # Group by label
    label_to_face_info = {}
    for face_id, label, prob in zip(face_ids, labels, probabilities):
        if label == -1:
            # Noise / Uncertain face - leave cluster_id as NULL
            cursor.execute("UPDATE faces SET cluster_confidence = ? WHERE id = ?", (float(prob), face_id))
            continue
            
        if label not in label_to_face_info:
            label_to_face_info[label] = []
        label_to_face_info[label].append((face_id, float(prob)))
    
    cluster_idx = 0
    # Create clusters for grouped faces
    for label, face_infos in label_to_face_info.items():
        # Representative face is the one with highest sharpness and size
        ids = [fi[0] for fi in face_infos]
        
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
                    
        # Calculate average cluster confidence
        avg_confidence = sum([fi[1] for fi in face_infos]) / len(face_infos) if face_infos else 0.0
                    
        cursor.execute(
            "INSERT INTO clusters (project_id, name, face_count, representative_face_id, confidence) VALUES (?, ?, ?, ?, ?)",
            (project_id, f"Cluster {cluster_idx + 1}", len(ids), rep_face_id, float(avg_confidence))
        )
        cluster_id = cursor.lastrowid
        cluster_idx += 1
        
        # Update faces
        for (fid, prob) in face_infos:
            cursor.execute("UPDATE faces SET cluster_id = ?, cluster_confidence = ? WHERE id = ?", (cluster_id, float(prob), fid))
            
    conn.commit()
