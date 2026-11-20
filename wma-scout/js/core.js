/* Core: feature catalog, geo math, persistence. Plain script (works from file://). */
(function () {
  "use strict";

  // ---------------------------------------------------------------- catalog
  // geom: point | line | area.  group drives the palette sections.
  const TYPES = [
    // Access & infrastructure
    { id: "parking", label: "Parking / Gate", icon: "🅿️", color: "#e8e8e8", geom: "point", group: "Access" },
    { id: "boat", label: "Boat Launch", icon: "🚤", color: "#4fb3ff", geom: "point", group: "Access" },
    { id: "check", label: "Check Station", icon: "🏁", color: "#ffd166", geom: "point", group: "Access" },
    { id: "atv", label: "ATV Trail", icon: "🛻", color: "#ff9f1c", geom: "line", group: "Access", dash: "8 6" },
    { id: "foot", label: "Foot Trail", icon: "🥾", color: "#f4e285", geom: "line", group: "Access", dash: "2 6" },
    { id: "road", label: "Road / Levee", icon: "🛣️", color: "#bdbdbd", geom: "line", group: "Access" },
    { id: "water_route", label: "Boat Route", icon: "🛶", color: "#4fb3ff", geom: "line", group: "Access", dash: "10 5" },

    // Habitat & terrain
    { id: "bedding", label: "Bedding Area", icon: "🛏️", color: "#c0392b", geom: "area", group: "Habitat" },
    { id: "thicket", label: "Thicket / Cutover", icon: "🌿", color: "#7cb342", geom: "area", group: "Habitat" },
    { id: "food", label: "Food (acorn flat, ag, plot)", icon: "🌰", color: "#f39c12", geom: "area", group: "Habitat" },
    { id: "water", label: "Open Water / Slough", icon: "💧", color: "#2980b9", geom: "area", group: "Habitat" },
    { id: "ridge", label: "Ridge / High Ground", icon: "⛰️", color: "#a1887f", geom: "line", group: "Habitat" },
    { id: "crossing", label: "Slough Crossing", icon: "🌉", color: "#5dade2", geom: "point", group: "Habitat" },
    { id: "funnel", label: "Funnel / Pinch", icon: "⏳", color: "#e056fd", geom: "point", group: "Habitat" },

    // Deer sign
    { id: "rub", label: "Rub", icon: "🪵", color: "#d35400", geom: "point", group: "Sign", sign: true },
    { id: "scrape", label: "Scrape", icon: "🟫", color: "#8e44ad", geom: "point", group: "Sign", sign: true },
    { id: "tracks", label: "Tracks", icon: "🐾", color: "#95a5a6", geom: "point", group: "Sign", sign: true },
    { id: "bed", label: "Bed", icon: "🛌", color: "#e74c3c", geom: "point", group: "Sign", sign: true },
    { id: "droppings", label: "Droppings", icon: "⚫", color: "#7f8c8d", geom: "point", group: "Sign", sign: true },
    { id: "sighting", label: "Deer Sighting", icon: "🦌", color: "#2ecc71", geom: "point", group: "Sign", sign: true },
    { id: "buck", label: "Buck Sighting", icon: "🫎", color: "#27ae60", geom: "point", group: "Sign", sign: true },
    { id: "trail", label: "Deer Trail / Run", icon: "〰️", color: "#d4a373", geom: "line", group: "Sign", sign: true, dash: "4 4" },
    { id: "rubline", label: "Rub Line", icon: "🪓", color: "#d35400", geom: "line", group: "Sign", sign: true, dash: "1 6" },
    { id: "camera", label: "Trail Camera", icon: "📷", color: "#00cec9", geom: "point", group: "Sign" },

    // Plan
    { id: "stand", label: "Stand / Setup", icon: "🎯", color: "#ff3b30", geom: "point", group: "Plan" },
    { id: "target", label: "Scout Target", icon: "🔎", color: "#fdcb6e", geom: "point", group: "Plan" },
    { id: "entry", label: "Entry Route", icon: "➡️", color: "#00e676", geom: "line", group: "Plan" },
    { id: "exit", label: "Exit Route", icon: "⬅️", color: "#ff5252", geom: "line", group: "Plan", dash: "6 4" },
    { id: "nogo", label: "No-Go / Sanctuary", icon: "⛔", color: "#ff1744", geom: "area", group: "Plan" },
    { id: "note", label: "Note", icon: "📝", color: "#ffffff", geom: "point", group: "Plan" },
    { id: "zone", label: "Area (general)", icon: "🔷", color: "#74b9ff", geom: "area", group: "Plan" },
    { id: "path", label: "Line (general)", icon: "➖", color: "#dfe6e9", geom: "line", group: "Plan" },
  ];
  const TYPE = Object.fromEntries(TYPES.map((t) => [t.id, t]));

  const WINDS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const WIND_DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

  // ---------------------------------------------------------------- geo math
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  function dist(a, b) {
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
    const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }
  function dest(p, brg, m) {
    const d = m / R, b = rad(brg), la = rad(p[0]), lo = rad(p[1]);
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return [deg(la2), deg(lo2)];
  }
  function angDiff(a, b) {
    const d = Math.abs(((a - b) % 360) + 360) % 360;
    return d > 180 ? 360 - d : d;
  }
  function lineLength(pts) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
    return s;
  }
  function centroid(pts) {
    let la = 0, lo = 0;
    pts.forEach((p) => { la += p[0]; lo += p[1]; });
    return [la / pts.length, lo / pts.length];
  }
  function areaM2(pts) {
    if (pts.length < 3) return 0;
    const c = centroid(pts), k = Math.cos(rad(c[0]));
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += rad(a[1]) * k * R * rad(b[0]) * R - rad(b[1]) * k * R * rad(a[0]) * R;
    }
    return Math.abs(s / 2);
  }
  function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][1], yi = poly[i][0], xj = poly[j][1], yj = poly[j][0];
      if (yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // nearest point on a polyline; returns {d, pt}
  function nearestOnLine(p, pts) {
    const k = Math.cos(rad(p[0])) * 111320, m = 110540;
    const toXY = (q) => [(q[1] - p[1]) * k, (q[0] - p[0]) * m];
    let best = { d: Infinity, pt: pts[0] };
    for (let i = 1; i < pts.length; i++) {
      const a = toXY(pts[i - 1]), b = toXY(pts[i]);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L = dx * dx + dy * dy;
      let t = L ? -(a[0] * dx + a[1] * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      const x = a[0] + t * dx, y = a[1] + t * dy;
      const d = Math.hypot(x, y);
      if (d < best.d) best = { d, pt: [p[0] + y / m, p[1] + x / k] };
    }
    return best;
  }
  // distance from point to any feature geometry
  function distToFeature(p, f) {
    if (f.geom.type === "Point") return { d: dist(p, f.geom.coords), pt: f.geom.coords };
    if (f.geom.type === "Polygon") {
      if (pointInPoly(p, f.geom.coords)) return { d: 0, pt: p };
      return nearestOnLine(p, f.geom.coords.concat([f.geom.coords[0]]));
    }
    return nearestOnLine(p, f.geom.coords);
  }
  function featureAnchor(f) {
    if (f.geom.type === "Point") return f.geom.coords;
    if (f.geom.type === "Polygon") return centroid(f.geom.coords);
    const c = f.geom.coords;
    return c[Math.floor(c.length / 2)];
  }
  function compass(b) { return WINDS[Math.round(b / 45) % 8]; }

  const fmt = {
    yd: (m) => (m < 1609 ? `${Math.round(m * 1.09361)} yd` : `${(m / 1609.34).toFixed(2)} mi`),
    ft: (m) => `${(m * 3.28084).toFixed(1)} ft`,
    acres: (m2) => `${(m2 / 4046.86).toFixed(1)} ac`,
    ll: (p) => `${p[0].toFixed(5)}, ${p[1].toFixed(5)}`,
    // all hunt times shown in Mississippi time regardless of the device's zone
    time: (d) => (d && !isNaN(d) ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "—"),
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------------------------------------------------------- persistence (IndexedDB, falls back to memory)
  const DB_NAME = "wma-scout", DB_VER = 1;
  let dbp = null;
  const mem = { kv: new Map(), blobs: new Map() };
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        const r = indexedDB.open(DB_NAME, DB_VER);
        r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("blobs"); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  async function op(store, mode, fn) {
    const d = await db();
    if (!d) return fn(null, mem[store]);
    return new Promise((res, rej) => {
      const tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      tx.oncomplete = () => res(req && req.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const store = {
    get: (k) => op("kv", "readonly", (s, m) => (s ? s.get(k) : { result: m.get(k) })),
    set: (k, v) => op("kv", "readwrite", (s, m) => (s ? s.put(v, k) : (m.set(k, v), null))),
    getBlob: (k) => op("blobs", "readonly", (s, m) => (s ? s.get(k) : { result: m.get(k) })),
    setBlob: (k, v) => op("blobs", "readwrite", (s, m) => (s ? s.put(v, k) : (m.set(k, v), null))),
    delBlob: (k) => op("blobs", "readwrite", (s, m) => (s ? s.delete(k) : (m.delete(k), null))),
    allBlobKeys: () => op("blobs", "readonly", (s, m) => (s ? s.getAllKeys() : { result: [...m.keys()] })),
  };

  window.WS = Object.assign(window.WS || {}, {
    TYPES, TYPE, WINDS, WIND_DEG,
    geo: { dist, bearing, dest, angDiff, lineLength, centroid, areaM2, pointInPoly, nearestOnLine, distToFeature, featureAnchor, compass },
    fmt, uid, esc, store,
  });
})();
