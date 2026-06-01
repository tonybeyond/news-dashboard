// Browser client. Subscribes to the SSE stream and incrementally updates the
// Leaflet map and event feed. Falls back to a one-shot REST fetch if SSE is
// unavailable. Renders only the events that pass the current filter sliders
// (so the dataset can grow without re-rendering the world every tick).
// ------- DOM refs -------
const $ = (id) => {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`#${id} not in DOM`);
    return el;
};
const els = {
    snapshot: $("snapshot"),
    sTotal: $("s-total"),
    sConflict: $("s-conflict"),
    sCountries: $("s-countries"),
    sTone: $("s-tone"),
    sAgo: $("s-ago"),
    liveDot: $("live-dot"),
    liveLabel: $("live-label"),
    feed: $("feed"),
    gFilter: $("g-filter"),
    mFilter: $("m-filter"),
    gVal: $("g-val"),
    mVal: $("m-val"),
    reconnect: $("reconnect"),
};
const state = {
    events: new Map(),
    meta: null,
    receivedAt: 0,
};
// ------- Map -------
const map = L.map("map", { worldCopyJump: true, preferCanvas: true }).setView([20, 10], 2);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© CARTO · © OSM · data: GDELT 2.0",
    subdomains: "abcd",
    maxZoom: 8,
}).addTo(map);
// id -> Leaflet marker. We mutate the layer in place when an event is updated
// so the same marker can change color/radius as new info arrives.
const markers = new Map();
function colorFor(g) {
    if (g <= -6)
        return "#ff5a4d";
    if (g <= -4)
        return "#ffb648";
    return "#7a8893";
}
function radiusFor(e) {
    return Math.max(3, Math.min(14, 3 + Math.log2(1 + e.mentions) * 1.5));
}
function popupHTML(e) {
    return `
    <div style="min-width:220px">
      <div style="font-weight:600;margin-bottom:4px">${esc(e.event_label)}</div>
      <div style="color:#7a8893;font-size:11px;margin-bottom:6px">
        ${esc(e.actor1 || "?")} → ${esc(e.actor2 || "?")}<br>
        ${esc(e.place)}${e.country ? ", " + esc(e.country) : ""}
      </div>
      <div style="font-size:11px">
        Goldstein: <b>${e.goldstein.toFixed(1)}</b> ·
        tone: <b>${e.tone.toFixed(1)}</b> · mentions: <b>${e.mentions}</b>
      </div>
      ${e.url ? `<div style="margin-top:6px"><a href="${esc(e.url)}" target="_blank" rel="noopener">source ↗</a></div>` : ""}
    </div>`;
}
function esc(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
// ------- Filtering / rendering -------
function currentFilters() {
    return {
        gMax: parseFloat(els.gFilter.value),
        mMin: parseInt(els.mFilter.value, 10),
    };
}
function passes(e, f) {
    return e.goldstein <= f.gMax && e.mentions >= f.mMin;
}
function severity(g) {
    return g <= -6 ? "hi" : g <= -4 ? "md" : "lo";
}
function eventRowHTML(e) {
    const sev = severity(e.goldstein);
    const url = e.url
        ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.replace(/^https?:\/\//, "").slice(0, 60))}…</a>`
        : "";
    return `
    <div class="event" data-id="${esc(e.id)}">
      <div class="row1">
        <span class="label">${esc(e.event_label)}</span>
        <span class="gscore ${sev}">${e.goldstein.toFixed(1)}</span>
      </div>
      <div class="row2">${esc(e.actor1 || "?")}${e.actor2 ? " → " + esc(e.actor2) : ""} · ${esc(e.place || "")}</div>
      <div class="row3">${url}</div>
    </div>`;
}
function renderFeed(newIds) {
    const f = currentFilters();
    els.gVal.textContent = f.gMax.toFixed(1);
    els.mVal.textContent = String(f.mMin);
    const visible = [...state.events.values()]
        .filter((e) => passes(e, f))
        .sort((a, b) => a.goldstein - b.goldstein || b.mentions - a.mentions)
        .slice(0, 200);
    if (visible.length === 0) {
        els.feed.innerHTML = '<div class="empty">no events match the current filters</div>';
    }
    else {
        els.feed.innerHTML = visible.map(eventRowHTML).join("");
        // Tag newly-arrived rows for the flash animation
        for (const id of newIds) {
            if (!passes(state.events.get(id), f))
                continue;
            const row = els.feed.querySelector(`.event[data-id="${cssEscape(id)}"]`);
            if (row) {
                row.classList.add("new");
                row.addEventListener("animationend", () => row.classList.remove("new"), { once: true });
            }
        }
    }
    els.feed.querySelectorAll(".event").forEach((el) => {
        el.addEventListener("click", () => {
            const ev = state.events.get(el.dataset.id ?? "");
            if (ev)
                map.setView([ev.lat, ev.lon], 5, { animate: true });
        });
    });
}
function syncMarkers() {
    const f = currentFilters();
    const want = new Set();
    for (const [id, e] of state.events) {
        if (!passes(e, f))
            continue;
        want.add(id);
        const m = markers.get(id);
        const opts = {
            radius: radiusFor(e),
            color: colorFor(e.goldstein),
            fillColor: colorFor(e.goldstein),
            fillOpacity: 0.7,
            weight: 1,
        };
        if (m) {
            m.setLatLng([e.lat, e.lon]);
            m.setStyle(opts);
        }
        else {
            const cm = L.circleMarker([e.lat, e.lon], opts).bindPopup(popupHTML(e));
            cm.addTo(map);
            markers.set(id, cm);
        }
    }
    // Remove markers that no longer pass the filter or are gone from the dataset.
    for (const [id, m] of markers) {
        if (!want.has(id)) {
            m.remove();
            markers.delete(id);
        }
    }
}
function renderHeader() {
    const m = state.meta;
    if (!m) {
        els.snapshot.textContent = "—";
    }
    else {
        els.snapshot.textContent = `snapshot: ${m.snapshot} · built ${m.built}`;
    }
    els.sTotal.textContent = m ? String(m.total) : "—";
    els.sConflict.textContent = m ? String(m.conflict) : "—";
    els.sCountries.textContent = m ? String(m.countries) : "—";
    els.sTone.textContent = m ? m.avg_tone : "—";
}
function renderAgo() {
    if (!state.receivedAt) {
        els.sAgo.textContent = "—";
        return;
    }
    const sec = Math.max(0, Math.floor((Date.now() - state.receivedAt) / 1000));
    if (sec < 60)
        els.sAgo.textContent = `${sec}s ago`;
    else if (sec < 3600)
        els.sAgo.textContent = `${Math.floor(sec / 60)}m ago`;
    else
        els.sAgo.textContent = `${Math.floor(sec / 3600)}h ago`;
}
setInterval(renderAgo, 1000);
// ------- Live stream -------
function setLive(state, label) {
    els.liveDot.classList.remove("live", "stale", "down");
    els.liveDot.classList.add(state);
    els.liveLabel.textContent = label;
}
let es = null;
function connect() {
    if (es)
        es.close();
    setLive("stale", "connecting…");
    // Try SSE first
    try {
        es = new EventSource("/api/stream");
    }
    catch (err) {
        console.error("EventSource failed to construct", err);
        void bootstrapRest();
        return;
    }
    es.onopen = () => setLive("live", "live");
    es.onerror = () => {
        setLive("down", "reconnecting…");
        // EventSource auto-reconnects; just reflect state in the UI.
    };
    es.onmessage = (ev) => {
        let msg;
        try {
            msg = JSON.parse(ev.data);
        }
        catch {
            return;
        }
        handleMessage(msg);
    };
}
function handleMessage(msg) {
    if (msg.type === "ping")
        return;
    if (msg.type === "hello") {
        state.meta = msg.meta;
        renderHeader();
        return;
    }
    if (msg.type === "delta") {
        // Replace the snapshot atomically. (GDELT exports are full snapshots,
        // not append-only — using add vs. replace keeps client logic simple.)
        state.events.clear();
        markers.forEach((m) => m.remove());
        markers.clear();
        const newIds = new Set();
        for (const e of msg.events) {
            state.events.set(e.id, e);
            newIds.add(e.id);
        }
        state.meta = msg.meta;
        state.receivedAt = Date.now();
        renderHeader();
        syncMarkers();
        renderFeed(newIds);
        setLive("live", "live");
    }
}
async function bootstrapRest() {
    // One-shot fetch if SSE is unsupported. The user can still see the latest
    // snapshot — it just won't auto-update.
    try {
        const res = await fetch("/api/snapshot");
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const body = (await res.json());
        if (body.meta && body.events) {
            state.events.clear();
            markers.forEach((m) => m.remove());
            markers.clear();
            for (const e of body.events)
                state.events.set(e.id, e);
            state.meta = body.meta;
            state.receivedAt = Date.now();
            renderHeader();
            syncMarkers();
            renderFeed(new Set());
            setLive("stale", "polling only");
        }
        else {
            setLive("stale", "waiting for first snapshot…");
        }
    }
    catch (err) {
        console.error("REST bootstrap failed", err);
        setLive("down", "no connection");
    }
}
// ------- Filter wiring -------
els.gFilter.addEventListener("input", () => {
    syncMarkers();
    renderFeed(new Set());
});
els.mFilter.addEventListener("input", () => {
    syncMarkers();
    renderFeed(new Set());
});
els.reconnect.addEventListener("click", connect);
// ------- Helpers -------
function cssEscape(s) {
    if (typeof CSS !== "undefined" && CSS.escape)
        return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
// ------- Boot -------
connect();
bootstrapRest();
export {};
