/* Deer-movement reasoning: rut phase timeline, travel-corridor model, stand scoring, wind logic,
   scouting route optimization. Heuristics are explicit so you can judge (and override) them. */
(function () {
  "use strict";
  const { geo, WINDS, WIND_DEG, terrain, TYPE } = window.WS;

  // ------------------------------------------------------------------ rut phases
  // Offsets are days relative to the mean conception date (MDWFP publishes conception, not "peak rut";
  // hunter-observed chasing typically peaks ~1–2 weeks BEFORE mean conception).
  const PHASES = [
    { key: "pre", from: -60, to: -22, name: "Pre-rut", color: "#6c8ebf",
      tips: ["Bucks on food-to-bed patterns; rubs appear along travel routes.", "Hunt food edges in the PM, staging cover off the food.", "Scout for rub lines — they point toward bedding."] },
    { key: "seeking", from: -21, to: -11, name: "Seeking", color: "#d6b656",
      tips: ["Scrape lines get hot; bucks cruise downwind of doe bedding.", "Set up on the downwind edge of doe bedding or along scrape lines in cover.", "Midday sits start paying off."] },
    { key: "chasing", from: -10, to: -3, name: "Chasing (peak daytime movement)", color: "#e8743b",
      tips: ["Most daylight buck movement of the year — sit all day if you can.", "Funnels and pinch points between doe groups beat food sources.", "Grunt/doe-bleat calling and rattling are most effective now.", "Scrapes cool off as bucks shift from making sign to chasing does."] },
    { key: "breeding", from: -2, to: 8, name: "Breeding / Lockdown", color: "#c0392b",
      tips: ["Bucks tend does in thick cover; movement can feel dead in open woods.", "Hunt the edges of the thickest doe bedding cover and ridges/high ground through it.", "Watch for bucks relocating does mid-morning — sit until 11:00+.", "Pinch points connecting doe bedding areas catch bucks searching for the next doe."] },
    { key: "post", from: 9, to: 24, name: "Post-rut recovery", color: "#7a7a7a",
      tips: ["Bucks go back to food and security cover to recover.", "Hunt the best remaining food (late acorns, green browse, ag) close to thick cover.", "Cold fronts drive the best movement."] },
    { key: "second", from: 25, to: 35, name: "Second rut", color: "#9b59b6",
      tips: ["Unbred does and doe fawns come into estrus ~28 days later.", "Doe groups on food draw bucks again — hunt food in the evening."] },
    { key: "late", from: 36, to: 120, name: "Late season", color: "#4a6fa5",
      tips: ["Food and thermal cover rule. Hunt south-facing cover and the best food."] },
  ];
  const DAY = 864e5;
  function phaseFor(date, conception) {
    const off = Math.round((date - conception) / DAY);
    return Object.assign({ offset: off }, PHASES.find((p) => off >= p.from && off <= p.to) || (off < -60 ? PHASES[0] : PHASES[PHASES.length - 1]));
  }

  // ------------------------------------------------------------------ helpers
  const ofType = (fs, ...ids) => fs.filter((f) => ids.includes(f.type));
  function bboxOf(points, padM) {
    let s = 90, n = -90, w = 180, e = -180;
    points.forEach((p) => { s = Math.min(s, p[0]); n = Math.max(n, p[0]); w = Math.min(w, p[1]); e = Math.max(e, p[1]); });
    const dLat = padM / 110540, dLng = padM / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
    return { south: s - dLat, north: n + dLat, west: w - dLng, east: e + dLng };
  }
  function allPts(f) { return f.geom.type === "Point" ? [f.geom.coords] : f.geom.coords; }

  // corner-cutting smoother so grid paths read like real deer trails
  function chaikin(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // ------------------------------------------------------------------ corridor model
  /* Cost surface:
     - lower ground costs more (wet, flood-prone); ridges/high ground are cheap — classic Delta travel.
     - cells below the flood level are near-impassable except at marked slough crossings.
     - your marked deer trails, rub lines and ridges are strong attractors (scouting beats modeling).
     - thickets/bedding give cover (cheaper); roads & ATV trails add pressure (pricier).
     Pairs: each bedding area → its 2 nearest food sources; in rut mode also bedding ↔ bedding (buck cruising). */
  async function modelCorridors(features, opts) {
    const o = Object.assign({ rut: true, useFlood: false, floodFt: 85, lowWeight: 4, maxPairDistM: 3500 }, opts);
    let beds = ofType(features, "bedding");
    if (!beds.length) beds = ofType(features, "thicket");
    const foods = ofType(features, "food");
    if (!beds.length) throw new Error("Draw at least one Bedding Area (or Thicket) polygon first.");
    if (!foods.length && !(o.rut && beds.length > 1)) throw new Error("Draw at least one Food polygon (or two bedding areas with rut mode on).");

    const pairs = [], seen = new Set();
    const addPair = (a, b, kind) => {
      const k = [a.id, b.id].sort().join("|") + kind;
      if (seen.has(k) || a.id === b.id) return;
      const d = geo.dist(geo.featureAnchor(a), geo.featureAnchor(b));
      if (d > o.maxPairDistM) return;
      seen.add(k); pairs.push({ a, b, kind, d });
    };
    beds.forEach((bd) => {
      const ba = geo.featureAnchor(bd);
      foods.slice().sort((x, y) => geo.dist(ba, geo.featureAnchor(x)) - geo.dist(ba, geo.featureAnchor(y))).slice(0, 2).forEach((fd) => addPair(bd, fd, "feed"));
      if (o.rut) beds.filter((x) => x !== bd).sort((x, y) => geo.dist(ba, geo.featureAnchor(x)) - geo.dist(ba, geo.featureAnchor(y))).slice(0, 2).forEach((b2) => addPair(bd, b2, "cruise"));
    });
    if (!pairs.length) throw new Error("No bedding→food pairs within range. Check that areas are within ~2 miles of each other.");
    const used = pairs.slice(0, 14);

    const pts = [];
    used.forEach((p) => { pts.push(...allPts(p.a), ...allPts(p.b)); });
    const b = bboxOf(pts, 350);
    const g = await terrain.grid(b, 220);
    const valid = Array.from(g.data).filter((v) => !isNaN(v));
    if (valid.length < g.data.length * 0.5) throw new Error("Elevation tiles didn't load (offline?). Try again with a connection.");
    const lo = terrain.percentile(g.data, 0.05), hi = terrain.percentile(g.data, 0.95), span = Math.max(0.3, hi - lo);
    const N = g.w * g.h, cost = new Float32Array(N);
    const floodM = o.floodFt / terrain.FT;
    for (let k = 0; k < N; k++) {
      const e = isNaN(g.data[k]) ? lo : g.data[k];
      const low = Math.max(0, Math.min(1, (hi - e) / span));
      cost[k] = 1 + o.lowWeight * low ** 1.5 + (o.useFlood && e < floodM ? 40 : 0);
    }
    const cellLL = (k) => g.toLatLng(k % g.w, (k / g.w) | 0);
    const polyMul = (types, mul, add = 0) => ofType(features, ...types).forEach((f) => {
      if (f.geom.type !== "Polygon") return;
      const bb = bboxOf(f.geom.coords, 0);
      for (let k = 0; k < N; k++) {
        const p = cellLL(k);
        if (p[0] < bb.south || p[0] > bb.north || p[1] < bb.west || p[1] > bb.east) continue;
        if (geo.pointInPoly(p, f.geom.coords)) cost[k] = cost[k] * mul + add;
      }
    });
    const lineMul = (types, mul, radiusM, setTo) => ofType(features, ...types).forEach((f) => {
      const cs = f.geom.type === "Point" ? [f.geom.coords] : f.geom.coords;
      const r = Math.max(1, Math.ceil(radiusM / g.cellM));
      const mark = new Set();
      for (let i = 0; i < cs.length; i++) {
        const a = cs[i], c = cs[Math.min(i + 1, cs.length - 1)];
        const steps = Math.max(1, Math.ceil(geo.dist(a, c) / (g.cellM / 2)));
        for (let s = 0; s <= steps; s++) {
          const p = [a[0] + ((c[0] - a[0]) * s) / steps, a[1] + ((c[1] - a[1]) * s) / steps];
          const [ci, cj] = g.fromLatLng(p[0], p[1]);
          for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
            const x = ci + di, y = cj + dj;
            if (x >= 0 && y >= 0 && x < g.w && y < g.h && di * di + dj * dj <= r * r) mark.add(y * g.w + x);
          }
        }
      }
      mark.forEach((k) => { cost[k] = setTo != null ? setTo : cost[k] * mul; });
    });
    polyMul(["water"], 1, 40);
    polyMul(["thicket", "bedding"], 0.75);
    lineMul(["road", "atv"], 1.4, 15);
    lineMul(["ridge"], 0.45, 25);
    lineMul(["trail", "rubline"], 0.35, 20);
    lineMul(["crossing"], 1, 35, 0.6);
    lineMul(["funnel"], 0.6, 40);

    const paths = [], usage = new Uint8Array(N);
    for (const p of used) {
      const A = geo.featureAnchor(p.a), B = geo.featureAnchor(p.b);
      const s = g.fromLatLng(A[0], A[1]), t = g.fromLatLng(B[0], B[1]);
      const cells = terrain.astar(g.w, g.h, cost, s, t);
      if (!cells) continue;
      const lane = new Set();
      cells.forEach(([i, j]) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const x = i + di, y = j + dj; if (x >= 0 && y >= 0 && x < g.w && y < g.h) lane.add(y * g.w + x); } });
      lane.forEach((k) => (usage[k] = Math.min(255, usage[k] + 1)));
      const coords = chaikin(chaikin(cells.filter((_, i) => i % 2 === 0 || i === cells.length - 1).map(([i, j]) => g.toLatLng(i, j))));
      paths.push({ from: p.a.name || TYPE[p.a.type].label, to: p.b.name || TYPE[p.b.type].label, kind: p.kind, coords, len: geo.lineLength(coords) });
    }
    // convergence hotspots: cells shared by >=2 lanes, away from the endpoints themselves
    const ends = used.flatMap((p) => [p.a, p.b]);
    const hotspots = [];
    for (let k = 0; k < N; k++) {
      if (usage[k] < 2) continue;
      const p = cellLL(k);
      if (ends.some((f) => geo.distToFeature(p, f).d < 60)) continue;
      const near = hotspots.find((h) => geo.dist(h.coords, p) < 120);
      if (near) { if (usage[k] > near.count) { near.count = usage[k]; near.coords = p; } }
      else hotspots.push({ coords: p, count: usage[k] });
    }
    hotspots.sort((a, b) => b.count - a.count);
    return { paths, hotspots: hotspots.slice(0, 12), stats: { cells: N, cellM: g.cellM, loFt: lo * terrain.FT, hiFt: hi * terrain.FT, pairs: used.length } };
  }

  // ------------------------------------------------------------------ stand analysis
  const SIGN_W = { rub: 3, scrape: 4, tracks: 1, bed: 2, droppings: 1, sighting: 3, buck: 6, camera: 0 };
  function analyzeStand(stand, features, model) {
    const p = stand.geom.coords, notes = [];
    const near = (types, r) => ofType(features, ...types).map((f) => ({ f, ...geo.distToFeature(p, f) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d);
    const nearest = (types) => ofType(features, ...types).map((f) => ({ f, ...geo.distToFeature(p, f) })).sort((a, b) => a.d - b.d)[0];

    const signs = near(Object.keys(SIGN_W), 150);
    const signScore = Math.min(35, signs.reduce((s, x) => s + (SIGN_W[x.f.type] || 0), 0));
    const counts = {};
    signs.forEach((x) => (counts[x.f.type] = (counts[x.f.type] || 0) + 1));
    ofType(features, "trail", "rubline").forEach((f) => { if (geo.distToFeature(p, f).d < 60) counts[f.type] = (counts[f.type] || 0) + 1; });

    const bed = nearest(["bedding"]), food = nearest(["food"]), pinch = nearest(["funnel", "crossing"]);
    let lane = null;
    if (model) model.paths.forEach((pa) => { const n = geo.nearestOnLine(p, pa.coords); if (!lane || n.d < lane.d) lane = { ...n, path: pa }; });
    const hot = model ? model.hotspots.map((h) => ({ h, d: geo.dist(p, h.coords) })).sort((a, b) => a.d - b.d)[0] : null;

    let prox = 0;
    if (bed) {
      if (bed.d === 0) { notes.push("⚠️ Stand is INSIDE bedding — you'll bump deer getting in. Back off to the edge."); prox = 2; }
      else if (bed.d < 50) { notes.push("Very tight to bedding (<55 yd). Great in lockdown, risky on entry."); prox = 14; }
      else if (bed.d <= 275) prox = 20;
      else if (bed.d <= 550) prox = 12;
      else prox = 4;
    } else notes.push("No bedding area mapped yet — draw where you think deer bed.");

    let travel = 0;
    const tdist = Math.min(lane ? lane.d : Infinity, pinch ? pinch.d : Infinity, hot ? hot.d : Infinity);
    if (tdist <= 40) travel = 25; else if (tdist <= 90) travel = 18; else if (tdist <= 180) travel = 8;
    if ((counts.trail || 0) + (counts.rubline || 0) > 0) travel = Math.min(25, travel + 8);

    // wind: scent must not blow toward bedding (within 600 m) or the travel lane / funnel deer approach on
    const sensitive = [];
    ofType(features, "bedding").forEach((f) => { const n = geo.distToFeature(p, f); if (n.d > 0 && n.d < 600) sensitive.push({ b: geo.bearing(p, geo.featureAnchor(f)), why: "bedding" }); });
    if (lane && lane.d > 15 && lane.d < 200) sensitive.push({ b: geo.bearing(p, lane.pt), why: "travel lane" });
    if (pinch && pinch.d > 15 && pinch.d < 200) sensitive.push({ b: geo.bearing(p, pinch.pt), why: "funnel/crossing" });
    ofType(features, "trail").forEach((f) => { const n = geo.distToFeature(p, f); if (n.d > 15 && n.d < 120) sensitive.push({ b: geo.bearing(p, n.pt), why: "deer trail" }); });
    const goodWinds = [], badWinds = [];
    WINDS.forEach((w) => {
      const scentTo = (WIND_DEG[w] + 180) % 360;
      const hit = sensitive.find((s) => geo.angDiff(scentTo, s.b) < 45);
      (hit ? badWinds : goodWinds).push(hit ? { w, why: hit.why } : w);
    });
    const windScore = sensitive.length ? Math.round((goodWinds.length / 8) * 10) : 5;

    // access
    let access = 0;
    const acc = nearest(["parking", "boat"]);
    const routes = ofType(features, "entry").filter((r) => { const c = r.geom.coords; return geo.dist(c[c.length - 1], p) < 120 || geo.dist(c[0], p) < 120; });
    if (routes.length) {
      access = 10;
      routes.forEach((r) => ofType(features, "bedding").forEach((bf) => {
        const close = r.geom.coords.some((q) => geo.distToFeature(q, bf).d < 70);
        if (close) { access = 3; notes.push(`⚠️ Entry route "${r.name || "route"}" passes within 75 yd of bedding — bump risk.`); }
      }));
    } else notes.push("No entry route drawn to this stand yet.");
    if (stand.manualWinds && stand.manualWinds.length) notes.push(`Your wind call: ${stand.manualWinds.join(", ")}.`);

    const score = Math.round(signScore + prox + travel + windScore + access);
    return { score, counts, bed, food, pinch, lane, hot, goodWinds, badWinds, sensitive, acc, routes, notes, accessScore: access };
  }

  // stand usable with a given wind? manual winds override computed
  function windOk(stand, analysis, wind) {
    if (!wind) return null;
    if (stand.manualWinds && stand.manualWinds.length) return stand.manualWinds.includes(wind);
    return analysis ? analysis.goodWinds.includes(wind) : null;
  }

  // ------------------------------------------------------------------ scouting route
  function orderRoute(start, stops) {
    if (!stops.length) return { order: [], legs: [], total: 0 };
    const left = stops.slice(), order = [];
    let cur = start || geo.featureAnchor(stops[0]);
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((s, i) => { const d = geo.dist(cur, geo.featureAnchor(s)); if (d < bd) { bd = d; bi = i; } });
      const s = left.splice(bi, 1)[0]; order.push(s); cur = geo.featureAnchor(s);
    }
    // 2-opt polish
    const pt = (i) => (i < 0 ? start || geo.featureAnchor(order[0]) : geo.featureAnchor(order[i]));
    for (let it = 0; it < 30; it++) {
      let improved = false;
      for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
        const a = pt(i - 1), b = pt(i), c = pt(j), d = j + 1 < order.length ? pt(j + 1) : null;
        const before = geo.dist(a, b) + (d ? geo.dist(c, d) : 0), after = geo.dist(a, c) + (d ? geo.dist(b, d) : 0);
        if (after < before - 1) { order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse()); improved = true; }
      }
      if (!improved) break;
    }
    const legs = []; let prev = start || geo.featureAnchor(order[0]), total = 0;
    order.forEach((s) => { const d = geo.dist(prev, geo.featureAnchor(s)); legs.push(d); total += d; prev = geo.featureAnchor(s); });
    if (start) total += geo.dist(prev, start); // walk back out
    return { order, legs, total };
  }

  window.WS = Object.assign(window.WS || {}, { analysis: { PHASES, phaseFor, modelCorridors, analyzeStand, windOk, orderRoute } });
})();
