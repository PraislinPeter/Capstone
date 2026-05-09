# Capstone Assistive Emotion Monitoring Platform

This repository contains a multi-part assistive healthcare project with:
- a Python/FastAPI backend for emotion detection and patient session tracking,
- a React/Vite caregiver app in `assistive-app/frontend`, and
- a React/Vite child-facing dashboard in `child-dashboard`.

## Repository Structure

- `backend/`
  - FastAPI app powered by PyTorch, Hugging Face models, InsightFace, and OpenCV
  - SQLAlchemy database models for patients, sessions, notes, and timelines
  - file upload support and static `/uploads` serving
  - `requirements.txt` for Python dependencies
- `assistive-app/frontend/`
  - main caregiver-facing React application built with Vite
  - uses `axios`, `bootstrap`, `react-router-dom`, `chart.js`, and `recharts`
- `child-dashboard/`
  - child-facing React dashboard built with Vite
  - uses `react-router-dom` and `lucide-react`
- `Procfile`, `railway.json`, `railway.toml`, `runtime.txt`
  - deployment configuration files for cloud hosting

## Backend Setup

1. Create and activate a Python virtual environment:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install backend dependencies:
   ```powershell
   cd backend
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```

3. Run the API server locally:
   ```powershell
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   If you start from the root folder instead, use:
   ```powershell
   cd backend
   python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## Assistive App Frontend Setup

1. Install dependencies:
   ```powershell
   cd assistive-app/frontend
   npm install
   ```

2. Start the development server:
   ```powershell
   npm run dev
   ```

3. Build for production:
   ```powershell
   npm run build
   ```

## Child Dashboard Setup

1. Install dependencies:
   ```powershell
   cd child-dashboard
   npm install
   ```

2. Start the child dashboard locally:
   ```powershell
   npm run dev
   ```

3. Build for production:
   ```powershell
   npm run build
   ```

## Notes

- The backend is designed for CPU-only deployment and includes a large set of ML dependencies.
- Model loading is lazy and happens when emotion detection is first invoked.
- The `Procfile` currently points to `main:app` in the root folder. If you deploy the backend from the root workspace, update it to use `backend.main:app`.
- `backend/uploads/` is used to store uploaded media and session artifacts.

## Recommended Workflow

- Start the backend first.
- Open `assistive-app/frontend` for the caregiver dashboard.
- Open `child-dashboard` for the child-facing interface.

## Contact

For development questions or to extend the system, inspect:
- `backend/main.py`
- `backend/database.py`
- `assistive-app/frontend/src/`
- `child-dashboard/src/`
