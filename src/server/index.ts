// Fastify server: serves the static client, exposes REST snapshot + a SSE
// stream of live updates, and runs the GDELT poller in the background.

import Fastify from "fastify";
import cors from "@fastify/cors";
import staticPlugin from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { LiveHub, Subscriber } from "./hub.js";
import { GdeltPoller } from "./poller.js";
import { LiveMessage } from "../shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../public");
const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "0.0.0.0";

const hub = new LiveHub();
const poller = new GdeltPoller();

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  // SSE-friendly: disable request timeout for the stream route.
  forceCloseConnections: false,
});

await app.register(cors, { origin: true });
await app.register(staticPlugin, {
  root: PUBLIC_DIR,
  prefix: "/",
  index: "index.html",
});

app.get("/api/health", async () => ({ ok: true, subs: hub.size() }));

app.get("/api/snapshot", async () => {
  const cur = hub.getCurrent();
  if (!cur) return { meta: null, events: [] };
  return { meta: cur.meta, events: cur.events };
});

app.get("/api/stream", async (req, reply) => {
  // Server-Sent Events. We hand the raw socket to a Subscriber; Fastify's
  // reply.raw gives us the Node HTTP ServerResponse.
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",  // disable buffering on nginx-style proxies
  });
  reply.raw.write(":ok\n\n");   // initial comment to flush headers

  const id = Date.now() + Math.floor(Math.random() * 1000);
  const emitter = new (await import("node:events")).EventEmitter();
  const sub: Subscriber = {
    id,
    emitter,
    send: (msg: LiveMessage) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(msg)}\n\n`);
      } catch {
        // socket already closed
      }
    },
    close: () => {
      try { reply.raw.end(); } catch { /* already closed */ }
    },
  };
  hub.subscribe(sub);

  // Heartbeat — keep the connection alive through proxies, plus gives the
  // client a signal that the stream is healthy.
  const ping = setInterval(() => {
    try {
      reply.raw.write(`data: ${JSON.stringify({ type: "ping", ts: Date.now() })}\n\n`);
    } catch {
      // ignore
    }
  }, 25_000);

  const onClose = (): void => {
    clearInterval(ping);
    hub.unsubscribe(id);
    req.raw.off("close", onClose);
  };
  req.raw.on("close", onClose);
});

poller.on("snapshot", (s) => {
  hub.setCurrent(s.meta, s.events);
  app.log.info(
    { snapshot: s.meta.snapshot, events: s.events.length, subs: hub.size() },
    "snapshot ready",
  );
});

await app.listen({ port: PORT, host: HOST });
app.log.info(`listening on http://${HOST}:${PORT}`);
poller.start();

// Graceful shutdown.
const stop = async (): Promise<void> => {
  app.log.info("shutting down…");
  poller.stop();
  await app.close();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
