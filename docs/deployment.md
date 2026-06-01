# Deployment

This project is designed to run as a single container, published on
host port **22332**. Two paths: Docker Compose (recommended) and a
direct `docker run`.

## Docker Compose

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f
```

The compose file is opinionated:

- Maps host `:22332` → container `:8000`
- Restart policy `unless-stopped`
- Healthcheck on `/api/health`
- No volumes — the container is fully self-contained
- Runs as the unprivileged `node` user (UID 1000)

To pull a freshly-built image: `docker compose pull && docker compose
up -d`. To tear down: `docker compose down`.

## Komodo

This is the canonical deployment target.

1. In Komodo, create a new **Stack** (or **Compose**) resource.
2. Point it at this repo (`tonybeyond/news-dashboard`).
3. Komodo will run `docker compose up -d --build` on the host.
4. The stack is published on the host's port 22332.
5. Komodo reads the healthcheck from the compose file and reflects
   container health in the UI.

To update after a `git push`:

- Komodo's "Pull and redeploy" action will rebuild and restart the
  container in place.

## Reverse proxy (optional)

If you front the dashboard with nginx or Traefik, the only thing that
matters is that the reverse proxy does **not buffer SSE responses**.
The container already sets `X-Accel-Buffering: no` so nginx leaves the
stream alone by default. Traefik is similarly well-behaved.

For nginx, the relevant `location` block:

```nginx
location / {
    proxy_pass http://127.0.0.1:22332;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
}
```

## Environment variables

| Variable    | Default   | Notes                              |
|-------------|-----------|------------------------------------|
| `PORT`      | 8000      | Container port                     |
| `HOST`      | 0.0.0.0   | Bind address                       |
| `LOG_LEVEL` | info      | Pino log level (trace/debug/info/warn/error/fatal) |
| `TZ`        | (unset)   | Set to `UTC` for UTC timestamps    |

Pass them in `docker-compose.yml` or via an `.env` file alongside it.

## Resource use

The container is small. Typical idle footprint (no SSE clients):

- Memory: ~80 MB RSS
- CPU: < 1% (peaks during the 1-3s GDELT fetch every ~15 min)
- Disk: ~150 MB image, no persistent volumes

## Logs

Pino JSON logs to stdout. Pipe through `jq` for readability:

```sh
docker logs -f gdelt-dashboard 2>&1 | jq
```

Sample log line:

```json
{"level":30,"time":1748779500000,"pid":1,"hostname":"...","snapshot":"20260601094500","events":286,"subs":2,"msg":"snapshot ready"}
```

## Updating

```sh
git pull
docker compose up -d --build
```

Or in Komodo, click "Pull and redeploy".
