from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
import uuid
from PIL import Image
import pandas as pd

from database import get_connection
from models import ProjectCreate, ProjectResponse, ImageResponse, StudentResponse, ClusterResponse, ClusterUpdate, CreateClusterRequest, AssignFaceRequest

import face_worker
import album_builder
import pdf_exporter

router = APIRouter(prefix="/projects", tags=["projects"])

# Base directory for project files
PROJECTS_DIR = Path(__file__).parent.parent / "projects_data"


@router.post("", response_model=ProjectResponse)
def create_project(data: ProjectCreate):
    """Create a new project with its directory structure."""
    conn = get_connection()
    try:
        # Create project directory
        project_dir = PROJECTS_DIR / data.name.replace(" ", "_").lower()
        project_dir.mkdir(parents=True, exist_ok=True)
        (project_dir / "originals").mkdir(exist_ok=True)
        (project_dir / "thumbnails").mkdir(exist_ok=True)
        (project_dir / "faces").mkdir(exist_ok=True)
        (project_dir / "embeddings").mkdir(exist_ok=True)

        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO projects (name, description, directory) VALUES (?, ?, ?)",
            (data.name, data.description or "", str(project_dir)),
        )
        conn.commit()
        project_id = cursor.lastrowid

        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()

        return ProjectResponse(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            status=row["status"],
            directory=row["directory"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            image_count=0,
            student_count=0,
            cluster_count=0,
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("", response_model=list[ProjectResponse])
def list_projects():
    """List all projects with their stats."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
        projects = []
        for row in rows:
            img_count = conn.execute(
                "SELECT COUNT(*) as c FROM images WHERE project_id = ?", (row["id"],)
            ).fetchone()["c"]
            stu_count = conn.execute(
                "SELECT COUNT(*) as c FROM students WHERE project_id = ?", (row["id"],)
            ).fetchone()["c"]
            clu_count = conn.execute(
                "SELECT COUNT(*) as c FROM clusters WHERE project_id = ?", (row["id"],)
            ).fetchone()["c"]

            projects.append(ProjectResponse(
                id=row["id"],
                name=row["name"],
                description=row["description"],
                status=row["status"],
                directory=row["directory"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                image_count=img_count,
                student_count=stu_count,
                cluster_count=clu_count,
            ))
        return projects
    finally:
        conn.close()


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int):
    """Get a single project by ID."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        img_count = conn.execute(
            "SELECT COUNT(*) as c FROM images WHERE project_id = ?", (project_id,)
        ).fetchone()["c"]
        stu_count = conn.execute(
            "SELECT COUNT(*) as c FROM students WHERE project_id = ?", (project_id,)
        ).fetchone()["c"]
        clu_count = conn.execute(
            "SELECT COUNT(*) as c FROM clusters WHERE project_id = ?", (project_id,)
        ).fetchone()["c"]

        return ProjectResponse(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            status=row["status"],
            directory=row["directory"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            image_count=img_count,
            student_count=stu_count,
            cluster_count=clu_count,
        )
    finally:
        conn.close()


@router.delete("/{project_id}")
def delete_project(project_id: int):
    """Delete a project and its files."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        # Delete project directory
        project_dir = Path(row["directory"])
        if project_dir.exists():
            shutil.rmtree(project_dir)

        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        return {"message": "Project deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


def process_uploaded_image(project_id: int, original_path: Path, thumbnail_path: Path, filename: str, filesize: int):
    """Generate thumbnail and insert into the database."""
    try:
        with Image.open(original_path) as img:
            width, height = img.size
            # Fix Orientation from EXIF
            # (Normally you'd use PIL.ImageOps.exif_transpose here)
            
            # Create thumbnail
            img.thumbnail((400, 400), Image.Resampling.LANCZOS)
            img.save(thumbnail_path, format="JPEG", quality=85)

        conn = get_connection()
        try:
            conn.execute(
                "INSERT INTO images (project_id, filename, original_path, thumbnail_path, width, height, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (project_id, filename, str(original_path), str(thumbnail_path), width, height, filesize),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f"Error processing image {filename}: {e}")


@router.post("/{project_id}/images")
async def upload_images(project_id: int, background_tasks: BackgroundTasks, files: list[UploadFile] = File(...)):
    """Upload multiple images to a project, returning immediately while processing thumbnails in background."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT directory FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        project_dir = Path(row["directory"])
    finally:
        conn.close()

    orig_dir = project_dir / "originals"
    thumb_dir = project_dir / "thumbnails"

    uploaded_count = 0
    for file in files:
        if not file.filename:
            continue
        
        # Save original file
        ext = Path(file.filename).suffix
        safe_filename = f"{uuid.uuid4().hex}{ext}"
        original_path = orig_dir / safe_filename
        thumbnail_path = thumb_dir / f"{original_path.stem}.jpg"
        
        content = await file.read()
        filesize = len(content)
        
        with open(original_path, "wb") as f:
            f.write(content)

        background_tasks.add_task(
            process_uploaded_image,
            project_id=project_id,
            original_path=original_path,
            thumbnail_path=thumbnail_path,
            filename=file.filename,
            filesize=filesize
        )
        uploaded_count += 1

    return {"message": f"Uploading and processing {uploaded_count} images in the background."}


@router.get("/{project_id}/images", response_model=list[ImageResponse])
def get_images(project_id: int):
    """List thumbnails/images for a project."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM images WHERE project_id = ? ORDER BY created_at DESC", (project_id,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/{project_id}/students/upload")
async def upload_students_excel(project_id: int, file: UploadFile = File(...)):
    """Upload an Excel file containing a list of students."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        content = await file.read()
        try:
            # Requires openpyxl
            import io
            df = pd.read_excel(io.BytesIO(content))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

        # Normalize column names
        df.columns = [str(col).strip().lower() for col in df.columns]
        
        if "name" not in df.columns:
            raise HTTPException(status_code=400, detail="Excel file must contain a 'name' column.")

        cursor = conn.cursor()
        inserted = 0
        for _, r in df.iterrows():
            name = str(r["name"]).strip()
            if not name or name == "nan":
                continue
            
            class_name = str(r.get("class", "")).strip()
            student_number = str(r.get("number", "")).strip()

            cursor.execute(
                "INSERT INTO students (project_id, name, class_name, student_number) VALUES (?, ?, ?, ?)",
                (project_id, name, class_name if class_name != "nan" else "", student_number if student_number != "nan" else "")
            )
            inserted += 1

        conn.commit()
        return {"message": f"Successfully imported {inserted} students."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/{project_id}/students", response_model=list[StudentResponse])
def get_students(project_id: int):
    """List students for a project."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM students WHERE project_id = ? ORDER BY name ASC", (project_id,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/{project_id}/students", response_model=StudentResponse)
def create_student(project_id: int, payload: dict):
    """Create a single student manually."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")

        name = payload.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Student name is required.")

        class_name = payload.get("class_name", "").strip()
        student_number = payload.get("student_number", "").strip()

        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO students (project_id, name, class_name, student_number) VALUES (?, ?, ?, ?)",
            (project_id, name, class_name, student_number),
        )
        conn.commit()

        new_row = conn.execute("SELECT * FROM students WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(new_row)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.put("/{project_id}/students/{student_id}", response_model=StudentResponse)
def update_student(project_id: int, student_id: int, payload: dict):
    """Update a single student's details."""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM students WHERE id = ? AND project_id = ?", (student_id, project_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Student not found")

        name = payload.get("name", existing["name"]).strip()
        if not name:
            raise HTTPException(status_code=400, detail="Student name is required.")

        class_name = payload.get("class_name", existing["class_name"]).strip()
        student_number = payload.get("student_number", existing["student_number"]).strip()

        conn.execute(
            "UPDATE students SET name = ?, class_name = ?, student_number = ? WHERE id = ? AND project_id = ?",
            (name, class_name, student_number, student_id, project_id),
        )
        conn.commit()

        updated = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        return dict(updated)
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{project_id}/students/{student_id}")
def delete_student(project_id: int, student_id: int):
    """Delete a single student."""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM students WHERE id = ? AND project_id = ?", (student_id, project_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Student not found")

        conn.execute("DELETE FROM students WHERE id = ? AND project_id = ?", (student_id, project_id))
        conn.commit()
        return {"message": "Student deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{project_id}/process")
def start_processing(project_id: int, background_tasks: BackgroundTasks):
    """Start face detection and clustering in the background."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT directory FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        project_dir = str(Path(row["directory"]))
        
        # We start the background task
        background_tasks.add_task(face_worker.process_project_faces, project_id, project_dir)
        return {"message": "Processing started in the background."}
    finally:
        conn.close()

@router.get("/{project_id}/progress")
def get_processing_progress(project_id: int):
    """Return the progress of the background face extraction job."""
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) as c FROM images WHERE project_id = ?", (project_id,)).fetchone()["c"]
        processed = conn.execute("SELECT COUNT(*) as c FROM images WHERE project_id = ? AND processed = 1", (project_id,)).fetchone()["c"]
        return {"total": total, "processed": processed}
    finally:
        conn.close()

@router.get("/{project_id}/clusters", response_model=list[ClusterResponse])
def get_clusters(project_id: int):
    """List clusters for a project."""
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM clusters WHERE project_id = ? ORDER BY face_count DESC", (project_id,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.get("/{project_id}/clusters/{cluster_id}/faces")
def get_cluster_faces(project_id: int, cluster_id: int):
    """Get all faces belonging to a specific cluster (for the cluster detail modal)."""
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, image_id, bbox_x, bbox_y, bbox_w, bbox_h,
                      sharpness, face_size, detector_confidence, cluster_confidence
               FROM faces 
               WHERE project_id = ? AND cluster_id = ?
               ORDER BY sharpness DESC""",
            (project_id, cluster_id)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.get("/{project_id}/images/{image_id}")
def get_image_details(project_id: int, image_id: int):
    """Retrieve details for a specific image, including its original and thumbnail paths."""
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT id, filename, original_path, thumbnail_path, width, height, created_at FROM images WHERE id = ? AND project_id = ?",
            (image_id, project_id)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Image not found")
        return dict(row)
    finally:
        conn.close()


@router.put("/{project_id}/clusters/{cluster_id}")
def update_cluster_name(project_id: int, cluster_id: int, payload: ClusterUpdate):
    """Update a cluster's name (Tagging)."""
    conn = get_connection()
    try:
        conn.execute("UPDATE clusters SET name = ?, is_verified = 1 WHERE id = ? AND project_id = ?", (payload.name, cluster_id, project_id))
        
        # Try to link to a student if exact name match
        student = conn.execute("SELECT id FROM students WHERE project_id = ? AND name = ?", (project_id, payload.name)).fetchone()
        if student:
            conn.execute("UPDATE clusters SET student_id = ? WHERE id = ?", (student["id"], cluster_id))
            conn.execute("UPDATE students SET cluster_id = ? WHERE id = ?", (cluster_id, student["id"]))
            
        conn.commit()
        return {"message": "Cluster name updated."}
    finally:
        conn.close()


@router.delete("/{project_id}/clusters/{cluster_id}")
def delete_cluster(project_id: int, cluster_id: int):
    """Delete a cluster and unassign all its faces (faces move back to review queue)."""
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM clusters WHERE id = ? AND project_id = ?", (cluster_id, project_id)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        # Unassign all faces — they return to the review queue
        conn.execute(
            "UPDATE faces SET cluster_id = NULL, cluster_confidence = 0.0 WHERE cluster_id = ? AND project_id = ?",
            (cluster_id, project_id)
        )
        # Unlink students
        conn.execute(
            "UPDATE students SET cluster_id = NULL WHERE cluster_id = ?", (cluster_id,)
        )
        conn.execute("DELETE FROM clusters WHERE id = ? AND project_id = ?", (cluster_id, project_id))
        conn.commit()
        return {"message": "Cluster deleted. Faces moved to review queue."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/{project_id}/unassigned-faces")
def get_unassigned_faces(project_id: int):
    """
    Review Queue: returns faces that passed quality gates but weren't auto-clustered.
    Ordered by quality_score DESC so the best candidates appear first.
    """
    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, image_id, bbox_x, bbox_y, bbox_w, bbox_h, 
                      sharpness, face_size, detector_confidence, quality_score, suggested_cluster_id
               FROM faces 
               WHERE project_id = ? AND cluster_id IS NULL
               ORDER BY quality_score DESC""",
            (project_id,)
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@router.post("/{project_id}/faces/{face_id}/assign")
def assign_face_to_cluster(project_id: int, face_id: int, payload: AssignFaceRequest):
    """Assign a face from the review queue to an existing cluster."""
    conn = get_connection()
    try:
        cluster_id = payload.cluster_id
        if not cluster_id:
            raise HTTPException(status_code=400, detail="cluster_id is required")
        
        face = conn.execute(
            "SELECT id FROM faces WHERE id = ? AND project_id = ?", (face_id, project_id)
        ).fetchone()
        if not face:
            raise HTTPException(status_code=404, detail="Face not found")
        
        cluster = conn.execute(
            "SELECT id FROM clusters WHERE id = ? AND project_id = ?", (cluster_id, project_id)
        ).fetchone()
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        conn.execute(
            "UPDATE faces SET cluster_id = ?, cluster_confidence = 1.0 WHERE id = ?",
            (cluster_id, face_id)
        )
        new_count = conn.execute(
            "SELECT COUNT(*) as c FROM faces WHERE cluster_id = ?", (cluster_id,)
        ).fetchone()["c"]
        conn.execute("UPDATE clusters SET face_count = ?, is_verified = 1 WHERE id = ?", (new_count, cluster_id))
        conn.commit()
        return {"message": "Face assigned to cluster."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{project_id}/faces/{face_id}/create-cluster")
def create_cluster_from_face(project_id: int, face_id: int, payload: CreateClusterRequest):
    """Promote a singleton/review face into its own new cluster."""
    conn = get_connection()
    try:
        face = conn.execute(
            "SELECT id FROM faces WHERE id = ? AND project_id = ?", (face_id, project_id)
        ).fetchone()
        if not face:
            raise HTTPException(status_code=404, detail="Face not found")
        
        name = payload.name.strip() if payload.name else "Unknown"
        
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO clusters (project_id, name, face_count, representative_face_id, confidence, is_verified) VALUES (?, ?, 1, ?, 1.0, 1)",
            (project_id, name, face_id)
        )
        cluster_id = cursor.lastrowid
        
        conn.execute(
            "UPDATE faces SET cluster_id = ?, cluster_confidence = 1.0 WHERE id = ?",
            (cluster_id, face_id)
        )
        
        if name != "Unknown":
            student = conn.execute(
                "SELECT id FROM students WHERE project_id = ? AND name = ?", (project_id, name)
            ).fetchone()
            if student:
                conn.execute("UPDATE clusters SET student_id = ? WHERE id = ?", (student["id"], cluster_id))
                conn.execute("UPDATE students SET cluster_id = ? WHERE id = ?", (cluster_id, student["id"]))
        
        conn.commit()
        return {"message": "New cluster created.", "cluster_id": cluster_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{project_id}/faces/{face_id}/unassign")
def unassign_face(project_id: int, face_id: int):
    """Remove a face from its cluster and return it to the review queue."""
    conn = get_connection()
    try:
        face = conn.execute(
            "SELECT id, cluster_id FROM faces WHERE id = ? AND project_id = ?", (face_id, project_id)
        ).fetchone()
        if not face:
            raise HTTPException(status_code=404, detail="Face not found")
        
        cluster_id = face["cluster_id"]
        if not cluster_id:
            return {"message": "Face is already unassigned."}
            
        conn.execute(
            "UPDATE faces SET cluster_id = NULL, cluster_confidence = 0.0 WHERE id = ?",
            (face_id,)
        )
        
        # Update cluster stats
        new_count = conn.execute(
            "SELECT COUNT(*) as c FROM faces WHERE cluster_id = ?", (cluster_id,)
        ).fetchone()["c"]
        if new_count == 0:
            conn.execute("DELETE FROM clusters WHERE id = ?", (cluster_id,))
        else:
            conn.execute("UPDATE clusters SET face_count = ? WHERE id = ?", (new_count, cluster_id))
            # If this face was the representative, find a new one
            rep = conn.execute("SELECT representative_face_id FROM clusters WHERE id = ?", (cluster_id,)).fetchone()
            if rep and rep["representative_face_id"] == face_id:
                best = conn.execute(
                    "SELECT id FROM faces WHERE cluster_id = ? ORDER BY sharpness * face_size DESC LIMIT 1",
                    (cluster_id,)
                ).fetchone()
                if best:
                    conn.execute("UPDATE clusters SET representative_face_id = ? WHERE id = ?", (best["id"], cluster_id))

        conn.commit()
        return {"message": "Face unassigned from identity."}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{project_id}/faces/{face_id}")
def delete_face(project_id: int, face_id: int):
    """Delete a single face crop/embedding and remove from cluster."""
    conn = get_connection()
    try:
        face = conn.execute(
            "SELECT id, cluster_id, thumbnail_path, embedding_path FROM faces WHERE id = ? AND project_id = ?",
            (face_id, project_id)
        ).fetchone()
        if not face:
            raise HTTPException(status_code=404, detail="Face not found")
        
        cluster_id = face["cluster_id"]
        
        # Delete files
        for fpath in [face["thumbnail_path"], face["embedding_path"]]:
            if fpath:
                p = Path(fpath)
                if p.exists():
                    p.unlink()
        
        conn.execute("DELETE FROM faces WHERE id = ?", (face_id,))
        
        # Update cluster face count
        if cluster_id:
            new_count = conn.execute(
                "SELECT COUNT(*) as c FROM faces WHERE cluster_id = ?", (cluster_id,)
            ).fetchone()["c"]
            if new_count == 0:
                conn.execute("DELETE FROM clusters WHERE id = ?", (cluster_id,))
            else:
                conn.execute("UPDATE clusters SET face_count = ? WHERE id = ?", (new_count, cluster_id))
                # Update representative if the deleted face was the representative
                rep = conn.execute("SELECT representative_face_id FROM clusters WHERE id = ?", (cluster_id,)).fetchone()
                if rep and rep["representative_face_id"] == face_id:
                    best = conn.execute(
                        "SELECT id FROM faces WHERE cluster_id = ? ORDER BY sharpness * face_size DESC LIMIT 1",
                        (cluster_id,)
                    ).fetchone()
                    if best:
                        conn.execute("UPDATE clusters SET representative_face_id = ? WHERE id = ?", (best["id"], cluster_id))
        
        conn.commit()
        return {"message": "Face deleted."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.delete("/{project_id}/images/{image_id}")
def delete_image(project_id: int, image_id: int):
    """Delete an image and all its associated face crops/embeddings."""
    conn = get_connection()
    try:
        img = conn.execute(
            "SELECT id, original_path, thumbnail_path FROM images WHERE id = ? AND project_id = ?",
            (image_id, project_id)
        ).fetchone()
        if not img:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Get all faces for this image to clean up clusters
        faces = conn.execute(
            "SELECT id, cluster_id, thumbnail_path, embedding_path FROM faces WHERE image_id = ?",
            (image_id,)
        ).fetchall()
        
        affected_clusters = set()
        for face in faces:
            if face["cluster_id"]:
                affected_clusters.add(face["cluster_id"])
            for fpath in [face["thumbnail_path"], face["embedding_path"]]:
                if fpath:
                    p = Path(fpath)
                    if p.exists():
                        p.unlink()
        
        # Delete all faces for this image
        conn.execute("DELETE FROM faces WHERE image_id = ?", (image_id,))
        
        # Update affected cluster counts
        for cid in affected_clusters:
            new_count = conn.execute(
                "SELECT COUNT(*) as c FROM faces WHERE cluster_id = ?", (cid,)
            ).fetchone()["c"]
            if new_count == 0:
                conn.execute("DELETE FROM clusters WHERE id = ?", (cid,))
            else:
                conn.execute("UPDATE clusters SET face_count = ? WHERE id = ?", (new_count, cid))
        
        # Delete image files
        for fpath in [img["original_path"], img["thumbnail_path"]]:
            if fpath:
                p = Path(fpath)
                if p.exists():
                    p.unlink()
        
        conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
        conn.commit()
        return {"message": "Image and associated faces deleted."}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/{project_id}/album/generate")
def api_generate_album(project_id: int, payload: dict = None):
    """Generate and return an album draft using Best-Photo selection and Co-occurrences, or a provided template."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
            
        template_id = payload.get("template_id") if payload else None
        target_cluster_id = payload.get("target_cluster_id") if payload else None

        pages = album_builder.generate_album(project_id, template_id, target_cluster_id=target_cluster_id)
        
        conn.execute("UPDATE projects SET status = 'completed' WHERE id = ?", (project_id,))
        conn.commit()
        
        return {"pages": pages}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/{project_id}/album/export")
def export_album_pdf(project_id: int):
    """Generates and downloads the Album PDF."""
    try:
        pdf_path = pdf_exporter.generate_album_pdf(project_id)
        return FileResponse(pdf_path, media_type='application/pdf', filename=Path(pdf_path).name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export PDF: {e}")
