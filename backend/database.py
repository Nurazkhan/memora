import sqlite3
import os
from pathlib import Path

DB_DIR = Path(__file__).parent / "data"
DB_PATH = DB_DIR / "memora.db"


def get_db_path():
    """Return the database file path, creating the directory if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    return str(DB_PATH)


def get_connection():
    """Create a new SQLite connection with row factory."""
    conn = sqlite3.connect(get_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initialize the database schema."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT DEFAULT 'draft',
            directory TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_path TEXT NOT NULL,
            thumbnail_path TEXT DEFAULT '',
            width INTEGER DEFAULT 0,
            height INTEGER DEFAULT 0,
            file_size INTEGER DEFAULT 0,
            processed INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS faces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            image_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            cluster_id INTEGER DEFAULT NULL,
            bbox_x INTEGER DEFAULT 0,
            bbox_y INTEGER DEFAULT 0,
            bbox_w INTEGER DEFAULT 0,
            bbox_h INTEGER DEFAULT 0,
            embedding_path TEXT DEFAULT '',
            thumbnail_path TEXT DEFAULT '',
            quality_score REAL DEFAULT 0.0,
            sharpness REAL DEFAULT 0.0,
            face_size REAL DEFAULT 0.0,
            detector_confidence REAL DEFAULT 0.0,
            cluster_confidence REAL DEFAULT 0.0,
            quality_score REAL DEFAULT 0.0,
            pose_pitch REAL DEFAULT 0.0,
            pose_yaw REAL DEFAULT 0.0,
            pose_roll REAL DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (cluster_id) REFERENCES clusters(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS clusters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT DEFAULT '',
            student_id INTEGER DEFAULT NULL,
            face_count INTEGER DEFAULT 0,
            representative_face_id INTEGER DEFAULT NULL,
            confidence REAL DEFAULT 0.0,
            is_verified INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            class_name TEXT DEFAULT '',
            student_number TEXT DEFAULT '',
            cluster_id INTEGER DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS co_occurrences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            cluster_a INTEGER NOT NULL,
            cluster_b INTEGER NOT NULL,
            count INTEGER DEFAULT 0,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (cluster_a) REFERENCES clusters(id) ON DELETE CASCADE,
            FOREIGN KEY (cluster_b) REFERENCES clusters(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS hard_negatives (
            project_id INTEGER NOT NULL,
            face_id_a INTEGER NOT NULL,
            face_id_b INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, face_id_a, face_id_b),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (face_id_a) REFERENCES faces(id) ON DELETE CASCADE,
            FOREIGN KEY (face_id_b) REFERENCES faces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_images_project ON images(project_id);
        CREATE INDEX IF NOT EXISTS idx_faces_image ON faces(image_id);
        CREATE INDEX IF NOT EXISTS idx_faces_project ON faces(project_id);
        CREATE INDEX IF NOT EXISTS idx_faces_cluster ON faces(cluster_id);
        CREATE INDEX IF NOT EXISTS idx_clusters_project ON clusters(project_id);
        CREATE INDEX IF NOT EXISTS idx_students_project ON students(project_id);
        CREATE INDEX IF NOT EXISTS idx_cooccurrences_project ON co_occurrences(project_id);
    """)

    # Safe migrations for existing databases
    try:
        cursor.execute("ALTER TABLE faces ADD COLUMN quality_score REAL DEFAULT 0.0")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE faces ADD COLUMN suggested_cluster_id INTEGER DEFAULT NULL")
    except sqlite3.OperationalError:
        pass

    try:
        cursor.execute("ALTER TABLE clusters ADD COLUMN is_verified INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    conn.commit()
    conn.close()
    print(f"[DB] Database initialized at {DB_PATH}")
