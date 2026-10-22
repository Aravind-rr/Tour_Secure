# Tour Secure

Tour Secure is a tourist-safety platform with a React frontend, Express API,
MongoDB, geofencing and anomaly-detection services, and a local Hardhat
blockchain. Docker Compose is the supported way to run the complete local
stack.

## Services

| Service | Technology | Local URL |
| --- | --- | --- |
| Frontend | React + Vite | http://localhost:5173 |
| Backend API | Express + TypeScript | http://localhost:8080/api |
| API health | Express | http://localhost:8080/api/health |
| Geofencing | FastAPI | http://localhost:8051/docs |
| Anomaly detection | FastAPI | http://localhost:8052/docs |
| Blockchain RPC | Hardhat | http://localhost:8545 |
| Database | MongoDB | Internal Docker network only |

MongoDB data and uploaded Digital-ID documents are stored in named Docker
volumes, so normal stops, restarts, and image rebuilds do not erase them.

## Requirements

- Docker Desktop with Docker Compose
- Ports `5173`, `8080`, `8051`, `8052`, and `8545` available
- Git, if cloning the repository

Node.js, Python, MongoDB, and Hardhat do not need to be installed on the host
for the Docker workflow.

## Start the complete project

From the repository root:

```powershell
docker compose up -d --build --wait
```

This single command:

1. Builds all application images.
2. Starts MongoDB and waits for it to become healthy.
3. Adds the sample safety locations if they are missing.
4. Starts the Python services and local blockchain.
5. Deploys the `TouristID` contract from the bundled offline artifact.
6. Starts the backend only after its dependencies are healthy.
7. Starts the frontend only after the backend is healthy.

Open http://localhost:5173 after the command completes.

The assistant works in offline mode by default. To enable Claude, create an
uncommitted `.env` file in the repository root:

```dotenv
ANTHROPIC_API_KEY=your_key_here
JWT_SECRET=replace_with_a_long_random_value
```

Then run the same start command again. Never commit `.env` files or API keys.

## Stop the project

```powershell
docker compose down
```

This stops and removes the project containers and network while preserving
MongoDB data and uploaded documents.

To restart later, use the same start command:

```powershell
docker compose up -d --build --wait
```

### Permanently reset all local data

The following command deletes the database and uploaded-document volumes. Use
it only when a complete reset is intended:

```powershell
docker compose down -v
```

## First account and administrator setup

1. Open http://localhost:5173/login.
2. Select **Create an account** and register normally.
3. To grant that user administrator access, open MongoDB's shell:

```powershell
docker compose exec db mongosh toursecure
```

At the MongoDB prompt, run:

```javascript
db.users.updateOne(
  { email: "your-email@example.com" },
  { $set: { role: "admin" } }
)
```

Then type `exit` and sign in again so the new role is included in the session.

## Verify the installation

Check container health:

```powershell
docker compose ps
```

The six long-running services should show `Up` and `healthy`. The `seed`
service is a one-time job and should show `Exited (0)` under:

```powershell
docker compose ps -a
```

Useful checks:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
Invoke-RestMethod "http://localhost:8080/api/recommendations/nearby?location=Jaipur&categories=historic,food"
Invoke-RestMethod http://localhost:8051/health
Invoke-RestMethod http://localhost:8052/health
```

On macOS/Linux, the equivalent health check is:

```bash
curl http://localhost:8080/api/health
```

## Functional checklist

After registering or signing in, verify:

- **Digital ID:** open Digital ID, create an ID, refresh its QR, and revisit the
  page after a browser refresh.
- **Reviews:** submit a review for a new or existing place, refresh the page,
  and confirm the previous review remains visible.
- **Explore:** load nearby recommendations and generate a two-day Jaipur plan.
- **Itinerary:** save the plan, refresh the page, and confirm it persists.
- **Assistant:** try `Recommend historic places near me` and
  `Plan 2 days in Gangtok`.
- **Heatmap:** search for Shillong and enable `Debug: Points & Scores`.
- **Safety Center:** add an emergency contact, start and complete a check-in,
  and create a test SOS alert.
- **Admin:** confirm `/admin` shows alerts and e-FIR records for an account whose
  MongoDB role is `admin`.

## Logs and troubleshooting

Show all service logs:

```powershell
docker compose logs -f
```

Show one service:

```powershell
docker compose logs -f backend
docker compose logs -f blockchain
```

If a port is already in use on Windows:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,8080,8051,8052,8545 |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

Identify the process before stopping it. For Docker containers, use:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}"
docker stop <conflicting-container-name>
```

Do not run a second MongoDB container for this project. The Compose MongoDB is
the authoritative database and intentionally is not published to a host port,
which avoids collisions and accidental use of the wrong database.

If images or configuration changed:

```powershell
docker compose up -d --build --force-recreate --wait
```

## Development checks

Docker is the runtime workflow, but local Node.js can be used for checks:

```powershell
cd backend
npm install
npm test
npm run build

cd ../frontend
npm install
npm run build
```

The root `package.json` is not used to run the application.

## Main features

- Cookie-based registration, login, and user/admin authorization
- Persistent reviews and safety-score heatmap
- GPS-aware recommendations and multi-day trip planning
- Saved itineraries and e-FIR reports
- Digital Trip ID with time-limited QR codes and persistent document uploads
- Emergency contacts, SOS live tracking, and safe check-in timers
- AI assistant with offline fallback and optional Anthropic integration
- GeoJSON risk zones and route anomaly detection
- Local Hardhat blockchain with the `TouristID` contract

## Production notes

The repository also supports Vercel for the React frontend and Express API.
Production requires MongoDB Atlas and strong secrets. The local Hardhat chain
and Python services are not hosted by Vercel and must be deployed separately if
they are required in production.

Required production variables include:

- `MONGO_URL`
- `JWT_SECRET`
- `ANTHROPIC_API_KEY` (optional)
- `ALERT_WEBHOOK_URL` (optional)
- `CRON_SECRET` (optional)

Never use the bundled Hardhat development private key or local JWT default in a
public or production deployment.
