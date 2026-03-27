import os
from pathlib import Path
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

from database import get_connection
import album_builder

def generate_album_pdf(project_id: int) -> str:
    """
    Generates a PDF representation of the album and returns the file path.
    """
    conn = get_connection()
    try:
        row = conn.execute("SELECT directory, name FROM projects WHERE id = ?", (project_id,)).fetchone()
        project_dir = Path(row["directory"])
        project_name = row["name"].replace(" ", "_").lower()
        
        pdf_path = project_dir / f"{project_name}_album.pdf"
        
        pages = album_builder.generate_album(project_id)
        
        c = canvas.Canvas(str(pdf_path), pagesize=landscape(A4))
        width, height = landscape(A4)
        
        for idx, page in enumerate(pages):
            c.setFont("Helvetica-Bold", 24)
            c.drawCentredString(width / 2.0, height - 1 * inch, page.get("title", ""))
            
            if page["type"] == "individual":
                # Draw a 2x2 grid
                grid_w = width * 0.4
                grid_h = height * 0.6
                
                start_x = (width - (grid_w * 2 + 0.5 * inch)) / 2.0
                start_y = height - 1.5 * inch - grid_h / 2.0
                
                positions = [
                    (start_x, start_y),
                    (start_x + grid_w + 0.5 * inch, start_y),
                    (start_x, start_y - grid_h - 0.5 * inch),
                    (start_x + grid_w + 0.5 * inch, start_y - grid_h - 0.5 * inch)
                ]
                
                for i, item in enumerate(page["items"]):
                    if i >= 4: break # Safety cap
                    x, y = positions[i]
                    
                    # Draw image
                    face_img = item["face_thumb"]
                    if os.path.exists(face_img):
                        c.drawImage(face_img, x, y, width=grid_w, height=grid_h, preserveAspectRatio=True, anchor='c')
                        
                    # Draw name
                    c.setFont("Helvetica", 14)
                    c.drawCentredString(x + grid_w / 2.0, y - 0.25 * inch, item["student_name"])
                    
            elif page["type"] == "group":
                # Draw one big image
                for item in page["items"]:
                    img_path = item["image_thumb"]
                    if os.path.exists(img_path):
                        c.drawImage(img_path, 1 * inch, 1 * inch, width=width - 2 * inch, height=height - 2.5 * inch, preserveAspectRatio=True, anchor='c')
                    
                    c.setFont("Helvetica", 12)
                    c.drawString(1 * inch, 0.5 * inch, f"Featuring: {item.get('metadata', '')}")
            
            # Draw page number
            c.setFont("Helvetica", 10)
            c.drawRightString(width - 0.5 * inch, 0.5 * inch, f"Page {idx + 1}")
            c.showPage()
            
        c.save()
        return str(pdf_path)
    finally:
        conn.close()
