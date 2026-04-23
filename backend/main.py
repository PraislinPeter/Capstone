import asyncio
import cv2
import torch
import base64
import numpy as np
import torch.nn.functional as F
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

# --- FastAPI & Type Hinting Imports ---
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List
import html as html_module

# --- AI & ML Imports ---
from transformers import AutoImageProcessor, AutoModelForImageClassification, Wav2Vec2FeatureExtractor, AutoModelForAudioClassification
from insightface.app import FaceAnalysis

# --- Database Imports ---
from sqlalchemy.orm import Session, joinedload
from database import SessionLocal, engine, Patient, SessionRecord, TimelineEntry, Note, Base, init_db

# ------------------- CONFIGURATION -------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

EMOTION_MODEL = "trpakov/vit-face-expression"
AUDIO_MODEL = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()

@app.on_event("startup")
def on_startup():
    init_db()
    print("✅ API started (models load on first emotion detection)")

# Fixed: Only one CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ------------------- MODEL LOADING (LAZY - ONLY ON FIRST USE) -------------------
processor = None
video_model = None
vid_id2label = None
face_app = None
audio_extractor = None
audio_model = None
aud_id2label = None
SILERO_VAD_MODEL = None
get_speech_timestamps = None
USE_SILERO_VAD = False
models_loaded = False

COMMON_EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise', 'disgust']

def _load_models():
    """Load all ML models ONLY on first emotion detection"""
    global processor, video_model, vid_id2label, face_app
    global audio_extractor, audio_model, aud_id2label
    global SILERO_VAD_MODEL, get_speech_timestamps, USE_SILERO_VAD, models_loaded
    
    if models_loaded:
        return  # Already loaded
    
    print(f"🚀 Loading Clinical Models on {DEVICE}...")
    
    # 1. Vision Model
    processor = AutoImageProcessor.from_pretrained(EMOTION_MODEL)
    video_model = AutoModelForImageClassification.from_pretrained(EMOTION_MODEL).to(DEVICE).eval()
    vid_id2label = video_model.config.id2label
    
    # 2. Face Detection
    face_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider" if DEVICE == "cuda" else "CPUExecutionProvider"]
    )
    face_app.prepare(ctx_id=0 if DEVICE == "cuda" else -1, det_size=(640, 640))
    
    # 3. Audio Model
    audio_extractor = Wav2Vec2FeatureExtractor.from_pretrained("facebook/wav2vec2-large-xlsr-53")
    audio_model = AutoModelForAudioClassification.from_pretrained(AUDIO_MODEL).to(DEVICE).eval()
    aud_id2label = audio_model.config.id2label
    
    print(f"  ✅ Video labels: {vid_id2label}")
    print(f"  ✅ Audio labels: {aud_id2label}")
    
    # 4. Optional: Silero VAD
    try:
        SILERO_VAD_MODEL, silero_utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad', model='silero_vad',
            force_reload=False, onnx=False
        )
        get_speech_timestamps = silero_utils[0]
        USE_SILERO_VAD = True
        print("  ✅ Silero VAD loaded.")
    except Exception:
        USE_SILERO_VAD = False
        print("  ⚠️  Silero VAD not available, using RMS + spectral flatness fallback.")
    
    models_loaded = True
    print("🚀 All models loaded!\n")


# ------------------- PRODUCTION ENGINE CLASS -------------------

class EmotionEngine:
    def __init__(self):
        self.box_alpha = 0.7
        self.ema_alpha = 0.3
        self.ema_video_scores = None
        self.ema_audio_scores = None
        self.confidence_threshold = 0.35
        self.audio_buffer_raw = np.array([], dtype=np.float32)
        self.last_bbox = None
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    # ── Preprocessing ──

    def enhance_image(self, image):
        """CLAHE + gray-world white balance."""
        image = self._white_balance(image)
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = self.clahe.apply(l)
        return cv2.cvtColor(cv2.merge((cl, a, b)), cv2.COLOR_LAB2BGR)

    @staticmethod
    def _white_balance(img):
        result = img.copy().astype(np.float32)
        avg_b = np.mean(result[:, :, 0])
        avg_g = np.mean(result[:, :, 1])
        avg_r = np.mean(result[:, :, 2])
        avg_gray = (avg_b + avg_g + avg_r) / 3.0
        if avg_b > 0: result[:, :, 0] *= avg_gray / avg_b
        if avg_g > 0: result[:, :, 1] *= avg_gray / avg_g
        if avg_r > 0: result[:, :, 2] *= avg_gray / avg_r
        return np.clip(result, 0, 255).astype(np.uint8)

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
        best_face, min_dist = None, float('inf')
        for face in faces:
            x1, y1, x2, y2 = face.bbox
            dist = math.hypot((x1 + x2) / 2 - center_x, (y1 + y2) / 2 - center_y)
            if dist < min_dist:
                min_dist = dist
                best_face = face
        return best_face

    # ── Video ──

    def process_video(self, frame):
        # LAZY LOAD: Load models on first video frame
        global video_model, processor, face_app, vid_id2label
        if video_model is None:
            _load_models()
        
        enhanced = self.enhance_image(frame)

        faces = face_app.get(enhanced)
        if not faces:
            self.last_bbox = None
            return None

        h, w = frame.shape[:2]
        face = self.get_central_face(faces, w, h)

        curr_bbox = face.bbox
        if self.last_bbox is not None:
            curr_bbox = self.last_bbox * (1 - self.box_alpha) + curr_bbox * self.box_alpha
        self.last_bbox = curr_bbox
        x1, y1, x2, y2 = map(int, curr_bbox)

        aligned = self.align_face(enhanced, face.kps)

        h_a, w_a = aligned.shape[:2]
        pad_w = int((x2 - x1) * 0.25)
        pad_h = int((y2 - y1) * 0.25)
        x1c, y1c = max(0, x1 - pad_w), max(0, y1 - pad_h)
        x2c, y2c = min(w_a, x2 + pad_w), min(h_a, y2 + pad_h)
        face_img = aligned[y1c:y2c, x1c:x2c]
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
            if 'happ' in label or 'joy' in label:        scores['happy'] += val
            elif 'sad' in label:                           scores['sad'] += val
            elif 'ang' in label:                           scores['angry'] += val
            elif 'fear' in label:                          scores['fear'] += val
            elif 'surp' in label:                          scores['surprise'] += val
            elif 'disg' in label or 'contempt' in label:  scores['disgust'] += val
            else:                                          scores['neutral'] += val

        # EMA smoothing
        if self.ema_video_scores is None:
            self.ema_video_scores = dict(scores)
        else:
            for k in COMMON_EMOTIONS:
                self.ema_video_scores[k] = (
                    self.ema_alpha * scores[k]
                    + (1 - self.ema_alpha) * self.ema_video_scores[k]
                )

        total = sum(self.ema_video_scores.values())
        if total > 0:
            return {k: float(v) / total for k, v in self.ema_video_scores.items()}
        return scores

    # ── Audio ──

    def _is_speech(self, chunk_16k: np.ndarray) -> bool:
        if USE_SILERO_VAD:
            tensor = torch.from_numpy(chunk_16k).float()
            timestamps = get_speech_timestamps(tensor, SILERO_VAD_MODEL, sampling_rate=16000)
            return len(timestamps) > 0
        else:
            rms = np.sqrt(np.mean(chunk_16k ** 2))
            if rms < 0.02:
                return False
            spectrum = np.abs(np.fft.rfft(chunk_16k))
            spectrum = spectrum + 1e-10
            geo_mean = np.exp(np.mean(np.log(spectrum)))
            arith_mean = np.mean(spectrum)
            flatness = geo_mean / arith_mean
            return flatness < 0.5

    def process_audio(self, raw_b64):
        # LAZY LOAD: Load models on first audio chunk
        global audio_model, audio_extractor, aud_id2label
        if audio_model is None:
            _load_models()
        
        try:
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",")[-1]

            audio_data = base64.b64decode(raw_b64)
            audio = AudioSegment.from_file(io.BytesIO(audio_data), format="webm")
            audio = audio.set_frame_rate(16000).set_channels(1)
            chunk = np.array(audio.get_array_of_samples(), dtype=np.float32) / (2 ** 15)

            if not self._is_speech(chunk):
                return None

            self.audio_buffer_raw = np.concatenate((self.audio_buffer_raw, chunk))
            max_len = 16000 * 3
            if len(self.audio_buffer_raw) > max_len:
                self.audio_buffer_raw = self.audio_buffer_raw[-max_len:]
            if len(self.audio_buffer_raw) < 16000:
                return None

            inputs = audio_extractor(
                self.audio_buffer_raw, sampling_rate=16000,
                return_tensors="pt", padding=True
            ).to(DEVICE)

            with torch.no_grad():
                logits = audio_model(**inputs).logits
                probs = F.softmax(logits, dim=-1).cpu().numpy()[0]

            scores = {k: 0.0 for k in COMMON_EMOTIONS}
            for i, p in enumerate(probs):
                label = aud_id2label[i].lower()
                val = float(p)
                if 'ang' in label:                          scores['angry'] += val
                elif 'calm' in label or 'neu' in label:     scores['neutral'] += val
                elif 'disg' in label:                        scores['disgust'] += val
                elif 'fear' in label:                        scores['fear'] += val
                elif 'hap' in label:                         scores['happy'] += val
                elif 'sad' in label:                         scores['sad'] += val
                elif 'surp' in label:                        scores['surprise'] += val
                else:                                        scores['neutral'] += val

            if self.ema_audio_scores is None:
                self.ema_audio_scores = dict(scores)
            else:
                for k in COMMON_EMOTIONS:
                    self.ema_audio_scores[k] = (
                        self.ema_alpha * scores[k]
                        + (1 - self.ema_alpha) * self.ema_audio_scores[k]
                    )

            total = sum(self.ema_audio_scores.values())
            if total > 0:
                return {k: float(v) / total for k, v in self.ema_audio_scores.items()}
            return scores

        except Exception as e:
            print(f"⚠️  Audio processing error: {e}")
            return None

    # ── Fusion ──

    @staticmethod
    def _entropy(scores: dict) -> float:
        return -sum(v * math.log(v + 1e-9) for v in scores.values())

    def fusion(self, v_scores, a_scores):
        if not v_scores and not a_scores:
            return "neutral", {k: (1.0 if k == 'neutral' else 0.0) for k in COMMON_EMOTIONS}

        if not a_scores:
            top = max(v_scores, key=v_scores.get)
            if v_scores[top] < self.confidence_threshold:
                top = "neutral"
            return top, v_scores

        if not v_scores:
            top = max(a_scores, key=a_scores.get)
            if a_scores[top] < self.confidence_threshold:
                top = "neutral"
            return top, a_scores

        v_ent = self._entropy(v_scores)
        a_ent = self._entropy(a_scores)

        w_v = 1.0 / (v_ent + 1e-9)
        w_a = 1.0 / (a_ent + 1e-9)
        total_w = w_v + w_a
        w_v /= total_w
        w_a /= total_w

        final_scores = {}
        for k in COMMON_EMOTIONS:
            final_scores[k] = float(v_scores.get(k, 0)) * w_v + float(a_scores.get(k, 0)) * w_a

        total = sum(final_scores.values())
        if total > 0:
            final_scores = {k: v / total for k, v in final_scores.items()}

        top_emotion = max(final_scores, key=final_scores.get)
        if final_scores[top_emotion] < self.confidence_threshold:
            top_emotion = "neutral"

        return top_emotion, final_scores


# ------------------- DB HELPERS -------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ------------------- PATIENT ROUTES -------------------

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
            "id": p.id, "name": p.name, "external_id": p.external_id,
            "age": age, "gender": p.gender, "contact": p.contact_info
        })
    return results


@app.get("/patients/{patient_id}")
def get_patient_details(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {
        "id": patient.id, "name": patient.name, "external_id": patient.external_id,
        "dob": patient.dob, "gender": patient.gender,
        "contact_info": patient.contact_info, "medical_history": patient.medical_history
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
        except Exception:
            pass

    try:
        db.commit()
        db.refresh(patient)
        return patient
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed. MRN may be duplicate.")


@app.post("/patients")
def register_patient(patient_data: dict, db: Session = Depends(get_db)):
    dob_obj = None
    if patient_data.get('dob'):
        try:
            dob_obj = datetime.strptime(patient_data.get('dob'), "%Y-%m-%d").date()
        except Exception:
            pass

    new_patient = Patient(
        name=patient_data.get('name'), external_id=patient_data.get('external_id'),
        dob=dob_obj, gender=patient_data.get('gender'),
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
        raise HTTPException(status_code=400, detail="Registration failed.")


# ------------------- HISTORY ROUTES -------------------

@app.get("/history/{patient_id}")
def get_patient_history(patient_id: int, db: Session = Depends(get_db)):
    sessions = (
        db.query(SessionRecord)
        .filter(SessionRecord.patient_id == patient_id)
        .options(joinedload(SessionRecord.timeline))
        .order_by(SessionRecord.date_recorded.desc())
        .all()
    )
    return [
        {
            "id": s.id, "date": s.date_recorded.strftime("%Y-%m-%d %H:%M"),
            "duration": s.duration, "video_url": s.video_url,
            "timeline": [{"time": t.timestamp_str, "emotion": t.emotion} for t in s.timeline]
        }
        for s in sessions
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
            "id": session_id, "date": creation_time, "duration": "Unknown",
            "timeline": [], "video_url": f"/uploads/{video_path.name}"
        }
        if json_path.exists():
            try:
                with open(json_path, "r") as f:
                    saved_data = json.load(f)
                    session_data["duration"] = saved_data.get("duration", "Unknown")
                    session_data["timeline"] = saved_data.get("timeline", [])
                    if "date" in saved_data:
                        session_data["date"] = saved_data["date"]
            except Exception:
                pass
        sessions.append(session_data)

    return sorted(sessions, key=lambda x: x['date'], reverse=True)


# ------------------- REPORT / NOTES / TRENDS HELPERS -------------------

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


# ------------------- REPORT -------------------

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


# ------------------- TRENDS -------------------

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


# ------------------- NOTES -------------------

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


# ------------------- SESSION FINALIZATION (ASYNC BACKGROUND) -------------------

async def _finalize_session(
    session_id: str,
    temp_video_path: Path,
    temp_audio_path: Path,
    final_output_path: Path,
    json_path: Path,
    audio_data: bytes,
    start_time: float,
    session_timeline: list,
    patient_id: int,
    session_db_id: int,
):
    print(f"💾 Finalizing session {session_id} in background...")

    has_audio = len(audio_data) > 0
    if has_audio:
        try:
            def _export_audio():
                buf = io.BytesIO(audio_data)
                AudioSegment.from_file(buf, format="webm").export(temp_audio_path, format="wav")
            await asyncio.to_thread(_export_audio)
        except Exception as e:
            print(f"⚠️  Audio export error: {e}")
            has_audio = False

    try:
        if has_audio:
            command = [
                "ffmpeg", "-y",
                "-i", str(temp_video_path), "-i", str(temp_audio_path),
                "-c:v", "copy", "-c:a", "libopus", str(final_output_path)
            ]
        else:
            command = [
                "ffmpeg", "-y",
                "-i", str(temp_video_path),
                "-c:v", "copy", str(final_output_path)
            ]
        await asyncio.to_thread(
            subprocess.run, command,
            **{"check": True, "stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        )
        if temp_video_path.exists():
            await asyncio.to_thread(os.remove, temp_video_path)
        if has_audio and temp_audio_path.exists():
            await asyncio.to_thread(os.remove, temp_audio_path)
        print("✅ Session saved.")
    except Exception as e:
        print(f"❌ FFmpeg mux failed: {e}")
        if temp_video_path.exists():
            await asyncio.to_thread(os.rename, temp_video_path, final_output_path)

    duration_delta = int(time.time() - start_time)
    duration_str = f"{duration_delta // 60:02}:{duration_delta % 60:02}"

    def _write_json():
        with open(json_path, "w") as f:
            json.dump({
                "session_id": session_id,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "duration": duration_str,
                "timeline": session_timeline
            }, f, indent=2)
    await asyncio.to_thread(_write_json)

    def _save_to_db():
        db = SessionLocal()
        try:
            record = db.query(SessionRecord).filter(SessionRecord.id == session_db_id).first()
            if record:
                record.duration = duration_str
                record.video_url = f"/uploads/{session_id}.webm"
                db.commit()
                db.refresh(record)
                record_id = record.id
            else:
                fallback = SessionRecord(
                    patient_id=patient_id, session_uuid=session_id,
                    duration=duration_str, video_url=f"/uploads/{session_id}.webm"
                )
                db.add(fallback)
                db.commit()
                db.refresh(fallback)
                record_id = fallback.id

            if session_timeline:
                db.add_all([
                    TimelineEntry(
                        session_id=record_id, timestamp_str=e['time'],
                        seconds=e['seconds'], emotion=e['emotion'],
                        confidence=e['confidence']
                    )
                    for e in session_timeline
                ])
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"DB Error: {e}")
        finally:
            db.close()
    await asyncio.to_thread(_save_to_db)

    print(f"✅ Session {session_id} finalization complete.")


# ------------------- WEBSOCKET STREAM -------------------

@app.websocket("/ws/stream/{patient_id}")
async def stream(ws: WebSocket, patient_id: int):
    # NO model loading here - models load on first frame/audio
    await ws.accept()

    engine_state = EmotionEngine()

    timestamp_id = int(time.time())
    session_id = f"session_{timestamp_id}"

    temp_video_path = UPLOAD_DIR / f"temp_vid_{timestamp_id}.webm"
    temp_audio_path = UPLOAD_DIR / f"temp_aud_{timestamp_id}.wav"
    final_output_path = UPLOAD_DIR / f"{session_id}.webm"
    json_path = UPLOAD_DIR / f"{session_id}.json"

    fourcc = cv2.VideoWriter_fourcc(*'vp80')
    out = cv2.VideoWriter(str(temp_video_path), fourcc, 5.0, (640, 480))
    audio_buffer = io.BytesIO()

    start_time = time.time()
    session_timeline = []

    last_v_scores = None
    last_a_scores = None
    frame_count = 0

    def _create_initial_session():
        db = SessionLocal()
        try:
            rec = SessionRecord(
                patient_id=patient_id, session_uuid=session_id,
                duration="00:00", video_url=""
            )
            db.add(rec)
            db.commit()
            db.refresh(rec)
            return rec.id
        except Exception as e:
            db.rollback()
            print(f"DB Error creating initial session: {e}")
            return None
        finally:
            db.close()

    session_db_id = await asyncio.to_thread(_create_initial_session)
    if session_db_id:
        await ws.send_json({"status": "session_started", "session_db_id": session_db_id})

    try:
        while True:
            data = await ws.receive_json()

            if data.get("event") == "stop":
                await ws.send_json({"status": "finished"})
                break

            if "image" in data:
                img_bytes = base64.b64decode(data["image"].split(",")[-1])
                frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                if frame is not None:
                    resized = cv2.resize(frame, (640, 480))
                    out.write(resized)
                    frame_count += 1

                    if frame_count % 3 == 0:
                        v_res = await asyncio.to_thread(engine_state.process_video, resized)
                        if v_res:
                            last_v_scores = v_res

            if data.get("audio"):
                raw_audio = data["audio"]
                try:
                    audio_bytes = base64.b64decode(raw_audio.split(",")[-1])
                    audio_buffer.write(audio_bytes)
                    a_res = await asyncio.to_thread(engine_state.process_audio, raw_audio)
                    if a_res:
                        last_a_scores = a_res
                except Exception:
                    pass

            final_emotion, final_scores = engine_state.fusion(last_v_scores, last_a_scores)

            elapsed = int(time.time() - start_time)
            timestamp = f"{elapsed // 60:02}:{elapsed % 60:02}"

            should_log = False
            if not session_timeline:
                should_log = True
            elif session_timeline[-1]['emotion'] != final_emotion:
                should_log = True
            elif (elapsed - session_timeline[-1]['seconds']) > 2:
                should_log = True

            if should_log:
                session_timeline.append({
                    "time": timestamp, "seconds": elapsed,
                    "emotion": final_emotion,
                    "confidence": float(final_scores.get(final_emotion, 0))
                })

            await ws.send_json({
                "status": "processing", "timestamp": timestamp,
                "emotion": final_emotion, "scores": final_scores
            })

    except WebSocketDisconnect:
        print("Client disconnected.")

    finally:
        out.release()
        audio_data = audio_buffer.getvalue()
        asyncio.create_task(_finalize_session(
            session_id, temp_video_path, temp_audio_path, final_output_path,
            json_path, audio_data, start_time, session_timeline, patient_id,
            session_db_id or 0
        ))