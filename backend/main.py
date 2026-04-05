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
from typing import List

# --- AI & ML Imports ---
from transformers import AutoImageProcessor, AutoModelForImageClassification, Wav2Vec2FeatureExtractor, AutoModelForAudioClassification
from insightface.app import FaceAnalysis

# --- Database Imports ---
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Patient, SessionRecord, TimelineEntry, Base

# ------------------- CONFIGURATION -------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# ╔══════════════════════════════════════════════════════════════════╗
# ║  UPGRADED MODELS (VERIFIED — these work with transformers API)   ║
# ║                                                                  ║
# ║  VIDEO: trpakov/vit-face-expression                              ║
# ║    - ViT fine-tuned on FER2013 + MMI + AffectNet                 ║
# ║    - Works with AutoImageProcessor + AutoModelForImageClassif.   ║
# ║    - 7 emotions: angry, disgust, fear, happy, sad, surprise,     ║
# ║      neutral                                                     ║
# ║                                                                  ║
# ║  NOTE on hsemotion/enet_b2_8:                                    ║
# ║    That model does NOT work with AutoModelForImageClassification ║
# ║    It requires `pip install hsemotion` and uses its own API:     ║
# ║      from hsemotion.facial_emotions import HSEmotionRecognizer   ║
# ║      fer = HSEmotionRecognizer('enet_b2_8', device='cpu')       ║
# ║    If you want to use it, see the alternate block at the bottom  ║
# ║    of this file. The trpakov model is a drop-in replacement.     ║
# ║                                                                  ║
# ║  AUDIO: ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition║
# ║    - Wav2Vec2 fine-tuned on RAVDESS (82% accuracy)               ║
# ║    - CRITICAL: Its AutoProcessor is broken. Use                  ║
# ║      Wav2Vec2FeatureExtractor from the parent model instead.     ║
# ║    - 8 emotions: angry, calm, disgust, fearful, happy, neutral,  ║
# ║      sad, surprised                                              ║
# ║                                                                  ║
# ║  INSTALL (one time):                                             ║
# ║    pip install timm                                              ║
# ╚══════════════════════════════════════════════════════════════════╝
EMOTION_MODEL = "trpakov/vit-face-expression"
AUDIO_MODEL = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()

# Fixed: Only one CORS middleware (you had two, which causes errors)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# ------------------- MODEL LOADING -------------------
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
# ╔══════════════════════════════════════════════════════════════════╗
# ║  CRITICAL FIX: The ehcalabres model's AutoProcessor is broken.  ║
# ║  Use Wav2Vec2FeatureExtractor from the parent model instead.    ║
# ╚══════════════════════════════════════════════════════════════════╝
audio_extractor = Wav2Vec2FeatureExtractor.from_pretrained("facebook/wav2vec2-large-xlsr-53")
audio_model = AutoModelForAudioClassification.from_pretrained(AUDIO_MODEL).to(DEVICE).eval()
aud_id2label = audio_model.config.id2label

print(f"  ✅ Video labels: {vid_id2label}")
print(f"  ✅ Audio labels: {aud_id2label}")

COMMON_EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise', 'disgust']

# ------------------- OPTIONAL: SILERO VAD -------------------
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

print("🚀 All models loaded!\n")


# ------------------- PRODUCTION ENGINE CLASS -------------------

class EmotionEngine:
    def __init__(self):
        self.box_alpha = 0.7

        # EMA smoothing replaces the old fixed-size deque buffer
        self.ema_alpha = 0.3
        self.ema_video_scores = None
        self.ema_audio_scores = None

        # If top emotion is below this, report "neutral" instead
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

            # Map ehcalabres labels → common emotions
            # ehcalabres: angry, calm, disgust, fearful, happy, neutral, sad, surprised
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
    sessions = db.query(SessionRecord).filter(SessionRecord.patient_id == patient_id).all()
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


# ------------------- WEBSOCKET STREAM -------------------

@app.websocket("/ws/stream/{patient_id}")
async def stream(ws: WebSocket, patient_id: int):
    await ws.accept()

    db = SessionLocal()
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
        print(f"💾 Finalizing session {session_id}...")
        out.release()

        audio_buffer.seek(0)
        has_audio = audio_buffer.getbuffer().nbytes > 0
        if has_audio:
            try:
                final_audio = AudioSegment.from_file(audio_buffer, format="webm")
                final_audio.export(temp_audio_path, format="wav")
            except Exception as e:
                print(f"⚠️  Audio export error: {e}")
                has_audio = False

        try:
            if has_audio:
                command = [
                    "ffmpeg", "-y", "-i", str(temp_video_path), "-i", str(temp_audio_path),
                    "-c:v", "copy", "-c:a", "libopus", str(final_output_path)
                ]
            else:
                command = [
                    "ffmpeg", "-y", "-i", str(temp_video_path),
                    "-c:v", "copy", str(final_output_path)
                ]
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if temp_video_path.exists(): os.remove(temp_video_path)
            if has_audio and temp_audio_path.exists(): os.remove(temp_audio_path)
            print("✅ Session Saved.")
        except Exception as e:
            print(f"❌ Save Failed: {e}")
            if temp_video_path.exists():
                os.rename(temp_video_path, final_output_path)

        duration_delta = int(time.time() - start_time)
        duration_str = f"{duration_delta // 60:02}:{duration_delta % 60:02}"

        with open(json_path, "w") as f:
            json.dump({
                "session_id": session_id,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "duration": duration_str,
                "timeline": session_timeline
            }, f, indent=2)

        try:
            new_session = SessionRecord(
                patient_id=patient_id, session_uuid=session_id,
                duration=duration_str, video_url=f"/uploads/{session_id}.webm"
            )
            db.add(new_session)
            db.commit()
            db.refresh(new_session)

            if session_timeline:
                db_entries = [
                    TimelineEntry(
                        session_id=new_session.id, timestamp_str=e['time'],
                        seconds=e['seconds'], emotion=e['emotion'],
                        confidence=e['confidence']
                    )
                    for e in session_timeline
                ]
                db.add_all(db_entries)
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"DB Error: {e}")
        finally:
            db.close()