// ─── Hardware + Backend Integration Layer ───────────────────────────────────
const BACKEND_URL = "http://127.0.0.1:8000";
const WS_URL = "ws://127.0.0.1:8000";

let _sessionWs = null;
let _sessionUuid = null;
let _sessionDbId = null;
let _patientId = null;
let _lastEmotionPacket = null;

const safeJson = async (res) => {
  try { return await res.json(); } catch { return null; }
};

const HardwareAPI = {

  // ─── Session lifecycle ─────────────────────────────────────────────────
  startSession: async (patientId) => {
    _patientId = patientId;

    // 1. Create or reuse session via REST
    const res = await fetch(`${BACKEND_URL}/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: patientId }),
    });

    const data = await safeJson(res);
    if (!res.ok) throw new Error(data?.detail || `Failed to start session (${res.status})`);

    _sessionUuid = data.session_uuid;
    _sessionDbId = data.session_id;
    console.log(`[SESSION] Started: ${_sessionUuid} for patient ${_patientId}`);

    // 2. ███ CRITICAL FIX: Actually open the WebSocket ███
    try {
      _sessionWs = new WebSocket(`${WS_URL}/ws/child-session/${_patientId}`);

      _sessionWs.onopen = () => {
        console.log(`[WS] ✅ Connected to /ws/child-session/${_patientId}`);
      };

      _sessionWs.onmessage = (e) => {
        try {
          const packet = JSON.parse(e.data);
          _lastEmotionPacket = packet;
          // Backend sends back emotion results — store for reference
          if (packet.emotion) {
            console.log(`[WS] 🧠 Emotion: ${packet.emotion} (${packet.timestamp})`);
          }
        } catch {}
      };

      _sessionWs.onerror = (err) => {
        console.warn("[WS] Connection error (frames won't be analyzed):", err);
      };

      _sessionWs.onclose = () => {
        console.log("[WS] Connection closed");
        _sessionWs = null;
      };

      // Wait briefly for connection to establish
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (_sessionWs && _sessionWs.readyState === WebSocket.OPEN) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        // Timeout after 3 seconds — don't block forever
        setTimeout(() => { clearInterval(check); resolve(); }, 3000);
      });

    } catch (err) {
      console.warn("[WS] WebSocket not available:", err.message);
      _sessionWs = null;
    }

    return _sessionUuid;
  },

  endSession: async () => {
    const closingUuid = _sessionUuid;

    // Send stop event via WS
    try {
      if (_sessionWs && _sessionWs.readyState === WebSocket.OPEN) {
        _sessionWs.send(JSON.stringify({ event: "stop" }));
      }
    } catch {}

    // End session via REST
    try {
      if (closingUuid) {
        const res = await fetch(`${BACKEND_URL}/sessions/${closingUuid}/end`, { method: "POST" });
        const data = await safeJson(res);
        if (res.ok) console.log(`[SESSION] Ended: ${closingUuid} (${data?.duration || "?"})`);
        else console.error("[SESSION] End failed:", data?.detail);
      }
    } catch (err) {
      console.error("[SESSION] End error:", err.message);
    }

    // Close WS
    try { if (_sessionWs) _sessionWs.close(); } catch {}

    _sessionWs = null;
    _sessionUuid = null;
    _sessionDbId = null;
    _patientId = null;
    _lastEmotionPacket = null;
  },

  getPatientId: () => _patientId,
  getSessionUuid: () => _sessionUuid,
  getSessionId: () => _sessionDbId,
  getLastEmotionPacket: () => _lastEmotionPacket,

  // ─── Camera/audio streaming ────────────────────────────────────────────
  sendVideoFrame: (base64Jpeg) => {
    if (_sessionWs && _sessionWs.readyState === WebSocket.OPEN) {
      _sessionWs.send(JSON.stringify({ image: base64Jpeg }));
    }
  },

  sendAudioChunk: (base64Webm) => {
    if (_sessionWs && _sessionWs.readyState === WebSocket.OPEN) {
      _sessionWs.send(JSON.stringify({ audio: base64Webm }));
    }
  },

  // ─── ESP32 touch sensor (placeholder) ──────────────────────────────────
  subscribeTouchSensor: (callback) => {
    console.log("[HW] Touch sensor subscription started (placeholder)");
    return () => {};
  },

  simulateTouch: () => {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ detected: true, pressure: 0.7 }), 2000);
    });
  },

  // ─── Game event logging via REST ───────────────────────────────────────
  logGameEvent: async (eventType, data = {}) => {
    if (!_patientId) {
      console.warn("[GAME] No patient — skipping event");
      return null;
    }

    const payload = {
      patient_id: _patientId,
      session_uuid: _sessionUuid,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      ...data,
    };

    console.log(`[GAME] ${eventType}:`, payload);

    try {
      const res = await fetch(`${BACKEND_URL}/api/game-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await safeJson(res);
      if (!res.ok) console.error("[GAME] Server error:", body?.detail || res.status);
      return body;
    } catch (err) {
      console.error("[GAME] Failed:", err.message);
      return null;
    }
  },

  // ─── Generic event logger ──────────────────────────────────────────────
  logEvent: (eventType, data) => {
    console.log(`[LOG] ${eventType}:`, data);
  },

  detectEmotion: async () => {
    return _lastEmotionPacket;
  },

  calibrateBaseline: async () => {
    return { success: true, baselineId: "baseline_" + Date.now() };
  },
};

export default HardwareAPI;
