import cv2
import torch
import base64
import numpy as np
import torch.nn.functional as F
import uuid
from typing import List, Optional
import io
import time
import json
import os
import subprocess
import math
from collections import deque
from datetime import datetime, date
from pathlib import Path
from PIL import Image
from pydub import AudioSegment
import html as html_module

# --- FastAPI & Type Hinting Imports ---
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# --- AI & ML Imports ---
from transformers import AutoImageProcessor, AutoModelForImageClassification, AutoFeatureExtractor, AutoModelForAudioClassification
from insightface.app import FaceAnalysis

# --- Database Imports ---
from sqlalchemy.orm import Session, joinedload
from database import GameEvent, SessionLocal, engine, Patient, SessionRecord, TimelineEntry, Note, Base, init_db

# ------------------- CONFIGURATION -------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

EMOTION_MODEL = "dima806/facial_emotions_image_detection"
AUDIO_MODEL = "superb/hubert-large-superb-er"

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Create database tables on startup ---
init_db()
print("✅ Database tables ready")

# ------------------- MODEL LOADING -------------------
print(f"🚀 Loading Clinical Models on {DEVICE}...")

processor = AutoImageProcessor.from_pretrained(EMOTION_MODEL)
video_model = AutoModelForImageClassification.from_pretrained(EMOTION_MODEL).to(DEVICE).eval()
vid_id2label = video_model.config.id2label

face_app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider" if DEVICE == "cuda" else "CPUExecutionProvider"])
face_app.prepare(ctx_id=0 if DEVICE == "cuda" else -1, det_size=(640, 640))

audio_extractor = AutoFeatureExtractor.from_pretrained(AUDIO_MODEL)
audio_model = AutoModelForAudioClassification.from_pretrained(AUDIO_MODEL).to(DEVICE).eval()
aud_id2label = audio_model.config.id2label

COMMON_EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise', 'disgust']
LIVE_SESSION_STATE = {}

# ------------------- PRODUCTION ENGINE CLASS -------------------

class EmotionEngine:
    def __init__(self):
        self.frame_window = 5
        self.audio_window_sec = 3.0
        self.box_alpha = 0.7
        self.audio_rms_threshold = 0.015

        self.video_buffer = deque(maxlen=self.frame_window)
        self.audio_buffer_raw = np.array([], dtype=np.float32)
        self.last_bbox = None

        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def enhance_image(self, image):
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = self.clahe.apply(l)
        limg = cv2.merge((cl, a, b))
        return cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)

    def align_face(self, frame, landmarks):
        left_eye, right_eye = landmarks[0], landmarks[1]
        dy = right_eye[1] - left_eye[1]
        dx = right_eye[0] - left_eye[0]
        angle = np.degrees(np.arctan2(dy, dx))
        center = ((left_eye[0] + right_eye[0]) // 2, (left_eye[1] + right_eye[1]) // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        h, w = frame.shape[:2]
        return cv2.warpAffine(frame, M, (w, h), flags=cv2.INTER_CUBIC)

    def get_central_face(self, faces, img_w, img_h):
        center_x, center_y = img_w // 2, img_h // 2
        best_face = None
        min_dist = float('inf')

        for face in faces:
            x1, y1, x2, y2 = face.bbox
            face_cx = (x1 + x2) // 2
            face_cy = (y1 + y2) // 2
            dist = math.sqrt((face_cx - center_x)**2 + (face_cy - center_y)**2)
            if dist < min_dist:
                min_dist = dist
                best_face = face
        return best_face

    def process_video(self, frame):
        enhanced_frame = self.enhance_image(frame)

        faces = face_app.get(enhanced_frame)
        if not faces:
            self.last_bbox = None
            return None

        h, w, _ = frame.shape
        face = self.get_central_face(faces, w, h)

        curr_bbox = face.bbox
        if self.last_bbox is not None:
            curr_bbox = self.last_bbox * (1 - self.box_alpha) + curr_bbox * self.box_alpha
        self.last_bbox = curr_bbox
        x1, y1, x2, y2 = map(int, curr_bbox)

        aligned_frame = self.align_face(enhanced_frame, face.kps)

        h_a, w_a, _ = aligned_frame.shape
        pad_w = int((x2 - x1) * 0.25)
        pad_h = int((y2 - y1) * 0.25)
        x1, y1 = max(0, x1 - pad_w), max(0, y1 - pad_h)
        x2, y2 = min(w_a, x2 + pad_w), min(h_a, y2 + pad_h)

        face_img = aligned_frame[y1:y2, x1:x2]
        if face_img.size == 0:
            return None

        pil_img = Image.fromarray(cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB))
        inputs = processor(images=pil_img, return_tensors="pt").to(DEVICE)

        with torch.no_grad():
            logits = video_model(**inputs).logits
            probs = F.softmax(logits, dim=-1).cpu().numpy()[0]

        scores = {k: 0.0 for k in COMMON_EMOTIONS}
        for i, p in enumerate(probs):
            label = vid_id2label[i].lower()
            val = float(p)

            if 'happ' in label: scores['happy'] += val
            elif 'sad' in label: scores['sad'] += val
            elif 'ang' in label: scores['angry'] += val
            elif 'fear' in label: scores['fear'] += val
            elif 'surp' in label: scores['surprise'] += val
            elif 'disg' in label: scores['disgust'] += val
            else: scores['neutral'] += val

        self.video_buffer.append(scores)

        avg_scores = {k: 0.0 for k in COMMON_EMOTIONS}
        current_buffer = list(self.video_buffer)

        if len(current_buffer) < 3:
            for s in current_buffer:
                for k, v in s.items(): avg_scores[k] += v
        else:
            weights = np.linspace(0.5, 1.5, len(current_buffer))
            weights /= weights.sum()
            for idx, s in enumerate(current_buffer):
                for k, v in s.items(): avg_scores[k] += (v * weights[idx])

        total = sum(avg_scores.values())
        return {k: float(v)/total for k, v in avg_scores.items()} if total > 0 else scores

    def process_audio(self, raw_b64):
        try:
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",")[-1]
            audio_data = base64.b64decode(raw_b64)
            audio_file = io.BytesIO(audio_data)
            audio = AudioSegment.from_file(audio_file, format="webm")
            audio = audio.set_frame_rate(16000).set_channels(1)

            chunk = np.array(audio.get_array_of_samples(), dtype=np.float32) / (2**15)

            rms = np.sqrt(np.mean(chunk**2))
            if rms < self.audio_rms_threshold:
                return None

            self.audio_buffer_raw = np.concatenate((self.audio_buffer_raw, chunk))

            max_len = 16000 * 3
            if len(self.audio_buffer_raw) > max_len:
                self.audio_buffer_raw = self.audio_buffer_raw[-max_len:]

            if len(self.audio_buffer_raw) < 16000:
                return None

            inputs = audio_extractor(self.audio_buffer_raw, sampling_rate=16000, return_tensors="pt", padding=True).to(DEVICE)
            with torch.no_grad():
                logits = audio_model(**inputs).logits
                probs = F.softmax(logits, dim=-1).cpu().numpy()[0]

            scores = {k: 0.0 for k in COMMON_EMOTIONS}
            for i, p in enumerate(probs):
                label = aud_id2label[i].lower()
                val = float(p)

                if 'neu' in label: scores['neutral'] += val
                elif 'hap' in label: scores['happy'] += val
                elif 'ang' in label: scores['angry'] += val
                elif 'sad' in label: scores['sad'] += val
                elif 'fear' in label: scores['fear'] += val

            return scores
        except:
            return None

    def fusion(self, v_scores, a_scores):
        if not v_scores and not a_scores: return "neutral", {}
        if not a_scores: return max(v_scores, key=v_scores.get), v_scores
        if not v_scores: return max(a_scores, key=a_scores.get), a_scores

        final_scores = {k: 0.0 for k in COMMON_EMOTIONS}

        for k in COMMON_EMOTIONS:
            w_v, w_a = 0.6, 0.4
            if k in ['angry', 'fear']:
                w_a = 0.7
                w_v = 0.3
            val = (float(v_scores.get(k, 0)) * w_v) + (float(a_scores.get(k, 0)) * w_a)
            final_scores[k] = val

        total = sum(final_scores.values())
        if total > 0:
            final_scores = {k: float(v)/total for k, v in final_scores.items()}
        return max(final_scores, key=final_scores.get), final_scores

# ------------------- DB HELPERS -------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_session_by_uuid(db: Session, session_uuid: str) -> Optional[SessionRecord]:
    return db.query(SessionRecord).filter(SessionRecord.session_uuid == session_uuid).first()

def format_duration_from_seconds(total_seconds: int) -> str:
    return f"{total_seconds // 60:02}:{total_seconds % 60:02}"

def ensure_active_session_for_patient(db: Session, patient_id: int) -> SessionRecord:
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    existing = (
        db.query(SessionRecord)
        .filter(
            SessionRecord.patient_id == patient_id,
            SessionRecord.status == "active"
        )
        .order_by(SessionRecord.started_at.desc(), SessionRecord.id.desc())
        .first()
    )
    if existing:
        return existing

    new_session = SessionRecord(
        patient_id=patient_id,
        session_uuid=f"session_{uuid.uuid4().hex}",
        status="active",
        started_at=datetime.utcnow(),
        date_recorded=datetime.utcnow(),
        duration="00:00",
        video_url=""
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session

def get_live_session_payload(session_uuid: str):
    state = LIVE_SESSION_STATE.get(session_uuid)
    if not state:
        return {
            "status": "idle",
            "session_uuid": session_uuid,
            "timestamp": "00:00",
            "emotion": "neutral",
            "scores": {k: 0.0 for k in COMMON_EMOTIONS},
            "updated_at": None,
        }
    return state

# --- PATIENT ROUTES ---
@app.get("/patients", response_model=List[dict])
def list_patients(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    results = []
    today = date.today()

    for p in patients:
        age = "N/A"
        if p.dob:
            age = today.year - p.dob.year - ((today.month, today.day) < (p.dob.month, p.dob.day))

        results.append({
            "id": p.id,
            "name": p.name,
            "external_id": p.external_id,
            "age": age,
            "gender": p.gender,
            "contact": p.contact_info
        })
    return results

@app.get("/patients/{patient_id}")
def get_patient_details(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    return {
        "id": patient.id,
        "name": patient.name,
        "external_id": patient.external_id,
        "dob": patient.dob,
        "gender": patient.gender,
        "contact_info": patient.contact_info,
        "medical_history": patient.medical_history
    }

@app.put("/patients/{patient_id}")
def update_patient(patient_id: int, patient_data: dict, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient.name = patient_data.get('name', patient.name)
    patient.external_id = patient_data.get('external_id', patient.external_id)
    patient.gender = patient_data.get('gender', patient.gender)
    patient.contact_info = patient_data.get('contact_info', patient.contact_info)
    patient.medical_history = patient_data.get('medical_history', patient.medical_history)

    if patient_data.get('dob'):
        try:
            patient.dob = datetime.strptime(patient_data.get('dob'), "%Y-%m-%d").date()
        except:
            pass

    try:
        db.commit()
        db.refresh(patient)
        return patient
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed. MRN may be duplicate.")

@app.post("/patients")
def register_patient(patient_data: dict, db: Session = Depends(get_db)):
    ext_id = patient_data.get('external_id', '').strip() if patient_data.get('external_id') else None
    if ext_id:
        existing = db.query(Patient).filter(Patient.external_id == ext_id).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"MRN '{ext_id}' is already taken by patient '{existing.name}' (ID {existing.id})."
            )

    dob_obj = None
    if patient_data.get('dob'):
        try:
            dob_obj = datetime.strptime(patient_data.get('dob'), "%Y-%m-%d").date()
        except:
            pass

    new_patient = Patient(
        name=patient_data.get('name'),
        external_id=ext_id,
        dob=dob_obj,
        gender=patient_data.get('gender'),
        contact_info=patient_data.get('contact_info'),
        medical_history=patient_data.get('medical_history')
    )
    db.add(new_patient)
    try:
        db.commit()
        db.refresh(new_patient)
        return new_patient
    except Exception as e:
        db.rollback()
        print(e)
        if "Duplicate" in str(e) or "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail=f"MRN '{ext_id}' is already taken.")
        raise HTTPException(status_code=400, detail="Registration failed.")

# --- SESSION ROUTES ---
@app.post("/sessions/start")
def start_session(data: dict, db: Session = Depends(get_db)):
    patient_id = data.get("patient_id")
    if not patient_id:
        raise HTTPException(status_code=400, detail="patient_id is required")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    existing = (
        db.query(SessionRecord)
        .filter(
            SessionRecord.patient_id == patient_id,
            SessionRecord.status == "active"
        )
        .order_by(SessionRecord.started_at.desc(), SessionRecord.id.desc())
        .first()
    )

    if existing:
        print(f"[SESSION] Reusing existing session: {existing.session_uuid}")
        return {
            "status": "ok",
            "session_id": existing.id,
            "session_uuid": existing.session_uuid,
            "patient_id": existing.patient_id,
            "started_at": existing.started_at.isoformat() if existing.started_at else None
        }

    new_session = SessionRecord(
        patient_id=patient_id,
        session_uuid=f"session_{uuid.uuid4().hex}",
        status="active",
        started_at=datetime.utcnow(),
        date_recorded=datetime.utcnow(),
        duration="00:00",
        video_url=""
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    print(f"[SESSION] Created new session: {new_session.session_uuid}")

    return {
        "status": "ok",
        "session_id": new_session.id,
        "session_uuid": new_session.session_uuid,
        "patient_id": new_session.patient_id,
        "started_at": new_session.started_at.isoformat() if new_session.started_at else None
    }

@app.post("/sessions/{session_uuid}/end")
def end_session(session_uuid: str, db: Session = Depends(get_db)):
    session = get_session_by_uuid(db, session_uuid)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != "completed":
        ended_at = datetime.utcnow()
        session.ended_at = ended_at
        session.status = "completed"

        start_dt = session.started_at or session.date_recorded or ended_at
        duration_seconds = max(0, int((ended_at - start_dt).total_seconds()))
        session.duration = format_duration_from_seconds(duration_seconds)

        db.commit()
        db.refresh(session)

    return {
        "status": "ok",
        "session_id": session.id,
        "session_uuid": session.session_uuid,
        "duration": session.duration
    }

# --- HISTORY ROUTES ---
@app.get("/history/{patient_id}")
def get_patient_history(patient_id: int, db: Session = Depends(get_db)):
    sessions = (
        db.query(SessionRecord)
        .filter(SessionRecord.patient_id == patient_id)
        .options(joinedload(SessionRecord.timeline))
        .order_by(SessionRecord.date_recorded.desc())
        .all()
    )

    history_data = []
    for s in sessions:
        history_data.append({
            "id": s.id,
            "date": s.date_recorded.strftime("%Y-%m-%d %H:%M"),
            "duration": s.duration,
            "video_url": s.video_url,
            "timeline": [{"time": t.timestamp_str, "emotion": t.emotion} for t in s.timeline]
        })
    return history_data

# --- GAME EVENT ROUTES ---
@app.post("/api/game-event")
def log_game_event(data: dict, db: Session = Depends(get_db)):
    session_uuid = data.get("session_uuid")
    patient_id = data.get("patient_id")

    session = None

    if session_uuid:
        session = get_session_by_uuid(db, session_uuid)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    elif patient_id:
        session = ensure_active_session_for_patient(db, patient_id)
    else:
        raise HTTPException(status_code=400, detail="session_uuid or patient_id is required")

    item_id = data.get("scenario_id") or data.get("texture_id") or data.get("item_id") or data.get("event_type")
    if not item_id:
        raise HTTPException(status_code=400, detail="scenario_id, texture_id, item_id, or event_type is required")

    correct_value = data.get("correct")
    if correct_value is None:
        correct = None
    else:
        correct = 1 if bool(correct_value) else 0

    selected_value = data.get("selected")
    if selected_value is None and data.get("feeling") is not None:
        selected_value = data.get("feeling")

    event = GameEvent(
        session_id=session.id,
        event_type=data.get("event_type"),
        item_id=item_id,
        expected=data.get("expected"),
        selected=selected_value,
        correct=correct,
        attempts=data.get("attempts"),
        duration_ms=data.get("duration_ms"),
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return {
        "status": "ok",
        "event_id": event.id,
        "session_id": session.id,
        "session_uuid": session.session_uuid
    }

@app.get("/api/game-events/{session_id}")
def get_game_events(session_id: int, db: Session = Depends(get_db)):
    events = (
        db.query(GameEvent)
        .filter(GameEvent.session_id == session_id)
        .order_by(GameEvent.timestamp.asc(), GameEvent.id.asc())
        .all()
    )
    return [
        {
            "id": e.id,
            "session_id": e.session_id,
            "event_type": e.event_type,
            "item_id": e.item_id,
            "expected": e.expected,
            "selected": e.selected,
            "correct": e.correct,
            "attempts": e.attempts,
            "duration_ms": e.duration_ms,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in events
    ]

@app.get("/api/game-events/latest/{patient_id}")
def get_latest_game_events(patient_id: int, db: Session = Depends(get_db)):
    latest_session = (
        db.query(SessionRecord)
        .filter(SessionRecord.patient_id == patient_id)
        .order_by(SessionRecord.date_recorded.desc(), SessionRecord.id.desc())
        .first()
    )
    if not latest_session:
        return []

    events = (
        db.query(GameEvent)
        .filter(GameEvent.session_id == latest_session.id)
        .order_by(GameEvent.timestamp.asc(), GameEvent.id.asc())
        .all()
    )
    return [
        {
            "id": e.id,
            "session_id": e.session_id,
            "event_type": e.event_type,
            "item_id": e.item_id,
            "expected": e.expected,
            "selected": e.selected,
            "correct": e.correct,
            "attempts": e.attempts,
            "duration_ms": e.duration_ms,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in events
    ]

@app.get("/history")
def get_history():
    sessions = []
    video_files = list(UPLOAD_DIR.glob("*.webm")) + list(UPLOAD_DIR.glob("*.mp4"))

    for video_path in video_files:
        if "temp_" in video_path.name:
            continue

        session_id = video_path.stem
        json_path = UPLOAD_DIR / f"{session_id}.json"

        file_stat = video_path.stat()
        creation_time = datetime.fromtimestamp(file_stat.st_mtime).strftime("%Y-%m-%d %H:%M")

        session_data = {
            "id": session_id,
            "date": creation_time,
            "duration": "Unknown",
            "timeline": [],
            "video_url": f"/uploads/{video_path.name}"
        }

        if json_path.exists():
            try:
                with open(json_path, "r") as f:
                    saved_data = json.load(f)
                    session_data["duration"] = saved_data.get("duration", "Unknown")
                    session_data["timeline"] = saved_data.get("timeline", [])
                    if "date" in saved_data:
                        session_data["date"] = saved_data["date"]
            except:
                pass

        sessions.append(session_data)

    return sorted(sessions, key=lambda x: x['date'], reverse=True)

@app.get("/sessions/{session_uuid}/live")
def get_live_session(session_uuid: str):
    return get_live_session_payload(session_uuid)

# ------------------- REPORT / NOTES / TRENDS HELPERS (FROM YOUR VERSION) -------------------

def _parse_seconds(time_str: str) -> int:
    if not time_str:
        return 0
    parts = list(map(int, time_str.split(':')))
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return parts[0] * 60 + (parts[1] if len(parts) > 1 else 0)


def _build_timeline_svg(timeline, total_secs: int, width: int = 740, height: int = 32) -> str:
    if not timeline or total_secs == 0:
        return ''
    colors = {
        'happy': '#10b981', 'sad': '#3b82f6', 'angry': '#f43f5e',
        'fear': '#a855f7', 'surprise': '#f59e0b', 'neutral': '#94a3b8', 'disgust': '#f97316'
    }
    rects = []
    for i, e in enumerate(timeline):
        start = e.seconds
        end = timeline[i + 1].seconds if i < len(timeline) - 1 else total_secs
        dur = max(0, end - start)
        x = (start / total_secs) * width
        w = max(1.5, (dur / total_secs) * width)
        color = colors.get(e.emotion.lower() if e.emotion else 'neutral', '#94a3b8')
        rects.append(f'<rect x="{x:.1f}" y="0" width="{w:.1f}" height="{height}" fill="{color}"/>')

    ticks = []
    for frac in [0, 0.25, 0.5, 0.75, 1.0]:
        t = int(frac * total_secs)
        x = frac * width
        m, s = divmod(t, 60)
        anchor = 'start' if frac == 0 else ('end' if frac == 1.0 else 'middle')
        ticks.append(
            f'<text x="{x:.1f}" y="{height + 14}" font-size="9" fill="#94a3b8" '
            f'text-anchor="{anchor}" font-family="monospace">{m:02d}:{s:02d}</text>'
        )

    return (
        f'<svg width="{width}" height="{height + 18}" xmlns="http://www.w3.org/2000/svg" '
        f'style="border-radius:6px;overflow:hidden;display:block">'
        f'{"".join(rects)}{"".join(ticks)}</svg>'
    )

# ------------------- REPORT (FROM YOUR VERSION) -------------------

@app.get("/report/{session_id}", response_class=HTMLResponse)
def generate_report(session_id: int, db: Session = Depends(get_db)):
    session = db.query(SessionRecord).filter(SessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    patient = db.query(Patient).filter(Patient.id == session.patient_id).first()
    notes = db.query(Note).filter(Note.session_id == session_id).order_by(Note.seconds).all()
    timeline = sorted(session.timeline, key=lambda t: t.seconds)

    duration_secs = _parse_seconds(session.duration) if session.duration else 0
    if duration_secs == 0 and timeline:
        duration_secs = timeline[-1].seconds + 10

    emo_colors = {
        'happy': '#10b981', 'sad': '#3b82f6', 'angry': '#f43f5e',
        'fear': '#a855f7', 'surprise': '#f59e0b', 'neutral': '#94a3b8', 'disgust': '#f97316'
    }
    distribution: dict = {}
    for i, e in enumerate(timeline):
        end = timeline[i + 1].seconds if i < len(timeline) - 1 else duration_secs
        dur = max(0, end - e.seconds)
        emo = (e.emotion or 'neutral').lower()
        distribution[emo] = distribution.get(emo, 0) + dur

    dist_sorted = sorted(distribution.items(), key=lambda x: x[1], reverse=True)
    dominant = dist_sorted[0][0] if dist_sorted else 'neutral'
    dominant_color = emo_colors.get(dominant, '#94a3b8')

    dist_rows = ''
    for emo, secs in dist_sorted:
        pct = round((secs / duration_secs) * 100) if duration_secs else 0
        m, s = divmod(int(secs), 60)
        color = emo_colors.get(emo, '#94a3b8')
        dist_rows += (
            f'<tr>'
            f'<td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;'
            f'background:{color};margin-right:6px;vertical-align:middle"></span>'
            f'<span style="text-transform:capitalize">{html_module.escape(emo)}</span></td>'
            f'<td style="font-weight:700">{pct}%</td>'
            f'<td style="color:#94a3b8;font-family:monospace">{m:02d}m {s:02d}s</td>'
            f'<td><div style="height:8px;background:{color};border-radius:4px;width:{pct}%;opacity:0.7;min-width:2px"></div></td>'
            f'</tr>'
        )

    distress = {'fear', 'angry', 'sad'}
    key_moments = []
    seen = set()
    for e in timeline:
        emo = (e.emotion or 'neutral').lower()
        if emo in distress and emo not in seen:
            key_moments.append((e.timestamp_str, f'First {emo} detected', e.confidence or 0, emo))
            seen.add(emo)
    if timeline:
        peak = max(timeline, key=lambda e: e.confidence or 0)
        if peak.confidence and peak.confidence > 0.65:
            key_moments.append((
                peak.timestamp_str,
                f'Peak confidence — {peak.emotion}',
                peak.confidence, (peak.emotion or 'neutral').lower()
            ))
    key_moments.sort(key=lambda x: _parse_seconds(x[0]))

    moment_rows = ''
    if key_moments:
        for ts, label, conf, emo in key_moments:
            color = emo_colors.get(emo, '#94a3b8')
            moment_rows += (
                f'<tr>'
                f'<td style="font-family:monospace;font-weight:700;color:#4f46e5">{html_module.escape(ts or "")}</td>'
                f'<td>{html_module.escape(label)}</td>'
                f'<td style="color:{color};font-weight:700">{round((conf or 0) * 100)}%</td>'
                f'</tr>'
            )
    else:
        moment_rows = '<tr><td colspan="3" style="color:#94a3b8;text-align:center;padding:12px">No significant moments detected</td></tr>'

    notes_html = ''
    if notes:
        items = ''.join([
            f'<div style="padding:10px 12px;background:#f8fafc;border-left:3px solid #4f46e5;'
            f'margin-bottom:8px;border-radius:0 6px 6px 0">'
            f'<span style="font-size:10px;font-weight:700;color:#4f46e5;font-family:monospace">'
            f'{html_module.escape(n.timestamp_str or "00:00")}</span>'
            f'<p style="margin:4px 0 0;font-size:12px;color:#334155">{html_module.escape(n.note_text or "")}</p>'
            f'</div>'
            for n in notes
        ])
        notes_html = f'<div class="section"><h2>Clinician Notes</h2>{items}</div>'

    svg = _build_timeline_svg(timeline, duration_secs)
    legend = ''.join([
        f'<div style="display:flex;align-items:center;gap:4px">'
        f'<div style="width:10px;height:10px;border-radius:50%;background:{c}"></div>'
        f'<span style="font-size:10px;color:#64748b;text-transform:capitalize">{e}</span></div>'
        for e, c in emo_colors.items()
    ])

    patient_name = html_module.escape(patient.name if patient else 'Unknown')
    patient_mrn = html_module.escape(patient.external_id if patient else 'N/A')
    session_date = session.date_recorded.strftime('%B %d, %Y') if session.date_recorded else 'N/A'

    safe_patient_name = patient_name.replace('"', '').replace("'", '')
    pdf_filename = f"report_{safe_patient_name.replace(' ', '_')}_session{session_id}.pdf"

    report_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Session Report — {patient_name}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
window.onload = function() {{
  var btn = document.getElementById('dl-btn');
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;
  var opt = {{
    margin: [10, 10, 10, 10],
    filename: '{pdf_filename}',
    image: {{ type: 'jpeg', quality: 0.97 }},
    html2canvas: {{ scale: 2, useCORS: true, logging: false }},
    jsPDF: {{ unit: 'mm', format: 'a4', orientation: 'portrait' }}
  }};
  html2pdf().set(opt).from(document.getElementById('report')).save().then(function() {{
    btn.textContent = '✓ Downloaded';
    btn.style.background = '#10b981';
  }});
}};
</script>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1e293b;padding:32px;max-width:840px;margin:0 auto;background:#fff}}
#dl-btn{{background:#4f46e5;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;margin-bottom:24px;transition:background .2s}}
#dl-btn:hover:not(:disabled){{background:#4338ca}}
#dl-btn:disabled{{opacity:.7;cursor:default}}
.header{{border-bottom:3px solid #4f46e5;padding-bottom:16px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-start}}
.logo{{font-size:22px;font-weight:900;color:#4f46e5}}
.section{{margin-bottom:28px}}
h2{{font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px}}
.grid-2{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}
.grid-4{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}
.card{{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px}}
.cl{{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}}
.cv{{font-size:15px;font-weight:800;color:#1e293b}}
table{{width:100%;border-collapse:collapse;font-size:12px}}
th{{font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0}}
td{{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}}
tr:last-child td{{border-bottom:none}}
@media print{{#dl-btn{{display:none}}body{{padding:16px}}@page{{margin:1.5cm}}}}
</style>
</head>
<body>
<button id="dl-btn">&#x2B07; Downloading PDF…</button>
<div id="report">
<div class="header">
  <div>
    <div class="logo">Clinician<span style="color:#1e293b">.AI</span></div>
    <div style="font-size:13px;color:#64748b;margin-top:4px;font-weight:600">Clinical Session Report</div>
  </div>
  <div style="text-align:right;font-size:11px;color:#94a3b8">
    <div>Generated {datetime.now().strftime('%B %d, %Y')}</div>
    <div style="font-family:monospace;margin-top:2px">Session #{session_id}</div>
  </div>
</div>
<div class="section">
  <h2>Patient Information</h2>
  <div class="grid-2">
    <div class="card"><div class="cl">Patient Name</div><div class="cv">{patient_name}</div></div>
    <div class="card"><div class="cl">Medical Record No.</div><div class="cv" style="font-family:monospace">{patient_mrn}</div></div>
  </div>
</div>
<div class="section">
  <h2>Session Summary</h2>
  <div class="grid-4">
    <div class="card"><div class="cl">Date</div><div class="cv" style="font-size:12px">{session_date}</div></div>
    <div class="card"><div class="cl">Duration</div><div class="cv" style="font-family:monospace">{session.duration or 'N/A'}</div></div>
    <div class="card"><div class="cl">Dominant Emotion</div><div class="cv" style="color:{dominant_color};text-transform:capitalize">{dominant}</div></div>
    <div class="card"><div class="cl">Emotion Shifts</div><div class="cv">{len(timeline)}</div></div>
  </div>
</div>
<div class="section">
  <h2>Emotion Timeline</h2>
  {svg}
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">{legend}</div>
</div>
<div class="section">
  <h2>Emotion Distribution</h2>
  <table>
    <thead><tr><th>Emotion</th><th>% of Session</th><th>Duration</th><th style="width:30%">Proportion</th></tr></thead>
    <tbody>{dist_rows}</tbody>
  </table>
</div>
<div class="section">
  <h2>Key Moments</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Event</th><th>Confidence</th></tr></thead>
    <tbody>{moment_rows}</tbody>
  </table>
</div>
{notes_html}
</div>
</body>
</html>"""
    return HTMLResponse(content=report_html)

# ------------------- TRENDS (FROM YOUR VERSION) -------------------

@app.get("/trends/{patient_id}")
def get_trends(patient_id: int, db: Session = Depends(get_db)):
    sessions = (
        db.query(SessionRecord)
        .filter(SessionRecord.patient_id == patient_id)
        .options(joinedload(SessionRecord.timeline))
        .order_by(SessionRecord.date_recorded)
        .all()
    )
    if len(sessions) < 2:
        return {"insights": []}

    def _session_pcts(session):
        counts: dict = {}
        for e in session.timeline:
            emo = (e.emotion or 'neutral').lower()
            counts[emo] = counts.get(emo, 0) + 1
        total = sum(counts.values()) or 1
        return {emo: (counts.get(emo, 0) / total) * 100 for emo in COMMON_EMOTIONS}

    pcts_list = [_session_pcts(s) for s in sessions]
    mid = len(pcts_list) // 2
    first_half = pcts_list[:mid]
    second_half = pcts_list[mid:]

    def _avg(half, emo):
        return sum(s.get(emo, 0) for s in half) / len(half)

    insights = []
    for emo in ['fear', 'sad', 'angry']:
        delta = _avg(second_half, emo) - _avg(first_half, emo)
        if delta > 10:
            insights.append({"type": "warning", "emotion": emo,
                              "message": f"{emo.capitalize()} has increased by {delta:.0f}% across recent sessions."})
        elif delta < -10:
            insights.append({"type": "positive", "emotion": emo,
                              "message": f"{emo.capitalize()} has decreased by {abs(delta):.0f}% — improving trend."})
    for emo in ['happy', 'neutral']:
        delta = _avg(second_half, emo) - _avg(first_half, emo)
        if delta > 10:
            insights.append({"type": "positive", "emotion": emo,
                              "message": f"{emo.capitalize()} has increased by {delta:.0f}% — positive trend."})
        elif delta < -10:
            insights.append({"type": "warning", "emotion": emo,
                              "message": f"{emo.capitalize()} has decreased by {abs(delta):.0f}% across recent sessions."})

    return {"insights": insights}

# ------------------- NOTES (FROM YOUR VERSION) -------------------

class NoteIn(BaseModel):
    seconds: int
    timestamp_str: str
    note_text: str


@app.get("/sessions/{session_id}/notes")
def get_notes(session_id: int, db: Session = Depends(get_db)):
    notes = (
        db.query(Note)
        .filter(Note.session_id == session_id)
        .order_by(Note.seconds)
        .all()
    )
    return [
        {"id": n.id, "seconds": n.seconds, "timestamp_str": n.timestamp_str,
         "note_text": n.note_text, "created_at": n.created_at.isoformat() if n.created_at else None}
        for n in notes
    ]


@app.post("/sessions/{session_id}/notes")
def add_note(session_id: int, body: NoteIn, db: Session = Depends(get_db)):
    session = db.query(SessionRecord).filter(SessionRecord.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    note = Note(
        session_id=session_id,
        seconds=body.seconds,
        timestamp_str=body.timestamp_str,
        note_text=body.note_text,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {"id": note.id, "seconds": note.seconds, "timestamp_str": note.timestamp_str,
            "note_text": note.note_text, "created_at": note.created_at.isoformat() if note.created_at else None}


@app.delete("/notes/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}

# ------------------- WEBSOCKET STREAM (ALISHA'S VERSION) -------------------

@app.websocket("/ws/child-session/{patient_id}")
async def child_session_stream(ws: WebSocket, patient_id: int):
    print(f"[WS] Incoming child-session connection for patient_id={patient_id}")
    await stream(ws, patient_id=patient_id, session_uuid=None)

@app.websocket("/ws/session/{session_uuid}")
async def session_stream(ws: WebSocket, session_uuid: str):
    print(f"[WS] Incoming session connection for session_uuid={session_uuid}")
    await stream(ws, patient_id=None, session_uuid=session_uuid)

async def stream(ws: WebSocket, patient_id: Optional[int] = None, session_uuid: Optional[str] = None):
    await ws.accept()

    db = SessionLocal()
    engine_state = EmotionEngine()

    active_session = None

    try:
        if session_uuid:
            active_session = get_session_by_uuid(db, session_uuid)
            if not active_session:
                await ws.send_json({"status": "error", "detail": "Session not found"})
                await ws.close()
                return
        else:
            if patient_id is None:
                await ws.send_json({"status": "error", "detail": "patient_id or session_uuid required"})
                await ws.close()
                return
            active_session = ensure_active_session_for_patient(db, patient_id)

        session_uuid = active_session.session_uuid

        temp_video_path = UPLOAD_DIR / f"temp_vid_{session_uuid}.webm"
        temp_audio_path = UPLOAD_DIR / f"temp_aud_{session_uuid}.wav"
        final_output_path = UPLOAD_DIR / f"{session_uuid}.webm"
        json_path = UPLOAD_DIR / f"{session_uuid}.json"

        fourcc = cv2.VideoWriter_fourcc(*'vp80')
        out = cv2.VideoWriter(str(temp_video_path), fourcc, 5.0, (640, 480))
        audio_buffer = io.BytesIO()

        start_time = time.time()
        session_timeline = []

        last_v_scores = None
        last_a_scores = None
        frame_count = 0

        try:
            while True:
                data = await ws.receive_json()

                print("📡 WS DATA RECEIVED:", list(data.keys()))

                if data.get("event") == "stop":
                    await ws.send_json({"status": "finished", "session_uuid": session_uuid})
                    break

                if "image" in data:
                    img_bytes = base64.b64decode(data["image"].split(",")[-1])
                    frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                    if frame is not None:
                        resized = cv2.resize(frame, (640, 480))
                        out.write(resized)

                        frame_count += 1
                        if frame_count % 3 == 0:
                            v_res = engine_state.process_video(resized)
                            if v_res:
                                last_v_scores = v_res

                if data.get("audio"):
                    raw_audio = data["audio"]
                    try:
                        audio_bytes = base64.b64decode(raw_audio.split(",")[-1])
                        audio_buffer.write(audio_bytes)

                        a_res = engine_state.process_audio(raw_audio)
                        if a_res:
                            last_a_scores = a_res
                    except:
                        pass

                final_emotion, final_scores = engine_state.fusion(last_v_scores, last_a_scores)
                print("🧠 EMOTION:", final_emotion)

                elapsed = int(time.time() - start_time)
                timestamp = f"{elapsed // 60:02}:{elapsed % 60:02}"

                should_log = False
                if not session_timeline:
                    should_log = True
                elif session_timeline[-1]["emotion"] != final_emotion:
                    should_log = True
                elif (elapsed - session_timeline[-1]["seconds"]) > 2:
                    should_log = True

                if should_log:
                    session_timeline.append({
                        "time": timestamp,
                        "seconds": elapsed,
                        "emotion": final_emotion,
                        "confidence": float(final_scores.get(final_emotion, 0))
                    })

                live_payload = {
                    "status": "processing",
                    "session_uuid": session_uuid,
                    "timestamp": timestamp,
                    "emotion": final_emotion,
                    "scores": final_scores,
                    "updated_at": datetime.utcnow().isoformat()
                }

                LIVE_SESSION_STATE[session_uuid] = live_payload

                await ws.send_json(live_payload)

        except WebSocketDisconnect:
            print("Client disconnected.")

        finally:
            print(f"💾 Finalizing session {session_uuid}...")
            out.release()

            audio_buffer.seek(0)
            has_audio = audio_buffer.getbuffer().nbytes > 0

            if has_audio:
                final_audio = AudioSegment.from_file(audio_buffer, format="webm")
                final_audio.export(temp_audio_path, format="wav")

            try:
                if has_audio:
                    command = [
                        "ffmpeg", "-y",
                        "-i", str(temp_video_path),
                        "-i", str(temp_audio_path),
                        "-c:v", "copy",
                        "-c:a", "libopus",
                        str(final_output_path)
                    ]
                else:
                    command = [
                        "ffmpeg", "-y",
                        "-i", str(temp_video_path),
                        "-c:v", "copy",
                        str(final_output_path)
                    ]

                subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                if temp_video_path.exists():
                    os.remove(temp_video_path)
                if temp_audio_path.exists() and has_audio:
                    os.remove(temp_audio_path)

                print("✅ Session Saved.")

            except Exception as e:
                print(f"❌ Save Failed: {e}")
                if temp_video_path.exists():
                    os.rename(temp_video_path, final_output_path)

            duration_delta = int(time.time() - start_time)
            duration_str = format_duration_from_seconds(duration_delta)

            with open(json_path, "w") as f:
                json.dump({
                    "session_id": session_uuid,
                    "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                    "duration": duration_str,
                    "timeline": session_timeline
                }, f, indent=2)

            try:
                active_session.video_url = f"/uploads/{session_uuid}.webm"
                active_session.duration = duration_str
                active_session.ended_at = datetime.utcnow()
                active_session.status = "completed"

                db.query(TimelineEntry).filter(TimelineEntry.session_id == active_session.id).delete()

                db.commit()

                if session_timeline:
                    db_entries = [
                        TimelineEntry(
                            session_id=active_session.id,
                            timestamp_str=e["time"],
                            seconds=e["seconds"],
                            emotion=e["emotion"],
                            confidence=e["confidence"]
                        )
                        for e in session_timeline
                    ]
                    db.add_all(db_entries)
                    db.commit()

                db.refresh(active_session)

            except Exception as e:
                db.rollback()
                print(f"DB Error: {e}")

    finally:
        if session_uuid:
            LIVE_SESSION_STATE[session_uuid] = {
                "status": "finished",
                "session_uuid": session_uuid,
                "timestamp": duration_str if "duration_str" in locals() else "00:00",
                "emotion": session_timeline[-1]["emotion"] if "session_timeline" in locals() and session_timeline else "neutral",
                "scores": {k: 0.0 for k in COMMON_EMOTIONS},
                "updated_at": datetime.utcnow().isoformat()
            }

        db.close()
