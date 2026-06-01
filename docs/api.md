# API Reference

All HTTP endpoints exposed by the server. The server is plain HTTP — no
auth, no rate limiting. Don't expose it to the public internet without a
reverse proxy.

## `GET /api/health`

Liveness probe used by the Docker healthcheck and external monitoring.

**Response 200:**
```json
{ "ok": true, "subs": 3 }
```

`subs` is the count of currently-connected SSE subscribers.

---

## `GET /api/snapshot`

Returns the most recent GDELT snapshot the server has parsed. Useful as
a one-shot fetch for clients that can't use SSE.

**Response 200:**
```json
{
  "meta": {
    "snapshot": "20260601094500",
    "built": "2026-06-01 09:40 UTC",
    "total": 958,
    "conflict": 286,
    "countries": 59,
    "avg_tone": "-1.26",
    "source": "http://data.gdeltproject.org/gdeltv2/20260601094500.export.CSV.zip"
  },
  "events": [
    {
      "id": "1306858733",
      "date": "2026-06-01",
      "added": "20260601094500",
      "actor1": "JERUSALEM",
      "actor1cc": "ISR",
      "actor2": "LEBANESE",
      "actor2cc": "LBN",
      "event_code": "195",
      "event_base": "195",
      "event_root": "19",
      "event_label": "FIGHT",
      "quad": 4,
      "quad_label": "Material",
      "goldstein": -10,
      "tone": -8.6,
      "mentions": 34,
      "sources": 2,
      "articles": 18,
      "lat": 33.8719,
      "lon": 35.5097,
      "place": "Beirut, Beyrouth, Lebanon",
      "country": "LE",
      "url": "https://www.channelnewsasia.com/..."
    }
  ]
}
```

If the server has not yet parsed a snapshot, the response is
`{ "meta": null, "events": [] }`.

---

## `GET /api/stream` — Server-Sent Events

Persistent connection that pushes deltas as new GDELT snapshots are
parsed.

**Response headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

**Wire format:** each event's `data:` line is a JSON object with a
`type` discriminator:

### `hello` — sent on connect when no snapshot is available yet
```json
{
  "type": "hello",
  "meta": { "snapshot": "—", "built": "—", "total": 0, "conflict": 0, "countries": 0, "avg_tone": "+0.00", "source": "" }
}
```

### `delta` — new snapshot ready (or sent on connect if one exists)
```json
{
  "type": "delta",
  "events": [ /* same shape as /api/snapshot events */ ],
  "meta": { /* same shape as /api/snapshot meta */ }
}
```

### `ping` — heartbeat every 25s
```json
{ "type": "ping", "ts": 1748779500000 }
```

### Example with `curl`
```sh
curl -N http://localhost:22332/api/stream

:ok

data: {"type":"hello","meta":{...}}

data: {"type":"delta","events":[...],"meta":{...}}

data: {"type":"ping","ts":1748779500000}
```

---

## `GET /` — Static dashboard

Returns the bundled HTML/CSS/JS client. Supports range requests.

---

## Error responses

| Status | When                                       |
|--------|--------------------------------------------|
| 200    | Normal                                     |
| 404    | Unknown path                               |
| 500    | Unhandled server error (see logs)          |

The SSE endpoint does not return error status codes after the headers
are sent. A broken connection shows up to the client as an `error`
event on the `EventSource`.
