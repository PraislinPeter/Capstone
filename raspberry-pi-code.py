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
import subprocess

try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

# <-- Replace with your OpenAI API Key
OPENAI_API_KEY = "API_KEY_GOES_HERE"


current_face_state = "happy"
emotion_history = []
last_api_emotion = ""
waiting_for_page = False
selected_page = None
cancel_conversation = False
think_state = 1
think_toggle_time = 0.0
is_listening = False

PAGES_INFO = {
    "1": {"type": "emotion", "name": "neutral", "description": "a picture showing a boy and a girl sitting at a desk showing no emotion"},
    "2": {"type": "emotion", "name": "happy", "description": "a picture showing the same boy and girl sitting on the ground, the boy is holding a gift and the girl is showing happiness"},
    "3": {"type": "emotion", "name": "sad", "description": "a picture showing the boy and girl sitting sadly on the ground, the boy holding a broken toy car"},
    "4": {"type": "emotion", "name": "anger", "description": "a picture showing the boy and girl both standing, the girl pointing at the boy accusingly, and the boy has his arms crossed"},
    "5": {"type": "texture", "name": "smooth aluminium foil", "description": "an aluminium foil as a flat sheet"},
    "6": {"type": "texture", "name": "smooth cotton", "description": "a brown sheet of cotton texture that is very smooth"},
    "7": {"type": "texture", "name": "bumpy metallic", "description": "a metallic colored sheet like foil but it is horizontally bumpy all over, like a bumpy aluminium foil feel"},
    "8": {"type": "texture", "name": "black sandpaper", "description": "a sheet of black sandpaper"},
    "9": {"type": "texture", "name": "cotton balls", "description": "a sheet of cotton balls stuck to it all over so it is very soft and also bumpy"}
}

message_queue = []


def add_to_history(text: str):
    global emotion_history
    emotion_history.append(text)
    if len(emotion_history) > 7:
        emotion_history.pop(0)


def speak_text_sync(text: str):
    """Generates and plays TTS using OpenAI. Runs synchronously."""
    global cancel_conversation
    if cancel_conversation:
        return
    print(f"\n[AURA SPEAKING]: {text}\n")
    if not HAS_OPENAI or not OPENAI_API_KEY:
        print(
            "⚠️ [WARN] OpenAI not configured or 'openai' package missing. Skipping TTS.")
        return

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.audio.speech.create(
            model="tts-1",
            voice="echo",
            response_format="wav",
            input=text
        )
        wav_path = "/tmp/aura_speech.wav"
        response.write_to_file(wav_path)
        if cancel_conversation:
            return
        subprocess.run(["aplay", "-q", wav_path])
    except Exception as e:
        print(f"❌ [ERROR] TTS Failed: {e}")


def restart_conversation_flow():
    global cancel_conversation
    print("[INFO] Restarting conversation flow...")
    cancel_conversation = True
    subprocess.run(["pkill", "-9", "arecord"], stderr=subprocess.DEVNULL)
    subprocess.run(["pkill", "-9", "aplay"], stderr=subprocess.DEVNULL)
    time.sleep(0.5)

    cancel_conversation = False

    global current_face_state, waiting_for_page, selected_page
    current_face_state = 'happy'
    waiting_for_page = False
    selected_page = None

    asyncio.create_task(asyncio.to_thread(interactive_conversation_sync))


def interactive_conversation_sync():
    """Background conversation loop using OpenAI Whisper, GPT, and TTS."""
    global current_face_state, waiting_for_page, selected_page, cancel_conversation

    if not HAS_OPENAI or not OPENAI_API_KEY:
        return

    def speak(text):
        if cancel_conversation:
            return
        speak_text_sync(text)

    def listen_dynamic(max_record_time=12, silence_timeout=1.5, threshold=800):
        global cancel_conversation, current_face_state, is_listening
        if cancel_conversation:
            return ""

        current_face_state = 'thinking'
        is_listening = True
        print("\n🎤 [AURA LISTENING... SPEAK INTO THE USB MIC NOW]\n")

        cmd = ["arecord", "-D", "plughw:1,0", "-f", "S16_LE",
               "-r", "16000", "-c", "1", "-q", "-t", "raw"]
        try:
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        except Exception:
            cmd = ["arecord", "-f", "S16_LE", "-r",
                   "16000", "-c", "1", "-q", "-t", "raw"]
            proc = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

        frames = []
        has_started_speaking = False
        silence_start_time = None
        start_time = time.time()

        import struct
        import math

        try:
            while True:
                if cancel_conversation:
                    proc.kill()
                    is_listening = False
                    return ""

                chunk = proc.stdout.read(4096)
                if not chunk:
                    break

                frames.append(chunk)

                count = len(chunk) // 2
                if count == 0:
                    continue
                format_str = "<" + "h" * count
                try:
                    shorts = struct.unpack(format_str, chunk)
                    rms = math.sqrt(sum(x*x for x in shorts) / count)
                except:
                    rms = 0

                if rms > threshold:
                    has_started_speaking = True
                    silence_start_time = None
                else:
                    if has_started_speaking:
                        if silence_start_time is None:
                            silence_start_time = time.time()
                        elif time.time() - silence_start_time > silence_timeout:
                            break

                if time.time() - start_time > max_record_time:
                    break
        finally:
            proc.kill()

        # Turn off indicator immediately after recording stops
        is_listening = False

        import wave
        import os
        wav_path = "/tmp/child_speech.wav"
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"".join(frames))

        client = OpenAI(api_key=OPENAI_API_KEY)
        try:
            with open(wav_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )
            text = transcript.text.strip()
            if text:
                print(f"🗣️ [CHILD SAID]: {text}")
                return text
        except Exception as e:
            print(f"⚠️ STT error: {e}")

        return ""

    time.sleep(3)
    if cancel_conversation:
        return

    current_face_state = 'happy'
    speak("Hello! I am AURA. How are you doing today?")

    user_text = listen_dynamic(15, 2.0)
    if cancel_conversation:
        return

    current_face_state = 'happy'
    if user_text:
        try:
            client = OpenAI(api_key=OPENAI_API_KEY)
            sys_prompt = (
                "You are AURA, a friendly robot. The user just answered how they are doing. "
                "Acknowledge their response warmly, and then seamlessly transition into giving them these EXACT instructions: "
                "'There is just one book in front of you. The first 4 pages are pictures and the next 5 are textures. "
                "Please touch a texture or observe one of the pages of the book. Choose one page and type in a number.' "
                "Do not wait for another prompt, just output the acknowledgment and instructions as one seamless response (2-3 sentences max)."
            )
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": user_text}
                ],
                max_tokens=80
            )
            reply = response.choices[0].message.content.strip()
            speak(reply)
        except Exception as e:
            speak("That is wonderful! There is just one book in front of you. The first 4 pages are pictures and the next 5 are textures. Please touch a texture or observe one of the pages of the book. Choose one page and type in a number.")
    else:
        speak("There is just one book in front of you. The first 4 pages are pictures and the next 5 are textures. Please touch a texture or observe one of the pages of the book. Choose one page and type in a number.")

    while not cancel_conversation:
        global waiting_for_page, selected_page
        waiting_for_page = True
        selected_page = None
        current_face_state = 'thinking'

        while waiting_for_page and not cancel_conversation:
            time.sleep(0.1)

        if cancel_conversation:
            return

        current_face_state = 'happy'

        page_info = PAGES_INFO.get(selected_page)
        p_name = "Unknown"
        if page_info:
            p_type = page_info["type"]
            p_name = page_info["name"]
            p_desc = page_info["description"]

            if p_type == "emotion":
                action_prompt = "Please see it."
            else:
                action_prompt = "Please touch it."

            speak(
                f"You have selected the number {selected_page}. This is {p_desc}. {action_prompt}")
            time.sleep(3)
            if cancel_conversation:
                return
            speak("How does it make you feel?")
        else:
            speak(
                f"You have selected page {selected_page}. Look at it or feel it, and tell me how you feel.")

        user_text2 = listen_dynamic(20, 2.0)
        if cancel_conversation:
            return

        if user_text2:
            try:
                client = OpenAI(api_key=OPENAI_API_KEY)

                # Get conversational response
                reply_resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "The user is exploring a sensory book. They just shared how a specific page made them feel. Acknowledge their feeling and be encouraging. Keep it short, 1-2 sentences."},
                        {"role": "user", "content": user_text2}
                    ],
                    max_tokens=50
                )
                reply_text = reply_resp.choices[0].message.content.strip()

                # Get Sentiment for face state
                sent_resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "Based on the user's description of feeling a texture or seeing an emotion, determine their emotion. Reply ONLY with one of the following: happy, sad, fear, disgust, surprise, anger."},
                        {"role": "user", "content": user_text2}
                    ],
                    max_tokens=10
                )
                sentiment = sent_resp.choices[0].message.content.strip().lower()
                sentiment = ''.join(c for c in sentiment if c.isalpha())

                if sentiment in ['happy', 'surprise']:
                    current_face_state = 'happy'
                elif sentiment in ['sad', 'fear', 'disgust', 'anger']:
                    current_face_state = 'sad'
                else:
                    current_face_state = 'happy'
                    sentiment = 'unknown'

                # Log to history and send via websocket queue
                if sentiment != 'unknown':
                    add_to_history(f"Felt {sentiment} about page {selected_page}")
                    message_queue.append({
                        "event": "child_feedback",
                        "feedback_type": "emotion_choice",
                        "value": sentiment.capitalize(),
                        "texture_name": p_name
                    })

                speak(reply_text)
            except Exception as e:
                print(f"[GPT ERROR] {e}")
                current_face_state = 'happy'
                speak(
                    "Thank you for sharing that with me. You did a great job exploring today!")
        else:
            current_face_state = 'happy'
            speak("Thank you for exploring with me today!")
        
        if cancel_conversation:
            return
            
        time.sleep(1)
        speak("Would you like to do another page? If so, type in the page number.")


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
HAS_DISPLAY = bool(os.environ.get("DISPLAY")
                   or os.environ.get("WAYLAND_DISPLAY"))

# Shared state: written by receive_results, read by the display refresh in the capture loop
current_emotion = "neutral"

# Flight limiter: True while a frame is in-flight to the backend.
# Prevents queue buildup when backend inference is slower than the send rate.
_waiting_for_response = False
# used to timeout the flight limiter if backend sends no response
_last_sent_time = 0.0
# seconds before giving up waiting and sending the next frame
FLIGHT_TIMEOUT = 8.0


def draw_face(state: str) -> np.ndarray:
    W, H = 1280, 720
    canvas = np.zeros((H, W, 3), dtype=np.uint8)

    cx, cy = W // 2, H // 2 - 20
    eye_y = cy - 50
    lx, rx = cx - 120, cx + 120

    eye_radius = 60
    pupil_radius = 25

    lx_pupil, ly_pupil = lx, eye_y
    rx_pupil, ry_pupil = rx, eye_y

    if state == 'happy':
        pass
    elif state == 'sad':
        lx_pupil += 15
        ly_pupil += 15
        rx_pupil += 15
        ry_pupil += 15
    elif state == 'thinking1':
        lx_pupil += 20
        ly_pupil -= 20
        rx_pupil += 20
        ry_pupil -= 20
    elif state == 'thinking2':
        lx_pupil -= 20
        ly_pupil -= 20
        rx_pupil -= 20
        ry_pupil -= 20

    cv2.circle(canvas, (lx, eye_y), eye_radius, (255, 255, 255), -1)
    cv2.circle(canvas, (rx, eye_y), eye_radius, (255, 255, 255), -1)

    cv2.circle(canvas, (lx_pupil, ly_pupil), pupil_radius, (0, 0, 0), -1)
    cv2.circle(canvas, (rx_pupil, ry_pupil), pupil_radius, (0, 0, 0), -1)

    my = cy + 100
    if state == 'happy':
        cv2.ellipse(canvas, (cx, my), (80, 50), 0, 0, 180, (255, 255, 255), 10)
    elif state == 'sad':
        cv2.ellipse(canvas, (cx, my + 50), (80, 50),
                    0, 180, 360, (255, 255, 255), 10)
    else:
        cv2.circle(canvas, (cx + 40, my), 15, (255, 255, 255), 8)

    font = cv2.FONT_HERSHEY_SIMPLEX
    start_y = H - 35 * len(emotion_history) - 20
    for i, item in enumerate(emotion_history):
        cv2.putText(canvas, item, (30, start_y + i * 35),
                    font, 1.0, (200, 200, 200), 2, cv2.LINE_AA)

    global is_listening
    if is_listening:
        cv2.circle(canvas, (W - 50, 50), 15, (0, 0, 255), -1)
        cv2.putText(canvas, "LISTENING", (W - 190, 58),
                    font, 0.7, (0, 0, 255), 2, cv2.LINE_AA)

    return canvas


# --- CONFIGURATION ---
# Change THIS to the actual IP address of the machine running backend/main.py
BACKEND_URL = "ws://172.20.10.3:8000/ws/stream"

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
        print(
            f"[WARN] Patient {PATIENT_ID} not found. Creating placeholder...")
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
                current_emotion = data['emotion'].lower()
                _waiting_for_response = False  # unblock the send loop
                print(
                    f"[AI RESPONSE] Time: {timestamp} | Dominant Emotion: {emotion}")

                global last_api_emotion
                if emotion != last_api_emotion:
                    last_api_emotion = emotion
                    add_to_history(f"{timestamp} - {emotion}")

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
    url = f"{BACKEND_URL}/{PATIENT_ID}/child"
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
                    print(
                        f"⚠️  picamera2 failed ({cam_err}), falling back to OpenCV...")
                    picam2 = None

            if picam2 is None:
                cap = cv2.VideoCapture(0)
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                if not cap.isOpened():
                    print("❌ ERROR: Could not open the camera.")
                    print(
                        "Hint: On Bookworm, ensure picamera2 is installed and the camera is enabled.")
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
                    cv2.imshow("Emotion Monitor", draw_face("happy"))
                    cv2.waitKey(1)
                except Exception as disp_err:
                    print(
                        f"⚠️  Display unavailable ({disp_err}), continuing without GUI.")
                    show_display = False

            # --- STARTUP INTERACTIVE CONVERSATION ---
            # Run the voice conversation loop in the background so it doesn't block video streaming!
            asyncio.create_task(asyncio.to_thread(
                interactive_conversation_sync))

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
                            global think_state, think_toggle_time, waiting_for_page, selected_page
                            render_state = current_face_state
                            if current_face_state == "thinking":
                                if time.time() - think_toggle_time > 0.8:
                                    think_state = 2 if think_state == 1 else 1
                                    think_toggle_time = time.time()
                                render_state = f"thinking{think_state}"

                            cv2.imshow("Emotion Monitor",
                                       draw_face(render_state))
                            key = cv2.waitKey(1) & 0xFF
                            if key == ord('q'):
                                break
                            elif key == ord('r'):
                                restart_conversation_flow()
                            elif chr(key).isdigit():
                                if waiting_for_page:
                                    selected_page = chr(key)
                                    waiting_for_page = False

                                    p_info = PAGES_INFO.get(selected_page, {})
                                    p_name = p_info.get("name", "Unknown")

                                    add_to_history(
                                        f"User selected page {selected_page}: {p_name}")

                                    message_queue.append({
                                        "event": "child_interaction",
                                        "texture_name": p_name,
                                        "page": selected_page
                                    })
                        except Exception as e:
                            print(f"Display error: {e}")
                            show_display = False

                    # Auto-clear the flight limiter if the backend took too long (e.g. no face detected)
                    if _waiting_for_response and (time.time() - _last_sent_time) > FLIGHT_TIMEOUT:
                        _waiting_for_response = False

                    while message_queue:
                        msg = message_queue.pop(0)
                        await websocket.send(json.dumps(msg))

                    # Skip sending if still waiting for a response
                    if _waiting_for_response:
                        await asyncio.sleep(0.05)
                        continue

                    # Encode JPEG + base64 together off the event loop so receive_results isn't starved
                    def _encode(f):
                        _, buf = cv2.imencode(
                            '.jpg', f, [int(cv2.IMWRITE_JPEG_QUALITY), 50])  # pylint: disable=no-member
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

