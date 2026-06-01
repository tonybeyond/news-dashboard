// GDELT 2.0 export parser. Port of build_dashboard.py: same column semantics,
// same geo block discovery (scan backwards from DATEADDED/SOURCEURL for a valid
// lat/lon pair inside a 9-field ActionGeo block). Pure, no I/O.

import { GdeltEvent, QuadClass } from "../shared/types.js";

// Subset of CAMEO root codes — same subset the Python build used, focused on
// the conflict/protest side. The dashboard surfaces anything with quad in
// (3, 4) and goldstein <= threshold, regardless of root.
const CAMEO_ROOT: Record<string, string> = {
  "01": "MAKE PUBLIC STATEMENT",
  "02": "APPEAL",
  "03": "EXPRESS INTENT TO COOPERATE",
  "04": "CONSULT",
  "05": "ENGAGE IN DIPLOMATIC COOPERATION",
  "06": "ENGAGE IN MATERIAL COOPERATION",
  "07": "PROVIDE AID",
  "08": "YIELD",
  "09": "INVESTIGATE",
  "10": "DEMAND",
  "11": "DISAPPROVE",
  "12": "REJECT",
  "13": "THREATEN",
  "14": "PROTEST",
  "15": "EXHIBIT FORCE POSTURE",
  "16": "REDUCE RELATIONS",
  "17": "COERCE",
  "18": "ASSAULT",
  "19": "FIGHT",
  "20": "USE UNCONVENTIONAL MASS VIOLENCE",
};

const QUAD: Record<number, string> = {
  1: "Verbal",
  2: "Cooperation",
  3: "Conflict",
  4: "Material",
};

export const CONFLICT_THRESHOLD = -3.0;

interface ActionGeo {
  lat: number;
  lon: number;
  place: string;
  country: string;
  url: string;
}

function findActionGeo(parts: string[], preferredCC?: string): ActionGeo | null {
  // GDELT rows can have up to three trailing geo blocks: Actor1Geo,
  // Actor2Geo, and ActionGeo. Each block has the shape:
  //   Type, FullName, CountryCode, ADM1Code, ADM2Code, Lat, Lon[, FeatureID]
  // with Lat at offset 5 from the block start and the last block ending
  // right before DATEADDED + SOURCEURL.
  //
  // Strategy:
  //   1. If a preferred country code is given, scan each candidate block
  //      and return the first one whose country code matches. This corrects
  //      for GDELT geocoder quirks where the ActionGeo resolves to the
  //      wrong country.
  //   2. Otherwise, return the LAST valid block (the actual ActionGeo).
  const url = parts[parts.length - 1] ?? "";

  // Each block is 7 or 8 fields wide. We try a small range of block widths
  // to handle both schemas. For each (start) position we look back from
  // before DATEADDED to find the lat/lon pair.
  const blocks = extractGeoBlocks(parts);
  if (blocks.length === 0) return null;

  if (preferredCC) {
    const want = preferredCC.toUpperCase();
    const match = blocks.find((b) => b.country.toUpperCase() === want);
    if (match) return { ...match, url };
  }
  return { ...blocks[blocks.length - 1]!, url };
}

interface GeoBlock {
  lat: number;
  lon: number;
  place: string;
  country: string;
}

function extractGeoBlocks(parts: string[]): GeoBlock[] {
  // Walk backwards from the end of the row. Each block ends with
  // [Lat, Lon, ...] and starts with a Type field. The Type field is
  // either a 1-2 digit code (numeric geo type) or a 2-letter abbreviation
  // for some FeatureID values. We try block widths of 7 and 8 fields.
  const out: GeoBlock[] = [];
  const seen = new Set<string>();    // dedupe by "lat,lon" in case of duplicates

  for (let i = 3; i < Math.min(parts.length, 14); i++) {
    const idx = -1 - i;            // candidate lat position (negative index)
    const latRaw = parts.at(idx);
    if (latRaw === undefined) continue;
    const lat = Number(latRaw);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) continue;
    const lonRaw = parts.at(idx + 1);
    if (lonRaw === undefined) continue;
    const lon = Number(lonRaw);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) continue;

    // For each candidate lat, the block's FullName sits 4 fields back and
    // the CountryCode 3 fields back. We try a small range of "back" values
    // (4..10) to handle schema drift.
    for (let back = 4; back <= 10; back++) {
      const typeRaw = parts.at(idx - back);
      const fullname = parts.at(idx - back + 1);
      const cc = parts.at(idx - back + 2);
      if (typeRaw === undefined || fullname === undefined) continue;
      if (!/^\d{1,2}$/.test(typeRaw)) continue;        // type must be 1..99 numeric
      if (fullname.length < 3) continue;
      if (!/[A-Za-z]/.test(fullname)) continue;
      if (fullname === fullname.toUpperCase()) continue;
      if (fullname.toLowerCase() === "the") continue;
      const country = (cc && cc.length === 2 && /^[A-Za-z]+$/.test(cc)) ? cc.toUpperCase() : "";
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lat, lon, place: fullname, country });
      break;        // found a valid block at this lat position; move on
    }
  }
  return out;
}

function num(s: string | undefined, fallback: number): number {
  if (s === undefined || s === "") return fallback;
  const v = Number(s);
  return Number.isFinite(v) ? v : fallback;
}

function int(s: string | undefined, fallback: number): number {
  if (s === undefined || s === "") return fallback;
  const v = Number.parseInt(s, 10);
  return Number.isFinite(v) ? v : fallback;
}

function dateFmt(sqldate: string): string {
  if (sqldate.length < 8) return sqldate;
  return `${sqldate.slice(0, 4)}-${sqldate.slice(4, 6)}-${sqldate.slice(6, 8)}`;
}

export function parseExport(raw: string): GdeltEvent[] {
  const events: GdeltEvent[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 61) continue;

    // Prefer the geo block whose country code matches one of the actors'
    // country codes. This guards against GDELT geocoder errors (e.g. "NJ"
    // being resolved to Jersey, JE rather than New Jersey, US) and also
    // against the case where Actor1Geo and ActionGeo disagree. When no
    // actor country code is set, fall back to the last (ActionGeo) block.
    const actor1cc = (parts[7] ?? "").toUpperCase();
    const actor2cc = (parts[17] ?? "").toUpperCase();
    const preferredCC = actor1cc || actor2cc;
    const geo = preferredCC
      ? findActionGeo(parts, preferredCC) ?? findActionGeo(parts)
      : findActionGeo(parts);
    if (!geo) continue;

    const root = parts[28] ?? "";
    const sqldate = parts[1] ?? "";
    const quad = int(parts[29], 0) as QuadClass;

    events.push({
      id: parts[0] ?? "",
      date: dateFmt(sqldate),
      added: parts[parts.length - 2] ?? "",
      actor1: parts[6] ?? "",
      actor1cc: parts[7] ?? "",
      actor2: parts[16] ?? "",
      actor2cc: parts[17] ?? "",
      event_code: parts[26] ?? "",
      event_base: parts[27] ?? "",
      event_root: root,
      event_label: CAMEO_ROOT[root] ?? "OTHER",
      quad,
      quad_label: QUAD[quad] ?? "?",
      goldstein: num(parts[30], 0.0),
      tone: num(parts[34], 0.0),
      mentions: int(parts[31], 0),
      sources: int(parts[32], 0),
      articles: int(parts[33], 0),
      lat: geo.lat,
      lon: geo.lon,
      place: geo.place,
      country: geo.country,
      url: geo.url,
    });
  }
  return events;
}

export function filterConflict(events: GdeltEvent[]): GdeltEvent[] {
  const out = events.filter(
    (e) => (e.quad === 3 || e.quad === 4) && e.goldstein <= CONFLICT_THRESHOLD,
  );
  out.sort((a, b) => a.goldstein - b.goldstein || b.mentions - a.mentions);
  return out;
}

export function summarize(events: GdeltEvent[]) {
  const conflict = events.filter((e) => e.quad === 3 || e.quad === 4);
  const countries = new Set<string>();
  for (const e of events) if (e.country) countries.add(e.country);
  const avgTone = events.length
    ? events.reduce((s, e) => s + e.tone, 0) / events.length
    : 0;
  return {
    total: events.length,
    conflict: conflict.length,
    countries: countries.size,
    avg_tone: `${avgTone >= 0 ? "+" : ""}${avgTone.toFixed(2)}`,
  };
}
