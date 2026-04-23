// ─── Hardware + Backend Integration Layer ───────────────────────────────────
//
// Simulation mode — no ESP32, no Pi camera needed.
// Each texture book playthrough creates a NEW backend session.
//
const BACKEND_URL = "http://localhost:8000";

let _patientId = null;
let _gameSessionId = null; // backend session ID for current game

const safeJson = async (res) => {
  try { return await res.json(); } catch { return null; }
};

const HardwareAPI = {

  // ─── App lifecycle ─────────────────────────────────────────────────
  startSession: async (patientId) => {
    _patientId = patientId;
    console.log(`[SESSION] App started for patient ${_patientId}`);
    return `sim_${Date.now()}`;
  },

  endSession: async () => {
    console.log(`[SESSION] App ended for patient ${_patientId}`);
    _patientId = null;
    _gameSessionId = null;
  },

  getPatientId: () => _patientId,
  getGameSessionId: () => _gameSessionId,

  // ─── Game session (one per texture book playthrough) ────────────────
  //
  // Called by TextureBookScreen on mount. Creates a fresh session on the
  // backend so each playthrough has its own isolated event log.
  //
  createGameSession: async () => {
    if (!_patientId) {
      console.warn("[GAME] No patient — can't create session");
      return null;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/game-session/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: _patientId }),
      });
      const data = await safeJson(res);
      if (res.ok && data?.session_id) {
        _gameSessionId = data.session_id;
        console.log(`[GAME] ✅ New game session created: ${_gameSessionId}`);
        return _gameSessionId;
      } else {
        console.warn("[GAME] Session creation failed, events will use latest session:", data);
        _gameSessionId = null;
        return null;
      }
    } catch (err) {
      console.warn("[GAME] Backend unreachable — events will auto-create session:", err.message);
      _gameSessionId = null;
      return null;
    }
  },

  // ─── ESP32 Touch Sensor (simulated) ────────────────────────────────
  subscribeTouchSensor: (callback) => {
    console.log("[HW] Touch sensor subscription (simulated)");
    return () => {};
  },

  simulateTouch: () => {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ detected: true, pressure: 0.7 }), 2000);
    });
  },

  // ─── Game event logging via REST ───────────────────────────────────
  //
  // If _gameSessionId exists, events go to that specific session.
  // If not (backend was down when session was created), the backend
  // falls back to the patient's latest session.
  //
  logGameEvent: async (eventType, data = {}) => {
    if (!_patientId) {
      console.warn("[GAME] No patient — skipping event");
      return null;
    }

    const payload = {
      patient_id: _patientId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      ...data,
    };

    // Attach session_id if we have one
    if (_gameSessionId) {
      payload.session_id = _gameSessionId;
    }

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
      console.error("[GAME] Backend unreachable — event logged locally only:", err.message);
      return null;
    }
  },

  logEvent: (eventType, data) => {
    console.log(`[LOG] ${eventType}:`, data);
  },

  // ─── Camera (disabled in simulation) ───────────────────────────────
  sendVideoFrame: () => {},
  sendAudioChunk: () => {},
  detectEmotion: async () => null,
  calibrateBaseline: async () => ({ success: true }),
};

export default HardwareAPI;
