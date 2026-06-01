# Troubleshooting

Common failure modes and how to recover.

## Container keeps restarting

```sh
docker logs gdelt-dashboard --tail 50
```

- **`ECONNREFUSED` to `data.gdeltproject.org`** — the host has no
  outbound HTTP to GDELT. Check firewall / NAT rules. The container
  will keep retrying every 60s.
- **`EAI_AGAIN` (DNS failure)** — the container can't resolve
  `data.gdeltproject.org`. The `node:20-alpine` image uses the host's
  DNS; check `/etc/resolv.conf` on the host.

## Dashboard loads but no events appear

The header pulse should be **green** (live). If it's red or stuck on
"connecting…":

1. Open browser devtools → Network → `/api/stream`. If the request is
   pending without `data:` lines, the SSE connection isn't working.
2. Behind nginx? Make sure `proxy_buffering off;` is set.
3. Behind Cloudflare? Free tier buffers SSE responses; upgrade to a
   paid plan or use a different path.

If the live dot is green but the map is empty, GDELT's
`lastupdate.txt` may be unreachable from the host. Check the server
logs for `[gdelt] tick failed: …`.

## `npm run build` fails with TypeScript errors

The codebase uses `noUncheckedIndexedAccess: true`. If you see
"possibly undefined" errors, that's the strict mode catching real
bugs — handle the undefined case rather than `!`-asserting.

## `npm install` fails on a fresh checkout

Make sure you're on Node 20+ (`node --version`). Earlier versions
lack `AbortSignal.timeout`.

## Port 22332 is already in use

```sh
ss -tlnp 'sport = :22332'    # who has it?
```

Edit `docker-compose.yml` to a different host port. The container port
stays at 8000 — don't change that.

## Healthcheck fails but the server is up

The healthcheck uses `wget` (from the Alpine base image). If you've
stripped that for size savings, re-add it or change the
`HEALTHCHECK` directive to use `node` instead.

## I want to keep snapshots on disk

Uncomment the `volumes` section in `docker-compose.yml` to mount
`./data` into `/app/data`. Then in `src/server/index.ts` add a
`fs.writeFile` after each `poller.on("snapshot", ...)` to persist the
last received payload to `/app/data/last.json`. (Not implemented by
default — the in-memory model is the source of truth.)
