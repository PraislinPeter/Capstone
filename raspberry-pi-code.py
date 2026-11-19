"""
SETUP INSTRUCTIONS FOR RASPBERRY PI:
------------------------------------
Depending on your Pi Operating system, follow one of the methods below.

Method 1: Older OS (Bullseye / Buster)
   sudo apt-get update
   sudo apt-get install python3-opencv
   pip3 install websockets

Method 2: Newer OS (Bookworm and above using PEP 668)
   sudo apt-get update
   sudo apt-get install python3-opencv
   python3 -m venv picam_env --system-site-packages
   source picam_env/bin/activate
   pip install websockets
   # picamera2 is pre-installed system-wide on Bookworm;
   # --system-site-packages above makes it visible inside the venv.
"""

# pylint: disable=no-member
import cv2
import base64
import json
import asyncio
import websockets
import time
import urllib.request
import urllib.error
import numpy as np
import os

# picamera2 is available on Pi OS Bookworm (libcamera stack).
# It is NOT available on older OS (Bullseye/Buster) — the except handles that.
try:
    from picamera2 import Picamera2
    HAS_PICAMERA2 = True
except ImportError:
    HAS_PICAMERA2 = False

# --- DISPLAY ---
# HAS_DISPLAY is True when the Pi has a screen attached (DISPLAY/WAYLAND_DISPLAY is set).
# When SSH'd in headlessly with no X11 forwarding, imshow is silently skipped.
HAS_DISPLAY = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))

# Shared state: written by receive_results, read by the display refresh in the capture loop
current_emotion = "neutral"

# Flight limiter: True while a frame is in-flight to the backend.
# Prevents queue buildup when backend inference is slower than the send rate.
_waiting_for_response = False
_last_sent_time = 0.0        # used to timeout the flight limiter if backend sends no response
FLIGHT_TIMEOUT = 8.0         # seconds before giving up waiting and sending the next frame

_EMOTION_COLORS = {
    'neutral':  (180, 180, 180),
    'happy':    ( 60, 210,  80),
    'sad':      (180,  90,  50),
    'angry':    ( 50,  50, 220),
    'fear':     (200,  80, 180),
    'surprise': (  0, 200, 230),
    'disgust':  ( 40, 160,  80),
}


def draw_emotion_face(emotion: str) -> np.ndarray:
    """Render a full-screen (1280x720) emotion face using OpenCV primitives."""
    W, H = 1280, 720
    canvas = np.zeros((H, W, 3), dtype=np.uint8)
    canvas[:] = (25, 20, 35)          # dark purple-black background

    e = emotion.lower()
    color = _EMOTION_COLORS.get(e, (180, 180, 180))
    cx, cy, r = W // 2, H // 2 - 20, 175

    # Soft glow ring
    glow = tuple(min(255, int(c * 0.35)) for c in color)
    cv2.circle(canvas, (cx, cy), r + 22, glow, -1)
    # Face
    cv2.circle(canvas, (cx, cy), r, color, -1)
    cv2.circle(canvas, (cx, cy), r, (255, 255, 255), 3)

    eye_y  = cy - 50
    lx, rx = cx - 65, cx + 65
    brow_y = eye_y - 38

    # ── Eyebrows ──────────────────────────────────────────────────
    if e == 'angry':
        cv2.line(canvas, (lx - 30, brow_y - 8),  (lx + 22, brow_y + 18), (15, 15, 15), 8)
        cv2.line(canvas, (rx - 22, brow_y + 18), (rx + 30, brow_y - 8),  (15, 15, 15), 8)
    elif e == 'sad':
        cv2.line(canvas, (lx - 22, brow_y + 12), (lx + 22, brow_y - 12), (15, 15, 15), 6)
        cv2.line(canvas, (rx - 22, brow_y - 12), (rx + 22, brow_y + 12), (15, 15, 15), 6)
    elif e in ('surprise', 'fear'):
        cv2.ellipse(canvas, (lx, brow_y - 8), (26, 9), 0, 200, 340, (15, 15, 15), 6)
        cv2.ellipse(canvas, (rx, brow_y - 8), (26, 9), 0, 200, 340, (15, 15, 15), 6)
    else:
        cv2.line(canvas, (lx - 24, brow_y), (lx + 24, brow_y), (15, 15, 15), 6)
        cv2.line(canvas, (rx - 24, brow_y), (rx + 24, brow_y), (15, 15, 15), 6)

    # ── Eyes ──────────────────────────────────────────────────────
    if e in ('surprise', 'fear'):
        cv2.circle(canvas, (lx, eye_y), 25, (255, 255, 255), -1)
        cv2.circle(canvas, (rx, eye_y), 25, (255, 255, 255), -1)
        cv2.circle(canvas, (lx, eye_y), 13, (25, 25, 25), -1)
        cv2.circle(canvas, (rx, eye_y), 13, (25, 25, 25), -1)
    elif e == 'angry':
        cv2.ellipse(canvas, (lx, eye_y), (22, 12), 0, 0, 360, (255, 255, 255), -1)
        cv2.ellipse(canvas, (rx, eye_y), (22, 12), 0, 0, 360, (255, 255, 255), -1)
        cv2.circle(canvas, (lx, eye_y), 8, (25, 25, 25), -1)
        cv2.circle(canvas, (rx, eye_y), 8, (25, 25, 25), -1)
    elif e == 'disgust':
        # One squinted eye, one normal
        cv2.ellipse(canvas, (lx, eye_y), (20, 10), 0, 0, 360, (255, 255, 255), -1)
        cv2.circle(canvas, (lx, eye_y), 7, (25, 25, 25), -1)
        cv2.circle(canvas, (rx, eye_y), 21, (255, 255, 255), -1)
        cv2.circle(canvas, (rx, eye_y), 10, (25, 25, 25), -1)
        cv2.circle(canvas, (rx + 6, eye_y - 6), 4, (200, 200, 200), -1)
    else:
        cv2.circle(canvas, (lx, eye_y), 20, (255, 255, 255), -1)
        cv2.circle(canvas, (rx, eye_y), 20, (255, 255, 255), -1)
        cv2.circle(canvas, (lx, eye_y), 10, (25, 25, 25), -1)
        cv2.circle(canvas, (rx, eye_y), 10, (25, 25, 25), -1)
        cv2.circle(canvas, (lx + 5, eye_y - 5), 4, (200, 200, 200), -1)
        cv2.circle(canvas, (rx + 5, eye_y - 5), 4, (200, 200, 200), -1)

    # ── Mouth ─────────────────────────────────────────────────────
    my = cy + 70
    if e == 'happy':
        cv2.ellipse(canvas, (cx, my - 15), (65, 48), 0, 0, 180, (20, 20, 20), 10)
    elif e == 'sad':
        cv2.ellipse(canvas, (cx, my + 28), (58, 42), 0, 180, 360, (20, 20, 20), 10)
    elif e == 'surprise':
        cv2.ellipse(canvas, (cx, my + 8), (28, 40), 0, 0, 360, (20, 20, 20), -1)
        cv2.ellipse(canvas, (cx, my + 8), (28, 40), 0, 0, 360, (255, 255, 255), 4)
    elif e == 'angry':
        cv2.ellipse(canvas, (cx, my + 22), (52, 28), 0, 195, 345, (20, 20, 20), 9)
    elif e == 'fear':
        pts = np.array([[cx-44, my], [cx-22, my+18], [cx-2, my-4],
                        [cx+18, my+18], [cx+38, my], [cx+52, my+12]], np.int32)
        cv2.polylines(canvas, [pts.reshape(-1, 1, 2)], False, (20, 20, 20), 8)
    elif e == 'disgust':
        cv2.line(canvas, (cx - 44, my + 8),  (cx,       my - 12), (20, 20, 20), 9)
        cv2.line(canvas, (cx,       my - 12), (cx + 44, my + 16), (20, 20, 20), 9)
    else:  # neutral
        cv2.line(canvas, (cx - 44, my), (cx + 44, my), (20, 20, 20), 9)

    # ── Big emotion label (bottom-center) ─────────────────────────
    label = emotion.upper()
    font, fs, th = cv2.FONT_HERSHEY_DUPLEX, 2.2, 4
    (tw, _), _ = cv2.getTextSize(label, font, fs, th)
    lx_t, ly_t = (W - tw) // 2, H - 45
    cv2.putText(canvas, label, (lx_t + 3, ly_t + 3), font, fs, (0, 0, 0), th + 2, cv2.LINE_AA)
    cv2.putText(canvas, label, (lx_t,     ly_t),     font, fs, color,     th,     cv2.LINE_AA)

    # ── Branding (top-left) ────────────────────────────────────────
    cv2.putText(canvas, "AURA", (18, 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (130, 100, 160), 2, cv2.LINE_AA)

    return canvas


# --- CONFIGURATION ---
# Change THIS to the actual IP address of the machine running backend/main.py
BACKEND_URL = "ws://172.20.10.5:8000/ws/stream"

# Derived HTTP base URL for pre-flight REST calls (no trailing slash)
BACKEND_HTTP_URL = BACKEND_URL.replace("ws://", "http://").split("/ws/")[0]

# Change the patient ID if you want logs linked to a specific database patient
PATIENT_ID = 1

# Flight limiter controls real send pacing; FPS_LIMIT just prevents a busy-spin
FPS_LIMIT = 10


def ensure_patient_exists():
    """
    Pre-flight check: confirm that PATIENT_ID exists in the backend DB.
    If not, create a placeholder patient so the FK constraint is satisfied.
    Uses only stdlib urllib — no extra packages needed.
    """
    url = f"{BACKEND_HTTP_URL}/patients/{PATIENT_ID}"
    try:
        urllib.request.urlopen(url, timeout=5)
        print(f"[INFO] Patient {PATIENT_ID} already exists in DB.")
        return True
    except urllib.error.HTTPError as e:
        if e.code != 404:
            print(f"[ERROR] Unexpected HTTP {e.code} when checking patient.")
            return False
        # Patient not found — create a minimal placeholder record
        print(f"[WARN] Patient {PATIENT_ID} not found. Creating placeholder...")
        payload = json.dumps({
            "name": f"Patient {PATIENT_ID}",
            "external_id": f"PI-{PATIENT_ID}"
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{BACKEND_HTTP_URL}/patients",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=5)
            print(f"[INFO] Placeholder patient {PATIENT_ID} created.")
            return True
        except Exception as create_err:
            print(f"[ERROR] Could not create patient: {create_err}")
            return False
    except Exception as e:
        print(f"[ERROR] Could not reach backend for patient check: {e}")
        return False


async def receive_results(websocket):
    """
    Asynchronously listens to the Websocket to receive 
    the live emotion & clinical analysis updates.
    """
    global current_emotion, _waiting_for_response
    try:
        async for message in websocket:
            data = json.loads(message)

            if data.get("status") == "finished":
                print("\n[INFO] Backend signaled stream completion.")
                break

            if "emotion" in data:
                timestamp = data.get('timestamp', '00:00')
                emotion = data['emotion'].upper()
                current_emotion = data['emotion'].lower()  # update the display
                _waiting_for_response = False  # unblock the send loop
                # Print out a clean log line
                print(
                    f"[AI RESPONSE] Time: {timestamp} | Dominant Emotion: {emotion}")

    except websockets.exceptions.ConnectionClosed:
        print("\n[INFO] Connection closed by server.")
    except Exception as e:
        print(f"\n[ERROR] Receiving task error: {e}")


async def stream_video():
    """
    Captures frames from the RPi camera, encodes them, and sends
    them iteratively to the backend WebSocket stream.
    """
    global _waiting_for_response, _last_sent_time
    url = f"{BACKEND_URL}/{PATIENT_ID}"
    print(f"==================================================")
    print(f"Connecting to Backend Stream: {url}")
    print(f"==================================================")

    try:
        async with websockets.connect(url, ping_interval=20, ping_timeout=10, max_size=2**22) as websocket:
            print("✅ Successfully connected to the backend!\n")

            # Start the background task to listen to AI responses
            receive_task = asyncio.create_task(receive_results(websocket))

            # --- Initialize Camera ---
            # Bookworm Pi OS: picamera2 (libcamera) is required — V4L2 times out.
            # Older OS (Bullseye/Buster): falls back to plain cv2.VideoCapture.
            picam2 = None
            cap = None

            if HAS_PICAMERA2:
                try:
                    picam2 = Picamera2()
                    config = picam2.create_video_configuration(
                        main={"size": (640, 480), "format": "BGR888"}
                    )
                    picam2.configure(config)
                    picam2.start()
                    print("📷 Camera backend: picamera2 (libcamera)")
                except Exception as cam_err:
                    print(f"⚠️  picamera2 failed ({cam_err}), falling back to OpenCV...")
                    picam2 = None

            if picam2 is None:
                cap = cv2.VideoCapture(0)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                if not cap.isOpened():
                    print("❌ ERROR: Could not open the camera.")
                    print("Hint: On Bookworm, ensure picamera2 is installed and the camera is enabled.")
                    return
                print("📷 Camera backend: OpenCV (V4L2/default)")

            # Initialise full-screen emotion display window
            # Gracefully skipped when SSH'd in without a display (DISPLAY not set)
            show_display = HAS_DISPLAY
            if show_display:
                try:
                    cv2.namedWindow("Emotion Monitor", cv2.WINDOW_NORMAL)
                    cv2.setWindowProperty("Emotion Monitor", cv2.WND_PROP_FULLSCREEN,
                                          cv2.WINDOW_FULLSCREEN)
                    cv2.imshow("Emotion Monitor", draw_emotion_face("neutral"))
                    cv2.waitKey(1)
                except Exception as disp_err:
                    print(f"⚠️  Display unavailable ({disp_err}), continuing without GUI.")
                    show_display = False

            print(f"📷 Camera Live. Streaming at target {FPS_LIMIT} FPS...")
            print("Press Ctrl+C to terminate the session.\n")

            frame_delay = 1.0 / FPS_LIMIT

            try:
                while True:
                    start_time = time.time()

                    if picam2 is not None:
                        try:
                            frame = picam2.capture_array("main")
                        except Exception:
                            print("⚠️ Failed to grab frame. Retrying...")
                            await asyncio.sleep(0.5)
                            continue
                    else:
                        ret, frame = cap.read()
                        if not ret:
                            print("⚠️ Failed to grab frame. Retrying...")
                            await asyncio.sleep(0.5)
                            continue

                    # Ensure 320x240 (in case the CV2 property set was ignored by the Pi driver)
                    frame = cv2.resize(frame, (320, 240))

                    # Refresh the display on every loop tick so it never freezes while waiting
                    if show_display:
                        try:
                            cv2.imshow("Emotion Monitor", draw_emotion_face(current_emotion))
                            if cv2.waitKey(1) & 0xFF == ord('q'):
                                break
                        except Exception:
                            show_display = False

                    # Auto-clear the flight limiter if the backend took too long (e.g. no face detected)
                    if _waiting_for_response and (time.time() - _last_sent_time) > FLIGHT_TIMEOUT:
                        _waiting_for_response = False

                    # Skip sending if still waiting for a response
                    if _waiting_for_response:
                        await asyncio.sleep(0.05)
                        continue

                    # Encode JPEG + base64 together off the event loop so receive_results isn't starved
                    def _encode(f):
                        _, buf = cv2.imencode('.jpg', f, [int(cv2.IMWRITE_JPEG_QUALITY), 50])  # pylint: disable=no-member
                        return base64.b64encode(buf).decode('utf-8')

                    jpg_as_text = await asyncio.to_thread(_encode, frame)
                    payload = {
                        "image": f"data:image/jpeg;base64,{jpg_as_text}"
                    }

                    # Send over WebSocket and mark frame as in-flight
                    _waiting_for_response = True
                    _last_sent_time = time.time()
                    await websocket.send(json.dumps(payload))

                    # Minimal sleep to prevent busy-spin (flight limiter controls real pacing)
                    elapsed = time.time() - start_time
                    sleep_time = max(0, frame_delay - elapsed)
                    await asyncio.sleep(sleep_time)

            except asyncio.CancelledError:
                # Expected when cleaning up
                pass
            finally:
                print("\nStopping camera and closing connection...")
                # Imitating the 'stop' event triggered by the React frontend
                try:
                    await websocket.send(json.dumps({"event": "stop"}))
                except:
                    pass
                if show_display:
                    cv2.destroyAllWindows()
                if picam2 is not None:
                    picam2.stop()
                    picam2.close()
                elif cap is not None:
                    cap.release()
                receive_task.cancel()

    except ConnectionRefusedError:
        print(
            f"❌ ERROR: Connection Refused. Is the backend running on {BACKEND_URL}?")
    except Exception as e:
        print(f"❌ STREAM ERROR: {e}")

if __name__ == "__main__":
    try:
        if not ensure_patient_exists():
            print("[ERROR] Aborting: could not verify/create patient in DB.")
            raise SystemExit(1)
        asyncio.run(stream_video())
    except KeyboardInterrupt:
        print("\n[INFO] Streaming stopped manually by user.")
