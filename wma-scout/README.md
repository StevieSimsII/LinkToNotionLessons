# WMA Scout: Phil Bryant WMA · Ten Point

A local-first web app for scouting and planning the **Dec 17–20, 2026** gun draw hunt on the Ten Point unit of Phil Bryant WMA (Issaquena/Warren Co., MS). Scouting days are **Mon–Wed, Dec 14–16**.

## Run it

```bash
cd wma-scout
python3 -m http.server 8000      # then open http://localhost:8000
```

Opening `index.html` directly also works. Serve it over http(s) for offline tile caching and the installable home-screen app. For use in the woods on your phone, host the folder on any static host (GitHub Pages, Netlify, Vercel) and "Add to Home Screen".

All data stays in your browser (IndexedDB). Use **Data → Full backup** to move it between devices.

## What it does

| Tab | What's in it |
| --- | --- |
| 🗺️ **Layers** | Satellite (Esri), USGS NAIP, USGS Topo/Imagery-Topo, Esri Topo, OpenTopoMap. **Micro-relief hillshade** (exaggerated 1–40×, so 2–4 ft Delta ridges and slough banks show up). **Relative elevation** stretched to the local range. **Flood / backwater simulator**: blue is underwater, yellow is the last dry ground deer get pushed onto. Imported onX layers and **onX screenshot overlays** you align by dragging the corners. |
| ✏️ **Mark** | 30+ feature types: access (parking/gate, boat launch, ATV trail, foot trail, levee, boat route); habitat (bedding, thicket, food, water, ridge, slough crossing, funnel); sign (rub, scrape, tracks, bed, droppings, sightings, deer trail, rub line, camera); plan (stand, scout target, entry/exit routes, no-go). Notes, photos, day assignment, status, and a measure tool. |
| 🧠 **Deer Intel** | **Rut timeline** keyed to the MDWFP mean conception date (you enter it). Phase tips for your hunt dates. **Sun, legal light, and moon** table (Mississippi time). **NWS hourly forecast** pull. **Travel-corridor model**: least-cost routes over real elevation from bedding to food, plus buck cruising lanes in rut mode, with convergence **hotspots**. **Stand scoring** with computed good/bad winds, and a **best stand per wind** matrix. |
| 📅 **Plan** | Mon–Wed scouting cards with Delta-specific task templates and an optimized walking route through the day's stops. Thu–Sun hunt cards with AM/PM sit assignments per hunter that check the stand against the forecast wind. Gear and regs checklist. |
| 📓 **Log** | Sign summary, filtered log, and a sign-density heat layer. The **📍 Field Log** button gives big-button, one-tap logging at your phone's GPS, with photo and note. |
| 💾 **Data** | Import KML/KMZ/GPX/GeoJSON from onX, image overlays, and backups. Export **KML/GPX back into onX** so your stands, routes, and hotspots ride along in onX's offline maps. Cache the current view for offline use. |

The top-bar **Wind** picker draws a 350-yd scent cone from every stand: green means the stand works in that wind, red means it doesn't.

## Getting your onX data in

1. In onX Web Map: My Content → select waypoints/lines/areas → **Export** (KML or GPX).
2. Data tab → **Import files**. They appear as a reference layer. Press **Convert** to make them editable; types are guessed from names, so "Scrape 3" becomes a scrape.
3. For imagery-only intel, screenshot onX north-up, import the PNG, and drag the orange corners until roads and sloughs line up.
4. **Data → Set home view** once you're zoomed to your unit. The built-in default center is only approximate.

## How the corridor model reasons

The cost surface is built from AWS Terrain Tiles (USGS 3DEP elevation):

- Low, wet ground costs more and high ground costs less. Ground below the flood level can be made nearly impassable except at marked crossings.
- Your mapped **deer trails, rub lines, ridges, crossings, and funnels** pull routes toward them. Scouting overrides modeling.
- Thickets and bedding are cheaper (cover). Roads and ATV trails are pricier (pressure). Open water is a barrier.

Lanes that overlap become hotspots. Treat every lane as a hypothesis: walk it and confirm it with sign, or kill it.

## Verify before you hunt

Rules change yearly. Confirm everything in the current MDWFP **Phil Bryant – Ten Point** brochure: permit cards at the west Ten Point check station on Hwy 465, ATV/UTV use on designated trails only, stand/flagging/camera rules, entry times, and river-stage closures.
