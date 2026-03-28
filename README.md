# 🚀 Autonomous DevOps Orchestrator

A production-ready predictive CI/CD platform with AI-powered failure
detection, root cause analysis, risk scoring, and self-healing.

## Features

| Feature | Description |
|---|---|
| **Pipeline Simulator** | 7-stage CI/CD pipeline (checkout → deploy) |
| **Failure Analysis** | Automatic root cause classification |
| **Risk Engine** | Predict failure probability before running |
| **Recommendations** | Prioritized P1/P2/P3 fix suggestions |
| **Self-Healing** | Auto-retry transient failures with audit trail |
| **Analytics** | Real-time charts and trend analysis |

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy |
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Database | PostgreSQL 15 (SQLite for local dev) |
| Charts | Recharts |
| Containers | Docker, Docker Compose |

## Quick Start (Docker)
```bash
# Clone the repository
git clone <your-repo-url>
cd devops-orchestrator

# Start everything with one command
docker-compose up --build

# Open the platform
open http://localhost:3000
```

## Local Development

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Project Structure
```
devops-orchestrator/
├── backend/
│   ├── app/
│   │   ├── api/routes/     # HTTP endpoints
│   │   ├── core/           # Config, logging, security
│   │   ├── db/             # Database connection
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # Business logic + AI engines
│   └── Dockerfile
├── frontend/
│   ├── app/                # Next.js pages
│   ├── components/         # Sidebar, TopBar
│   ├── lib/                # API client
│   └── Dockerfile
└── docker-compose.yml
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Database connection string | SQLite |
| `SECRET_KEY` | JWT signing key | auto-generated |
| `ALLOWED_ORIGINS` | CORS origins | localhost:3000 |
| `ENVIRONMENT` | production/development | development |
| `LOG_LEVEL` | INFO/DEBUG/WARNING | INFO |

## AI Engines

### Failure Analysis Engine
Classifies pipeline failures into categories using rule-based pattern
matching on error messages and stage names.

### Risk Engine  
Predicts failure probability using 5 weighted signals:
- Historical failure rate (35%)
- Recent trend (30%)
- Last run status (15%)
- Duration consistency (10%)
- Failure streak (10%)

### Recommendation Engine
Generates P1/P2/P3 prioritized fix recommendations based on failure
category with effort estimates and action steps.

### Self-Healing Engine
Auto-retries transient failures (infrastructure, source control) up to
N times before escalating to rollback signal.

## API Documentation

Available at `http://localhost:8000/docs` (development only).

## Docker Commands
```bash
docker-compose up -d          # Start in background
docker-compose down           # Stop
docker-compose down -v        # Stop + delete data
docker-compose logs -f        # Live logs
docker-compose up --build     # Rebuild after changes
```