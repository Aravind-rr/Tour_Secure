# Tour Secure Pro Monorepo (Extended Scaffold)

A richer, runnable scaffold for **Smart Tourist Safety Monitoring & Incident Response System**.

## Apps & Services
- **frontend/** (React + TypeScript + Tailwind) – Full multi-tab UI (Home, Heatmap, Reviews, Itinerary, eFIR, Digital ID, About) with SOS, safety scores, and API wiring.
- **backend/** (Node + Express + TypeScript + Mongoose) – Users, reviews, itineraries, zones, e-FIRs, alerts, safety scores, and Digital IDs.
- **db** (MongoDB) – Persistent application data for the backend.
- **services/geofencing/** (FastAPI) – Configurable GeoJSON-like zones (from `zones.json`), polygon containment & distance fallback.
- **services/anomaly/** (FastAPI) – Rule-based route checks (deviation & inactivity) with extension points for ML models.
- **blockchain/** (Hardhat + Solidity) – Local chain and `TouristID` contract deployment.
- **docker-compose.yml** – One command to run all services.

## Quick Start
```bash
docker compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8080/api
```

### Notes
- MongoDB data is stored in the `db_data` Docker volume and accessed through Mongoose.
- Hardhat starts a local node and deploys `TouristID` on boot.
- Geofencing reads `services/geofencing/app/zones.json` (edit & restart to change scores).

## API Map (selected)
- `GET /api/health`
- `GET /api/safety-scores`
- `GET /api/safety-scores/nearby?lat=..&lng=..&radius=..`
- `POST /api/alerts/panic`
- `POST /api/efir` { name, contact, description }
- `GET /api/geo/zones` / `POST /api/geo/zones`
- `POST /api/geo/check`
- `GET /api/reviews` / `POST /api/reviews`
- `GET /api/itinerary` / `POST /api/itinerary`
- `GET /api/digital-id/me` / `POST /api/digital-id/create`

This is a **developer-friendly baseline**: everything compiles & runs; you can grow features incrementally.
