import sqlite3
from typing import List, Dict, Any

from database import get_connection

def build_co_occurrences(project_id: int):
    """
    Builds the co-occurrence matrix for a project's clusters.
    If image X has faces from cluster A and cluster B, increment count(A, B).
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        
        # Clear existing
        cursor.execute("DELETE FROM co_occurrences WHERE project_id = ?", (project_id,))
        
        # Get all faces with a valid cluster mapped by image
        rows = cursor.execute("""
            SELECT image_id, cluster_id 
            FROM faces 
            WHERE project_id = ? AND cluster_id IS NOT NULL
        """, (project_id,)).fetchall()
        
        image_clusters = {}
        for r in rows:
            img = r["image_id"]
            c = r["cluster_id"]
            if img not in image_clusters:
                image_clusters[img] = set()
            image_clusters[img].add(c)
            
        cooc = {}
        for img, clusters in image_clusters.items():
            clusters = list(clusters)
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    c1, c2 = clusters[i], clusters[j]
                    # order them safely
                    if c1 > c2:
                        c1, c2 = c2, c1
                        
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


def generate_album(project_id: int) -> List[Dict[str, Any]]:
    """
    Generates a generic album draft.
    Outputs a list of "pages".
    Page 1..N: Individual portraits (4 per page)
    Page N+1..M: Group photos (1 per page)
    """
    build_co_occurrences(project_id)
    
    conn = get_connection()
    try:
        # Get all students and find their best specific face crop + original image
        students = conn.execute("""
            SELECT s.id, s.name, s.cluster_id
            FROM students s
            WHERE s.project_id = ? AND s.cluster_id IS NOT NULL
            ORDER BY s.name ASC
        """, (project_id,)).fetchall()
        
        portraits = []
        for s in students:
            # Pick best face for this cluster based on sharpness and face_size
            best_face = conn.execute("""
                SELECT f.id, f.thumbnail_path, f.image_id, i.original_path, i.thumbnail_path as img_thumb
                FROM faces f
                JOIN images i ON f.image_id = i.id
                WHERE f.cluster_id = ?
                ORDER BY (f.sharpness * f.face_size) DESC
                LIMIT 1
            """, (s["cluster_id"],)).fetchone()
            
            if best_face:
                portraits.append({
                    "student_id": s["id"],
                    "student_name": s["name"],
                    "face_id": best_face["id"],
                    "face_thumb": best_face["thumbnail_path"],
                    "image_id": best_face["image_id"],
                    "image_thumb": best_face["img_thumb"],
                    "image_original": best_face["original_path"]
                })
        
        # Create Individual Pages (grid of 4)
        pages = []
        chunk_size = 4
        for i in range(0, len(portraits), chunk_size):
            chunk = portraits[i:i+chunk_size]
            pages.append({
                "type": "individual",
                "title": f"Portraits",
                "items": chunk
            })
            
        # Select Group Photos
        # Find images with the most recognized faces
        group_images = conn.execute("""
            SELECT i.id, i.original_path, i.thumbnail_path, GROUP_CONCAT(s.name, ', ') as students_in_photo, COUNT(DISTINCT f.cluster_id) as face_count
            FROM images i
            JOIN faces f ON i.id = f.image_id
            JOIN clusters c ON f.cluster_id = c.id
            JOIN students s ON c.student_id = s.id
            WHERE i.project_id = ?
            GROUP BY i.id
            HAVING face_count > 1
            ORDER BY face_count DESC
            LIMIT 10
        """, (project_id,)).fetchall()
        
        for g in group_images:
            pages.append({
                "type": "group",
                "title": "Memories",
                "items": [{
                    "image_id": g["id"],
                    "image_thumb": g["thumbnail_path"],
                    "image_original": g["original_path"],
                    "metadata": g["students_in_photo"]
                }]
            })
            
        return pages
    finally:
        conn.close()
