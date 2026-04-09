from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


class TherapistCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "therapist"


class TherapistLogin(BaseModel):
    email: EmailStr
    password: str


class TherapistOut(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str

    class Config:
        from_attributes = True


class ChildCreate(BaseModel):
    patient_code: str
    full_name: str
    age: Optional[str] = None
    caregiver_name: Optional[str] = None
    diagnosis: Optional[str] = None
    notes: Optional[str] = None
    created_by_therapist_id: Optional[int] = None


class ChildOut(BaseModel):
    id: int
    patient_code: str
    full_name: str
    age: Optional[str] = None
    caregiver_name: Optional[str] = None
    diagnosis: Optional[str] = None
    notes: Optional[str] = None
    created_by_therapist_id: Optional[int] = None

    class Config:
        from_attributes = True


class SessionCreate(BaseModel):
    child_id: int
    therapist_id: Optional[int] = None


class SessionOut(BaseModel):
    id: int
    session_id: str
    child_id: int
    therapist_id: Optional[int] = None
    status: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    video_url: Optional[str] = None
    duration: Optional[str] = None
    summary_notes: Optional[str] = None

    class Config:
        from_attributes = True