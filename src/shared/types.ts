// Wire-format types shared between server and client. Keep this file
// dependency-free so the client can import it without pulling server deps.

export type QuadClass = 1 | 2 | 3 | 4;

export interface GdeltEvent {
  id: string;
  date: string;          // YYYY-MM-DD
  added: string;         // YYYYMMDDHHMMSS
  actor1: string;
  actor1cc: string;
  actor2: string;
  actor2cc: string;
  event_code: string;
  event_base: string;
  event_root: string;
  event_label: string;
  quad: QuadClass;
  quad_label: string;
  goldstein: number;
  tone: number;
  mentions: number;
  sources: number;
  articles: number;
  lat: number;
  lon: number;
  place: string;
  country: string;
  url: string;
}

export interface SnapshotMeta {
  snapshot: string;      // YYYYMMDDHHMMSS
  built: string;         // ISO timestamp
  total: number;
  conflict: number;
  countries: number;
  avg_tone: string;
  source: string;
}

// SSE message envelope. The `type` field tells the client how to interpret
// the payload; this keeps the wire format extensible without versioning.
export type LiveMessage =
  | { type: "hello"; meta: SnapshotMeta }
  | { type: "delta"; events: GdeltEvent[]; meta: SnapshotMeta }
  | { type: "ping"; ts: number };
