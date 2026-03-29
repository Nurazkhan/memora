import os
import sqlite3
import numpy as np
import cv2
from pathlib import Path
import hdbscan
import faiss

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
    Open-Set Identity Dual-Layer Pipeline:
    Stage 1: FAISS Verified Gallery Matching (High precision NN search)
    Stage 2: HDBSCAN Discovery (Grouping remaining unassigned faces)
    Stage 3: Cluster Merging & Validation
    """
    HIGH_THRESHOLD = 0.65
    LOW_THRESHOLD = 0.50

    cursor = conn.cursor()

    # Clear OLD unverified clusters. (We keep verified ones to build the gallery!)
    # First, detach faces from unverified clusters
    cursor.execute(
        "UPDATE faces SET cluster_id = NULL, cluster_confidence = 0.0, suggested_cluster_id = NULL WHERE project_id = ? AND cluster_id IN (SELECT id FROM clusters WHERE is_verified = 0)",
        (project_id,)
    )
    # Delete the unverified clusters themselves
    cursor.execute("DELETE FROM clusters WHERE project_id = ? AND is_verified = 0", (project_id,))
    conn.commit()

    # --- GALLERY PREPARATION (FAISS) ---
    verified_clusters = cursor.execute("SELECT id, name FROM clusters WHERE project_id = ? AND is_verified = 1", (project_id,)).fetchall()
    
    gallery_ids = []
    gallery_centroids = []

    if verified_clusters:
        for vc in verified_clusters:
            faces_in_vc = cursor.execute("SELECT embedding_path FROM faces WHERE cluster_id = ?", (vc["id"],)).fetchall()
            vc_embs = []
            for row in faces_in_vc:
                try:
                    vc_embs.append(np.load(row["embedding_path"]))
                except Exception:
                    pass
            if vc_embs:
                # Compute centroid and L2 normalize
                centroid = np.mean(vc_embs, axis=0)
                centroid = centroid / np.linalg.norm(centroid)
                gallery_centroids.append(centroid)
                gallery_ids.append(vc["id"])

    # Create FAISS Index if gallery exists
    faiss_index = None
    if gallery_centroids:
        faiss_index = faiss.IndexFlatIP(512)
        faiss_index.add(np.vstack(gallery_centroids).astype('float32'))

    # --- FETCH ALL UNASSIGNED FACES ---
    unassigned_faces = cursor.execute(
        "SELECT id, embedding_path, sharpness, face_size, detector_confidence FROM faces WHERE project_id = ? AND cluster_id IS NULL",
        (project_id,)
    ).fetchall()

    if not unassigned_faces:
        return

    embeddings = []
    face_ids = []
    face_quality = {}

    for row in unassigned_faces:
        try:
            emb = np.load(row["embedding_path"])
            embeddings.append(emb)
            face_ids.append(row["id"])
            quality = (row["sharpness"] or 0.0) * (row["face_size"] or 0.0) * (row["detector_confidence"] or 0.0)
            face_quality[row["id"]] = quality
        except Exception:
            pass

    if not embeddings:
        return

    X = np.array(embeddings)
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1
    X = X / norms

    # Arrays for HDBSCAN pool
    hdbscan_emb = []
    hdbscan_fids = []

    # --- STAGE 2: FAISS ASSIGNMENT ---
    for i in range(len(face_ids)):
        face_emb = X[i]
        fid = face_ids[i]
        q = face_quality[fid]
        
        # Update baseline quality score
        cursor.execute("UPDATE faces SET quality_score = ? WHERE id = ?", (q, fid))

        assigned = False
        if faiss_index is not None:
            # Query FAISS
            D, I = faiss_index.search(face_emb.astype('float32').reshape(1, -1), 1)
            best_score = D[0][0]
            best_idx = I[0][0]

            if best_score >= HIGH_THRESHOLD:
                # Direct Hit! Assign to gallery.
                hit_cluster_id = gallery_ids[best_idx]
                cursor.execute(
                    "UPDATE faces SET cluster_id = ?, cluster_confidence = ? WHERE id = ?",
                    (hit_cluster_id, float(best_score), fid)
                )
                assigned = True
            elif best_score >= LOW_THRESHOLD:
                # Uncertain Match. Save suggestion but pass to HDBSCAN.
                hit_cluster_id = gallery_ids[best_idx]
                cursor.execute(
                    "UPDATE faces SET suggested_cluster_id = ? WHERE id = ?",
                    (hit_cluster_id, fid)
                )

        if not assigned:
            hdbscan_emb.append(face_emb)
            hdbscan_fids.append(fid)

    conn.commit()

    if len(hdbscan_emb) < 2:
        return

    # --- STAGE 3: HDBSCAN DISCOVERY ---
    X_pool = np.array(hdbscan_emb)
    try:
        n_faces = len(X_pool)
        ms = 3 if n_faces >= 10 else 2
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=2,
            min_samples=ms,
            metric='euclidean',
            allow_single_cluster=False,
            cluster_selection_method='eom',
        )
        clusterer.fit(X_pool)
        labels = clusterer.labels_
        probabilities = clusterer.probabilities_
    except Exception as e:
        print(f"HDBSCAN failed: {e}")
        return

    label_to_face_info = {}
    for fid, label, prob in zip(hdbscan_fids, labels, probabilities):
        if label == -1:
            cursor.execute("UPDATE faces SET cluster_confidence = ? WHERE id = ?", (float(prob), fid))
        else:
            if label not in label_to_face_info:
                label_to_face_info[label] = []
            label_to_face_info[label].append((fid, float(prob)))

    # Compute new cluster centroids for merging phase
    new_clusters_data = {}
    for label, face_infos in label_to_face_info.items():
        ids = [fi[0] for fi in face_infos]
        embs = [hdbscan_emb[hdbscan_fids.index(fid)] for fid in ids]
        centroid = np.mean(embs, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        new_clusters_data[label] = {
            "ids": ids,
            "centroid": centroid,
            "face_infos": face_infos
        }

    # Merge similar new clusters (naive hierarchical fallback)
    merged_labels = set()
    final_clusters = []

    for label_a, data_a in new_clusters_data.items():
        if label_a in merged_labels:
            continue
        
        current_ids = list(data_a["ids"])
        current_infos = list(data_a["face_infos"])
        current_centroid = data_a["centroid"]

        for label_b, data_b in new_clusters_data.items():
            if label_b <= label_a or label_b in merged_labels:
                continue
            
            sim = np.dot(current_centroid, data_b["centroid"])
            if sim >= HIGH_THRESHOLD:
                # Merge!
                current_ids.extend(data_b["ids"])
                current_infos.extend(data_b["face_infos"])
                merged_labels.add(label_b)
                # Recompute centroid (approximate)
                embs = [hdbscan_emb[hdbscan_fids.index(fid)] for fid in current_ids]
                current_centroid = np.mean(embs, axis=0)
                current_centroid = current_centroid / np.linalg.norm(current_centroid)

        final_clusters.append({
            "ids": current_ids,
            "infos": current_infos
        })

    # Save final discovered clusters
    cluster_idx = 0
    for c_data in final_clusters:
        ids = c_data["ids"]
        infos = c_data["infos"]

        rep_face_id = ids[0]
        max_score = -1
        for fid in ids:
            f_row = conn.execute("SELECT sharpness, face_size FROM faces WHERE id = ?", (fid,)).fetchone()
            if f_row:
                score = f_row["sharpness"] * f_row["face_size"]
                if score > max_score:
                    max_score = score
                    rep_face_id = fid

        avg_confidence = sum(fi[1] for fi in infos) / len(infos)

        cursor.execute(
            "INSERT INTO clusters (project_id, name, face_count, representative_face_id, confidence, is_verified) VALUES (?, ?, ?, ?, ?, 0)",
            (project_id, f"Cluster {cluster_idx + 1}", len(ids), rep_face_id, float(avg_confidence))
        )
        cluster_id = cursor.lastrowid
        cluster_idx += 1

        for (fid, prob) in infos:
            cursor.execute("UPDATE faces SET cluster_id = ?, cluster_confidence = ? WHERE id = ?", (cluster_id, float(prob), fid))

    # Update counts for gallery clusters (in case FAISS added faces)
    if verified_clusters:
        for vc in verified_clusters:
            new_count = conn.execute("SELECT COUNT(*) as c FROM faces WHERE cluster_id = ?", (vc["id"],)).fetchone()["c"]
            cursor.execute("UPDATE clusters SET face_count = ? WHERE id = ?", (new_count, vc["id"]))

    conn.commit()

