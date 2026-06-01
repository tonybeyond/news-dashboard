# GDELT Geopolitical Dashboard · Live

A live, auto-updating world map of GDELT 2.0 conflict / material-conflict
events. Replaces the previous static HTML generator (`build_dashboard.py`)
with a TypeScript pipeline: a Fastify server tails GDELT every 60 seconds
and pushes fresh snapshots to the browser over Server-Sent Events, while a
no-framework Leaflet client renders the world map and event feed.

Designed to run as a single container in a Komodo deployment.

## Features

- **Truly live** — server polls GDELT's 15-minute snapshots and pushes
  deltas to the browser over SSE. The header pulse indicator reflects
  connection health.
- **Conflict-focused** — filters to quad-class 3 (Conflict) and 4
  (Material conflict) with Goldstein scale ≤ -3.
- **Client-side filtering** — intensity and minimum-mentions sliders
  reshape the map and feed instantly without a server round-trip.
- **No external keys** — talks to GDELT's public bulk feed directly.
- **Self-contained image** — multi-stage Alpine build, runs as non-root,
  exposes a single port.

## Endpoints

| Path            | Purpose                                          |
|-----------------|--------------------------------------------------|
| `/`             | Static dashboard (Leaflet UI)                    |
| `/api/health`   | `{"ok":true,"subs":N}`                           |
| `/api/snapshot` | JSON: current `{ meta, events }`                 |
| `/api/stream`   | SSE: `hello`, `delta`, `ping` messages           |

## Run locally with Docker

```sh
docker compose up -d --build
curl -s http://localhost:22332/api/health
# → {"ok":true,"subs":0}
```

Then open `http://<host>:22332/`.

## Run locally without Docker (dev mode)

```sh
npm install
npm run build
npm start
# → listening on http://0.0.0.0:8000
```

## Deploy to Komodo

This repo is set up for a `docker-compose` deployment. In Komodo, create
a new Stack or Compose resource and point it at this repository. Komodo
will run `docker compose up -d --build` on the host. The dashboard is
published on host port **22332**.

The container's healthcheck hits `/api/health` every 30s; Komodo will
mark the stack unhealthy if the server stops responding.

## Configuration

All settings are environment variables (see `.env.example`):

| Variable        | Default | Notes                                  |
|-----------------|---------|----------------------------------------|
| `PORT`          | 8000    | Container port (mapped to 22332)       |
| `HOST`          | 0.0.0.0 | Bind address                           |
| `LOG_LEVEL`     | info    | Pino log level                         |
| `TZ`            | (unset) | Set to `UTC` for UTC timestamps        |

## Architecture

```
GDELT  ┐
       │  HTTP (undici)
       ▼
┌────────────────────────────┐    SSE     ┌─────────────────────────┐
│ Fastify server (Node 20)   │ ◀─────────▶│  Leaflet client (TS)    │
│  • GdeltPoller (60s tick)  │            │  • EventSource stream   │
│  • LiveHub (sub registry)  │   JSON     │  • In-place marker map  │
│  • Static + REST + SSE     │ ◀─────────▶│  • Feed (DOM diff)      │
└────────────────────────────┘            └─────────────────────────┘
```

### Why SSE, not WebSockets?

GDELT is unidirectional (server → client) and the update cadence is
~15 minutes. SSE has built-in reconnection, works over plain HTTP, and
avoids the extra complexity of a WebSocket server. Polling via REST
remains available at `/api/snapshot` for clients that need it.

## Layout

```
dashboard/
├── src/
│   ├── server/         # Fastify, GDELT poller, SSE hub
│   ├── client/         # Browser app (no framework)
│   └── shared/         # Wire types shared by both
├── public/             # Compiled static assets (index.html, app.js, css)
├── scripts/            # Build helpers
├── Dockerfile          # Multi-stage runtime image
├── docker-compose.yml  # Komodo / production deployment
└── package.json
```

## Development

```sh
npm install
npm run build:server   # → dist/server/
npm run build:client   # → public/app.js (auto-copied)
npm start              # node dist/server/index.js
```

Clean rebuild: `rm -rf dist public/app.js public/shared && npm run build`.

## Credits

- Data: [GDELT 2.0](http://data.gdeltproject.org/gdeltv2/) (15-min
  English export).
- Map tiles: [CARTO dark](https://carto.com/basemaps) + OpenStreetMap.
- Original Python implementation: `build_dashboard.py` (now retired).
