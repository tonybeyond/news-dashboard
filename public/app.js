// Browser client. Subscribes to the SSE stream and incrementally updates the
// Leaflet map and event feed. Falls back to a one-shot REST fetch if SSE is
// unavailable. All filtering happens client-side so the dataset can grow
// without re-rendering the world on every tick.
import { countryName } from "./countries.js";
import { CAMEO_ROOT, CONFLICT_ROOTS } from "./cameo.js";
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
    sVisible: $("s-visible"),
    sAgo: $("s-ago"),
    liveDot: $("live-dot"),
    liveLabel: $("live-label"),
    feed: $("feed"),
    gFilter: $("g-filter"),
    mFilter: $("m-filter"),
    gVal: $("g-val"),
    mVal: $("m-val"),
    reconnect: $("reconnect"),
    // Second filter row
    countryBtn: $("country-btn"),
    countryPanel: $("country-panel"),
    countryList: $("country-list"),
    countryCount: $("country-count"),
    countrySearch: $("country-search"),
    rootBtn: $("root-btn"),
    rootPanel: $("root-panel"),
    rootList: $("root-list"),
    rootCount: $("root-count"),
    searchBox: $("search-box"),
    filtersClear: $("filters-clear"),
};
const state = {
    events: new Map(),
    meta: null,
    receivedAt: 0,
    selectedCountries: new Set(),
    selectedRoots: new Set(),
    search: "",
};
// ------- Map -------
const map = L.map("map", { worldCopyJump: true, preferCanvas: true }).setView([20, 10], 2);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© CARTO · © OSM · data: GDELT 2.0",
    subdomains: "abcd",
    maxZoom: 8,
}).addTo(map);
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
        ${esc(e.place)}${e.country ? ", " + esc(countryName(e.country)) : ""}
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
// ------- Filtering -------
function currentFilters() {
    return {
        gMax: parseFloat(els.gFilter.value),
        mMin: parseInt(els.mFilter.value, 10),
        countries: state.selectedCountries, // empty set = pass all
        roots: state.selectedRoots, // empty set = pass all
        search: state.search.trim().toLowerCase(),
    };
}
function searchHaystack(e) {
    return `${e.actor1} ${e.actor2} ${e.place} ${e.event_label} ${e.country}`.toLowerCase();
}
// Cache the lowercased search haystack per event id. We don't put it on
// the event object itself because that would dirty the wire format.
const hayCache = new Map();
function hayFor(e) {
    let h = hayCache.get(e.id);
    if (h === undefined) {
        h = searchHaystack(e);
        hayCache.set(e.id, h);
    }
    return h;
}
function clearHayCache() { hayCache.clear(); }
function passes(e, f) {
    if (e.goldstein > f.gMax)
        return false;
    if (e.mentions < f.mMin)
        return false;
    if (f.countries.size > 0 && !f.countries.has(e.country))
        return false;
    if (f.roots.size > 0 && !f.roots.has(e.event_root))
        return false;
    if (f.search.length > 0 && !hayFor(e).includes(f.search))
        return false;
    return true;
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
function countVisible() {
    const f = currentFilters();
    let n = 0;
    for (const e of state.events.values())
        if (passes(e, f))
            n++;
    return n;
}
function renderFeed(newIds) {
    els.gVal.textContent = parseFloat(els.gFilter.value).toFixed(1);
    els.mVal.textContent = String(parseInt(els.mFilter.value, 10));
    const f = currentFilters();
    const visible = [...state.events.values()]
        .filter((e) => passes(e, f))
        .sort((a, b) => a.goldstein - b.goldstein || b.mentions - a.mentions)
        .slice(0, 200);
    if (visible.length === 0) {
        els.feed.innerHTML = '<div class="empty">no events match the current filters</div>';
    }
    else {
        els.feed.innerHTML = visible.map(eventRowHTML).join("");
        for (const id of newIds) {
            const e = state.events.get(id);
            if (!e || !passes(e, f))
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
    // Update the visible-count stat in the header.
    els.sVisible.textContent = String(countVisible());
    // Show / hide the "clear" button.
    const hasFilter = f.countries.size > 0 || f.roots.size > 0 || f.search.length > 0;
    els.filtersClear.hidden = !hasFilter;
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
    for (const [id, m] of markers) {
        if (!want.has(id)) {
            m.remove();
            markers.delete(id);
        }
    }
}
function renderHeader() {
    const m = state.meta;
    els.snapshot.textContent = m ? `snapshot: ${m.snapshot} · built ${m.built}` : "—";
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
// ------- Country dropdown -------
function countryBreakdown() {
    const m = new Map();
    for (const e of state.events.values()) {
        if (!e.country)
            continue;
        m.set(e.country, (m.get(e.country) ?? 0) + 1);
    }
    return m;
}
function rootBreakdown() {
    const m = new Map();
    for (const e of state.events.values()) {
        m.set(e.event_root, (m.get(e.event_root) ?? 0) + 1);
    }
    return m;
}
let countryListBuilt = null; // memoize: only rebuild when dataset changes
function renderCountryList() {
    const counts = countryBreakdown();
    const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const filter = els.countrySearch.value.trim().toLowerCase();
    const visible = filter
        ? entries.filter(([cc]) => countryName(cc).toLowerCase().includes(filter) || cc.toLowerCase().includes(filter))
        : entries;
    els.countryList.innerHTML = visible.map(([cc, n]) => {
        const checked = state.selectedCountries.has(cc) ? "checked" : "";
        return `
      <label class="dd-item" data-country-code="${esc(cc)}">
        <input type="checkbox" data-country-code="${esc(cc)}" ${checked}>
        <span class="dd-item-label">${esc(countryName(cc))} <span style="color:var(--muted)">${esc(cc)}</span></span>
        <span class="dd-item-meta">${n}</span>
      </label>`;
    }).join("") || '<div class="empty" style="padding:12px">no countries</div>';
    // Update the count badge on the dropdown button.
    const total = state.selectedCountries.size;
    els.countryCount.textContent = total === 0 ? "" : `${total} sel`;
    countryListBuilt = state.meta?.snapshot ?? "no-snapshot";
}
function renderRootList() {
    const counts = rootBreakdown();
    const entries = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    els.rootList.innerHTML = entries.map(([code, n]) => {
        const checked = state.selectedRoots.has(code) ? "checked" : "";
        const isConflict = CONFLICT_ROOTS.has(code);
        return `
      <label class="dd-item ${isConflict ? "conflict" : ""}" data-root-code="${esc(code)}">
        <input type="checkbox" data-root-code="${esc(code)}" ${checked}>
        <span class="dd-item-label">${esc(CAMEO_ROOT[code] ?? code)} <span style="color:var(--muted)">${esc(code)}</span></span>
        <span class="dd-item-meta">${n}</span>
      </label>`;
    }).join("") || '<div class="empty" style="padding:12px">no subjects</div>';
    const total = state.selectedRoots.size;
    els.rootCount.textContent = total === 0 ? "" : `${total} sel`;
}
function openDropdown(panel, btn) {
    closeAllDropdowns();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
}
function closeAllDropdowns() {
    els.countryPanel.hidden = true;
    els.rootPanel.hidden = true;
    els.countryBtn.setAttribute("aria-expanded", "false");
    els.rootBtn.setAttribute("aria-expanded", "false");
}
function applyFiltersChanged() {
    syncMarkers();
    renderFeed(new Set());
}
// ------- Live stream -------
function setLive(stateName, label) {
    els.liveDot.classList.remove("live", "stale", "down");
    els.liveDot.classList.add(stateName);
    els.liveLabel.textContent = label;
}
let es = null;
function connect() {
    if (es)
        es.close();
    setLive("stale", "connecting…");
    try {
        es = new EventSource("/api/stream");
    }
    catch (err) {
        console.error("EventSource failed to construct", err);
        void bootstrapRest();
        return;
    }
    es.onopen = () => setLive("live", "live");
    es.onerror = () => setLive("down", "reconnecting…");
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
        // Replace atomically.
        state.events.clear();
        clearHayCache();
        for (const e of msg.events)
            state.events.set(e.id, e);
        state.meta = msg.meta;
        state.receivedAt = Date.now();
        renderHeader();
        // Rebuild dropdown contents to reflect the new dataset.
        renderCountryList();
        renderRootList();
        syncMarkers();
        renderFeed(new Set([...state.events.keys()]));
        setLive("live", "live");
    }
}
async function bootstrapRest() {
    try {
        const res = await fetch("/api/snapshot");
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const body = (await res.json());
        if (body.meta && body.events) {
            state.events.clear();
            clearHayCache();
            for (const e of body.events)
                state.events.set(e.id, e);
            state.meta = body.meta;
            state.receivedAt = Date.now();
            renderHeader();
            renderCountryList();
            renderRootList();
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
els.gFilter.addEventListener("input", applyFiltersChanged);
els.mFilter.addEventListener("input", applyFiltersChanged);
els.reconnect.addEventListener("click", connect);
// Country dropdown
els.countryBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (els.countryPanel.hidden) {
        openDropdown(els.countryPanel, els.countryBtn);
        els.countrySearch.value = "";
        renderCountryList();
        queueMicrotask(() => els.countrySearch.focus());
    }
    else {
        closeAllDropdowns();
    }
});
els.countryList.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement))
        return;
    const cc = t.dataset.countryCode;
    if (!cc)
        return;
    if (t.checked)
        state.selectedCountries.add(cc);
    else
        state.selectedCountries.delete(cc);
    applyFiltersChanged();
    els.countryCount.textContent = state.selectedCountries.size === 0 ? "" : `${state.selectedCountries.size} sel`;
});
els.countrySearch.addEventListener("input", renderCountryList);
els.countryPanel.querySelectorAll("[data-country-action]").forEach((b) => {
    b.addEventListener("click", () => {
        const action = b.dataset.countryAction;
        state.selectedCountries.clear();
        if (action === "top10") {
            const counts = countryBreakdown();
            const top10 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
            for (const [cc] of top10)
                state.selectedCountries.add(cc);
        }
        renderCountryList();
        applyFiltersChanged();
    });
});
// Root dropdown
els.rootBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (els.rootPanel.hidden) {
        openDropdown(els.rootPanel, els.rootBtn);
        renderRootList();
    }
    else {
        closeAllDropdowns();
    }
});
els.rootList.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement))
        return;
    const code = t.dataset.rootCode;
    if (!code)
        return;
    if (t.checked)
        state.selectedRoots.add(code);
    else
        state.selectedRoots.delete(code);
    applyFiltersChanged();
    els.rootCount.textContent = state.selectedRoots.size === 0 ? "" : `${state.selectedRoots.size} sel`;
});
els.rootPanel.querySelectorAll("[data-root-action]").forEach((b) => {
    b.addEventListener("click", () => {
        const action = b.dataset.rootAction;
        state.selectedRoots.clear();
        if (action === "conflict") {
            for (const code of CONFLICT_ROOTS)
                state.selectedRoots.add(code);
        }
        renderRootList();
        applyFiltersChanged();
    });
});
// Search box — debounce 150ms so typing doesn't thrash renderFeed
let searchTimer = null;
els.searchBox.addEventListener("input", () => {
    if (searchTimer !== null)
        window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
        state.search = els.searchBox.value;
        applyFiltersChanged();
    }, 150);
});
// Clear all filters
els.filtersClear.addEventListener("click", () => {
    state.selectedCountries.clear();
    state.selectedRoots.clear();
    state.search = "";
    els.searchBox.value = "";
    renderCountryList();
    renderRootList();
    applyFiltersChanged();
});
// Close any open dropdown when clicking outside
document.addEventListener("click", (e) => {
    if (!(e.target instanceof Node))
        return;
    if (els.countryPanel.contains(e.target) || els.countryBtn.contains(e.target))
        return;
    if (els.rootPanel.contains(e.target) || els.rootBtn.contains(e.target))
        return;
    closeAllDropdowns();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
        closeAllDropdowns();
});
// ------- Helpers -------
function cssEscape(s) {
    if (typeof CSS !== "undefined" && CSS.escape)
        return CSS.escape(s);
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
// ------- Boot -------
connect();
bootstrapRest();
