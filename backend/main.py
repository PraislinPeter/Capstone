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
import math  # <--- NEW
from collections import deque # <--- NEW
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
from transformers import AutoImageProcessor, AutoModelForImageClassification, AutoFeatureExtractor, AutoModelForAudioClassification
from insightface.app import FaceAnalysis

# --- Database Imports ---
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Patient, SessionRecord, TimelineEntry, Base

# ------------------- CONFIGURATION -------------------
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# UPGRADE: Better model for webcam lighting conditions
EMOTION_MODEL = "dima806/facial_emotions_image_detection"
AUDIO_MODEL = "superb/hubert-large-superb-er"

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------- MODEL LOADING -------------------
print(f"🚀 Loading Clinical Models on {DEVICE}...")

# 1. Vision Models
processor = AutoImageProcessor.from_pretrained(EMOTION_MODEL)
video_model = AutoModelForImageClassification.from_pretrained(EMOTION_MODEL).to(DEVICE).eval()
vid_id2label = video_model.config.id2label

# 2. Face Detection
face_app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider" if DEVICE == "cuda" else "CPUExecutionProvider"])
face_app.prepare(ctx_id=0 if DEVICE == "cuda" else -1, det_size=(640, 640))

# 3. Audio Models
audio_extractor = AutoFeatureExtractor.from_pretrained(AUDIO_MODEL)
audio_model = AutoModelForAudioClassification.from_pretrained(AUDIO_MODEL).to(DEVICE).eval()
aud_id2label = audio_model.config.id2label

COMMON_EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'fear', 'surprise', 'disgust']

# ------------------- PRODUCTION ENGINE CLASS -------------------
# ------------------- PRODUCTION ENGINE CLASS (FIXED) -------------------

class EmotionEngine:
    def __init__(self):
        # Configuration
        self.frame_window = 5       
        self.audio_window_sec = 3.0 
        self.box_alpha = 0.7        
        self.audio_rms_threshold = 0.015 
        
        # State buffers
        self.video_buffer = deque(maxlen=self.frame_window)
        self.audio_buffer_raw = np.array([], dtype=np.float32)
        self.last_bbox = None 
        
        # Lighting enhancer
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))

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
        # 1. Enhance
        enhanced_frame = self.enhance_image(frame)
        
        # 2. Detect
        faces = face_app.get(enhanced_frame)
        if not faces: 
            self.last_bbox = None
            return None
        
        # 3. Central Face
        h, w, _ = frame.shape
        face = self.get_central_face(faces, w, h)
        
        # 4. Smooth Box
        curr_bbox = face.bbox
        if self.last_bbox is not None:
            curr_bbox = self.last_bbox * (1 - self.box_alpha) + curr_bbox * self.box_alpha
        self.last_bbox = curr_bbox
        x1, y1, x2, y2 = map(int, curr_bbox)
        
        # 5. Align
        aligned_frame = self.align_face(enhanced_frame, face.kps)
        
        # Crop & Pad
        h_a, w_a, _ = aligned_frame.shape
        pad_w = int((x2 - x1) * 0.25)
        pad_h = int((y2 - y1) * 0.25)
        x1, y1 = max(0, x1 - pad_w), max(0, y1 - pad_h)
        x2, y2 = min(w_a, x2 + pad_w), min(h_a, y2 + pad_h)
        
        face_img = aligned_frame[y1:y2, x1:x2]
        if face_img.size == 0: return None

        # 6. Predict
        pil_img = Image.fromarray(cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB))
        inputs = processor(images=pil_img, return_tensors="pt").to(DEVICE)
        
        with torch.no_grad():
            logits = video_model(**inputs).logits
            probs = F.softmax(logits, dim=-1).cpu().numpy()[0]
            
        # Map Labels (AND CAST TO FLOAT)
        scores = {k: 0.0 for k in COMMON_EMOTIONS}
        for i, p in enumerate(probs):
            label = vid_id2label[i].lower()
            val = float(p) # <--- FIX: Explicit cast to float
            
            if 'happ' in label: scores['happy'] += val
            elif 'sad' in label: scores['sad'] += val
            elif 'ang' in label: scores['angry'] += val
            elif 'fear' in label: scores['fear'] += val
            elif 'surp' in label: scores['surprise'] += val
            elif 'disg' in label: scores['disgust'] += val
            else: scores['neutral'] += val
            
        self.video_buffer.append(scores)
        
        # Weighted Average
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
        # <--- FIX: Explicit float cast in return comprehension
        return {k: float(v)/total for k, v in avg_scores.items()} if total > 0 else scores

    def process_audio(self, raw_b64):
        try:
            if "," in raw_b64: raw_b64 = raw_b64.split(",")[-1]
            audio_data = base64.b64decode(raw_b64)
            audio_file = io.BytesIO(audio_data)
            audio = AudioSegment.from_file(audio_file, format="webm")
            audio = audio.set_frame_rate(16000).set_channels(1)
            
            chunk = np.array(audio.get_array_of_samples(), dtype=np.float32) / (2**15)
            
            # VAD
            rms = np.sqrt(np.mean(chunk**2))
            if rms < self.audio_rms_threshold:
                return None 

            self.audio_buffer_raw = np.concatenate((self.audio_buffer_raw, chunk))
            
            max_len = 16000 * 3
            if len(self.audio_buffer_raw) > max_len:
                self.audio_buffer_raw = self.audio_buffer_raw[-max_len:]
            
            if len(self.audio_buffer_raw) < 16000: return None
                
            inputs = audio_extractor(self.audio_buffer_raw, sampling_rate=16000, return_tensors="pt", padding=True).to(DEVICE)
            with torch.no_grad():
                logits = audio_model(**inputs).logits
                probs = F.softmax(logits, dim=-1).cpu().numpy()[0] 
            
            # Map Labels (AND CAST TO FLOAT)
            scores = {k: 0.0 for k in COMMON_EMOTIONS}
            for i, p in enumerate(probs):
                label = aud_id2label[i].lower()
                val = float(p) # <--- FIX: Explicit cast to float
                
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
            # <--- FIX: Explicit float cast during math
            val = (float(v_scores.get(k, 0)) * w_v) + (float(a_scores.get(k, 0)) * w_a)
            final_scores[k] = val
            
        total = sum(final_scores.values())
        if total > 0:
            final_scores = {k: float(v)/total for k, v in final_scores.items()} # <--- FIX
        return max(final_scores, key=final_scores.get), final_scores

# ------------------- DB HELPERS -------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- PATIENT ROUTES ---
@app.get("/patients", response_model=List[dict])
def list_patients(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()
    results = []
    
    today = date.today()
    
    for p in patients:
        # Calculate Age Logic
        age = "N/A"
        if p.dob:
            age = today.year - p.dob.year - ((today.month, today.day) < (p.dob.month, p.dob.day))
            
        results.append({
            "id": p.id,
            "name": p.name,
            "external_id": p.external_id,
            "age": age,                # <--- Sending Age to Frontend
            "gender": p.gender,
            "contact": p.contact_info
        })
    return results

@app.get("/patients/{patient_id}")
def get_patient_details(patient_id: int, db: Session = Depends(get_db)):
    # Fetch the specific patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Return the raw DB columns so the form can populate
    return {
        "id": patient.id,
        "name": patient.name,
        "external_id": patient.external_id,
        "dob": patient.dob,                 # Raw Date for the input field
        "gender": patient.gender,
        "contact_info": patient.contact_info,
        "medical_history": patient.medical_history
    }

# --- UPDATE PATIENT ROUTE ---
@app.put("/patients/{patient_id}")
def update_patient(patient_id: int, patient_data: dict, db: Session = Depends(get_db)):
    # 1. Find the patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # 2. Update fields if they exist in the payload
    # Note: We use patient_data.get('key', patient.key) to keep old value if new one is missing
    patient.name = patient_data.get('name', patient.name)
    patient.external_id = patient_data.get('external_id', patient.external_id)
    patient.gender = patient_data.get('gender', patient.gender)
    patient.contact_info = patient_data.get('contact_info', patient.contact_info)
    patient.medical_history = patient_data.get('medical_history', patient.medical_history)
    
    # Handle Date of Birth conversion
    if patient_data.get('dob'):
        try:
            patient.dob = datetime.strptime(patient_data.get('dob'), "%Y-%m-%d").date()
        except:
            pass # Keep original if format fails

    # 3. Save changes
    try:
        db.commit()
        db.refresh(patient)
        return patient
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Update failed. MRN may be duplicate.")

@app.post("/patients")
def register_patient(patient_data: dict, db: Session = Depends(get_db)):
    # Convert string date "YYYY-MM-DD" to Python date object
    dob_obj = None
    if patient_data.get('dob'):
        try:
            dob_obj = datetime.strptime(patient_data.get('dob'), "%Y-%m-%d").date()
        except:
            pass

    new_patient = Patient(
        name=patient_data.get('name'), 
        external_id=patient_data.get('external_id'),
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
        raise HTTPException(status_code=400, detail="Registration failed.")

# --- HISTORY ROUTES ---

@app.get("/history/{patient_id}")
def get_patient_history(patient_id: int, db: Session = Depends(get_db)):
    sessions = db.query(SessionRecord).filter(SessionRecord.patient_id == patient_id).all()
    
    # Format for the frontend
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

@app.get("/history")
def get_history():
    """Returns list of recording sessions."""
    sessions = []
    # Scan for both .mp4 and .webm
    video_files = list(UPLOAD_DIR.glob("*.webm")) + list(UPLOAD_DIR.glob("*.mp4"))
    
    for video_path in video_files:
        if "temp_" in video_path.name: continue # Skip partial files
        
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
                    if "date" in saved_data: session_data["date"] = saved_data["date"]
            except: pass

        sessions.append(session_data)
    
    return sorted(sessions, key=lambda x: x['date'], reverse=True)

# ------------------- WEBSOCKET STREAM -------------------
# ------------------- STREAMING ROUTE -------------------

@app.websocket("/ws/stream/{patient_id}")
async def stream(ws: WebSocket, patient_id: int):
    await ws.accept()
    
    # Init DB and Engine
    db = SessionLocal()
    engine_state = EmotionEngine() # Instance per session
    
    timestamp_id = int(time.time())
    session_id = f"session_{timestamp_id}"
    
    # Paths
    temp_video_path = UPLOAD_DIR / f"temp_vid_{timestamp_id}.webm"
    temp_audio_path = UPLOAD_DIR / f"temp_aud_{timestamp_id}.wav"
    final_output_path = UPLOAD_DIR / f"{session_id}.webm"
    json_path = UPLOAD_DIR / f"{session_id}.json"
    
    # Writers
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

            # 1. Process Video (With Frame Skipping)
            if "image" in data:
                img_bytes = base64.b64decode(data["image"].split(",")[-1])
                frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                if frame is not None:
                    # Resize for file storage
                    resized = cv2.resize(frame, (640, 480))
                    out.write(resized)
                    
                    frame_count += 1
                    
                    # RUN AI ONLY every 3rd frame (10 FPS approx)
                    # This prevents lag and keeps audio in sync
                    if frame_count % 3 == 0:
                        v_res = engine_state.process_video(resized)
                        if v_res: last_v_scores = v_res

            # 2. Process Audio
            if data.get("audio"):
                raw_audio = data["audio"]
                try:
                    audio_bytes = base64.b64decode(raw_audio.split(",")[-1])
                    audio_buffer.write(audio_bytes)
                    
                    # Process (Engine handles VAD internally)
                    a_res = engine_state.process_audio(raw_audio)
                    if a_res: last_a_scores = a_res
                except: pass

            # 3. Fusion
            final_emotion, final_scores = engine_state.fusion(last_v_scores, last_a_scores)
            
            # 4. Timeline Logging (Smart De-duplication)
            elapsed = int(time.time() - start_time)
            timestamp = f"{elapsed//60:02}:{elapsed%60:02}"
            
            should_log = False
            if not session_timeline: should_log = True
            elif session_timeline[-1]['emotion'] != final_emotion: should_log = True
            elif (elapsed - session_timeline[-1]['seconds']) > 2: should_log = True
            
            if should_log:
                session_timeline.append({
                    "time": timestamp,
                    "seconds": elapsed,
                    "emotion": final_emotion,
                    "confidence": float(final_scores.get(final_emotion, 0))
                })

            await ws.send_json({
                "status": "processing",
                "timestamp": timestamp,
                "emotion": final_emotion,
                "scores": final_scores
            })

    except WebSocketDisconnect:
        print("Client disconnected.")
    
    finally:
        # ------------------- SAVING LOGIC -------------------
        print(f"💾 Finalizing session {session_id}...")
        out.release()
        
        audio_buffer.seek(0)
        has_audio = audio_buffer.getbuffer().nbytes > 0
        if has_audio:
            final_audio = AudioSegment.from_file(audio_buffer, format="webm")
            final_audio.export(temp_audio_path, format="wav")
        
        try:
            if has_audio:
                command = [
                    "ffmpeg", "-y", "-i", str(temp_video_path), "-i", str(temp_audio_path),
                    "-c:v", "copy", "-c:a", "libopus", str(final_output_path)
                ]
            else:
                command = ["ffmpeg", "-y", "-i", str(temp_video_path), "-c:v", "copy", str(final_output_path)]

            subprocess.run(command, check=True, stdout=None, stderr=None)
            if temp_video_path.exists(): os.remove(temp_video_path)
            if temp_audio_path.exists() and has_audio: os.remove(temp_audio_path)
            print("✅ Session Saved.")

        except Exception as e:
            print(f"❌ Save Failed: {e}")
            if temp_video_path.exists(): os.rename(temp_video_path, final_output_path)

        # DB Save
        duration_delta = int(time.time() - start_time)
        duration_str = f"{duration_delta//60:02}:{duration_delta%60:02}"
        
        with open(json_path, "w") as f:
            json.dump({
                "session_id": session_id, "date": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "duration": duration_str, "timeline": session_timeline
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
                        seconds=e['seconds'], emotion=e['emotion'], confidence=e['confidence']
                    ) for e in session_timeline
                ]
                db.add_all(db_entries)
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"DB Error: {e}")
        finally:
            db.close()