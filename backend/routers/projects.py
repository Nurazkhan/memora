from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
import uuid
from PIL import Image
import pandas as pd

from database import get_connection
from models import ProjectCreate, ProjectResponse, ImageResponse, StudentResponse, ClusterResponse, ClusterUpdate

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

@router.put("/{project_id}/clusters/{cluster_id}")
def update_cluster_name(project_id: int, cluster_id: int, payload: ClusterUpdate):
    """Update a cluster's name (Tagging)."""
    conn = get_connection()
    try:
        conn.execute("UPDATE clusters SET name = ? WHERE id = ? AND project_id = ?", (payload.name, cluster_id, project_id))
        
        # Try to link to a student if exact name match
        student = conn.execute("SELECT id FROM students WHERE project_id = ? AND name = ?", (project_id, payload.name)).fetchone()
        if student:
            conn.execute("UPDATE clusters SET student_id = ? WHERE id = ?", (student["id"], cluster_id))
            conn.execute("UPDATE students SET cluster_id = ? WHERE id = ?", (cluster_id, student["id"]))
            
        conn.commit()
        return {"message": "Cluster name updated."}
    finally:
        conn.close()

@router.post("/{project_id}/album/generate")
def api_generate_album(project_id: int):
    """Generate and return an album draft using Best-Photo selection and Co-occurrences."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
            
        pages = album_builder.generate_album(project_id)
        
        conn.execute("UPDATE projects SET status = 'completed' WHERE id = ?", (project_id,))
        conn.commit()
        
        return {"pages": pages}
    except Exception as e:
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
