from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    status: str
    directory: str
    created_at: str
    updated_at: str
    image_count: Optional[int] = 0
    student_count: Optional[int] = 0
    cluster_count: Optional[int] = 0


class ImageResponse(BaseModel):
    id: int
    project_id: int
    filename: str
    original_path: str
    thumbnail_path: str
    width: int
    height: int
    file_size: int
    processed: int
    created_at: str


class StudentResponse(BaseModel):
    id: int
    project_id: int
    name: str
    class_name: str
    student_number: str
    cluster_id: Optional[int] = None
    created_at: str


class ClusterResponse(BaseModel):
    id: int
    project_id: int
    name: str
    student_id: Optional[int] = None
    face_count: int
    representative_face_id: Optional[int] = None
    created_at: str


class ClusterUpdate(BaseModel):
    name: str


class CreateClusterRequest(BaseModel):
    name: Optional[str] = ""


class AssignFaceRequest(BaseModel):
    cluster_id: int



class ProcessingStatusResponse(BaseModel):
    status: str
    progress: float
    message: str
    total_images: int
    processed_images: int
