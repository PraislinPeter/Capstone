# pylint: disable=no-member
import cv2
import base64
import json
import asyncio
import websockets
import time

# --- CONFIGURATION ---
# Change THIS to the actual IP address of the machine running backend/main.py
BACKEND_URL = "ws://192.168.1.100:8000/ws/stream"

# Change the patient ID if you want logs linked to a specific database patient
PATIENT_ID = 1

# 5 FPS is enough for the backend engine to work well and keeps Pi 3 CPU usage very low
FPS_LIMIT = 5


async def receive_results(websocket):
    """
    Asynchronously listens to the Websocket to receive 
    the live emotion & clinical analysis updates.
    """
    try:
        async for message in websocket:
            data = json.loads(message)

            if data.get("status") == "finished":
                print("\n[INFO] Backend signaled stream completion.")
                break

            if "emotion" in data:
                timestamp = data.get('timestamp', '00:00')
                emotion = data['emotion'].upper()
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
    url = f"{BACKEND_URL}/{PATIENT_ID}"
    print(f"==================================================")
    print(f"Connecting to Backend Stream: {url}")
    print(f"==================================================")

    try:
        async with websockets.connect(url) as websocket:
            print("✅ Successfully connected to the backend!\n")

            # Start the background task to listen to AI responses
            receive_task = asyncio.create_task(receive_results(websocket))

            # --- Initialize Camera ---
            # Using v4l2 backend is standard on Pi 3 OpenCV installations
            cap = cv2.VideoCapture(0)

            # Force resolution to 640x480 (the backend's required crop standard)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)  # pylint: disable=no-member
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT,
                    480)  # pylint: disable=no-member

            if not cap.isOpened():
                print("❌ ERROR: Could not open the camera array.")
                print("Hint 1: Ensure the camera is connected and enabled.")
                print(
                    "Hint 2: On newest Pi OS, try running with: libcamerify python3 pi_client.py")
                return

            print(f"📷 Camera Live. Streaming at target {FPS_LIMIT} FPS...")
            print("Press Ctrl+C to terminate the session.\n")

            frame_delay = 1.0 / FPS_LIMIT

            try:
                while True:
                    start_time = time.time()

                    ret, frame = cap.read()
                    if not ret:
                        print("⚠️ Failed to grab frame. Retrying...")
                        await asyncio.sleep(0.5)
                        continue

                    # Ensure 640x480 (in case the CV2 property set was ignored by the Pi driver)
                    frame = cv2.resize(frame, (640, 480))

                    # Compress to JPEG - Quality 60 is perfectly optimized for AI & Network
                    encode_param = [
                        int(cv2.IMWRITE_JPEG_QUALITY), 60]  # pylint: disable=no-member
                    _, buffer = cv2.imencode('.jpg', frame, encode_param)

                    # Base64 Encode (to mimic the React frontend exactly)
                    jpg_as_text = base64.b64encode(buffer).decode('utf-8')
                    payload = {
                        "image": f"data:image/jpeg;base64,{jpg_as_text}"
                    }

                    # Send over WebSocket
                    await websocket.send(json.dumps(payload))

                    # Dynamic sleep to hard limit the FPS and keep Pi temperatures down
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
                cap.release()
                receive_task.cancel()

    except ConnectionRefusedError:
        print(
            f"❌ ERROR: Connection Refused. Is the backend running on {BACKEND_URL}?")
    except Exception as e:
        print(f"❌ STREAM ERROR: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(stream_video())
    except KeyboardInterrupt:
        print("\n[INFO] Streaming stopped manually by user.")
