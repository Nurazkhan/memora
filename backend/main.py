from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from database import init_db
from routers import projects, templates

app = FastAPI(title="Memora API", version="1.0.0")

# CORS — allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving thumbnails and face crops
PROJECTS_DIR = Path(__file__).parent / "projects_data"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(PROJECTS_DIR)), name="files")

# Include routers
app.include_router(projects.router)
app.include_router(templates.router)


@app.on_event("startup")
def startup_event():
    """Initialize database on startup."""
    init_db()
    print("[Memora API] Server started on port 8599")


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "memora-api", "version": "1.0.0"}
