// Polls GDELT's lastupdate.txt, fetches the latest export zip, parses it,
// and emits 'snapshot' events when fresh data arrives. Designed to be the
// single source of truth in the server.

import { request } from "undici";
import { parseExport, filterConflict, summarize } from "./parser.js";
import { GdeltEvent, SnapshotMeta } from "../shared/types.js";
import { EventEmitter } from "node:events";

const LASTUPDATE = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const POLL_INTERVAL_MS = 60_000;       // check lastupdate every 60s
const FETCH_TIMEOUT_MS = 60_000;
const LASTUPDATE_TIMEOUT_MS = 30_000;

export interface Snapshot {
  meta: SnapshotMeta;
  events: GdeltEvent[];                 // conflict-filtered
  receivedAt: number;                   // epoch ms
}

interface RawEmit {
  meta: SnapshotMeta;
  events: GdeltEvent[];                 // conflict-filtered
  full: GdeltEvent[];                   // all parsed events (for stats)
}

export class GdeltPoller extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private inflight = false;
  private lastSnapshotId: string | null = null;
  private current: Snapshot | null = null;

  start(): void {
    if (this.timer) return;
    // Kick off immediately, then on the interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  getCurrent(): Snapshot | null {
    return this.current;
  }

  private async tick(): Promise<void> {
    if (this.inflight) return;
    this.inflight = true;
    try {
      const exportUrl = await this.resolveExportUrl();
      if (!exportUrl) return;
      const snapshotId = exportUrl.split("/").pop()?.replace(".export.CSV.zip", "") ?? "";
      if (snapshotId && snapshotId === this.lastSnapshotId) {
        // No new snapshot; nothing to do.
        return;
      }
      console.log(`[gdelt] new snapshot: ${snapshotId} — fetching…`);
      const zbytes = await this.downloadZip(exportUrl);
      const text = await unzipToText(zbytes);
      const all = parseExport(text);
      const conflict = filterConflict(all);
      const stats = summarize(all);
      const meta: SnapshotMeta = {
        snapshot: snapshotId,
        built: new Date().toISOString().replace("T", " ").replace(/\..*$/, " UTC"),
        total: stats.total,
        conflict: stats.conflict,
        countries: stats.countries,
        avg_tone: stats.avg_tone,
        source: exportUrl,
      };
      this.lastSnapshotId = snapshotId;
      this.current = { meta, events: conflict, receivedAt: Date.now() };
      const emit: RawEmit = { meta, events: conflict, full: all };
      this.emit("snapshot", emit);
    } catch (err) {
      console.error(`[gdelt] tick failed: ${(err as Error).message}`);
    } finally {
      this.inflight = false;
    }
  }

  private async resolveExportUrl(): Promise<string | null> {
    const res = await request(LASTUPDATE, {
      method: "GET",
      headers: { "User-Agent": "gdelt-live-dashboard/0.2" },
      signal: AbortSignal.timeout(LASTUPDATE_TIMEOUT_MS),
    });
    if (res.statusCode !== 200) {
      res.body.dump();
      return null;
    }
    const text = (await res.body.text()).trim();
    for (const line of text.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3 && (parts[2] ?? "").includes(".export.CSV.zip")) {
        return parts[2]!;
      }
    }
    return null;
  }

  private async downloadZip(url: string): Promise<Buffer> {
    const res = await request(url, {
      method: "GET",
      headers: { "User-Agent": "gdelt-live-dashboard/0.2" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.statusCode !== 200) {
      res.body.dump();
      throw new Error(`download failed: HTTP ${res.statusCode}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of res.body) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }
}

async function unzipToText(zip: Buffer): Promise<string> {
  // GDELT exports use deflate compression (zip method 8). We use fflate to
  // decode the first entry's data — the export zip always contains exactly
  // one .CSV file.
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(zip));
  const names = Object.keys(files);
  if (names.length === 0) throw new Error("empty zip");
  return strFromU8(files[names[0]!]!);
}
