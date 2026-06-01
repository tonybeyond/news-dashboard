# Security

## Reporting a vulnerability

Email security issues to the address in the repository's GitHub
profile, or open a private advisory at
https://github.com/tonybeyond/news-dashboard/security/advisories/new.

Please do **not** file public issues for security bugs.

## Supported versions

Only the latest minor release receives security updates. Older
versions are best-effort.

## Threat model

This dashboard is read-only: it fetches a public data feed and renders
it. There is no authentication, no user input, no persistence.

The server is **not** designed to be exposed directly to the public
internet. Put it behind a reverse proxy (nginx, Traefik) and apply
standard hardening (rate limits, IP allowlists if appropriate).

## Known limitations

- The `text/event-stream` endpoint is unauthenticated. Anyone who can
  reach the server can subscribe to updates.
- The server fetches GDELT zip files from a public HTTP endpoint
  (`http://data.gdeltproject.org`). The response is parsed but not
  executed; the worst case is a malformed row being rejected by the
  parser.
- The container runs as the unprivileged `node` user (UID 1000) and
  does not require any elevated capabilities.
