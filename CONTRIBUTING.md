# Contributing

Thanks for your interest in improving the GDELT Live Dashboard. This is a
small project, so the bar to merging is low — fix the bug, open a PR,
and we'll talk.

## Development setup

```sh
npm install
npm run build      # tsc + copy-client-assets
npm start          # node dist/server/index.js
# → http://localhost:8000
```

The dev cycle:

1. `npm run build:server` after server-side changes (`src/server/`, `src/shared/`)
2. `npm run build:client` after client-side changes (`src/client/`)
3. Restart the server (no live reload on purpose — keeps the surface small)

## Project layout

```
src/server/   Fastify, GDELT poller, SSE hub
src/client/   Browser app (no framework — vanilla TS + Leaflet)
src/shared/   Wire types shared by both
public/       Built static assets (index.html, app.js, styles.css)
scripts/      Build helpers
docs/         Long-form documentation
```

## Code style

- **TypeScript strict mode is on.** Treat compiler errors as bugs.
- **No new dependencies without a reason.** If you need a 200KB package
  to replace 20 lines of code, write the 20 lines.
- **Comments explain why, not what.** A reader can see the `if`; they
  can't see the schema-drift bug it works around.
- **No `any`.** Use `unknown` and narrow, or update the shared types in
  `src/shared/types.ts`.

## Testing

There is no test suite yet. Parser logic is the prime candidate — if you
add tests, put them in `src/server/parser.test.ts` and use `node --test`
so we don't take on a test runner as a dep.

## Commit messages

Short, imperative mood, no scope prefix required:

```
fix parser for 3-block geo schema
add reconnect button to client
```

## Pull requests

- One logical change per PR.
- Build cleanly (`npm run build`) before requesting review.
- If you change the wire format (anything in `src/shared/`), call it out
  in the PR description — it's a cross-cutting concern.
