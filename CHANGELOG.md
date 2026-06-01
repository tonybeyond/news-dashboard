# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-06-01

### Added
- Live SSE push of GDELT snapshots to the browser (`/api/stream`).
- `LiveHub` subscription registry with hello/delta/ping message types.
- `GdeltPoller` that tails `lastupdate.txt` and downloads new exports.
- TS client with in-place marker updates, animated flash for new rows,
  and a live health dot in the header.
- Robust geo-block parser: handles the 2026 schema with up to three
  trailing geo blocks (Actor1, Actor2, Action).
- Multi-stage Alpine Dockerfile (non-root runtime, healthcheck).
- `docker-compose.yml` mapping host `:22332` → container `:8000`.
- Country, subject (CAMEO root), and free-text filters in the client.
- Geocoder-failure fallback: when GDELT returns `lat=0` (a signature of
  its geocoder falling back to the equator), substitute the country's
  centroid so events appear in the right hemisphere.

### Changed
- Parser ported from Python (`build_dashboard.py`) to TypeScript.
- Replaces the static `dashboard.html` build with a real-time pipeline.

### Removed
- `build_dashboard.py` and the old `dashboard.html` static artifact.
- One-off CSV fixtures and `__pycache__` (no longer relevant).

## [0.1.0] — 2026-05-31

- Initial Python build: `build_dashboard.py` rendered a static Leaflet
  dashboard from the latest GDELT 15-minute export.
