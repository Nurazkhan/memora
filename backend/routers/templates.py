from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pathlib import Path
import json
import shutil
import uuid

from database import get_connection
from models import TemplateCreate, TemplateResponse

router = APIRouter(prefix="/templates", tags=["templates"])

# Directory for template assets (backgrounds)
TEMPLATES_ASSETS_DIR = Path(__file__).parent.parent / "projects_data" / "templates_assets"
TEMPLATES_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

@router.get("", response_model=list[TemplateResponse])
def list_templates():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM templates ORDER BY created_at DESC").fetchall()
        templates = []
        for row in rows:
            t = dict(row)
            t["layout_json"] = json.loads(t["layout_json"])
            templates.append(TemplateResponse(**t))
        return templates
    finally:
        conn.close()

@router.post("", response_model=TemplateResponse)
def create_template(data: TemplateCreate):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        layout_str = json.dumps(data.layout_json)
        cursor.execute(
            "INSERT INTO templates (name, page_size, layout_json) VALUES (?, ?, ?)",
            (data.name, data.page_size, layout_str)
        )
        conn.commit()
        template_id = cursor.lastrowid
        
        row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        t = dict(row)
        t["layout_json"] = json.loads(t["layout_json"])
        return TemplateResponse(**t)
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/{template_id}", response_model=TemplateResponse)
def get_template(template_id: int):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        t = dict(row)
        t["layout_json"] = json.loads(t["layout_json"])
        return TemplateResponse(**t)
    finally:
        conn.close()

@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(template_id: int, data: TemplateCreate):
    conn = get_connection()
    try:
        layout_str = json.dumps(data.layout_json)
        conn.execute(
            "UPDATE templates SET name = ?, page_size = ?, layout_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (data.name, data.page_size, layout_str, template_id)
        )
        conn.commit()
        
        row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        t = dict(row)
        t["layout_json"] = json.loads(t["layout_json"])
        return TemplateResponse(**t)
    finally:
        conn.close()

@router.delete("/{template_id}")
def delete_template(template_id: int):
    conn = get_connection()
    try:
        # Cleanup background file if exists
        row = conn.execute("SELECT background_path FROM templates WHERE id = ?", (template_id,)).fetchone()
        if row and row["background_path"]:
            p = Path(row["background_path"])
            if p.exists():
                p.unlink()
        
        conn.execute("DELETE FROM templates WHERE id = ?", (template_id,))
        conn.commit()
        return {"message": "Template deleted"}
    finally:
        conn.close()

@router.post("/{template_id}/background")
def upload_template_background(template_id: int, file: UploadFile = File(...)):
    conn = get_connection()
    try:
        ext = Path(file.filename).suffix
        filename = f"{uuid.uuid4()}{ext}"
        file_path = TEMPLATES_ASSETS_DIR / filename
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        conn.execute(
            "UPDATE templates SET background_path = ? WHERE id = ?",
            (str(file_path), template_id)
        )
        conn.commit()
        return {"background_path": str(file_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
