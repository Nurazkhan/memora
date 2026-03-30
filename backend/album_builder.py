import sqlite3
import json
from typing import List, Dict, Any
from database import get_connection

def build_co_occurrences(project_id: int):
    """Builds the co-occurrence matrix for a project's clusters."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM co_occurrences WHERE project_id = ?", (project_id,))
        rows = cursor.execute("""
            SELECT image_id, cluster_id 
            FROM faces 
            WHERE project_id = ? AND cluster_id IS NOT NULL
        """, (project_id,)).fetchall()
        
        image_clusters = {}
        for r in rows:
            img = r["image_id"]
            c = r["cluster_id"]
            if img not in image_clusters: image_clusters[img] = set()
            image_clusters[img].add(c)
            
        cooc = {}
        for img, clusters in image_clusters.items():
            clusters = list(clusters)
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    c1, c2 = clusters[i], clusters[j]
                    if c1 > c2: c1, c2 = c2, c1
                    pair = (c1, c2)
                    cooc[pair] = cooc.get(pair, 0) + 1
                    
        for (c1, c2), count in cooc.items():
            cursor.execute(
                "INSERT INTO co_occurrences (project_id, cluster_a, cluster_b, count) VALUES (?, ?, ?, ?)",
                (project_id, c1, c2, count)
            )
        conn.commit()
    finally:
        conn.close()

def get_best_photo_for_identity(conn, cluster_id):
    """Finds the best-quality photo for a specific identity."""
    return conn.execute("""
        SELECT f.id as face_id, f.thumbnail_path as face_thumb, f.image_id, 
               i.original_path, i.thumbnail_path as img_thumb, i.filename
        FROM faces f
        JOIN images i ON f.image_id = i.id
        WHERE f.cluster_id = ?
        ORDER BY (f.sharpness * f.face_size) DESC
        LIMIT 1
    """, (cluster_id,)).fetchone()

def generate_album(project_id: int, template_id: int = None, target_cluster_id: int = None) -> List[Dict[str, Any]]:
    """Generates an album draft, optionally using a template."""
    build_co_occurrences(project_id)
    conn = get_connection()
    
    try:
        # --- TEMPLATE DRIVEN GENERATION ---
        if template_id and target_cluster_id:
            template = conn.execute("SELECT layout_json FROM templates WHERE id = ?", (template_id,)).fetchone()
            if not template:
                raise ValueError("Template not found")
            
            # Fetch target cluster info to resolve texts
            cluster_info = conn.execute("SELECT name FROM clusters WHERE id = ?", (target_cluster_id,)).fetchone()
            cluster_name = cluster_info["name"] if cluster_info else "Unknown"

            # Pre-fetch ALL photos that contain this cluster (for individual frames)
            individual_photos = conn.execute("""
                SELECT f.id as face_id, f.thumbnail_path as face_thumb, f.image_id, 
                       i.original_path, i.thumbnail_path as img_thumb, i.filename
                FROM faces f
                JOIN images i ON f.image_id = i.id
                WHERE f.cluster_id = ?
                ORDER BY (f.sharpness * f.face_size) DESC
            """, (target_cluster_id,)).fetchall()
            individual_photos = [dict(p) for p in individual_photos]

            # Pre-fetch a pool of group photos that contain this cluster
            group_photos = conn.execute("""
                SELECT i.id, i.original_path, i.thumbnail_path as img_thumb, i.filename
                FROM images i
                JOIN faces f ON i.id = f.image_id
                WHERE i.project_id = ? AND f.cluster_id = ?
                AND (SELECT COUNT(*) FROM faces f2 WHERE f2.image_id = i.id) > 1
                ORDER BY i.created_at ASC
            """, (project_id, target_cluster_id)).fetchall()
            group_photos = [dict(img) for img in group_photos]
            group_photo_idx = 0
            individual_photo_idx = 0
            
            layout = json.loads(template["layout_json"])
            pages = []

            for p_idx, t_page in enumerate(layout.get("pages", [])):
                orientation = t_page.get("orientation", "landscape")
                # Canvas dimensions used by the template editor
                canvas_w = 1000.0
                canvas_h = 707.0 if orientation == "landscape" else 1414.0
                
                page_items = []
                for obj in t_page.get("objects", []):
                    # Normalize pixel coords to 0-1 range
                    norm_obj = {
                        **obj,
                        "x": obj.get("x", 0) / canvas_w,
                        "y": obj.get("y", 0) / canvas_h,
                        "width": obj.get("width", 0) / canvas_w,
                        "height": obj.get("height", 0) / canvas_h,
                    }
                    
                    # 1. Handle Frames
                    if obj["type"] == "frame":
                        role = obj.get("role", "individual")
                        photo = None
                        
                        if role == "individual":
                            if individual_photo_idx < len(individual_photos):
                                photo = individual_photos[individual_photo_idx]
                                individual_photo_idx += 1
                            elif individual_photos:
                                photo = individual_photos[0]
                        elif role in ["group", "class", "family"]:
                            if group_photo_idx < len(group_photos):
                                photo = group_photos[group_photo_idx]
                                group_photo_idx += 1
                            elif individual_photos:
                                # Fallback to individual photo
                                photo = individual_photos[0]
                        else:
                            # Unknown role, try individual
                            if individual_photos:
                                photo = individual_photos[0]
                                    
                        if photo:
                            # Extract the actual filename on disk from the full path
                            import os
                            disk_filename = os.path.basename(photo.get("original_path", ""))
                            page_items.append({
                                **norm_obj,
                                "target_photo": {
                                    **photo,
                                    "disk_filename": disk_filename
                                }
                            })
                        else:
                            page_items.append(norm_obj)
                                    
                    # 2. Handle Text (Variable Resolution)
                    elif obj["type"] == "text":
                        content = obj.get("content", "")
                        if obj.get("source_type") == "variable":
                            var = obj.get("source_variable")
                            if var == "student.name":
                                content = cluster_name
                        
                        page_items.append({
                            **norm_obj,
                            "resolved_content": content
                        })
                    else:
                        # Pass through other object types
                        page_items.append(norm_obj)
                
                pages.append({
                    "id": t_page.get("id", f"p{p_idx}"),
                    "type": "template_page",
                    "title": t_page.get("name", f"Page {p_idx + 1}"),
                    "orientation": orientation,
                    "background": t_page.get("background_path"),
                    "items": page_items
                })
            return pages

        # --- FALLBACK: GENERIC GENERATION ---
        students = conn.execute("""
            SELECT s.id, s.name, s.cluster_id FROM students s
            WHERE s.project_id = ? AND s.cluster_id IS NOT NULL
            ORDER BY s.name ASC
        """, (project_id,)).fetchall()
        
        portraits = []
        for s in students:
            best = get_best_photo_for_identity(conn, s["cluster_id"])
            if best:
                portraits.append({
                    "student_id": s["id"], "student_name": s["name"],
                    "face_id": best["face_id"], "face_thumb": best["face_thumb"],
                    "image_id": best["image_id"], "image_thumb": best["img_thumb"],
                    "image_original": best["original_path"]
                })
        
        pages = []
        for i in range(0, len(portraits), 4):
            pages.append({"type": "individual", "title": "Portraits", "items": portraits[i:i+4]})
            
        group_images = conn.execute("""
            SELECT i.id, i.original_path, i.thumbnail_path, GROUP_CONCAT(s.name, ', ') as students_in_photo, COUNT(DISTINCT f.cluster_id) as face_count
            FROM images i
            JOIN faces f ON i.id = f.image_id
            JOIN clusters c ON f.cluster_id = c.id
            JOIN students s ON c.student_id = s.id
            WHERE i.project_id = ?
            GROUP BY i.id HAVING face_count > 1
            ORDER BY face_count DESC LIMIT 10
        """, (project_id,)).fetchall()
        
        for g in group_images:
            pages.append({
                "type": "group", "title": "Memories",
                "items": [{
                    "image_id": g["id"], "image_thumb": g["thumbnail_path"],
                    "image_original": g["original_path"], "metadata": g["students_in_photo"]
                }]
            })
        return pages
    finally:
        conn.close()
