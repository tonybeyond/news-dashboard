# Architecture

This document describes how the pieces fit together. For usage
instructions, see [README.md](../README.md). For the wire format, see
[api.md](api.md).

## High-level data flow

```
                                    ┌──────────────────────┐
                                    │   GDELT 2.0 bulk     │
                                    │   data.gdeltproject  │
                                    │   (15-min snapshots) │
                                    └──────────┬───────────┘
                                               │ HTTP, every ~60s
                                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Fastify server (Node 20)                                    │
│                                                              │
│  ┌──────────────┐   new snapshot   ┌──────────────────┐       │
│  │ GdeltPoller  │ ───────────────▶ │  LiveHub         │       │
│  │ (lastupdate  │                  │  (sub registry,  │       │
│  │  + zip + zip)│                  │   current snap)  │       │
│  └──────────────┘                  └────────┬─────────┘       │
│                                             │                 │
│  ┌──────────┐  GET /api/snapshot            │                 │
│  │ REST     │ ◀─────────────────────────────┤                 │
│  │ handler  │                               │                 │
│  └──────────┘                               │                 │
│  ┌──────────┐  GET /api/stream (SSE)        │                 │
│  │ SSE      │ ◀─────────────────────────────┤                 │
│  │ handler  │  emits: hello / delta / ping  │                 │
│  └──────────┘                               │                 │
│  ┌──────────┐  GET /                        │                 │
│  │ static   │ ◀─────────────────────────────┘                 │
│  │ (Leaflet │                                                   │
│  │  client) │                                                   │
│  └──────────┘                                                   │
└──────────────────────────────────────────────────────────────┘
                       │
                       │  text/event-stream
                       ▼
            ┌────────────────────────┐
            │  Browser (vanilla TS)  │
            │  • EventSource         │
            │  • Leaflet map         │
            │  • Event feed          │
            │  • Filter sliders      │
            └────────────────────────┘
```

## Components

### `GdeltPoller` (`src/server/poller.ts`)

The single source of truth for "what does the world look like right now".

- **Cadence:** every 60s, checks `lastupdate.txt`.
- **Trigger:** only when the snapshot id changes.
- **Pipeline per tick:**
  1. Resolve the latest export URL from `lastupdate.txt`.
  2. If the id is new, download the zip.
  3. Parse with the in-house GDELT 2.0 row parser.
  4. Apply the conflict/material filter and sort.
  5. Emit a `snapshot` event with the conflict-filtered set.
- **Failure handling:** failures are logged and swallowed; the next
  tick retries. Inflight ticks are guarded by a flag so a slow fetch
  doesn't overlap with the next poll.

### `LiveHub` (`src/server/hub.ts`)

Tiny in-process pub/sub. Holds the current snapshot in memory, and on
each new snapshot broadcasts a `delta` message to all subscribers.
Subscribers receive the current snapshot on connect (so a client
opening the dashboard after the server has been running for an hour
sees the latest data immediately).

### SSE handler (`src/server/index.ts` → `app.get("/api/stream")`)

- Writes `text/event-stream` headers with `X-Accel-Buffering: no` so
  reverse proxies (nginx, Traefik) don't buffer the response.
- Sends an initial `:ok` comment to flush the headers.
- Subscribes the connection to the hub.
- Sends a `ping` every 25s to keep the connection alive through
  proxies.
- On socket close: unsubscribes and stops the heartbeat.

### Parser (`src/server/parser.ts`)

GDELT 2.0 row layout (2026 schema, 61 columns):

```
[1..N]  Standard prefix
[37..43]   Actor1Geo   (Type, FullName, CC, ADM1, ADM2, Lat, Lon, FID)
[45..51]   Actor2Geo   (Type, FullName, CC, ADM1, ADM2, Lat, Lon, FID)
[53..59]   ActionGeo   (Type, FullName, CC, ADM1, ADM2, Lat, Lon, FID)
[60]       DATEADDED
[61]       SOURCEURL
```

The schema varies: some snapshots have 7 trailing fields (no FID), some
have 8, some include intermediate numeric fields between blocks. The
parser walks backwards from the URL looking for a valid `(lat, lon)`
pair, then verifies the candidate by checking the fields 4 and 3
positions back look like a real place name and a 2-letter country code.

### Client (`src/client/app.ts`)

A no-framework browser app:

- Opens an `EventSource` to `/api/stream`.
- Falls back to a one-shot `fetch('/api/snapshot')` if the SSE
  connection can't be established.
- Maintains a `Map<id, GdeltEvent>` in memory and a `Map<id, Marker>` on
  the Leaflet map. On each `delta`, the client **replaces** the
  current dataset (GDELT exports are full snapshots, not deltas) and
  animates any new event ids with a brief green flash.
- Filter sliders reshape the map and feed in place — no server
  round-trip.

## Why this design?

- **SSE, not WebSockets:** GDELT is unidirectional. SSE has built-in
  reconnection, works over plain HTTP, and avoids the complexity of a
  WebSocket server.
- **Replace, not append:** A `delta` carries the full current
  snapshot, not the rows that changed. This keeps the wire format
  simple and means the client never has to reconcile partial state.
- **No database:** Snapshots live in memory. A restart loses the
  in-memory state, but the next poll (≤ 60s) repopulates it.
- **In-place marker updates:** We mutate Leaflet markers in place
  rather than re-creating them. This avoids the flash-of-empty-map
  effect on each new snapshot.
