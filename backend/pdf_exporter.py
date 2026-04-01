from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from reportlab.lib.pagesizes import A4, landscape, portrait
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from database import get_connection
import album_builder

PAGE_WIDTH = 1000.0
PAGE_HEIGHTS = {
    "landscape": 707.0,
    "portrait": 1414.0,
}


def _project_row(project_id: int):
    conn = get_connection()
    try:
        return conn.execute("SELECT directory, name FROM projects WHERE id = ?", (project_id,)).fetchone()
    finally:
        conn.close()


def _page_size(orientation: str):
    return portrait(A4) if orientation == "portrait" else landscape(A4)


def _page_height(orientation: str):
    return PAGE_HEIGHTS["portrait"] if orientation == "portrait" else PAGE_HEIGHTS["landscape"]


def _scale_rect(item: Dict[str, Any], page_width: float, page_height: float):
    return (
        float(item.get("x", 0)) * page_width,
        float(item.get("y", 0)) * page_height,
        float(item.get("width", 0)) * page_width,
        float(item.get("height", 0)) * page_height,
    )


def _crop_fit_dimensions(img_width: float, img_height: float, frame_width: float, frame_height: float):
    if img_width <= 0 or img_height <= 0 or frame_width <= 0 or frame_height <= 0:
        return 0, 0, 0, 0

    img_ratio = img_width / img_height
    frame_ratio = frame_width / frame_height

    if img_ratio > frame_ratio:
        draw_height = frame_height
        draw_width = frame_height * img_ratio
        draw_x = -(draw_width - frame_width) / 2
        draw_y = 0
    else:
        draw_width = frame_width
        draw_height = frame_width / img_ratio
        draw_x = 0
        draw_y = -(draw_height - frame_height) / 2

    return draw_x, draw_y, draw_width, draw_height


def _disk_image_path(project_directory: Path, photo: Dict[str, Any]) -> Optional[Path]:
    original_path = photo.get("original_path") or photo.get("image_original")
    if original_path:
        candidate = Path(original_path)
        if candidate.exists():
            return candidate

    disk_filename = photo.get("disk_filename")
    if disk_filename:
        candidate = project_directory / "originals" / disk_filename
        if candidate.exists():
            return candidate

    filename = photo.get("filename")
    if filename:
        candidate = project_directory / "originals" / filename
        if candidate.exists():
            return candidate

    return None


def _background_image_path(background_path: Optional[str]) -> Optional[Path]:
    if not background_path:
        return None
    candidate = Path(background_path)
    return candidate if candidate.exists() else None


def _draw_image_cover(pdf: canvas.Canvas, image_path: Path, x: float, y: float, width: float, height: float):
    try:
        image = ImageReader(str(image_path))
        img_width, img_height = image.getSize()
        draw_x, draw_y, draw_width, draw_height = _crop_fit_dimensions(img_width, img_height, width, height)
        pdf.saveState()
        path = pdf.beginPath()
        path.rect(x, y, width, height)
        pdf.clipPath(path, stroke=0, fill=0)
        pdf.drawImage(image, x + draw_x, y + draw_y, width=draw_width, height=draw_height, mask="auto")
        pdf.restoreState()
    except Exception:
        pdf.saveState()
        pdf.setFillColorRGB(0.92, 0.93, 0.96)
        pdf.rect(x, y, width, height, fill=1, stroke=0)
        pdf.restoreState()


def _draw_frame_placeholder(pdf: canvas.Canvas, x: float, y: float, width: float, height: float):
    pdf.saveState()
    pdf.setFillColorRGB(0.93, 0.94, 0.97)
    pdf.rect(x, y, width, height, fill=1, stroke=0)
    pdf.setStrokeColorRGB(0.7, 0.73, 0.8)
    pdf.setDash(4, 4)
    pdf.rect(x + 6, y + 6, max(0, width - 12), max(0, height - 12), fill=0, stroke=1)
    pdf.restoreState()


def _draw_text(pdf: canvas.Canvas, item: Dict[str, Any], page_width: float, page_height: float):
    x, y, width, height = _scale_rect(item, page_width, page_height)
    if width <= 0 or height <= 0:
        return

    font_size = max(8, float(item.get("font_size", item.get("fontSize", 18))) * (page_height / _page_height(item.get("orientation", "landscape"))))
    text = str(item.get("resolved_content") or item.get("content") or "").strip()
    if not text:
        return

    fill = item.get("fill", "#1f2937").lstrip("#")
    if len(fill) == 6:
        r = int(fill[0:2], 16) / 255
        g = int(fill[2:4], 16) / 255
        b = int(fill[4:6], 16) / 255
        pdf.setFillColorRGB(r, g, b)
    else:
        pdf.setFillColorRGB(0.12, 0.16, 0.22)
    pdf.setFont("Helvetica-Bold", font_size)

    align = item.get("align", "left")
    text_y = page_height - y - height / 2 - font_size / 3
    if align == "center":
        pdf.drawCentredString(x + width / 2, text_y, text)
    elif align == "right":
        pdf.drawRightString(x + width, text_y, text)
    else:
        pdf.drawString(x, text_y, text)


def _draw_template_page(pdf: canvas.Canvas, project_directory: Path, page: Dict[str, Any]):
    orientation = page.get("orientation", "landscape")
    page_width, page_height = _page_size(orientation)
    background_path = _background_image_path(page.get("background"))
    if background_path:
        _draw_image_cover(pdf, background_path, 0, 0, page_width, page_height)

    for item in page.get("items", []):
        item = {**item, "orientation": orientation}
        if item.get("type") == "frame":
            x, y, width, height = _scale_rect(item, page_width, page_height)
            image_path = _disk_image_path(project_directory, item.get("target_photo") or {})
            if image_path:
                _draw_image_cover(pdf, image_path, x, page_height - y - height, width, height)
            else:
                _draw_frame_placeholder(pdf, x, page_height - y - height, width, height)
        elif item.get("type") == "text":
            _draw_text(pdf, item, page_width, page_height)


def _draw_generic_page(pdf: canvas.Canvas, project_directory: Path, page: Dict[str, Any]):
    page_width, page_height = landscape(A4)
    if page.get("type") == "group":
        for item in page.get("items", []):
            image_path = _disk_image_path(project_directory, item)
            if image_path:
                _draw_image_cover(pdf, image_path, 36, 36, page_width - 72, page_height - 72)
        return

    items = page.get("items", [])
    if not items:
        return

    columns = min(4, max(1, len(items)))
    gap = 24
    frame_width = (page_width - 72 - gap * (columns - 1)) / columns
    frame_height = page_height - 120
    start_x = 36
    y = 56

    for index, item in enumerate(items[:4]):
        x = start_x + index * (frame_width + gap)
        image_path = _disk_image_path(project_directory, item)
        if image_path:
            _draw_image_cover(pdf, image_path, x, y, frame_width, frame_height)
        else:
            _draw_frame_placeholder(pdf, x, y, frame_width, frame_height)


def build_album_pdf(project_id: int, pages: Optional[List[Dict[str, Any]]] = None) -> bytes:
    project = _project_row(project_id)
    if not project:
        raise ValueError("Project not found")

    project_directory = Path(project["directory"])
    pages = pages or album_builder.generate_album(project_id)

    buffer = BytesIO()
    pdf = None

    for page in pages:
        orientation = page.get("orientation", "landscape")
        current_size = _page_size(orientation)
        if pdf is None:
            pdf = canvas.Canvas(buffer, pagesize=current_size)
        else:
            pdf.setPageSize(current_size)

        if page.get("type") == "template_page":
            _draw_template_page(pdf, project_directory, page)
        else:
            _draw_generic_page(pdf, project_directory, page)

        pdf.showPage()

    if pdf is None:
        pdf = canvas.Canvas(buffer, pagesize=landscape(A4))
        pdf.showPage()

    pdf.save()
    return buffer.getvalue()


def generate_album_pdf(project_id: int, pages: Optional[List[Dict[str, Any]]] = None) -> str:
    project = _project_row(project_id)
    if not project:
        raise ValueError("Project not found")

    project_directory = Path(project["directory"])
    project_name = project["name"].replace(" ", "_").lower()
    pdf_path = project_directory / f"{project_name}_album.pdf"
    pdf_bytes = build_album_pdf(project_id, pages=pages)
    pdf_path.write_bytes(pdf_bytes)
    return str(pdf_path)
