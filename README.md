# Tour Secure Pro Monorepo (Extended Scaffold)

A richer, runnable scaffold for **Smart Tourist Safety Monitoring & Incident Response System**.

## Apps & Services
- **frontend/** (React + TypeScript + Tailwind) – Multi-tab UI (Home, Explore, AI Assistant, Heatmap, Reviews, Itinerary, eFIR, Digital ID, Safety Center, About) with SOS, safety scores, and API wiring.
- **backend/** (Node + Express + TypeScript + Mongoose) – Users, reviews, itineraries, zones, e-FIRs, alerts, safety scores, Digital IDs, recommendations, AI assistant, check-ins.
- **db** (MongoDB) – Persistent application data for the backend.
- **services/geofencing/** (FastAPI) – Configurable GeoJSON-like zones (from `zones.json`), polygon containment & distance fallback.
- **services/anomaly/** (FastAPI) – Rule-based route checks (deviation & inactivity) with extension points for ML models.
- **blockchain/** (Hardhat + Solidity) – Local chain and `TouristID` contract deployment.
- **docker-compose.yml** – One command to run all services.

## Quick Start
```bash
# optional: enable the Claude-powered assistant (otherwise it runs in offline mode)
export ANTHROPIC_API_KEY=sk-ant-...

docker compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8080/api
```

### Notes
- MongoDB data is stored in the `db_data` Docker volume and accessed through Mongoose.
- Hardhat starts a local node and deploys `TouristID` on boot.
- Geofencing reads `services/geofencing/app/zones.json` (edit & restart to change scores).
- Backend unit tests (no DB needed): `cd backend && npm test`.

---

## ✨ New features

### 🧭 Explore — category-wise, safety-aware recommendations (`/explore`)
Categories: **Historic & Heritage, Entertainment, Fun & Adventure, Food & Drink, Nature, Spiritual, Shopping**.

| Tab | What it does |
| --- | --- |
| **Near me** | Ranks places around your GPS position (or any searched city/landmark) by interest match, distance, popularity, **area safety** and **time of day**. Results are shown as a mixed "Top picks" list, per-category sections and a colour-coded map. "Hide low-safety places" removes places inside high-risk zones. |
| **From my itinerary** | Learns an interest profile from your saved itinerary (e.g. *70% historic, 30% food*), suggests places near **each stop**, a "For you" list, and ideas for categories your trip doesn't cover yet. Already-planned places are excluded. |
| **Plan a trip** | Generates a timed **day-by-day plan** (1–7 days, relaxed/balanced/packed) with lunch/dinner slots, travel estimates and nearest-neighbour routing. Save the whole trip — or a single day — to your itinerary in one click. |

Places come from a curated catalogue (~120 landmarks, eateries and attractions across Chennai, Guwahati, Shillong, Gangtok, Delhi, Mumbai, Jaipur, Agra, Kolkata) and, when the server has internet, **live OpenStreetMap POIs** via the Overpass API (cached, with automatic fallback). Free-text locations are geocoded offline first, then via Nominatim.

### 🤖 AI assistant (`/assistant` + floating chat bubble on every page)
- Uses **Claude** (Anthropic Messages API with tool use) when `ANTHROPIC_API_KEY` is set; otherwise an **offline rule-based engine** answers using the same tools — so it always works in demos.
- Tools: area safety lookup, category recommendations, trip planning, read/add itinerary items, emergency numbers, nearest police/hospital, and in-app action buttons (SOS, e-FIR, check-in…).
- Replies render place cards and full plans you can save directly. Emergency messages ("someone is following me") immediately surface **Call 112** and **SOS** buttons.
- Falls back to offline mode automatically if the AI API is unreachable; per-user rate limiting protects the key.

### 🚨 SOS with live tracking
- Shared SOS flow (Home button, Safety Center, assistant) with a 5-second cancel countdown.
- Each alert gets a **public live-tracking link** (`/track/:token`, expires after 24 h) that keeps updating while the alert is open.
- One-tap **WhatsApp / SMS / Call** to your emergency contacts with the link; "I'm safe" / "False alarm" to close.
- Guests are guided to call 112 instead of getting a false "SOS sent".
- Optional `ALERT_WEBHOOK_URL` receives every alert as JSON (Slack/Discord/Teams/Twilio Functions, etc.).

### ⏱️ Safe check-in timer (Safety Center, `/safety`)
Start a timer before a night ride or trek. If you don't tap **I'm safe** before it runs out, a background sweeper escalates it into an alert with your last known location. Late check-ins resolve the alert.

### 👥 Emergency contacts & travel preferences
Up to 5 contacts (validated), plus preferred categories and "avoid unsafe" default — used by Explore, the planner and the assistant.

### 🗓️ Itinerary upgrades
Category & time fields, **persisted done status** (was client-only), delete, auto-geocoding, per-item **safety badges**, "Ideas nearby" links, bulk save, timed ICS export.

### 🛠️ Control room (Admin)
Alerts now show type (SOS / missed check-in), status workflow (**open → acknowledged → resolved**), user + contacts, live-track link; plus a list of active check-ins.

### 🐛 Fixes along the way
- `calculateSafety` now treats the seed data's `-1..+1` sentiment as a scale (it was clamped to 0).
- Home "Your Safety Score" now shows a real safety score (higher = safer) instead of the zone's *risk* score.
- `walletAddress` / `blockchainAddress` were missing from the User schema (silently dropped by Mongoose).
- CORS now allows the `Cache-Control` header the heatmap sends (preflight was rejected cross-origin).
- SOS countdown no longer risks firing twice under React StrictMode; JSON error handler instead of HTML stack traces.

---

## Configuration (backend)
| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | – | Enables the Claude assistant engine |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model id for the assistant |
| `ASSISTANT_RATE_PER_MIN` | `20` | Chat requests per user/IP per minute |
| `ENABLE_OSM` / `OVERPASS_URL` | `true` / overpass-api.de | Live OpenStreetMap places |
| `ENABLE_GEOCODER` / `GEOCODER_URL` | `true` / Nominatim | Online geocoding fallback |
| `PUBLIC_APP_URL` | first `CORS_ORIGINS` entry | Base URL for live-tracking links |
| `ALERT_WEBHOOK_URL` | – | POST every new alert as JSON |
| `CHECKIN_GRACE_SECONDS` | `120` | Grace period before a missed check-in escalates |
| `ALERT_SHARE_TTL_HOURS` | `24` | Tracking-link lifetime |

## API Map (selected)
- `GET /api/health`
- `GET /api/safety-scores`
- `GET /api/safety-scores/nearby?lat=..&lng=..&radius=..`
- `POST /api/alerts/panic` → `{ id, trackUrl, shareText, contacts }`
- `POST /api/alerts/:id/location` · `POST /api/alerts/:id/cancel` · `GET /api/alerts/mine`
- `GET /api/alerts/track/:token` (public live tracking)
- `POST /api/efir` { name, contact, description }
- `GET /api/geo/zones` / `POST /api/geo/zones`
- `POST /api/geo/check`
- `GET /api/reviews` / `POST /api/reviews`
- `GET /api/itinerary[?withSafety=1]` / `POST /api/itinerary` / `POST /api/itinerary/bulk` / `PATCH|DELETE /api/itinerary/:id`
- `GET /api/digital-id/me` / `POST /api/digital-id/create`
- `GET /api/recommendations/categories`
- `GET /api/recommendations/nearby?lat=&lng=|location=&categories=historic,food&radius=15&hour=18&avoidUnsafe=1`
- `GET /api/recommendations/itinerary?categories=&perStop=4` (auth)
- `POST /api/recommendations/plan` { location | lat,lng, days, categories, pace, startDate, avoidUnsafe }
- `GET /api/recommendations/geocode?q=` · `GET /api/recommendations/safety?lat=&lng=&hour=`
- `GET /api/assistant/status` · `POST /api/assistant/chat` { messages, context: { lat, lng, hour, localTime, page } }
- `POST /api/checkins` { minutes, label } · `GET /api/checkins/active` · `POST /api/checkins/:id/(complete|extend|ping|cancel)`
- `GET /api/profile` · `PUT /api/profile/contacts` · `PUT /api/profile/preferences`
- `GET /api/admin/alerts` · `PATCH /api/admin/alerts/:id` · `GET /api/admin/checkins` (admin)

This is a **developer-friendly baseline**: everything compiles & runs; you can grow features incrementally.
