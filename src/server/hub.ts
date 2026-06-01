// Server-Sent Events hub. Holds the current snapshot and broadcasts deltas
// to all connected clients. Simple EventEmitter per subscriber.

import { EventEmitter } from "node:events";
import { GdeltEvent, LiveMessage, SnapshotMeta } from "../shared/types.js";

export interface Subscriber {
  id: number;
  emitter: EventEmitter;
  send: (msg: LiveMessage) => void;
  close: () => void;
}

export class LiveHub {
  private current: { meta: SnapshotMeta; events: GdeltEvent[] } | null = null;
  private nextId = 1;
  private subs = new Map<number, Subscriber>();

  setCurrent(meta: SnapshotMeta, events: GdeltEvent[]): void {
    this.current = { meta, events };
    const msg: LiveMessage = { type: "delta", events, meta };
    for (const sub of this.subs.values()) sub.send(msg);
  }

  getCurrent(): { meta: SnapshotMeta; events: GdeltEvent[] } | null {
    return this.current;
  }

  subscribe(sub: Subscriber): void {
    this.subs.set(sub.id, sub);
    // Send hello immediately with the current snapshot so late joiners catch up.
    if (this.current) {
      sub.send({ type: "delta", events: this.current.events, meta: this.current.meta });
    } else {
      sub.send({ type: "hello", meta: blankMeta() });
    }
  }

  unsubscribe(id: number): void {
    this.subs.delete(id);
  }

  size(): number {
    return this.subs.size;
  }
}

function blankMeta(): SnapshotMeta {
  return {
    snapshot: "—",
    built: "—",
    total: 0,
    conflict: 0,
    countries: 0,
    avg_tone: "+0.00",
    source: "",
  };
}
