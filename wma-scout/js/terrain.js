/* Terrain engine: decodes free AWS Terrain Tiles (Terrarium PNG, meters) into elevation grids,
   renders relative-elevation / micro-relief hillshade / flood-level layers, and runs least-cost
   deer-travel paths. Delta bottoms are flat; a 2–4 ft rise is what matters, so everything here
   is stretched to the local range rather than absolute elevation. */
(function () {
  "use strict";
  const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const NATIVE_Z = 15;
  const FT = 3.28084;
  const cache = new Map(); // key -> Promise<Float32Array|null>

  const lng2x = (lng, z) => ((lng + 180) / 360) * 2 ** z;
  const lat2y = (lat, z) => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
  };
  const x2lng = (x, z) => (x / 2 ** z) * 360 - 180;
  const y2lat = (y, z) => {
    const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  let scratch = null;
  function decode(bitmap) {
    if (!scratch) { scratch = document.createElement("canvas"); scratch.width = scratch.height = 256; }
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, 256, 256);
    ctx.drawImage(bitmap, 0, 0, 256, 256);
    const px = ctx.getImageData(0, 0, 256, 256).data;
    const out = new Float32Array(256 * 256);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;
    return out;
  }
  function nativeTile(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (cache.has(key)) return cache.get(key);
    const p = fetch(TILE_URL(z, x, y), { mode: "cors" })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b) : null))
      .then((bm) => (bm ? decode(bm) : null))
      .catch(() => null);
    cache.set(key, p);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
    p.then((v) => { if (!v) cache.delete(key); });
    return p;
  }
  // elevation array (meters, 256x256) for any zoom; > native is bilinear-upsampled
  async function tileElev(z, x, y) {
    if (z <= NATIVE_Z) return nativeTile(z, x, y);
    const f = 2 ** (z - NATIVE_Z), px = Math.floor(x / f), py = Math.floor(y / f);
    const src = await nativeTile(NATIVE_Z, px, py);
    if (!src) return null;
    const ox = (x - px * f) * (256 / f), oy = (y - py * f) * (256 / f), s = 1 / f;
    const out = new Float32Array(65536);
    for (let j = 0; j < 256; j++) {
      const sy = Math.min(254.999, oy + j * s), y0 = Math.floor(sy), ty = sy - y0;
      for (let i = 0; i < 256; i++) {
        const sx = Math.min(254.999, ox + i * s), x0 = Math.floor(sx), tx = sx - x0, k = y0 * 256 + x0;
        out[j * 256 + i] = (src[k] * (1 - tx) + src[k + 1] * tx) * (1 - ty) + (src[k + 256] * (1 - tx) + src[k + 257] * tx) * ty;
      }
    }
    return out;
  }

  async function elevationAt(lat, lng) {
    const z = NATIVE_Z, fx = lng2x(lng, z), fy = lat2y(lat, z);
    const t = await nativeTile(z, Math.floor(fx), Math.floor(fy));
    if (!t) return null;
    const i = Math.min(255, Math.floor((fx % 1) * 256)), j = Math.min(255, Math.floor((fy % 1) * 256));
    return t[j * 256 + i];
  }

  // ------------------------------------------------------------- render settings
  const settings = { lo: 80, hi: 100, flood: 85, exag: 12, ramp: "delta" };
  const RAMP = [
    [0.0, [20, 40, 120]], [0.18, [30, 110, 190]], [0.35, [40, 170, 170]], [0.5, [90, 190, 90]],
    [0.65, [210, 210, 70]], [0.8, [235, 150, 40]], [0.92, [220, 70, 40]], [1.0, [255, 235, 230]],
  ];
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i][0]) {
        const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i], u = (t - t0) / (t1 - t0);
        return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u, c0[2] + (c1[2] - c0[2]) * u];
      }
    }
    return RAMP[RAMP.length - 1][1];
  }

  function paint(mode, el, img, z, lat) {
    const d = img.data;
    if (mode === "relief") {
      const lo = settings.lo / FT, span = Math.max(0.05, (settings.hi - settings.lo) / FT);
      for (let i = 0; i < 65536; i++) {
        const c = ramp((el[i] - lo) / span), j = i * 4;
        d[j] = c[0]; d[j + 1] = c[1]; d[j + 2] = c[2]; d[j + 3] = 255;
      }
    } else if (mode === "flood") {
      const lvl = settings.flood / FT;
      for (let i = 0; i < 65536; i++) {
        const j = i * 4, depth = lvl - el[i];
        if (depth > 0) {
          d[j] = 20; d[j + 1] = 110; d[j + 2] = 255; d[j + 3] = Math.min(230, 120 + depth * 40);
        } else if (depth > -0.6) { // shoreline band: the last dry ground — where deer get pushed
          d[j] = 255; d[j + 1] = 230; d[j + 2] = 0; d[j + 3] = 170;
        } else d[j + 3] = 0;
      }
    } else { // hillshade
      const cell = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z; // meters per px
      // ESRI hillshade convention: sun from the NW (315°) at 45° altitude
      const zf = settings.exag, az = (135 * Math.PI) / 180, zen = (45 * Math.PI) / 180;
      const at = (i, j) => el[Math.max(0, Math.min(255, j)) * 256 + Math.max(0, Math.min(255, i))];
      for (let j = 0; j < 256; j++) {
        for (let i = 0; i < 256; i++) {
          const dzdx = ((at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1)) - (at(i - 1, j - 1) + 2 * at(i - 1, j) + at(i - 1, j + 1))) / (8 * cell);
          const dzdy = ((at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1)) - (at(i - 1, j - 1) + 2 * at(i, j - 1) + at(i + 1, j - 1))) / (8 * cell);
          const slope = Math.atan(zf * Math.hypot(dzdx, dzdy));
          const aspect = Math.atan2(dzdy, -dzdx);
          let hs = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
          hs = Math.max(0, hs);
          const k = (j * 256 + i) * 4, v = hs * 255;
          d[k] = d[k + 1] = d[k + 2] = v;
          d[k + 3] = Math.min(255, Math.abs(v - 180) * 1.6); // flat = transparent, relief = visible
        }
      }
    }
  }

  function makeLayer(mode, L, opts) {
    const Layer = L.GridLayer.extend({
      createTile(coords, done) {
        const c = document.createElement("canvas");
        c.width = c.height = 256;
        tileElev(coords.z, coords.x, coords.y).then((el) => {
          if (el) {
            const ctx = c.getContext("2d"), img = ctx.createImageData(256, 256);
            const lat = y2lat(coords.y + 0.5, coords.z);
            paint(mode, el, img, coords.z, lat);
            ctx.putImageData(img, 0, 0);
          }
          done(null, c);
        });
        return c;
      },
    });
    return new Layer(Object.assign({ maxZoom: 20, maxNativeZoom: 20, minZoom: 9, tileSize: 256, attribution: "Elevation: AWS Terrain Tiles (USGS 3DEP)" }, opts));
  }

  // ------------------------------------------------------------- grids
  // Build an elevation grid covering bounds (south, west, north, east). maxCells per side.
  async function grid(b, maxCells = 200) {
    let z = NATIVE_Z, x0, x1, y0, y1;
    for (; z > 9; z--) {
      x0 = lng2x(b.west, z); x1 = lng2x(b.east, z); y0 = lat2y(b.north, z); y1 = lat2y(b.south, z);
      if ((x1 - x0) * 256 <= 1100 && (y1 - y0) * 256 <= 1100) break;
    }
    const tx0 = Math.floor(x0), tx1 = Math.floor(x1), ty0 = Math.floor(y0), ty1 = Math.floor(y1);
    const tiles = {};
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) jobs.push(nativeTile(z, tx, ty).then((t) => (tiles[`${tx}/${ty}`] = t)));
    await Promise.all(jobs);
    const pxW = Math.ceil((x1 - x0) * 256), pxH = Math.ceil((y1 - y0) * 256);
    const step = Math.max(1, Math.ceil(Math.max(pxW, pxH) / maxCells));
    const w = Math.max(2, Math.ceil(pxW / step)), h = Math.max(2, Math.ceil(pxH / step));
    const data = new Float32Array(w * h);
    let missing = 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const gx = x0 * 256 + (i + 0.5) * step, gy = y0 * 256 + (j + 0.5) * step;
        const tx = Math.floor(gx / 256), ty = Math.floor(gy / 256), t = tiles[`${tx}/${ty}`];
        if (!t) { data[j * w + i] = NaN; missing++; continue; }
        data[j * w + i] = t[Math.min(255, Math.floor(gy - ty * 256)) * 256 + Math.min(255, Math.floor(gx - tx * 256))];
      }
    }
    const cellM = (156543.03392 * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180)) / 2 ** z * step;
    return {
      w, h, data, cellM, missing,
      toLatLng: (i, j) => [y2lat(y0 + ((j + 0.5) * step) / 256, z), x2lng(x0 + ((i + 0.5) * step) / 256, z)],
      fromLatLng: (lat, lng) => [
        Math.max(0, Math.min(w - 1, Math.floor(((lng2x(lng, z) - x0) * 256) / step))),
        Math.max(0, Math.min(h - 1, Math.floor(((lat2y(lat, z) - y0) * 256) / step))),
      ],
    };
  }
  function percentile(arr, p) {
    const v = Array.from(arr).filter((x) => !isNaN(x)).sort((a, b) => a - b);
    return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN;
  }
  async function viewRange(b) {
    const g = await grid(b, 120);
    return { lo: percentile(g.data, 0.02) * FT, hi: percentile(g.data, 0.98) * FT, median: percentile(g.data, 0.5) * FT };
  }

  // ------------------------------------------------------------- A* on a cost grid
  function astar(w, h, cost, start, goal) {
    const N = w * h, g = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const s = start[1] * w + start[0], t = goal[1] * w + goal[0];
    let minC = Infinity;
    for (let i = 0; i < N; i++) if (cost[i] < minC) minC = cost[i];
    const hfn = (k) => Math.hypot((k % w) - goal[0], ((k / w) | 0) - goal[1]) * minC;
    const heap = [], push = (k, f) => {
      heap.push([f, k]); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
    }, pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    };
    g[s] = 0; push(s, hfn(s));
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      if (k === t) break;
      closed[k] = 1;
      const x = k % w, y = (k / w) | 0;
      for (const [dx, dy, dd] of D) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = ny * w + nx;
        if (closed[nk]) continue;
        const ng = g[k] + dd * (cost[k] + cost[nk]) / 2;
        if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(nk, ng + hfn(nk)); }
      }
    }
    if (from[t] < 0 && s !== t) return null;
    const path = [];
    for (let k = t; k >= 0; k = from[k]) { path.push([k % w, (k / w) | 0]); if (k === s) break; }
    return path.reverse();
  }

  window.WS = Object.assign(window.WS || {}, {
    terrain: { settings, makeLayer, elevationAt, grid, viewRange, percentile, astar, FT, lng2x, lat2y, tileElev },
  });
})();
