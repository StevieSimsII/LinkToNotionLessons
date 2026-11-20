/* Import (onX KML/KMZ/GPX, GeoJSON, backups) and export (GPX/KML for onX, GeoJSON, full backup). */
(function () {
  "use strict";
  const { TYPE, uid, esc } = window.WS;

  async function readGeoFile(file) {
    const name = file.name.replace(/\.[^.]+$/, "");
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const parseXml = (txt) => new DOMParser().parseFromString(txt, "text/xml");
    if (ext === "kml") return { name, geojson: toGeoJSON.kml(parseXml(await file.text())) };
    if (ext === "gpx") return { name, geojson: toGeoJSON.gpx(parseXml(await file.text())) };
    if (ext === "kmz") {
      const zip = await JSZip.loadAsync(file);
      const kmlName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".kml"));
      if (!kmlName) throw new Error("No .kml inside this KMZ.");
      return { name, geojson: toGeoJSON.kml(parseXml(await zip.file(kmlName).async("string"))) };
    }
    if (ext === "json" || ext === "geojson") {
      const j = JSON.parse(await file.text());
      if (j && j.wmaScoutBackup) return { name, backup: j };
      if (j.type === "FeatureCollection") return { name, geojson: j };
      if (j.type === "Feature") return { name, geojson: { type: "FeatureCollection", features: [j] } };
      throw new Error("JSON isn't GeoJSON or a WMA Scout backup.");
    }
    throw new Error(`Unsupported file type .${ext}`);
  }

  // Guess one of our types from an imported feature's name/description + geometry.
  const RULES = [
    [/scrape/i, "scrape"], [/rub ?line/i, "rubline"], [/\brub/i, "rub"], [/track/i, "tracks"], [/\bbed(s|ding)?\b/i, "bedding"],
    [/stand|blind|ladder|climb|set ?up|lock ?on/i, "stand"], [/cam(era)?\b|cell ?cam/i, "camera"], [/buck/i, "buck"], [/deer|doe/i, "sighting"],
    [/park|gate/i, "parking"], [/boat|ramp|launch/i, "boat"], [/check ?station/i, "check"], [/atv|utv|4 ?wheel/i, "atv"],
    [/levee|road|hwy|highway/i, "road"], [/crossing|ford/i, "crossing"], [/funnel|pinch|saddle/i, "funnel"],
    [/acorn|oak|food|plot|field|beans|corn|wheat|clover/i, "food"], [/thicket|cutover|briar|cane|regen/i, "thicket"],
    [/slough|lake|pond|bayou|brake|water/i, "water"], [/ridge|high ground|bench/i, "ridge"], [/entry|in route|walk in/i, "entry"],
    [/exit|out route/i, "exit"], [/trail/i, "foot"],
  ];
  function guessType(props, gtype) {
    const txt = `${props.name || ""} ${props.description || ""} ${props.desc || ""} ${props.sym || ""}`;
    const want = gtype === "Point" ? "point" : gtype === "Polygon" ? "area" : "line";
    for (const [re, t] of RULES) if (re.test(txt) && TYPE[t].geom === want) return t;
    return want === "point" ? "note" : want === "area" ? "zone" : "path";
  }
  // GeoJSON feature -> our feature(s)
  function fromGeoJSON(gf) {
    const out = [];
    const g = gf.geometry;
    if (!g) return out;
    const props = gf.properties || {};
    const push = (type, coords) => {
      const t = guessType(props, type);
      out.push({ id: uid(), type: t, name: props.name || "", notes: stripHtml(props.description || props.desc || ""),
        created: props.time || new Date().toISOString(), geom: { type, coords }, imported: true });
    };
    const ll = (c) => [c[1], c[0]];
    if (g.type === "Point") push("Point", ll(g.coordinates));
    else if (g.type === "MultiPoint") g.coordinates.forEach((c) => push("Point", ll(c)));
    else if (g.type === "LineString") push("LineString", g.coordinates.map(ll));
    else if (g.type === "MultiLineString") g.coordinates.forEach((l) => push("LineString", l.map(ll)));
    else if (g.type === "Polygon") push("Polygon", g.coordinates[0].slice(0, -1).map(ll));
    else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => push("Polygon", p[0].slice(0, -1).map(ll)));
    else if (g.type === "GeometryCollection") g.geometries.forEach((gg) => out.push(...fromGeoJSON({ geometry: gg, properties: props })));
    return out;
  }
  function stripHtml(s) {
    const d = document.createElement("div"); d.innerHTML = String(s); return (d.textContent || "").trim();
  }

  // ------------------------------------------------------------------ export
  function toGeoJSONFC(features) {
    return {
      type: "FeatureCollection",
      features: features.map((f) => {
        const lnglat = (p) => [p[1], p[0]];
        let geometry;
        if (f.geom.type === "Point") geometry = { type: "Point", coordinates: lnglat(f.geom.coords) };
        else if (f.geom.type === "LineString") geometry = { type: "LineString", coordinates: f.geom.coords.map(lnglat) };
        else geometry = { type: "Polygon", coordinates: [f.geom.coords.concat([f.geom.coords[0]]).map(lnglat)] };
        return { type: "Feature", geometry, properties: { name: f.name, type: f.type, typeLabel: TYPE[f.type].label, notes: f.notes, day: f.day, created: f.created, status: f.status, stroke: TYPE[f.type].color } };
      }),
    };
  }
  const label = (f) => `${TYPE[f.type].label}${f.name ? ": " + f.name : ""}`;
  function toGPX(features) {
    const wpts = features.filter((f) => f.geom.type === "Point").map((f) =>
      `  <wpt lat="${f.geom.coords[0]}" lon="${f.geom.coords[1]}"><name>${esc(label(f))}</name><desc>${esc(f.notes || "")}</desc><type>${esc(TYPE[f.type].label)}</type></wpt>`);
    const trks = features.filter((f) => f.geom.type !== "Point").map((f) => {
      const pts = f.geom.type === "Polygon" ? f.geom.coords.concat([f.geom.coords[0]]) : f.geom.coords;
      return `  <trk><name>${esc(label(f))}</name><desc>${esc(f.notes || "")}</desc><trkseg>${pts.map((p) => `<trkpt lat="${p[0]}" lon="${p[1]}"/>`).join("")}</trkseg></trk>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="WMA Scout" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts.concat(trks).join("\n")}\n</gpx>\n`;
  }
  function kmlColor(hex, alpha) { // #rrggbb -> aabbggrr
    const h = hex.replace("#", "");
    return alpha + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  }
  function toKML(features, docName) {
    const types = [...new Set(features.map((f) => f.type))];
    const styles = types.map((t) => `<Style id="s_${t}"><IconStyle><color>${kmlColor(TYPE[t].color, "ff")}</color></IconStyle><LineStyle><color>${kmlColor(TYPE[t].color, "ff")}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor(TYPE[t].color, "55")}</color></PolyStyle></Style>`).join("\n");
    const c = (p) => `${p[1]},${p[0]},0`;
    const pms = features.map((f) => {
      let g;
      if (f.geom.type === "Point") g = `<Point><coordinates>${c(f.geom.coords)}</coordinates></Point>`;
      else if (f.geom.type === "LineString") g = `<LineString><tessellate>1</tessellate><coordinates>${f.geom.coords.map(c).join(" ")}</coordinates></LineString>`;
      else g = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${f.geom.coords.concat([f.geom.coords[0]]).map(c).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      return `<Placemark><name>${esc(label(f))}</name><description>${esc(f.notes || "")}</description><styleUrl>#s_${f.type}</styleUrl>${g}</Placemark>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(docName)}</name>\n${styles}\n${pms}\n</Document></kml>\n`;
  }

  function download(name, text, mime) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: mime || "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  const dataURLToBlob = async (d) => (await fetch(d)).blob();

  window.WS = Object.assign(window.WS || {}, { io: { readGeoFile, fromGeoJSON, guessType, toGeoJSONFC, toGPX, toKML, download, blobToDataURL, dataURLToBlob } });
})();
