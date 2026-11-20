/* WMA Scout — UI, map, and state wiring. */
(async function () {
  "use strict";
  const { TYPES, TYPE, WINDS, WIND_DEG, geo, fmt, uid, esc, store, astro, terrain, analysis, io } = window.WS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ================================================================== constants
  // Approximate: Phil Bryant WMA lies along MS Hwy 465 / Steele Bayou in Issaquena & Warren Cos.
  // Import your onX export (Data tab) and press "Set home view" to lock onto your exact ground.
  const DEFAULT_CENTER = [32.5, -90.97];
  const DAYS = [
    ["2026-12-14", "scout", "Mon"], ["2026-12-15", "scout", "Tue"], ["2026-12-16", "scout", "Wed"],
    ["2026-12-17", "hunt", "Thu"], ["2026-12-18", "hunt", "Fri"], ["2026-12-19", "hunt", "Sat"], ["2026-12-20", "hunt", "Sun"],
  ];
  const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  // midnight in Mississippi (CST, UTC-6 in December) for astronomical calcs
  const msMidnight = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 6)); };
  const dayLabel = (s) => parseDay(s).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  const SCOUT_TEMPLATES = {
    "2026-12-14": { title: "Big-picture recon", tasks: [
      "Check in at the Ten Point check station (Hwy 465), get permit card, and confirm current scouting/entry rules in the brochure",
      "Check Mississippi River stage at Vicksburg + backwater forecast; set the Flood slider to match",
      "Drive/ride the designated ATV trails & roads at first light; log parking spots, gates, and other hunters' vehicles",
      "Walk the edges of the top food sources (red/water/overcup oak flats, browse) — check for fresh feeding & droppings",
      "Time every walk-in from parking/boat launch to candidate stands",
      "Evening: glass an opening or slough edge from a distance; log every deer seen and its direction",
    ] },
    "2026-12-15": { title: "Sign & corridors", tasks: [
      "Run the corridor model, then walk each predicted lane — confirm (log sign) or kill it",
      "Inspect every magenta hotspot / funnel / slough crossing the model flagged",
      "Log every scrape (licking branch? fresh?), rub (diameter), track line, and crossing",
      "Midday: work bedding EDGES only — never push through the interior",
      "Pick a primary + backup stand for each likely wind",
      "Draw entry & exit routes that keep your scent off bedding",
    ] },
    "2026-12-16": { title: "Finalize & stay quiet", tasks: [
      "Light touch only — no new ground near your best stands",
      "Confirm entry/exit routes in the dark-friendly way allowed by regs (reflective tacks only if permitted)",
      "Prep stand sites midday (minimal lane trimming; follow WMA stand rules)",
      "Pull the NWS forecast (Deer Intel tab) and assign Thu–Sun sits by wind",
      "Evening observation sit from long range on the best food/slough edge",
      "Gear check: blaze orange, permit card, license, headlamp, drag rope, wind checker",
    ] },
  };
  const HUNT_TASKS = [
    "Enter by headlamp before legal shooting light; check wind at the truck",
    "Log every deer seen (Field Log) with time & direction",
    "Midday: hold during peak rut — bucks move 10 am–2 pm",
    "Re-check wind before the PM sit; switch stands if it shifted",
  ];

  function buildDays() {
    return DAYS.map(([date, kind, dow]) => ({
      date, kind, dow,
      title: kind === "scout" ? SCOUT_TEMPLATES[date].title : "Hunt day",
      tasks: (kind === "scout" ? SCOUT_TEMPLATES[date].tasks : HUNT_TASKS).map((t) => ({ id: uid(), text: t, done: false })),
      notes: "",
      forecast: { am: "", amSpd: "", pm: "", pmSpd: "", hi: "", lo: "", front: false, src: "" },
      sits: {},
      routeStart: "",
    }));
  }
  const DEFAULT_STATE = () => ({
    version: 1,
    settings: { center: DEFAULT_CENTER, zoom: 13, homeSet: false, conception: "2026-12-27", hunters: "Me", labels: true, basemap: "sat", ref: true },
    features: [], imports: [], overlays: [],
    days: buildDays(),
    gear: [
      "Hunting license + WMA user permit", "Draw permit / permit card", "Blaze orange (500 sq in + cap)", "Rifle/muzzleloader + ammo (per unit rules)",
      "Headlamp + spare", "Phone + battery bank (onX offline maps downloaded)", "Wind checker", "Knee boots / waders (sloughs)", "Climber or harness + lifeline",
      "Drag rope, knife, gloves", "Trail flagging/tacks (only where allowed)", "Rain gear", "Snacks & water",
    ].map((t) => ({ id: uid(), text: t, done: false })),
    terrain: { relief: false, hillshade: false, flood: false, opRelief: 0.55, opHill: 0.8, opFlood: 0.7, lo: 80, hi: 100, floodFt: 85, exag: 12, river: "" },
    wind: "",
    model: null,
    modelOpts: { rut: true, useFlood: false, lowWeight: 4 },
  });

  // ================================================================== state
  let S = (await store.get("state").catch(() => null)) || DEFAULT_STATE();
  S = Object.assign(DEFAULT_STATE(), S);
  S.settings = Object.assign(DEFAULT_STATE().settings, S.settings);
  S.terrain = Object.assign(DEFAULT_STATE().terrain, S.terrain);
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set("state", JSON.parse(JSON.stringify(S))).catch((e) => toast("Save failed: " + e.message)), 300); };
  const featById = (id) => S.features.find((f) => f.id === id);
  const conceptionDate = () => parseDay(S.settings.conception || "2026-12-27");

  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), ms);
  }

  // ================================================================== map
  const map = L.map("map", { zoomControl: true, center: S.settings.center, zoom: S.settings.zoom, maxZoom: 20, preferCanvas: false });
  const esri = (svc) => `https://server.arcgisonline.com/ArcGIS/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
  const usgs = (svc) => `https://basemap.nationalmap.gov/arcgis/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`;
  const BASEMAPS = {
    sat: { name: "Satellite (Esri World Imagery)", url: esri("World_Imagery"), max: 19, attr: "Imagery © Esri, Maxar, Earthstar, USDA" },
    naip: { name: "USGS Imagery (NAIP)", url: usgs("USGSImageryOnly"), max: 16, attr: "USGS The National Map" },
    imgtopo: { name: "USGS Imagery + Topo", url: usgs("USGSImageryTopo"), max: 16, attr: "USGS The National Map" },
    topo: { name: "USGS Topo (contours)", url: usgs("USGSTopo"), max: 16, attr: "USGS The National Map" },
    esritopo: { name: "Esri World Topo", url: esri("World_Topo_Map"), max: 19, attr: "© Esri" },
    otm: { name: "OpenTopoMap", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", max: 17, attr: "© OpenStreetMap, SRTM | OpenTopoMap (CC-BY-SA)" },
  };
  const baseLayers = {};
  Object.entries(BASEMAPS).forEach(([k, b]) => (baseLayers[k] = L.tileLayer(b.url, { maxNativeZoom: b.max, maxZoom: 20, attribution: b.attr, crossOrigin: false })));
  const refLayer = L.layerGroup([
    L.tileLayer(esri("Reference/World_Transportation"), { maxNativeZoom: 19, maxZoom: 20, opacity: 0.85 }),
    L.tileLayer(esri("Reference/World_Boundaries_and_Places"), { maxNativeZoom: 19, maxZoom: 20 }),
  ]);
  let curBase = null;
  function setBase(k) {
    if (curBase) map.removeLayer(curBase);
    curBase = baseLayers[k] || baseLayers.sat; curBase.addTo(map); curBase.bringToBack();
    S.settings.basemap = k; save();
  }
  setBase(S.settings.basemap);
  if (S.settings.ref) refLayer.addTo(map);

  map.createPane("terrain"); map.getPane("terrain").style.zIndex = 350;
  map.createPane("overlayImg"); map.getPane("overlayImg").style.zIndex = 360;
  map.createPane("cones"); map.getPane("cones").style.zIndex = 390;
  const reliefL = terrain.makeLayer("relief", L, { pane: "terrain", opacity: S.terrain.opRelief });
  const hillL = terrain.makeLayer("hillshade", L, { pane: "terrain", opacity: S.terrain.opHill });
  const floodL = terrain.makeLayer("flood", L, { pane: "terrain", opacity: S.terrain.opFlood });
  Object.assign(terrain.settings, { lo: S.terrain.lo, hi: S.terrain.hi, flood: S.terrain.floodFt, exag: S.terrain.exag });
  function syncTerrain() {
    [[reliefL, "relief"], [hillL, "hillshade"], [floodL, "flood"]].forEach(([l, k]) => {
      if (S.terrain[k] && !map.hasLayer(l)) l.addTo(map);
      if (!S.terrain[k] && map.hasLayer(l)) map.removeLayer(l);
    });
    reliefL.setOpacity(S.terrain.opRelief); hillL.setOpacity(S.terrain.opHill); floodL.setOpacity(S.terrain.opFlood);
    renderLegend();
  }
  let redrawT = null;
  function redrawTerrain(which) {
    Object.assign(terrain.settings, { lo: S.terrain.lo, hi: S.terrain.hi, flood: S.terrain.floodFt, exag: S.terrain.exag });
    clearTimeout(redrawT);
    redrawT = setTimeout(() => { (which || [reliefL, hillL, floodL]).forEach((l) => map.hasLayer(l) && l.redraw()); renderLegend(); }, 120);
  }
  syncTerrain();

  const gImports = L.layerGroup().addTo(map);
  const gOverlays = L.layerGroup().addTo(map);
  const gModel = L.layerGroup().addTo(map);
  const gCones = L.layerGroup().addTo(map);
  const gRoute = L.layerGroup().addTo(map);
  const gHeat = L.layerGroup();
  const gFeatures = L.layerGroup().addTo(map);
  const gEdit = L.layerGroup().addTo(map);
  const gMe = L.layerGroup().addTo(map);
  L.control.scale({ imperial: true, metric: false }).addTo(map);

  // locate control
  const LocateCtl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const d = L.DomUtil.create("div", "leaflet-bar");
      d.innerHTML = '<a href="#" title="Show my location" style="font-size:16px">◎</a><a href="#" title="Home view" style="font-size:15px">⌂</a>';
      L.DomEvent.disableClickPropagation(d);
      d.children[0].onclick = (e) => { e.preventDefault(); startGPS(true); };
      d.children[1].onclick = (e) => { e.preventDefault(); map.setView(S.settings.center, S.settings.zoom); };
      return d;
    },
  });
  map.addControl(new LocateCtl());

  map.on("moveend", () => { if (!S.settings.homeSet) { S.settings.center = [map.getCenter().lat, map.getCenter().lng]; S.settings.zoom = map.getZoom(); save(); } });

  // ================================================================== feature rendering
  let sel = null;
  function pinIcon(f) {
    const t = TYPE[f.type];
    const lbl = S.settings.labels && f.name ? `<span class="lbl">${esc(f.name)}</span>` : "";
    return L.divIcon({ className: "", html: `<div class="pin${sel === f.id ? " sel" : ""}">${t.icon}${lbl}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  }
  function popupHtml(f) {
    const t = TYPE[f.type];
    let extra = "";
    if (f.geom.type === "LineString") extra = `<br><span class="muted">${fmt.yd(geo.lineLength(f.geom.coords))}</span>`;
    if (f.geom.type === "Polygon") extra = `<br><span class="muted">${fmt.acres(geo.areaM2(f.geom.coords))}</span>`;
    return `<b>${t.icon} ${esc(f.name || t.label)}</b><br><span class="muted">${esc(t.label)}${f.created ? " · " + new Date(f.created).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>${extra}${f.notes ? `<p>${esc(f.notes)}</p>` : ""}`;
  }
  function renderFeatures() {
    gFeatures.clearLayers(); gEdit.clearLayers();
    // areas first, then lines, then points on top
    const order = { Polygon: 0, LineString: 1, Point: 2 };
    S.features.slice().sort((a, b) => order[a.geom.type] - order[b.geom.type]).forEach((f) => {
      const t = TYPE[f.type] || TYPE.note, isSel = sel === f.id;
      let l;
      if (f.geom.type === "Point") {
        l = L.marker(f.geom.coords, { icon: pinIcon(f), draggable: isSel, zIndexOffset: isSel ? 1000 : 0, riseOnHover: true });
        l.on("dragend", (e) => { const p = e.target.getLatLng(); f.geom.coords = [p.lat, p.lng]; save(); afterGeomChange(); });
      } else if (f.geom.type === "LineString") {
        l = L.polyline(f.geom.coords, { color: t.color, weight: isSel ? 6 : 4, dashArray: t.dash, opacity: 0.95 });
      } else {
        l = L.polygon(f.geom.coords, { color: t.color, weight: isSel ? 3 : 2, fillOpacity: isSel ? 0.3 : 0.16, dashArray: t.dash });
      }
      l.on("click", (e) => { L.DomEvent.stopPropagation(e); if (draw) return onMapClick(e); select(f.id); });
      l.bindTooltip(`${t.icon} ${esc(f.name || t.label)}`, { sticky: true, direction: "top", opacity: 0.9 });
      l.addTo(gFeatures);
      if (isSel && f.geom.type !== "Point") vertexHandles(f);
    });
    renderCones();
  }
  function vertexHandles(f) {
    f.geom.coords.forEach((c, i) => {
      const m = L.marker(c, { draggable: true, icon: L.divIcon({ className: "", html: '<div class="vertex"></div>', iconSize: [10, 10], iconAnchor: [5, 5] }), title: "Drag to move · right-click/long-press to delete" });
      m.on("drag", (e) => { const p = e.target.getLatLng(); f.geom.coords[i] = [p.lat, p.lng]; });
      m.on("dragend", () => { save(); renderFeatures(); afterGeomChange(); });
      m.on("contextmenu", () => {
        const min = f.geom.type === "Polygon" ? 3 : 2;
        if (f.geom.coords.length <= min) return toast("Can't remove — shape needs more points.");
        f.geom.coords.splice(i, 1); save(); renderFeatures(); afterGeomChange();
      });
      m.addTo(gEdit);
    });
  }
  function afterGeomChange() { renderEditor(); if ($("#panel-intel").classList.contains("active")) renderIntel(); }

  function select(id, opts = {}) {
    sel = id;
    renderFeatures();
    if (id) { showTab("mark"); renderMark(); if (opts.pan) { const f = featById(id); if (f) map.panTo(geo.featureAnchor(f)); } }
    else renderMark();
  }

  // ================================================================== scent cones
  function renderCones() {
    gCones.clearLayers();
    const w = S.wind;
    if (!w) return;
    const scentTo = (WIND_DEG[w] + 180) % 360;
    S.features.filter((f) => f.type === "stand").forEach((f) => {
      const a = analysis.analyzeStand(f, S.features, S.model);
      const ok = analysis.windOk(f, a, w);
      const p = f.geom.coords, len = 320, half = 22, pts = [p];
      for (let b = -half; b <= half; b += 4) pts.push(geo.dest(p, scentTo + b, len));
      const color = ok === true ? "#66bb6a" : ok === false ? "#ff5252" : "#bdbdbd";
      L.polygon(pts, { pane: "cones", color, weight: 1, fillColor: color, fillOpacity: 0.18, interactive: false }).addTo(gCones);
    });
  }

  // ================================================================== drawing
  let draw = null; // {type, pts, temp, measure}
  function startDraw(type) {
    cancelDraw();
    const t = type === "measure" ? { geom: "line", label: "Measure" } : TYPE[type];
    draw = { type, pts: [], geom: t.geom, measure: type === "measure" };
    map.doubleClickZoom.disable();
    $("#map").style.cursor = "crosshair";
    if (t.geom === "point") { $("#drawbar").classList.add("hidden"); toast(`Tap the map to place: ${t.label}`); }
    else { $("#drawbar").classList.remove("hidden"); updateDrawMsg(); }
    renderPalette();
  }
  function updateDrawMsg() {
    if (!draw) return;
    const t = draw.measure ? { label: "Measure" } : TYPE[draw.type];
    let m = `${t.label}: tap to add points (${draw.pts.length})`;
    if (draw.pts.length > 1) m += draw.geom === "area" ? ` · ${fmt.acres(geo.areaM2(draw.pts))}` : ` · ${fmt.yd(geo.lineLength(draw.pts))}`;
    $("#drawMsg").textContent = m;
    $("#drawFinish").classList.toggle("hidden", !!draw.measure);
  }
  function redrawTemp() {
    if (draw.temp) map.removeLayer(draw.temp);
    const c = draw.measure ? "#ffeb3b" : TYPE[draw.type].color;
    draw.temp = draw.geom === "area" && draw.pts.length > 2 ? L.polygon(draw.pts, { color: c, dashArray: "4 4", fillOpacity: 0.15 }) : L.polyline(draw.pts, { color: c, dashArray: "4 4", weight: 3 });
    draw.temp.addTo(map);
    updateDrawMsg();
  }
  function finishDraw() {
    if (!draw) return;
    const need = draw.geom === "area" ? 3 : 2;
    if (draw.measure) return cancelDraw();
    if (draw.pts.length < need) return toast(`Need at least ${need} points.`);
    const f = newFeature(draw.type, draw.geom === "area" ? "Polygon" : "LineString", draw.pts.slice());
    cancelDraw();
    select(f.id);
  }
  function cancelDraw() {
    if (draw && draw.temp) map.removeLayer(draw.temp);
    draw = null;
    map.doubleClickZoom.enable();
    $("#map").style.cursor = "";
    $("#drawbar").classList.add("hidden");
    renderPalette();
  }
  $("#drawFinish").onclick = finishDraw;
  $("#drawCancel").onclick = cancelDraw;
  $("#drawUndo").onclick = () => { if (draw && draw.pts.length) { draw.pts.pop(); redrawTemp(); } };
  map.on("dblclick", (e) => { if (draw && draw.geom !== "point") { L.DomEvent.stop(e); finishDraw(); } });
  map.on("click", (e) => onMapClick(e));
  async function onMapClick(e) {
    const p = [e.latlng.lat, e.latlng.lng];
    if (draw) {
      if (draw.geom === "point") {
        const f = newFeature(draw.type, "Point", p);
        cancelDraw(); select(f.id);
      } else { draw.pts.push(p); redrawTemp(); }
      return;
    }
    if (overlayEdit) return;
    if (sel) select(null);
    $("#readout").textContent = `${fmt.ll(p)} · elev …`;
    const el = await terrain.elevationAt(p[0], p[1]);
    $("#readout").textContent = `${fmt.ll(p)} · elev ${el == null ? "n/a" : (el * terrain.FT).toFixed(1) + " ft"}`;
  }
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "Escape") { cancelDraw(); select(null); }
    if (e.key === "Enter" && draw) finishDraw();
  });

  function newFeature(type, gtype, coords, extra = {}) {
    const f = Object.assign({ id: uid(), type, name: "", notes: "", created: new Date().toISOString(), geom: { type: gtype, coords }, day: "", status: "", photos: [] }, extra);
    S.features.push(f); save();
    return f;
  }

  // ================================================================== tabs & sidebar
  function showTab(name) {
    $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$(".panel").forEach((p) => p.classList.toggle("active", p.id === "panel-" + name));
    $("#sidebar").classList.remove("collapsed");
    ({ layers: renderLayers, mark: renderMark, intel: renderIntel, plan: renderPlan, log: renderLog, data: renderData })[name]();
    setTimeout(() => map.invalidateSize(), 220);
  }
  $$(".tabs button").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  $("#toggleSidebar").onclick = () => { $("#sidebar").classList.toggle("collapsed"); setTimeout(() => map.invalidateSize(), 250); };

  // top bar
  $("#windSelect").innerHTML = `<option value="">— off —</option>` + WINDS.map((w) => `<option>${w}</option>`).join("");
  $("#windSelect").value = S.wind || "";
  $("#windSelect").onchange = (e) => { S.wind = e.target.value; save(); renderCones(); if ($("#panel-intel").classList.contains("active")) renderIntel(); };
  function renderCountdown() {
    const now = new Date(), scout = parseDay("2026-12-14"), hunt = parseDay("2026-12-17"), end = parseDay("2026-12-21");
    const d = (a) => Math.ceil((a - now) / 864e5);
    let txt;
    if (now < scout) txt = `🔎 Scouting in ${d(scout)}d · 🎯 Hunt in ${d(hunt)}d`;
    else if (now < hunt) txt = `🔎 Scouting now · Hunt in ${d(hunt)}d`;
    else if (now < end) txt = "🎯 Hunt is ON";
    else txt = "Season wrap-up";
    $("#countdown").textContent = txt;
  }
  renderCountdown();

  // ================================================================== LAYERS panel
  function renderLayers() {
    const T = S.terrain;
    const p = $("#panel-layers");
    p.innerHTML = `
      <h3>Base map</h3>
      <div class="card">
        ${Object.entries(BASEMAPS).map(([k, b]) => `<label class="row"><input type="radio" name="base" value="${k}" ${S.settings.basemap === k ? "checked" : ""}> ${b.name}</label>`).join("")}
        <label class="row"><input type="checkbox" id="refT" ${S.settings.ref ? "checked" : ""}> Roads & place labels overlay</label>
        <label class="row"><input type="checkbox" id="lblT" ${S.settings.labels ? "checked" : ""}> Show marker names</label>
        <p class="muted small">Tip: compare Esri vs. NAIP — different flight dates show different leaf/flood conditions. USGS Topo shows contours, sloughs, and old channel scars.</p>
      </div>

      <h3>Terrain intelligence</h3>
      <div class="card">
        <label class="row"><input type="checkbox" id="hillT" ${T.hillshade ? "checked" : ""}> <b>Micro-relief hillshade</b></label>
        <div class="row"><span class="small muted">Exaggeration</span><input type="range" id="exag" min="1" max="40" value="${T.exag}"><span class="small" id="exagV">${T.exag}×</span></div>
        <div class="row"><span class="small muted">Opacity</span><input type="range" id="opHill" min="0.1" max="1" step="0.05" value="${T.opHill}"></div>
        <p class="muted small">Delta ground is "flat" — but 2–4 ft ridges, old natural levees and slough banks are deer highways. Crank exaggeration to 15–30× to see them.</p>
        <hr style="border-color:var(--line)">
        <label class="row"><input type="checkbox" id="relT" ${T.relief ? "checked" : ""}> <b>Relative elevation (high ground)</b></label>
        <div class="row"><span class="small muted">Low ft</span><input type="number" id="lo" value="${T.lo.toFixed(1)}" step="0.5"><span class="small muted">High ft</span><input type="number" id="hi" value="${T.hi.toFixed(1)}" step="0.5"></div>
        <div class="btn-row"><button class="btn small" id="autoRange">Auto-fit to current view</button></div>
        <div class="row"><span class="small muted">Opacity</span><input type="range" id="opRel" min="0.1" max="1" step="0.05" value="${T.opRelief}"></div>
        <hr style="border-color:var(--line)">
        <label class="row"><input type="checkbox" id="floodT" ${T.flood ? "checked" : ""}> <b>Flood / backwater simulator</b></label>
        <div class="row"><span class="small muted">Water at</span><input type="range" id="floodFt" min="${Math.floor(T.lo - 5)}" max="${Math.ceil(T.hi + 5)}" step="0.25" value="${T.floodFt}"><span class="small" id="floodV">${T.floodFt.toFixed(1)} ft</span></div>
        <div class="row"><span class="small muted">Opacity</span><input type="range" id="opFlood" min="0.1" max="1" step="0.05" value="${T.opFlood}"></div>
        <p class="muted small">Blue = under water at that ground elevation, <span style="color:#ffe600">yellow</span> = last dry ground. When the Mississippi backs water up Steele Bayou, deer pile onto those yellow islands and ridges. Elevations are approximate (USGS 3DEP via AWS Terrain Tiles); calibrate by tapping a known waterline.</p>
      </div>

      <h3>Imported onX layers</h3>
      <div class="card" id="importList"></div>

      <h3>Image overlays (onX screenshots)</h3>
      <div class="card" id="overlayList"></div>
    `;
    $$('input[name=base]', p).forEach((r) => (r.onchange = () => setBase(r.value)));
    $("#refT").onchange = (e) => { S.settings.ref = e.target.checked; e.target.checked ? refLayer.addTo(map) : map.removeLayer(refLayer); save(); };
    $("#lblT").onchange = (e) => { S.settings.labels = e.target.checked; save(); renderFeatures(); };
    const bindT = (id, key, fn) => ($("#" + id).onchange = (e) => { S.terrain[key] = e.target.type === "checkbox" ? e.target.checked : parseFloat(e.target.value); save(); fn && fn(); });
    bindT("hillT", "hillshade", syncTerrain); bindT("relT", "relief", syncTerrain); bindT("floodT", "flood", syncTerrain);
    $("#exag").oninput = (e) => { S.terrain.exag = +e.target.value; $("#exagV").textContent = e.target.value + "×"; save(); redrawTerrain([hillL]); };
    $("#opHill").oninput = (e) => { S.terrain.opHill = +e.target.value; save(); syncTerrain(); };
    $("#opRel").oninput = (e) => { S.terrain.opRelief = +e.target.value; save(); syncTerrain(); };
    $("#opFlood").oninput = (e) => { S.terrain.opFlood = +e.target.value; save(); syncTerrain(); };
    $("#lo").onchange = (e) => { S.terrain.lo = +e.target.value; save(); redrawTerrain([reliefL]); };
    $("#hi").onchange = (e) => { S.terrain.hi = +e.target.value; save(); redrawTerrain([reliefL]); };
    $("#floodFt").oninput = (e) => { S.terrain.floodFt = +e.target.value; $("#floodV").textContent = (+e.target.value).toFixed(1) + " ft"; save(); redrawTerrain([floodL]); };
    $("#autoRange").onclick = autoRange;
    renderImportList(); renderOverlayList();
  }
  async function autoRange() {
    toast("Sampling elevation in view…");
    const b = map.getBounds();
    try {
      const r = await terrain.viewRange({ south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() });
      if (isNaN(r.lo)) throw new Error("no data");
      S.terrain.lo = Math.floor(r.lo * 2) / 2; S.terrain.hi = Math.ceil(r.hi * 2) / 2;
      if (S.terrain.floodFt < S.terrain.lo || S.terrain.floodFt > S.terrain.hi) S.terrain.floodFt = Math.round(r.median * 4) / 4;
      if (!S.terrain.relief) S.terrain.relief = true;
      save(); syncTerrain(); redrawTerrain(); renderLayers();
      toast(`View spans ${S.terrain.lo}–${S.terrain.hi} ft (median ${r.median.toFixed(1)} ft)`);
    } catch (e) { toast("Couldn't load elevation tiles — are you online?"); }
  }
  function renderLegend() {
    const T = S.terrain, el = $("#legend");
    if (!T.relief && !T.flood) return el.classList.add("hidden");
    el.classList.remove("hidden");
    let h = "";
    if (T.relief) h += `<div>Relative elevation</div><div class="bar" style="background:linear-gradient(90deg,#142878,#1e6ebe,#28aaaa,#5abe5a,#d2d246,#eb9628,#dc4628,#ffebe6)"></div><div class="ends"><span>${T.lo.toFixed(1)} ft</span><span>${T.hi.toFixed(1)} ft</span></div>`;
    if (T.flood) h += `<div style="margin-top:6px">Water level ${T.floodFt.toFixed(1)} ft: <span style="color:#4fa3ff">■</span> flooded <span style="color:#ffe600">■</span> last dry</div>`;
    el.innerHTML = h;
  }

  // ---------- imports
  const importLayers = new Map();
  function renderImportsOnMap() {
    gImports.clearLayers(); importLayers.clear();
    S.imports.forEach((imp) => {
      if (!imp.visible) return;
      const l = L.geoJSON(imp.geojson, {
        style: (f) => ({ color: (f.properties && (f.properties.stroke || f.properties["stroke-color"])) || imp.color, weight: 3, fillOpacity: 0.12 }),
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 6, color: "#000", weight: 1, fillColor: imp.color, fillOpacity: 0.95 }),
        onEachFeature: (f, layer) => {
          const pr = f.properties || {};
          layer.bindPopup(`<b>${esc(pr.name || "(unnamed)")}</b><br><span class="muted">${esc(imp.name)}</span>${pr.description ? `<p>${esc(String(pr.description).replace(/<[^>]+>/g, " "))}</p>` : ""}`);
        },
      }).addTo(gImports);
      importLayers.set(imp.id, l);
    });
  }
  function renderImportList() {
    const el = $("#importList");
    if (!el) return;
    el.innerHTML = S.imports.length ? S.imports.map((imp) => `
      <div class="row" data-id="${imp.id}">
        <input type="checkbox" class="vis" ${imp.visible ? "checked" : ""}>
        <input type="color" class="col" value="${imp.color}" style="width:28px;padding:0;border:0;background:none">
        <label>${esc(imp.name)} <span class="muted small">(${imp.geojson.features.length})</span></label>
        <button class="btn small zoom">Zoom</button>
        <button class="btn small conv" title="Turn these into editable markers with types guessed from names">Convert</button>
        <button class="btn small danger del">✕</button>
      </div>`).join("") : `<p class="muted small">Export waypoints, tracks, and areas from onX (Web Map → My Content → Export as KML/GPX) and import them on the Data tab. They show up here.</p>`;
    $$("[data-id]", el).forEach((row) => {
      const imp = S.imports.find((i) => i.id === row.dataset.id);
      $(".vis", row).onchange = (e) => { imp.visible = e.target.checked; save(); renderImportsOnMap(); };
      $(".col", row).onchange = (e) => { imp.color = e.target.value; save(); renderImportsOnMap(); };
      $(".zoom", row).onclick = () => { const l = importLayers.get(imp.id); if (l && l.getBounds().isValid()) map.fitBounds(l.getBounds(), { padding: [20, 20] }); };
      $(".conv", row).onclick = () => {
        const fs = imp.geojson.features.flatMap(io.fromGeoJSON);
        fs.forEach((f) => S.features.push(Object.assign({ day: "", status: "", photos: [] }, f)));
        imp.visible = false; save(); renderImportsOnMap(); renderFeatures(); renderImportList();
        toast(`Converted ${fs.length} features — review their types on the Log/Mark tabs.`);
      };
      $(".del", row).onclick = () => { if (!confirm(`Remove imported layer "${imp.name}"?`)) return; S.imports = S.imports.filter((i) => i !== imp); save(); renderImportsOnMap(); renderImportList(); };
    });
  }

  // ---------- image overlays
  const overlayObjs = new Map();
  let overlayEdit = null;
  async function renderOverlaysOnMap() {
    gOverlays.clearLayers(); overlayObjs.clear();
    for (const o of S.overlays) {
      if (!o.visible) continue;
      const blob = await store.getBlob(o.blobKey);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      const img = L.imageOverlay(url, o.bounds, { opacity: o.opacity, pane: "overlayImg", interactive: false }).addTo(gOverlays);
      overlayObjs.set(o.id, img);
    }
    if (overlayEdit) overlayHandles(overlayEdit);
  }
  function overlayHandles(id) {
    const o = S.overlays.find((x) => x.id === id), img = overlayObjs.get(id);
    if (!o || !img) return;
    const mk = (cls) => L.divIcon({ className: "", html: `<div class="handle ${cls}"></div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
    const sw = L.marker(o.bounds[0], { draggable: true, icon: mk(""), title: "SW corner" }).addTo(gOverlays);
    const ne = L.marker(o.bounds[1], { draggable: true, icon: mk(""), title: "NE corner" }).addTo(gOverlays);
    const ctr = () => [(o.bounds[0][0] + o.bounds[1][0]) / 2, (o.bounds[0][1] + o.bounds[1][1]) / 2];
    const mv = L.marker(ctr(), { draggable: true, icon: mk("move"), title: "Move whole image" }).addTo(gOverlays);
    const upd = () => { img.setBounds(o.bounds); sw.setLatLng(o.bounds[0]); ne.setLatLng(o.bounds[1]); mv.setLatLng(ctr()); };
    sw.on("drag", (e) => { const p = e.target.getLatLng(); o.bounds[0] = [p.lat, p.lng]; img.setBounds(o.bounds); mv.setLatLng(ctr()); });
    ne.on("drag", (e) => { const p = e.target.getLatLng(); o.bounds[1] = [p.lat, p.lng]; img.setBounds(o.bounds); mv.setLatLng(ctr()); });
    let start = null;
    mv.on("dragstart", () => { start = { c: ctr(), b: JSON.parse(JSON.stringify(o.bounds)) }; });
    mv.on("drag", (e) => {
      const p = e.target.getLatLng(), dLat = p.lat - start.c[0], dLng = p.lng - start.c[1];
      o.bounds = start.b.map((q) => [q[0] + dLat, q[1] + dLng]);
      img.setBounds(o.bounds); sw.setLatLng(o.bounds[0]); ne.setLatLng(o.bounds[1]);
    });
    [sw, ne, mv].forEach((m) => m.on("dragend", () => { save(); upd(); }));
  }
  function renderOverlayList() {
    const el = $("#overlayList");
    if (!el) return;
    el.innerHTML = `
      <label class="btn small accent file-btn">➕ Add screenshot<input type="file" id="ovFile" accept="image/*" hidden multiple></label>
      <p class="muted small">Screenshot a north-up onX view (satellite, hybrid, or topo), add it here, then drag the orange corners until roads/sloughs line up. Lower opacity to compare against live imagery.</p>
      ${S.overlays.map((o) => `
        <div class="card" data-id="${o.id}" style="margin:8px 0 0">
          <div class="row"><input type="checkbox" class="vis" ${o.visible ? "checked" : ""}><label>${esc(o.name)}</label>
            <button class="btn small edit ${overlayEdit === o.id ? "on" : ""}">${overlayEdit === o.id ? "Lock" : "Align"}</button>
            <button class="btn small danger del">✕</button></div>
          <div class="row"><span class="small muted">Opacity</span><input type="range" class="op" min="0.05" max="1" step="0.05" value="${o.opacity}"></div>
        </div>`).join("")}`;
    $("#ovFile").onchange = async (e) => { for (const f of e.target.files) await addOverlay(f); e.target.value = ""; };
    $$("[data-id]", el).forEach((row) => {
      const o = S.overlays.find((x) => x.id === row.dataset.id);
      $(".vis", row).onchange = (e) => { o.visible = e.target.checked; save(); renderOverlaysOnMap(); };
      $(".op", row).oninput = (e) => { o.opacity = +e.target.value; const im = overlayObjs.get(o.id); if (im) im.setOpacity(o.opacity); save(); };
      $(".edit", row).onclick = () => { overlayEdit = overlayEdit === o.id ? null : o.id; if (overlayEdit) { o.visible = true; map.fitBounds(o.bounds, { padding: [30, 30] }); } renderOverlaysOnMap(); renderOverlayList(); };
      $(".del", row).onclick = async () => { if (!confirm(`Delete overlay "${o.name}"?`)) return; await store.delBlob(o.blobKey); S.overlays = S.overlays.filter((x) => x !== o); if (overlayEdit === o.id) overlayEdit = null; save(); renderOverlaysOnMap(); renderOverlayList(); };
    });
  }
  async function addOverlay(file) {
    const key = "ov_" + uid();
    await store.setBlob(key, file);
    const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([4, 3]); im.src = URL.createObjectURL(file); });
    // fit into 70% of current view, preserving the screenshot's aspect ratio in screen space
    const size = map.getSize(), c = map.getCenter(), cp = map.latLngToContainerPoint(c);
    let w = size.x * 0.7, h = (w * dims[1]) / dims[0];
    if (h > size.y * 0.7) { h = size.y * 0.7; w = (h * dims[0]) / dims[1]; }
    const sw = map.containerPointToLatLng([cp.x - w / 2, cp.y + h / 2]), ne = map.containerPointToLatLng([cp.x + w / 2, cp.y - h / 2]);
    const o = { id: uid(), name: file.name, blobKey: key, bounds: [[sw.lat, sw.lng], [ne.lat, ne.lng]], opacity: 0.7, visible: true };
    S.overlays.push(o); overlayEdit = o.id; save();
    await renderOverlaysOnMap(); renderOverlayList();
    toast("Drag the orange corners (and blue center) to align the screenshot.");
  }

  // ================================================================== MARK panel
  let activeType = null;
  function renderPalette() {
    const el = $("#palette");
    if (!el) return;
    const groups = [...new Set(TYPES.map((t) => t.group))];
    el.innerHTML = groups.map((g) => `<h4>${g}</h4><div class="palette">${TYPES.filter((t) => t.group === g).map((t) =>
      `<button data-t="${t.id}" class="${draw && draw.type === t.id ? "active" : ""}"><span class="ic">${t.icon}</span>${t.label}<span class="g">${t.geom}</span></button>`).join("")}</div>`).join("") +
      `<div class="btn-row" style="margin-top:10px"><button class="btn small ${draw && draw.measure ? "on" : ""}" id="measureBtn">📏 Measure distance</button></div>`;
    $$("[data-t]", el).forEach((b) => (b.onclick = () => (draw && draw.type === b.dataset.t ? cancelDraw() : startDraw(b.dataset.t))));
    $("#measureBtn").onclick = () => (draw && draw.measure ? cancelDraw() : startDraw("measure"));
  }
  function renderMark() {
    const p = $("#panel-mark");
    p.innerHTML = `<div id="editor"></div><h3>Add to map</h3><p class="muted small">Pick a type, then tap the map. Lines & areas: tap each point, then Finish (or double-click).</p><div id="palette"></div>`;
    renderEditor(); renderPalette();
  }
  function renderEditor() {
    const el = $("#editor");
    if (!el) return;
    const f = sel && featById(sel);
    if (!f) { el.innerHTML = ""; return; }
    const t = TYPE[f.type];
    const sameGeom = TYPES.filter((x) => x.geom === t.geom);
    let geomInfo = "";
    if (f.geom.type === "LineString") geomInfo = `Length ${fmt.yd(geo.lineLength(f.geom.coords))}`;
    else if (f.geom.type === "Polygon") geomInfo = `Area ${fmt.acres(geo.areaM2(f.geom.coords))} · perimeter ${fmt.yd(geo.lineLength(f.geom.coords.concat([f.geom.coords[0]])))}`;
    else geomInfo = fmt.ll(f.geom.coords) + ' · <span id="elevInfo">elev …</span>';
    const statusOpts = f.type === "stand" ? ["", "candidate", "confirmed", "hung/ready", "rejected"] : f.type === "target" ? ["", "to check", "checked — good", "checked — dead"] : t.sign ? ["", "fresh", "old"] : null;
    el.innerHTML = `
      <div class="card hl">
        <div class="row"><span style="font-size:22px">${t.icon}</span><strong style="flex:1">${esc(f.name || t.label)}</strong><button class="btn small" id="edClose">Done</button></div>
        <div class="field"><span>Type</span><select id="edType">${sameGeom.map((x) => `<option value="${x.id}" ${x.id === f.type ? "selected" : ""}>${x.icon} ${x.label}</option>`).join("")}</select></div>
        <div class="field"><span>Name</span><input type="text" id="edName" value="${esc(f.name)}" placeholder="e.g. Overcup flat north, Big rub tree"></div>
        <div class="field"><span>Notes</span><textarea id="edNotes" placeholder="What you saw, sign size/freshness, travel direction, wind, access…">${esc(f.notes)}</textarea></div>
        <div class="row">
          <div class="field" style="flex:1"><span>Logged</span><input type="datetime-local" id="edDate" value="${toLocalInput(f.created)}"></div>
          <div class="field" style="flex:1"><span>Plan day</span><select id="edDay"><option value="">—</option>${S.days.map((d) => `<option value="${d.date}" ${f.day === d.date ? "selected" : ""}>${d.dow} ${d.date.slice(5)} (${d.kind})</option>`).join("")}</select></div>
        </div>
        ${statusOpts ? `<div class="field"><span>Status</span><select id="edStatus">${statusOpts.map((s) => `<option ${f.status === s ? "selected" : ""} value="${s}">${s || "—"}</option>`).join("")}</select></div>` : ""}
        ${f.type === "stand" ? `<div class="field"><span>Your wind call (overrides computed)</span><div class="btn-row">${WINDS.map((w) => `<button class="btn small mw ${(f.manualWinds || []).includes(w) ? "on" : ""}" data-w="${w}">${w}</button>`).join("")}</div></div><div id="standAnalysis"></div>` : ""}
        <p class="muted small">${geomInfo}${f.geom.type !== "Point" ? " · drag white dots to reshape, right-click/long-press one to delete it" : " · drag the marker to move it"}</p>
        <div class="thumbs" id="edThumbs"></div>
        <div class="btn-row">
          <label class="btn small file-btn">📷 Add photo<input type="file" id="edPhoto" accept="image/*" multiple hidden></label>
          <button class="btn small" id="edZoom">Zoom to</button>
          <button class="btn small" id="edDup">Duplicate</button>
          <button class="btn small danger" id="edDel">Delete</button>
        </div>
      </div>`;
    $("#edClose").onclick = () => select(null);
    $("#edType").onchange = (e) => { f.type = e.target.value; save(); renderFeatures(); renderEditor(); };
    $("#edName").oninput = (e) => { f.name = e.target.value; save(); };
    $("#edName").onchange = () => renderFeatures();
    $("#edNotes").oninput = (e) => { f.notes = e.target.value; save(); };
    $("#edDate").onchange = (e) => { f.created = new Date(e.target.value).toISOString(); save(); };
    $("#edDay").onchange = (e) => { f.day = e.target.value; save(); };
    if ($("#edStatus")) $("#edStatus").onchange = (e) => { f.status = e.target.value; save(); };
    $$(".mw", el).forEach((b) => (b.onclick = () => {
      f.manualWinds = f.manualWinds || [];
      const i = f.manualWinds.indexOf(b.dataset.w);
      i >= 0 ? f.manualWinds.splice(i, 1) : f.manualWinds.push(b.dataset.w);
      save(); renderEditor(); renderCones();
    }));
    $("#edZoom").onclick = () => { if (f.geom.type === "Point") map.setView(f.geom.coords, Math.max(map.getZoom(), 17)); else map.fitBounds(L.latLngBounds(f.geom.coords), { padding: [40, 40] }); };
    $("#edDup").onclick = () => { const c = JSON.parse(JSON.stringify(f)); c.id = uid(); c.name = (f.name || "") + " (copy)"; c.photos = []; if (c.geom.type === "Point") c.geom.coords = [c.geom.coords[0] + 0.0003, c.geom.coords[1]]; S.features.push(c); save(); select(c.id); };
    $("#edDel").onclick = async () => { if (!confirm("Delete this feature?")) return; for (const k of f.photos || []) await store.delBlob(k); S.features = S.features.filter((x) => x !== f); save(); select(null); };
    $("#edPhoto").onchange = async (e) => { for (const file of e.target.files) { const k = "ph_" + uid(); await store.setBlob(k, file); (f.photos = f.photos || []).push(k); } save(); renderThumbs(f); };
    renderThumbs(f);
    if (f.geom.type === "Point") terrain.elevationAt(f.geom.coords[0], f.geom.coords[1]).then((v) => { const e = $("#elevInfo"); if (e) e.textContent = v == null ? "elev n/a" : `elev ${(v * terrain.FT).toFixed(1)} ft`; });
    if (f.type === "stand") renderStandAnalysis(f, $("#standAnalysis"));
  }
  async function renderThumbs(f) {
    const el = $("#edThumbs");
    if (!el) return;
    el.innerHTML = "";
    for (const k of f.photos || []) {
      const b = await store.getBlob(k);
      if (!b) continue;
      const u = URL.createObjectURL(b), d = document.createElement("div");
      d.className = "t"; d.innerHTML = `<img src="${u}" alt="photo"><button title="Remove">✕</button>`;
      d.querySelector("img").onclick = () => window.open(u, "_blank");
      d.querySelector("button").onclick = async () => { await store.delBlob(k); f.photos = f.photos.filter((x) => x !== k); save(); renderThumbs(f); };
      el.appendChild(d);
    }
  }
  function toLocalInput(iso) {
    const d = iso ? new Date(iso) : new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function renderStandAnalysis(f, el) {
    const a = analysis.analyzeStand(f, S.features, S.model);
    const c = Object.entries(a.counts).map(([k, v]) => `<span class="pill">${TYPE[k].icon} ${v}</span>`).join("") || '<span class="muted small">no sign logged within 165 yd</span>';
    el.innerHTML = `
      <div class="card" style="background:#11140c">
        <div class="row"><span class="score">${a.score}</span><span class="muted small">/100 setup score</span></div>
        <div class="kv">
          <b>Sign nearby</b><span>${c}</span>
          <b>Bedding</b><span>${a.bed ? `${fmt.yd(a.bed.d)} ${geo.compass(geo.bearing(f.geom.coords, a.bed.pt))}` : "—"}</span>
          <b>Food</b><span>${a.food ? `${fmt.yd(a.food.d)} ${geo.compass(geo.bearing(f.geom.coords, a.food.pt))}` : "—"}</span>
          <b>Funnel / crossing</b><span>${a.pinch ? fmt.yd(a.pinch.d) : "—"}</span>
          <b>Predicted lane</b><span>${a.lane ? `${fmt.yd(a.lane.d)} (${esc(a.lane.path.from)} → ${esc(a.lane.path.to)})` : "run model in Deer Intel"}</span>
          <b>Access</b><span>${a.acc ? `${fmt.yd(a.acc.d)} from ${esc(a.acc.f.name || TYPE[a.acc.f.type].label)}` : "no parking/boat marked"}</span>
          <b>Good winds</b><span>${a.goodWinds.map((w) => `<span class="pill good">${w}</span>`).join("") || "—"}</span>
          <b>Bad winds</b><span>${a.badWinds.map((x) => `<span class="pill bad" title="blows scent toward ${x.why}">${x.w}</span>`).join("") || "—"}</span>
        </div>
        ${a.notes.map((n) => `<p class="small">${esc(n)}</p>`).join("")}
      </div>`;
  }

  // ================================================================== INTEL panel
  function renderIntel() {
    const p = $("#panel-intel");
    const C = conceptionDate();
    const huntPhase = analysis.phaseFor(parseDay("2026-12-18"), C);
    const start = parseDay("2026-11-15"), end = parseDay("2027-01-31"), span = end - start;
    const pos = (d) => Math.max(0, Math.min(100, ((d - start) / span) * 100));
    const segs = analysis.PHASES.map((ph) => {
      const a = new Date(C.getTime() + ph.from * 864e5), b = new Date(C.getTime() + (ph.to + 1) * 864e5);
      const l = pos(a), r = pos(b);
      return r > l ? `<div class="seg" style="position:absolute;left:${l}%;width:${r - l}%;background:${ph.color}" title="${ph.name}">${r - l > 9 ? ph.name.split(" ")[0] : ""}</div>` : "";
    }).join("");
    const center = map.getCenter();
    const sunRows = S.days.map((d) => {
      const r = astro.dayReport(msMidnight(d.date), center.lat, center.lng), ph = analysis.phaseFor(parseDay(d.date), C);
      return `<tr class="${d.kind}"><td>${d.dow} ${d.date.slice(8)}</td><td>${fmt.time(r.legalStart)}<br><span class="muted">${fmt.time(r.sunrise)}</span></td><td>${fmt.time(r.legalEnd)}<br><span class="muted">${fmt.time(r.sunset)}</span></td><td>${r.moonName.split(" ").pop()} ${Math.round(r.moonFraction * 100)}%<br><span class="muted">↑${fmt.time(r.moonrise)} ↓${fmt.time(r.moonset)}</span></td><td><span class="muted">${fmt.time(r.moonOverhead)}<br>${fmt.time(r.moonUnderfoot)}</span></td><td><span class="pill" style="border-color:${ph.color};color:${ph.color}">${ph.name.split(" ")[0]}</span></td></tr>`;
    }).join("");
    const stands = S.features.filter((f) => f.type === "stand");
    const ranked = stands.map((f) => ({ f, a: analysis.analyzeStand(f, S.features, S.model) })).sort((x, y) => y.a.score - x.a.score);
    const windMatrix = WINDS.map((w) => {
      const ok = ranked.filter((r) => analysis.windOk(r.f, r.a, w)).slice(0, 3);
      return `<tr><td><b>${w}</b></td><td>${ok.map((r) => `<a href="#" data-sel="${r.f.id}">${esc(r.f.name || "Stand")}</a> <span class="muted">(${r.a.score})</span>`).join(", ") || '<span class="muted">none — find a setup for this wind</span>'}</td></tr>`;
    }).join("");
    const m = S.model;
    p.innerHTML = `
      <h3>Rut timing — south Delta</h3>
      <div class="card">
        <div class="field"><span>Mean conception date for Issaquena/Warren (read it off the MDWFP breeding-date map)</span><input type="date" id="conc" value="${S.settings.conception}"></div>
        <div class="timeline">${segs}
          <div class="huntband" style="left:${pos(parseDay("2026-12-14"))}%;width:${pos(parseDay("2026-12-17")) - pos(parseDay("2026-12-14"))}%;background:rgba(156,204,101,.35);border-color:#9ccc65" title="Scouting"></div>
          <div class="huntband" style="left:${pos(parseDay("2026-12-17"))}%;width:${pos(parseDay("2026-12-21")) - pos(parseDay("2026-12-17"))}%" title="Hunt"></div>
          <div class="mark" style="left:${pos(C)}%"><span>conception</span></div>
        </div>
        <p><b>Your hunt (Dec 17–20) lands ${Math.abs(huntPhase.offset)} days ${huntPhase.offset < 0 ? "before" : "after"} mean conception → <span style="color:${huntPhase.color}">${huntPhase.name}</span>.</b></p>
        <ul class="small" style="padding-left:18px;margin:6px 0">${huntPhase.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <details><summary>How to read this</summary>
          <p class="small">MDWFP publishes a <i>mean conception</i> date, not "peak rut". Hunter-observed chasing usually peaks 1–2 weeks <i>before</i> mean conception. MDWFP herd-health data has Delta conception dates from about Dec 10 to Jan 2, with northern Delta counties earlier than southern ones. The default (Dec 27) is a placeholder. Enter the official date for your county and every phase, tip, and day badge updates.</p>
        </details>
      </div>

      <h3>Sun, legal light & moon</h3>
      <div class="card">
        <table class="tbl"><tr><th>Day</th><th>Legal start<br>sunrise</th><th>Legal end<br>sunset</th><th>Moon</th><th>Overhead<br>underfoot</th><th>Phase</th></tr>${sunRows}</table>
        <p class="muted small">Legal light uses ½ hr before sunrise / after sunset (Mississippi standard). Verify against the unit brochure. Times are for the current map center. Many Delta hunters watch moon overhead/underfoot for midday movement.</p>
      </div>

      <h3>Weather & wind</h3>
      <div class="card">
        <div class="btn-row"><button class="btn small accent" id="nws">Pull NWS hourly forecast</button><a class="btn small" href="https://forecast.weather.gov/MapClick.php?lat=${center.lat.toFixed(3)}&lon=${center.lng.toFixed(3)}" target="_blank" rel="noopener">NWS page ↗</a><a class="btn small" href="https://water.noaa.gov/gauges/vckm6" target="_blank" rel="noopener">Miss. River @ Vicksburg ↗</a></div>
        <div id="nwsOut" class="small muted">The NWS gives about 7 days of hourly forecast. It fills each plan day's AM/PM wind automatically from about Dec 10 on.</div>
        <p class="small">December in the Delta: S/SE winds ahead of a cold front, then a hard N/NW wind behind it. The <b>first 24–48 hrs after a front</b> (falling temps, rising pressure, N wind) is when to sit all day. Warm, humid, high-moon days are the time to hunt thick cover close to beds.</p>
      </div>

      <h3>Travel-corridor model</h3>
      <div class="card">
        <p class="small">Builds least-cost deer routes from each <b>Bedding</b> area to its nearest <b>Food</b>, plus bedding→bedding cruising lanes in rut mode. The cost surface favors high ground, your logged deer trails, rub lines, ridges, crossings, and cover. It penalizes low wet ground, water, roads, and ATV trails. Lanes that overlap become <b style="color:#e056fd">hotspots</b>: candidate funnels to check on foot.</p>
        <label class="row"><input type="checkbox" id="moRut" ${S.modelOpts.rut ? "checked" : ""}> Rut mode: add buck cruising lanes between bedding areas</label>
        <label class="row"><input type="checkbox" id="moFlood" ${S.modelOpts.useFlood ? "checked" : ""}> Treat ground below flood level (${S.terrain.floodFt.toFixed(1)} ft) as water</label>
        <div class="row"><span class="small muted">High-ground preference</span><input type="range" id="moLow" min="0" max="10" step="0.5" value="${S.modelOpts.lowWeight}"><span class="small">${S.modelOpts.lowWeight}</span></div>
        <div class="btn-row"><button class="btn accent small" id="runModel">Run model</button><button class="btn small" id="clearModel">Clear</button><button class="btn small" id="saveLanes" ${m ? "" : "disabled"}>Save lanes as features</button></div>
        <div id="modelOut" class="small">${m ? modelSummary(m) : '<span class="muted">Not run yet.</span>'}</div>
      </div>

      <h3>Stand rankings ${S.wind ? `· wind ${S.wind}` : ""}</h3>
      <div class="card">
        ${ranked.length ? `<table class="tbl"><tr><th>Stand</th><th>Score</th><th>Good winds</th><th>${S.wind || "Wind"}</th></tr>${ranked.map((r) => {
          const ok = analysis.windOk(r.f, r.a, S.wind);
          return `<tr><td><a href="#" data-sel="${r.f.id}">${esc(r.f.name || "Stand")}</a><br><span class="muted">${esc(r.f.status || "")}</span></td><td><b>${r.a.score}</b></td><td>${(r.f.manualWinds && r.f.manualWinds.length ? r.f.manualWinds : r.a.goodWinds).join(" ")}</td><td>${ok == null ? "—" : ok ? "✅" : "❌"}</td></tr>`;
        }).join("")}</table>` : '<p class="muted small">Mark a few 🎯 Stand / Setup spots to rank them.</p>'}
      </div>
      <h3>Best stands by wind</h3>
      <div class="card"><table class="tbl">${windMatrix}</table></div>

      <h3>Reading the Ten Point bottoms</h3>
      <div class="card small">
        <p><b>High ground is everything.</b> Low ground floods, so deer bed and travel on the subtle ridges between sloughs and brakes. Use micro-relief hillshade + relative elevation to find them.</p>
        <p><b>Slough & bayou crossings</b> are the natural funnels: beaver dams, downed logs, shallow necks, and the narrow ends of brakes. Mark every one you find.</p>
        <p><b>Edges</b>: deer travel transitions such as cutover against mature hardwood, cane against open timber, and reforestation against woods. Satellite views from different dates show these clearly.</p>
        <p><b>Acorns in December</b>: red-oak group (water, willow, Nuttall, cherrybark) and overcup drop late. Find the trees still dropping and you've found the does. In the rut, find the does and you find the bucks.</p>
        <p><b>Pressure</b>: 24 permit hunters share a unit. The best spots are often past where most hunters stop walking, or across water: check boat access across sloughs and bayous. Deer move away from ATV trails and roads once the gun hunts start.</p>
        <p><b>Doe bedding during lockdown</b>: thick regen, cutovers, and briar/cane patches on high ground. Sit the downwind edge and the pinch points between two of them.</p>
      </div>`;
    $("#conc").onchange = (e) => { S.settings.conception = e.target.value; save(); renderIntel(); };
    $$("[data-sel]", p).forEach((a) => (a.onclick = (e) => { e.preventDefault(); select(a.dataset.sel, { pan: true }); }));
    $("#nws").onclick = pullNWS;
    $("#moRut").onchange = (e) => { S.modelOpts.rut = e.target.checked; save(); };
    $("#moFlood").onchange = (e) => { S.modelOpts.useFlood = e.target.checked; save(); };
    $("#moLow").onchange = (e) => { S.modelOpts.lowWeight = +e.target.value; save(); renderIntel(); };
    $("#runModel").onclick = runModel;
    $("#clearModel").onclick = () => { S.model = null; save(); renderModel(); renderIntel(); };
    $("#saveLanes").onclick = () => {
      if (!S.model) return;
      S.model.paths.forEach((pa) => newFeature("trail", "LineString", pa.coords, { name: `Predicted: ${pa.from} → ${pa.to}`, notes: "Model-predicted lane — confirm with sign.", status: "" }));
      S.model.hotspots.forEach((h, i) => newFeature("target", "Point", h.coords, { name: `Hotspot ${i + 1}`, notes: `Model convergence of ${h.count} lanes — check for a funnel/crossing.`, status: "to check" }));
      renderFeatures(); toast("Lanes saved as Deer Trail lines and hotspots as Scout Targets.");
    };
  }
  function modelSummary(m) {
    return `<p>${m.paths.length} lanes · ${m.hotspots.length} hotspots · grid ${Math.round(m.stats.cellM)} m cells · ground ${m.stats.loFt.toFixed(1)}–${m.stats.hiFt.toFixed(1)} ft</p>
      <ul class="list">${m.paths.map((pa) => `<li><span class="ic">${pa.kind === "cruise" ? "💘" : "🌰"}</span><div class="grow">${esc(pa.from)} → ${esc(pa.to)}<div class="sub">${pa.kind === "cruise" ? "buck cruising lane" : "bed→feed lane"} · ${fmt.yd(pa.len)}</div></div></li>`).join("")}</ul>`;
  }
  async function runModel() {
    const out = $("#modelOut");
    out.innerHTML = '<span class="muted">Loading elevation & routing…</span>';
    try {
      const m = await analysis.modelCorridors(S.features, { ...S.modelOpts, floodFt: S.terrain.floodFt });
      S.model = m; save(); renderModel(); renderFeatures(); renderIntel();
      toast(`Model: ${m.paths.length} lanes, ${m.hotspots.length} hotspots`);
    } catch (e) { out.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`; }
  }
  function renderModel() {
    gModel.clearLayers();
    const m = S.model;
    if (!m) return;
    m.paths.forEach((pa) => {
      L.polyline(pa.coords, { color: "#000", weight: 7, opacity: 0.35, interactive: false }).addTo(gModel);
      L.polyline(pa.coords, { color: pa.kind === "cruise" ? "#e056fd" : "#ffb300", weight: 3.5, dashArray: "10 6", opacity: 0.95 })
        .bindTooltip(`${pa.kind === "cruise" ? "💘 Cruising lane" : "🌰 Bed→feed lane"}: ${esc(pa.from)} → ${esc(pa.to)} (${fmt.yd(pa.len)})`, { sticky: true }).addTo(gModel);
    });
    m.hotspots.forEach((h, i) => L.marker(h.coords, { icon: L.divIcon({ className: "", html: '<div class="hotspot"></div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindTooltip(`Hotspot ${i + 1}: ${h.count} lanes converge — likely funnel`).addTo(gModel));
  }

  // ---------- NWS
  const DIR16 = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  async function pullNWS() {
    const out = $("#nwsOut"), c = map.getCenter();
    out.textContent = "Contacting api.weather.gov…";
    try {
      const pt = await (await fetch(`https://api.weather.gov/points/${c.lat.toFixed(4)},${c.lng.toFixed(4)}`)).json();
      const fc = await (await fetch(pt.properties.forecastHourly)).json();
      const periods = fc.properties.periods;
      let filled = 0;
      const rows = [];
      S.days.forEach((d) => {
        const at = (h) => periods.find((p) => p.startTime.slice(0, 10) === d.date && +p.startTime.slice(11, 13) === h);
        const am = at(7), pm = at(15);
        const temps = periods.filter((p) => p.startTime.slice(0, 10) === d.date).map((p) => p.temperature);
        if (am || pm) {
          filled++;
          const to8 = (s) => geo.compass(DIR16[s] ?? 0);
          if (am) { d.forecast.am = to8(am.windDirection); d.forecast.amSpd = am.windSpeed; }
          if (pm) { d.forecast.pm = to8(pm.windDirection); d.forecast.pmSpd = pm.windSpeed; }
          if (temps.length) { d.forecast.hi = Math.max(...temps); d.forecast.lo = Math.min(...temps); }
          d.forecast.src = "NWS " + new Date().toLocaleDateString();
          rows.push(`<tr><td>${d.dow}</td><td>${d.forecast.am} ${esc(d.forecast.amSpd)}</td><td>${d.forecast.pm} ${esc(d.forecast.pmSpd)}</td><td>${d.forecast.lo}–${d.forecast.hi}°</td><td>${esc((am || pm).shortForecast)}</td></tr>`);
        }
      });
      save();
      out.innerHTML = filled ? `<table class="tbl"><tr><th></th><th>7 AM</th><th>3 PM</th><th>Temp</th><th></th></tr>${rows.join("")}</table>` :
        `Forecast reaches ${periods[periods.length - 1].startTime.slice(0, 10)} — your dates aren't in range yet. Try again within ~7 days of Dec 14.`;
    } catch (e) { out.textContent = "Couldn't reach the NWS API (offline or blocked). Enter winds manually on the Plan tab."; }
  }

  // ================================================================== PLAN panel
  function renderPlan() {
    const p = $("#panel-plan");
    const stands = S.features.filter((f) => f.type === "stand");
    const access = S.features.filter((f) => ["parking", "boat", "check"].includes(f.type));
    const hunters = S.settings.hunters.split(",").map((s) => s.trim()).filter(Boolean);
    const C = conceptionDate();
    p.innerHTML = `
      <div class="card small">Scout <b>Mon–Wed (Dec 14–16)</b>, hunt <b>Thu–Sun (Dec 17–20)</b>. Assign map features to a day from the editor (Plan day), and they show up here as stops. Hunters: <input type="text" id="hunters" value="${esc(S.settings.hunters)}" placeholder="Me, Dad" style="margin-top:4px"></div>
      ${S.days.map((d, di) => {
        const ph = analysis.phaseFor(parseDay(d.date), C), c = map.getCenter(), r = astro.dayReport(msMidnight(d.date), c.lat, c.lng);
        const stops = S.features.filter((f) => f.day === d.date);
        const fc = d.forecast;
        return `<div class="card daycard ${d.kind}" data-di="${di}">
          <div class="dh"><strong>${dayLabel(d.date)} · ${d.kind === "scout" ? "🔎 Scout" : "🎯 Hunt"}</strong><span class="pill" style="border-color:${ph.color};color:${ph.color}">${ph.name.split(" (")[0]}</span></div>
          <input type="text" class="dtitle" value="${esc(d.title)}" style="margin:6px 0">
          <div class="small muted">Legal ${fmt.time(r.legalStart)}–${fmt.time(r.legalEnd)} · ${r.moonName} ${Math.round(r.moonFraction * 100)}%</div>
          <div class="row" style="flex-wrap:wrap">
            <span class="small muted">AM wind</span><select class="fam" style="width:70px"><option value="">?</option>${WINDS.map((w) => `<option ${fc.am === w ? "selected" : ""}>${w}</option>`).join("")}</select>
            <span class="small muted">PM</span><select class="fpm" style="width:70px"><option value="">?</option>${WINDS.map((w) => `<option ${fc.pm === w ? "selected" : ""}>${w}</option>`).join("")}</select>
            <label class="small"><input type="checkbox" class="ffront" ${fc.front ? "checked" : ""}> cold front</label>
          </div>
          ${fc.src ? `<div class="small muted">${esc(fc.amSpd)} / ${esc(fc.pmSpd)} · ${fc.lo}–${fc.hi}°F · ${esc(fc.src)}</div>` : ""}
          ${d.kind === "hunt" ? `<h4>Sits</h4>${hunters.map((h) => {
            const s = d.sits[h] || {};
            const sel = (slot) => `<select class="sit" data-h="${esc(h)}" data-slot="${slot}"><option value="">${slot.toUpperCase()} stand…</option>${stands.map((st) => `<option value="${st.id}" ${s[slot] === st.id ? "selected" : ""}>${esc(st.name || "Stand")}</option>`).join("")}</select>`;
            const chk = (slot) => {
              const st = s[slot] && featById(s[slot]), w = slot === "am" ? fc.am : fc.pm;
              if (!st || !w) return "";
              const ok = analysis.windOk(st, analysis.analyzeStand(st, S.features, S.model), w);
              return ok ? `<span class="pill good">${w} ✓</span>` : `<span class="pill bad">${w} ✗ bad wind</span>`;
            };
            return `<div class="small" style="margin-top:4px"><b>${esc(h)}</b></div><div class="sits"><div>${sel("am")}${chk("am")}</div><div>${sel("pm")}${chk("pm")}</div></div>`;
          }).join("")}` : ""}
          <h4>${d.kind === "scout" ? "Stops for this day" : "Linked features"} (${stops.length})</h4>
          ${stops.length ? `<ul class="list">${stops.map((f) => `<li data-sel="${f.id}"><span class="ic">${TYPE[f.type].icon}</span><div class="grow">${esc(f.name || TYPE[f.type].label)}<div class="sub">${esc(f.status || TYPE[f.type].label)}</div></div></li>`).join("")}</ul>` : '<p class="muted small">None yet. Select a marker → set "Plan day".</p>'}
          ${d.kind === "scout" ? `<div class="row"><select class="rstart"><option value="">Start from…</option>${access.map((a) => `<option value="${a.id}" ${d.routeStart === a.id ? "selected" : ""}>${TYPE[a.type].icon} ${esc(a.name || TYPE[a.type].label)}</option>`).join("")}</select><button class="btn small route">Plan route</button></div><div class="small routeOut"></div>` : ""}
          <h4>Tasks</h4>
          ${d.tasks.map((t) => `<div class="check ${t.done ? "done" : ""}" data-t="${t.id}"><input type="checkbox" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span><button class="x" title="Remove">✕</button></div>`).join("")}
          <div class="row"><input type="text" class="newtask" placeholder="Add task…"><button class="btn small addtask">Add</button></div>
          <textarea class="dnotes" placeholder="Day notes / debrief…">${esc(d.notes)}</textarea>
        </div>`;
      }).join("")}
      <h3>Gear & regs checklist</h3>
      <div class="card" id="gear">${S.gear.map((t) => `<div class="check ${t.done ? "done" : ""}" data-g="${t.id}"><input type="checkbox" ${t.done ? "checked" : ""}><span>${esc(t.text)}</span><button class="x">✕</button></div>`).join("")}
        <div class="row"><input type="text" id="newGear" placeholder="Add item…"><button class="btn small" id="addGear">Add</button></div></div>`;
    $("#hunters").onchange = (e) => { S.settings.hunters = e.target.value; save(); renderPlan(); };
    $$(".daycard", p).forEach((card) => {
      const d = S.days[+card.dataset.di];
      $(".dtitle", card).oninput = (e) => { d.title = e.target.value; save(); };
      $(".fam", card).onchange = (e) => { d.forecast.am = e.target.value; save(); renderPlan(); };
      $(".fpm", card).onchange = (e) => { d.forecast.pm = e.target.value; save(); renderPlan(); };
      $(".ffront", card).onchange = (e) => { d.forecast.front = e.target.checked; save(); };
      $(".dnotes", card).oninput = (e) => { d.notes = e.target.value; save(); };
      $$(".sit", card).forEach((s) => (s.onchange = () => { d.sits[s.dataset.h] = d.sits[s.dataset.h] || {}; d.sits[s.dataset.h][s.dataset.slot] = s.value; save(); renderPlan(); }));
      $$("[data-t]", card).forEach((row) => {
        const t = d.tasks.find((x) => x.id === row.dataset.t);
        $("input", row).onchange = (e) => { t.done = e.target.checked; save(); row.classList.toggle("done", t.done); };
        $(".x", row).onclick = () => { d.tasks = d.tasks.filter((x) => x !== t); save(); renderPlan(); };
      });
      const add = () => { const v = $(".newtask", card).value.trim(); if (!v) return; d.tasks.push({ id: uid(), text: v, done: false }); save(); renderPlan(); };
      $(".addtask", card).onclick = add;
      $(".newtask", card).onkeydown = (e) => { if (e.key === "Enter") add(); };
      $$("[data-sel]", card).forEach((li) => (li.onclick = () => select(li.dataset.sel, { pan: true })));
      if ($(".route", card)) {
        $(".rstart", card).onchange = (e) => { d.routeStart = e.target.value; save(); };
        $(".route", card).onclick = () => planRoute(d, $(".routeOut", card));
      }
    });
    $$("[data-g]", p).forEach((row) => {
      const t = S.gear.find((x) => x.id === row.dataset.g);
      $("input", row).onchange = (e) => { t.done = e.target.checked; save(); row.classList.toggle("done", t.done); };
      $(".x", row).onclick = () => { S.gear = S.gear.filter((x) => x !== t); save(); renderPlan(); };
    });
    $("#addGear").onclick = () => { const v = $("#newGear").value.trim(); if (v) { S.gear.push({ id: uid(), text: v, done: false }); save(); renderPlan(); } };
  }
  function planRoute(d, out) {
    const stops = S.features.filter((f) => f.day === d.date && f.geom.type === "Point" && !["parking", "boat", "check"].includes(f.type));
    const startF = d.routeStart && featById(d.routeStart);
    if (!stops.length) { out.textContent = "Assign some point features (targets, stands, sign to re-check) to this day first."; return; }
    const r = analysis.orderRoute(startF ? startF.geom.coords : null, stops);
    gRoute.clearLayers();
    const pts = (startF ? [startF.geom.coords] : []).concat(r.order.map((f) => f.geom.coords)).concat(startF ? [startF.geom.coords] : []);
    L.polyline(pts, { color: "#00e5ff", weight: 3, dashArray: "2 8", opacity: 0.95 }).addTo(gRoute);
    r.order.forEach((f, i) => L.marker(f.geom.coords, { icon: L.divIcon({ className: "", html: `<div style="background:#00e5ff;color:#000;border-radius:50%;width:18px;height:18px;font-size:11px;font-weight:700;text-align:center;line-height:18px;transform:translate(12px,-12px)">${i + 1}</div>`, iconSize: [18, 18] }), interactive: false }).addTo(gRoute));
    map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
    const walkMin = (r.total * 1.3) / 0.6 / 60; // 1.3 tortuosity factor, ~1.35 mph through bottoms
    const stopMin = r.order.length * 15;
    out.innerHTML = `<p>Route ${fmt.yd(r.total)} straight-line (${startF ? "round trip" : "one way"}) · ≈ ${Math.round((walkMin + stopMin) / 60 * 10) / 10} hrs incl. 15 min/stop.</p><ol style="padding-left:18px;margin:4px 0">${r.order.map((f, i) => `<li>${TYPE[f.type].icon} ${esc(f.name || TYPE[f.type].label)} <span class="muted">+${fmt.yd(r.legs[i])}</span></li>`).join("")}</ol><button class="btn small" id="clrRoute">Clear route</button>`;
    $("#clrRoute", out).onclick = () => { gRoute.clearLayers(); out.innerHTML = ""; };
  }

  // ================================================================== LOG panel
  let logFilter = { type: "", day: "" };
  function renderLog() {
    const p = $("#panel-log");
    const signs = S.features.filter((f) => TYPE[f.type].sign || ["camera", "note", "target"].includes(f.type));
    const cnt = (t) => S.features.filter((f) => f.type === t).length;
    let list = signs.filter((f) => (!logFilter.type || f.type === logFilter.type) && (!logFilter.day || (f.created || "").slice(0, 10) === logFilter.day || f.day === logFilter.day));
    list.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
    p.innerHTML = `
      <h3>Sign summary</h3>
      <div class="stat-grid">
        <div><b>${cnt("rub") + cnt("rubline")}</b>rubs</div><div><b>${cnt("scrape")}</b>scrapes</div><div><b>${cnt("tracks") + cnt("trail")}</b>tracks/trails</div><div><b>${cnt("sighting") + cnt("buck")}</b>sightings</div>
        <div><b>${cnt("bedding") + cnt("bed")}</b>bedding</div><div><b>${cnt("food")}</b>food</div><div><b>${cnt("stand")}</b>stands</div><div><b>${cnt("crossing") + cnt("funnel")}</b>funnels</div>
      </div>
      <div class="btn-row" style="margin-top:8px"><button class="btn small ${map.hasLayer(gHeat) ? "on" : ""}" id="heatT">🔥 Sign density heat</button><button class="btn small accent" id="openField">📍 Field Log</button></div>
      <h3>Entries</h3>
      <div class="row"><select id="fType"><option value="">All types</option>${TYPES.filter((t) => t.sign || ["camera", "note", "target"].includes(t.id)).map((t) => `<option value="${t.id}" ${logFilter.type === t.id ? "selected" : ""}>${t.icon} ${t.label}</option>`).join("")}</select>
      <select id="fDay"><option value="">All days</option>${S.days.map((d) => `<option value="${d.date}" ${logFilter.day === d.date ? "selected" : ""}>${d.dow} ${d.date.slice(5)}</option>`).join("")}</select></div>
      <ul class="list">${list.map((f) => `<li data-sel="${f.id}"><span class="ic">${TYPE[f.type].icon}</span><div class="grow">${esc(f.name || TYPE[f.type].label)} ${f.status ? `<span class="pill">${esc(f.status)}</span>` : ""}${(f.photos || []).length ? " 📷" : ""}<div class="sub">${f.created ? new Date(f.created).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}${f.notes ? " · " + esc(f.notes.slice(0, 80)) : ""}</div></div></li>`).join("") || '<p class="muted small">No entries yet. Use the Field Log button while you scout.</p>'}</ul>`;
    $("#fType").onchange = (e) => { logFilter.type = e.target.value; renderLog(); };
    $("#fDay").onchange = (e) => { logFilter.day = e.target.value; renderLog(); };
    $("#heatT").onclick = () => { map.hasLayer(gHeat) ? map.removeLayer(gHeat) : (renderHeat(), gHeat.addTo(map)); renderLog(); };
    $("#openField").onclick = openField;
    $$("[data-sel]", p).forEach((li) => (li.onclick = () => select(li.dataset.sel, { pan: true })));
  }
  function renderHeat() {
    gHeat.clearLayers();
    const W = { rub: 1, scrape: 1.4, tracks: 0.6, bed: 1, droppings: 0.5, sighting: 1, buck: 1.6 };
    S.features.forEach((f) => {
      const w = W[f.type];
      if (w && f.geom.type === "Point") {
        L.circle(f.geom.coords, { radius: 90, stroke: false, fillColor: "#ff3d00", fillOpacity: 0.12 * w, interactive: false }).addTo(gHeat);
        L.circle(f.geom.coords, { radius: 40, stroke: false, fillColor: "#ffea00", fillOpacity: 0.15 * w, interactive: false }).addTo(gHeat);
      }
    });
  }

  // ================================================================== Field mode
  let gps = null, gpsWatch = null;
  function startGPS(pan) {
    if (!navigator.geolocation) return toast("No GPS available in this browser.");
    if (gpsWatch == null) {
      gpsWatch = navigator.geolocation.watchPosition((pos) => {
        gps = pos;
        const ll = [pos.coords.latitude, pos.coords.longitude];
        gMe.clearLayers();
        L.circle(ll, { radius: pos.coords.accuracy, color: "#2196f3", weight: 1, fillOpacity: 0.1, interactive: false }).addTo(gMe);
        L.circleMarker(ll, { radius: 7, color: "#fff", weight: 2, fillColor: "#2196f3", fillOpacity: 1 }).addTo(gMe);
        const st = $("#gpsStatus"); if (st) st.textContent = `GPS ±${Math.round(pos.coords.accuracy * 1.09)} yd`;
        if (pan && pan !== "done") { map.setView(ll, Math.max(map.getZoom(), 16)); pan = "done"; }
      }, (err) => { const st = $("#gpsStatus"); if (st) st.textContent = "GPS error: " + err.message; toast("GPS: " + err.message); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    } else if (gps && pan) map.setView([gps.coords.latitude, gps.coords.longitude], Math.max(map.getZoom(), 16));
  }
  function openField() {
    $("#fieldModal").classList.remove("hidden");
    startGPS(false);
    const quick = ["rub", "scrape", "tracks", "bed", "droppings", "sighting", "buck", "trail", "crossing", "funnel", "camera", "stand", "target", "parking", "note"];
    $("#fieldGrid").innerHTML = quick.map((t) => `<button data-q="${t}"><span class="ic">${TYPE[t].icon}</span>${TYPE[t].label}</button>`).join("");
    $$("[data-q]", $("#fieldGrid")).forEach((b) => (b.onclick = async () => {
      const ll = gps ? [gps.coords.latitude, gps.coords.longitude] : [map.getCenter().lat, map.getCenter().lng];
      const type = b.dataset.q;
      const gtype = TYPE[type].geom === "point" ? "Point" : "LineString";
      const coords = gtype === "Point" ? ll : [ll, geo.dest(ll, 0, 15)];
      const f = newFeature(type, gtype, coords, { notes: $("#fieldNote").value.trim() + (gps ? "" : " [no GPS fix — placed at map center]") });
      const file = $("#fieldPhoto").files[0];
      if (file) { const k = "ph_" + uid(); await store.setBlob(k, file); f.photos.push(k); save(); }
      $("#fieldNote").value = ""; $("#fieldPhoto").value = "";
      renderFeatures();
      toast(`${TYPE[type].icon} ${TYPE[type].label} logged${gps ? ` (±${Math.round(gps.coords.accuracy * 1.09)} yd)` : " at map center"}`);
    }));
  }
  $("#fieldModeBtn").onclick = openField;
  $("#fieldClose").onclick = () => $("#fieldModal").classList.add("hidden");

  // ================================================================== DATA panel
  function renderData() {
    const p = $("#panel-data");
    const online = location.protocol.startsWith("http");
    p.innerHTML = `
      <h3>Import</h3>
      <div class="card">
        <label class="btn accent file-btn">📂 Import files<input type="file" id="impFile" multiple accept=".kml,.kmz,.gpx,.geojson,.json,image/*" hidden></label>
        <p class="small">• <b>onX</b>: export waypoints/tracks/areas as <b>KML</b> or <b>GPX</b> (onX Web Map → My Content → select → Export). KMZ and GeoJSON also work.<br>
        • <b>Images</b> (PNG/JPG screenshots of onX satellite/topo/hybrid) become draggable map overlays.<br>
        • <b>.json</b> backups from this app restore everything.</p>
        <div id="impOut" class="small muted"></div>
      </div>
      <h3>Export (send to onX / your hunting partner)</h3>
      <div class="card">
        <div class="field"><span>What</span><select id="expWhat"><option value="all">Everything I've marked (${S.features.length})</option><option value="plan">Plan only: stands, routes, targets, access</option><option value="sign">Sign only</option></select></div>
        <div class="btn-row"><button class="btn small" data-x="kml">KML (onX, Google Earth)</button><button class="btn small" data-x="gpx">GPX (onX, GPS units)</button><button class="btn small" data-x="geojson">GeoJSON</button></div>
        <p class="muted small">Import the KML into onX (Web Map → Import) so your stands, routes, and hotspots are on your phone with onX's offline maps in the woods.</p>
        <hr style="border-color:var(--line)">
        <div class="btn-row"><button class="btn small accent" id="backup">💾 Full backup (.json incl. photos)</button></div>
      </div>
      <h3>Offline maps</h3>
      <div class="card">
        <p class="small">Saves the current view's tiles (active base map + elevation) to the browser cache for spotty Delta cell service. ${online ? "" : "<b style='color:var(--warn)'>Only works when the app is served over http(s), not opened as a file.</b>"}</p>
        <div class="row"><span class="small muted">Zoom levels</span><select id="offZ"><option value="2">current +2</option><option value="3" selected>current +3</option><option value="4">current +4</option></select></div>
        <div class="btn-row"><button class="btn small" id="cacheBtn" ${online ? "" : "disabled"}>⬇️ Cache this view</button></div>
        <div class="progress"><div id="cacheProg"></div></div><div class="small muted" id="cacheOut"></div>
      </div>
      <h3>Settings</h3>
      <div class="card">
        <div class="btn-row"><button class="btn small" id="setHome">⌂ Set home view to current map</button>${S.settings.homeSet ? '<span class="pill good">home locked</span>' : '<span class="pill warn">home not set (default is approximate)</span>'}</div>
        <p class="muted small">The default center is an approximation of Phil Bryant WMA near Hwy 465 / Steele Bayou. Import your onX boundary or zoom to your unit, then lock it.</p>
        <div class="btn-row"><button class="btn small danger" id="resetPlan">Reset plan days</button><button class="btn small danger" id="resetAll">Erase everything</button></div>
      </div>
      <h3>Sources & reminders</h3>
      <div class="card small">
        <p>Verify all rules in the current <b>Phil Bryant – Ten Point</b> brochure from MDWFP: permit-only deer hunts, permit cards at the west Ten Point check station on Hwy 465, ATVs/UTVs on designated trails only for hunting/fishing access, plus stand, flagging, and camera rules and river-stage closures.</p>
        <p class="muted">Elevation: AWS Terrain Tiles (USGS 3DEP and others). Imagery: Esri, USGS NAIP. Forecast: NWS. Rut model: MDWFP mean conception date (you enter it).</p>
      </div>`;
    $("#impFile").onchange = (e) => importFiles([...e.target.files]).finally(() => (e.target.value = ""));
    $$("[data-x]", p).forEach((b) => (b.onclick = () => doExport(b.dataset.x)));
    $("#backup").onclick = backup;
    $("#cacheBtn").onclick = cacheView;
    $("#setHome").onclick = () => { S.settings.center = [map.getCenter().lat, map.getCenter().lng]; S.settings.zoom = map.getZoom(); S.settings.homeSet = true; save(); renderData(); toast("Home view locked."); };
    $("#resetPlan").onclick = () => { if (confirm("Reset all 7 plan days to the default templates?")) { S.days = buildDays(); save(); toast("Plan reset."); } };
    $("#resetAll").onclick = async () => { if (!confirm("Erase ALL features, imports, overlays, photos and plans? (Make a backup first!)")) return; const keys = await store.allBlobKeys(); for (const k of keys || []) await store.delBlob(k); S = DEFAULT_STATE(); save(); location.reload(); };
  }
  async function importFiles(files) {
    const out = $("#impOut"), msgs = [];
    for (const file of files) {
      try {
        if (file.type.startsWith("image/")) { await addOverlay(file); msgs.push(`🖼️ ${file.name}: overlay added. Align it on the map`); continue; }
        const r = await io.readGeoFile(file);
        if (r.backup) { await restore(r.backup); msgs.push(`💾 Restored backup ${file.name}`); continue; }
        const n = r.geojson.features.length;
        const colors = ["#ffeb3b", "#00e5ff", "#ff4081", "#76ff03", "#ff9100", "#e040fb"];
        const imp = { id: uid(), name: r.name, geojson: r.geojson, color: colors[S.imports.length % colors.length], visible: true };
        S.imports.push(imp); save(); renderImportsOnMap();
        const l = importLayers.get(imp.id);
        if (l && l.getBounds().isValid()) map.fitBounds(l.getBounds(), { padding: [20, 20] });
        msgs.push(`✅ ${file.name}: ${n} features. See Layers → Imported (use Convert to make them editable)`);
      } catch (e) { msgs.push(`❌ ${file.name}: ${e.message}`); }
    }
    if (out) out.innerHTML = msgs.map(esc).join("<br>");
    toast(msgs[msgs.length - 1] || "Nothing imported");
  }
  function exportSet(what) {
    if (what === "plan") return S.features.filter((f) => ["Plan", "Access"].includes(TYPE[f.type].group) || ["funnel", "crossing"].includes(f.type));
    if (what === "sign") return S.features.filter((f) => TYPE[f.type].sign);
    return S.features;
  }
  function doExport(kind) {
    const fs = exportSet($("#expWhat").value);
    if (!fs.length) return toast("Nothing to export yet.");
    const base = `ten-point-${new Date().toISOString().slice(0, 10)}`;
    if (kind === "kml") io.download(base + ".kml", io.toKML(fs, "WMA Scout – Ten Point"), "application/vnd.google-earth.kml+xml");
    if (kind === "gpx") io.download(base + ".gpx", io.toGPX(fs), "application/gpx+xml");
    if (kind === "geojson") io.download(base + ".geojson", JSON.stringify(io.toGeoJSONFC(fs), null, 1), "application/geo+json");
  }
  async function backup() {
    const keys = (await store.allBlobKeys()) || [];
    const blobs = {};
    for (const k of keys) { const b = await store.getBlob(k); if (b) blobs[k] = await io.blobToDataURL(b); }
    io.download(`wma-scout-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ wmaScoutBackup: 1, saved: new Date().toISOString(), state: S, blobs }), "application/json");
  }
  async function restore(b) {
    if (!confirm("Restore this backup? It replaces everything currently in the app.")) return;
    for (const [k, v] of Object.entries(b.blobs || {})) await store.setBlob(k, await io.dataURLToBlob(v));
    S = Object.assign(DEFAULT_STATE(), b.state);
    await store.set("state", JSON.parse(JSON.stringify(S)));
    location.reload();
  }
  async function cacheView() {
    const zAdd = +$("#offZ").value, z0 = map.getZoom(), b = map.getBounds();
    const base = BASEMAPS[S.settings.basemap];
    const urls = [];
    for (let z = Math.max(10, z0 - 1); z <= Math.min(19, z0 + zAdd); z++) {
      const x0 = Math.floor(terrain.lng2x(b.getWest(), z)), x1 = Math.floor(terrain.lng2x(b.getEast(), z));
      const y0 = Math.floor(terrain.lat2y(b.getNorth(), z)), y1 = Math.floor(terrain.lat2y(b.getSouth(), z));
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        if (z <= base.max) urls.push(base.url.replace("{s}", "a").replace("{z}", z).replace("{x}", x).replace("{y}", y));
        if (z <= 15) urls.push(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
      }
    }
    if (urls.length > 6000 && !confirm(`${urls.length} tiles is a lot (~${Math.round(urls.length * 0.02)} MB). Continue?`)) return;
    const prog = $("#cacheProg"), out = $("#cacheOut");
    let done = 0, fail = 0;
    const q = urls.slice();
    const worker = async () => {
      while (q.length) {
        const u = q.shift();
        try { await fetch(u, { mode: u.includes("elevation-tiles") ? "cors" : "no-cors" }); } catch (e) { fail++; }
        done++;
        if (done % 10 === 0 || done === urls.length) { prog.style.width = `${(done / urls.length) * 100}%`; out.textContent = `${done}/${urls.length} tiles${fail ? ` · ${fail} failed` : ""}`; }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    out.textContent = `Cached ${done - fail} tiles${fail ? ` (${fail} failed)` : ""}. They'll load from cache when you're offline.`;
  }

  // ================================================================== boot
  renderImportsOnMap();
  await renderOverlaysOnMap();
  renderFeatures();
  renderModel();
  renderLayers();
  if (window.innerWidth < 760) $("#sidebar").classList.add("collapsed");
  setTimeout(() => map.invalidateSize(), 100);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (!S.features.length && !S.imports.length) setTimeout(() => toast("Start on the Data tab: import your onX KML/GPX, or add screenshots as overlays.", 5000), 800);
  window.WSApp = { S: () => S, map, select, renderIntel, runModel };
})();
