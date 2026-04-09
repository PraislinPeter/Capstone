from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Text, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import datetime

DATABASE_URL = "sqlite:///clinician_ai.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100))
    external_id = Column(String(50), unique=True)
    dob = Column(Date)
    gender = Column(String(20))
    contact_info = Column(String(150))
    medical_history = Column(Text)

    sessions = relationship("SessionRecord", back_populates="patient", cascade="all, delete")


class SessionRecord(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    session_uuid = Column(String(100), unique=True, index=True, nullable=False)

    status = Column(String(20), default="active")   # active | completed | abandoned
    started_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)

    date_recorded = Column(DateTime, default=datetime.datetime.utcnow)
    duration = Column(String(20), default="00:00")
    video_url = Column(String(255), default="")

    patient = relationship("Patient", back_populates="sessions")
    timeline = relationship("TimelineEntry", back_populates="session", cascade="all, delete")
    game_events = relationship("GameEvent", back_populates="session", cascade="all, delete")


class TimelineEntry(Base):
    __tablename__ = "timeline_entries"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"))
    timestamp_str = Column(String(20))
    seconds = Column(Integer)
    emotion = Column(String(50))
    confidence = Column(Float)

    session = relationship("SessionRecord", back_populates="timeline")


class GameEvent(Base):
    __tablename__ = "game_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)

    event_type = Column(String(50))
    item_id = Column(String(50))
    expected = Column(String(50))
    selected = Column(String(50))
    correct = Column(Integer)
    attempts = Column(Integer)
    duration_ms = Column(Integer)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("SessionRecord", back_populates="game_events")


def init_db():
    Base.metadata.create_all(bind=engine)
