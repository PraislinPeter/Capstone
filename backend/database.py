from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Date, Boolean
from datetime import date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime

# Replace 'user', 'password', and 'localhost' with your MySQL credentials
DATABASE_URL = "mysql+pymysql://root:password123@localhost/emotion_db"

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELS ---

class Patient(Base):
    __tablename__ = "patients"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    external_id = Column(String(50), unique=True)
    dob = Column(Date)                # <--- NEW
    gender = Column(String(20))       # <--- NEW
    contact_info = Column(String(150))# <--- NEW
    medical_history = Column(Text)    # <--- NEW
    
    # Relationships (keep existing)
    # sessions = relationship("SessionRecord", back_populates="patient")
    sessions = relationship("SessionRecord", back_populates="patient", cascade="all, delete")

class SessionRecord(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    session_uuid = Column(String(100))
    date_recorded = Column(DateTime, default=datetime.datetime.utcnow)
    duration = Column(String(20))
    video_url = Column(String(255))

    patient = relationship("Patient", back_populates="sessions")
    timeline = relationship("TimelineEntry", back_populates="session", cascade="all, delete")
    notes = relationship("Note", back_populates="session", cascade="all, delete")

class TimelineEntry(Base):
    __tablename__ = "timeline_entries"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    timestamp_str = Column(String(20))
    seconds = Column(Integer)
    emotion = Column(String(100))
    confidence = Column(Float)
    is_interaction = Column(Boolean, default=False, nullable=True)
    feedback_type = Column(String(50), nullable=True)

    session = relationship("SessionRecord", back_populates="timeline")


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    seconds = Column(Integer, default=0)
    timestamp_str = Column(String(20), default="00:00")
    note_text = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("SessionRecord", back_populates="notes")


# Helper to create tables if they don't exist
def init_db():
    Base.metadata.create_all(bind=engine)