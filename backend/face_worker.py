import os
import sqlite3
import numpy as np
import cv2
from pathlib import Path
import networkx as nx
from networkx.algorithms import community
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
                
                # Flipped augmentation for Multi-Embedding robustness
                img_cv_flipped = cv2.flip(img_cv, 1)
                faces_flipped = app.get(img_cv_flipped)
                
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
                        
                    # Generate Multi-Embedding (Average with Flipped Image)
                    emb1 = face.normed_embedding
                    if emb1 is None:
                        continue
                        
                    # Find matched face in flipped image
                    center_x, center_y = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                    expected_flip_x = img_cv.shape[1] - center_x
                    
                    emb2 = None
                    for ff in faces_flipped:
                        ff_x1, ff_y1, ff_x2, ff_y2 = ff.bbox
                        ff_cx, ff_cy = (ff_x1 + ff_x2) / 2.0, (ff_y1 + ff_y2) / 2.0
                        # Match bounding box centers
                        if abs(ff_cx - expected_flip_x) < max(w, h)*0.5 and abs(ff_cy - center_y) < max(w, h)*0.5:
                            emb2 = ff.normed_embedding
                            break
                            
                    if emb2 is not None:
                        final_emb = (emb1 + emb2) / 2.0
                        final_emb = final_emb / np.linalg.norm(final_emb)
                    else:
                        final_emb = emb1
                        
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
                    np.save(str(emb_path), np.array(final_emb))
                    
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
    Stage 2: Graph Cleansing & Hard Negatives
    Stage 3: V2 Graph Clustering (Louvain Community Detection)
    Stage 4: Co-occurrence & Identity Constraints
    """
    HIGH_THRESHOLD = 0.65
    LOW_THRESHOLD = 0.50

    cursor = conn.cursor()

    # Clear OLD unverified clusters. (We keep verified ones to build the gallery!)
    cursor.execute(
        "UPDATE faces SET cluster_id = NULL, cluster_confidence = 0.0, suggested_cluster_id = NULL WHERE project_id = ? AND cluster_id IN (SELECT id FROM clusters WHERE is_verified = 0)",
        (project_id,)
    )
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

    # Load hard negatives (Never Merge constraint)
    hard_negatives = cursor.execute("SELECT face_id_a, face_id_b FROM hard_negatives WHERE project_id = ?", (project_id,)).fetchall()
    hard_negative_pairs = set()
    for r in hard_negatives:
        hard_negative_pairs.add((r["face_id_a"], r["face_id_b"]))
        hard_negative_pairs.add((r["face_id_b"], r["face_id_a"]))

    # --- FETCH ALL UNASSIGNED FACES ---
    unassigned_faces = cursor.execute(
        "SELECT id, image_id, embedding_path, sharpness, face_size, detector_confidence FROM faces WHERE project_id = ? AND cluster_id IS NULL",
        (project_id,)
    ).fetchall()

    if not unassigned_faces:
        return

    embeddings = []
    face_ids = []
    face_quality = {}
    face_image_id = {}

    for row in unassigned_faces:
        try:
            emb = np.load(row["embedding_path"])
            embeddings.append(emb)
            fid = row["id"]
            face_ids.append(fid)
            quality = (row["sharpness"] or 0.0) * (row["face_size"] or 0.0) * (row["detector_confidence"] or 0.0)
            face_quality[fid] = quality
            face_image_id[fid] = row["image_id"]
        except Exception:
            pass

    if not embeddings:
        return

    X = np.array(embeddings)
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1
    X = X / norms

    graph_emb = []
    graph_fids = []

    # --- STAGE 2: FAISS ASSIGNMENT ---
    for i in range(len(face_ids)):
        face_emb = X[i]
        fid = face_ids[i]
        q = face_quality[fid]
        
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
                # Uncertain Match. Save suggestion but pass to Discovery Graph.
                hit_cluster_id = gallery_ids[best_idx]
                cursor.execute(
                    "UPDATE faces SET suggested_cluster_id = ? WHERE id = ?",
                    (hit_cluster_id, fid)
                )

        if not assigned:
            graph_emb.append(face_emb)
            graph_fids.append(fid)

    conn.commit()

    if len(graph_emb) < 2:
        return

    # --- STAGE 3-5: V2 IDENTITY GRAPH ---
    G = nx.Graph()
    for fid in graph_fids:
        G.add_node(fid)
        
    X_graph = np.array(graph_emb)
    # Fast dense pairwise similarity matrix
    similarity_matrix = np.dot(X_graph, X_graph.T)
    
    n_nodes = len(graph_fids)
    for i in range(n_nodes):
        fid_a = graph_fids[i]
        img_a = face_image_id[fid_a]
        
        for j in range(i + 1, n_nodes):
            fid_b = graph_fids[j]
            img_b = face_image_id[fid_b]
            sim = float(similarity_matrix[i, j])
            
            # STAGE 5 / STAGE 6: Co-occurrence Intelligence & Hard Negatives
            if img_a == img_b:
                if sim >= (HIGH_THRESHOLD - 0.05):
                    # Hard Negative Mining: High visual similarity but in same photo. Must be twins/lookalikes.
                    cursor.execute("INSERT OR IGNORE INTO hard_negatives (project_id, face_id_a, face_id_b) VALUES (?, ?, ?)", 
                                   (project_id, min(fid_a, fid_b), max(fid_a, fid_b)))
                continue # STRICT CONSTRAINT: Edge weight = 0 (prohibited)
                
            # Check hard negative table constraint
            if (fid_a, fid_b) in hard_negative_pairs:
                continue
                
            if sim >= LOW_THRESHOLD:
                # Add valid social connection
                G.add_edge(fid_a, fid_b, weight=sim)
                
    conn.commit()
    
    # --- STAGE 4: GRAPH CLUSTERING (LOUVAIN) ---
    communities = []
    try:
        if len(G.edges) > 0:
            # Resolution > 1 isolates smaller tighter cliques (better for faces)
            communities = community.louvain_communities(G, weight='weight', resolution=1.05)
        else:
            communities = [{n} for n in G.nodes]
    except Exception as e:
        print(f"Graph clustering failed: {e}")
        communities = [{n} for n in G.nodes]
        
    # --- STAGE 7: CLUSTER VALIDATION & SAVING ---
    cluster_idx = 0
    for comm in communities:
        if len(comm) < 2:
            continue # Leave singletons unassigned
            
        ids = list(comm)
        # Compute dynamic centroid
        comm_embs = [graph_emb[graph_fids.index(fid)] for fid in ids]
        centroid = np.mean(comm_embs, axis=0)
        centroid = centroid / np.linalg.norm(centroid)
        
        sims_to_centroid = np.dot(comm_embs, centroid)
        avg_sim = np.mean(sims_to_centroid)
        
        # Validation Gate: High variance clusters are split (left unassigned)
        if avg_sim < (LOW_THRESHOLD + 0.02):
            continue 
            
        rep_face_id = ids[0]
        max_score = -1
        for i, fid in enumerate(ids):
            q = face_quality[fid]
            if q > max_score:
                max_score = q
                rep_face_id = fid

        cursor.execute(
            "INSERT INTO clusters (project_id, name, face_count, representative_face_id, confidence, is_verified) VALUES (?, ?, ?, ?, ?, 0)",
            (project_id, f"Group {cluster_idx + 1}", len(ids), rep_face_id, float(avg_sim))
        )
        cluster_id = cursor.lastrowid
        cluster_idx += 1

        for i, fid in enumerate(ids):
            prob = float(sims_to_centroid[i])
            cursor.execute("UPDATE faces SET cluster_id = ?, cluster_confidence = ? WHERE id = ?", (cluster_id, prob, fid))

    # Update counts for gallery clusters
    if verified_clusters:
        for vc in verified_clusters:
            new_count = conn.execute("SELECT COUNT(*) as c FROM faces WHERE cluster_id = ?", (vc["id"],)).fetchone()["c"]
            cursor.execute("UPDATE clusters SET face_count = ? WHERE id = ?", (new_count, vc["id"]))

    conn.commit()

