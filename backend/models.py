from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Therapist(Base):
    __tablename__ = "therapists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="therapist")

    children = relationship("ChildProfile", back_populates="created_by")
    sessions = relationship("Session", back_populates="therapist")


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id = Column(Integer, primary_key=True, index=True)
    patient_code = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False)
    age = Column(String, nullable=True)
    caregiver_name = Column(String, nullable=True)
    diagnosis = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    created_by_therapist_id = Column(Integer, ForeignKey("therapists.id"), nullable=True)

    created_by = relationship("Therapist", back_populates="children")
    sessions = relationship("Session", back_populates="child")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, nullable=False, index=True)

    child_id = Column(Integer, ForeignKey("child_profiles.id"), nullable=False)
    therapist_id = Column(Integer, ForeignKey("therapists.id"), nullable=True)

    status = Column(String, default="active")
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    video_url = Column(String, nullable=True)
    duration = Column(String, nullable=True)
    summary_notes = Column(Text, nullable=True)

    child = relationship("ChildProfile", back_populates="sessions")
    therapist = relationship("Therapist", back_populates="sessions")