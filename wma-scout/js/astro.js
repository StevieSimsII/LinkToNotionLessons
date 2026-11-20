/* Sun & moon calculations (adapted from the SunCalc formulas by V. Agafonkin, BSD-2). */
(function () {
  "use strict";
  const PI = Math.PI, rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d) => toJulian(d) - J2000;
  const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  function eclipticLongitude(M) {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + rad * 102.9372 + PI;
  }
  function sunCoords(d) {
    const L = eclipticLongitude(solarMeanAnomaly(d));
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }
  const J0 = 0.0009;
  const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * PI));
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * PI) + n;
  const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

  function sunTimes(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), n = julianCycle(d, lw), ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0), Jnoon = solarTransitJ(ds, M, L);
    const get = (h) => {
      const w = hourAngle(h * rad, phi, dec), a = approxTransit(w, lw, n);
      const Jset = solarTransitJ(a, M, L);
      return { rise: fromJulian(Jnoon - (Jset - Jnoon)), set: fromJulian(Jset) };
    };
    const sr = get(-0.833), civ = get(-6);
    return { sunrise: sr.rise, sunset: sr.set, dawn: civ.rise, dusk: civ.set, noon: fromJulian(Jnoon) };
  }
  function sunPosition(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = siderealTime(d, lw) - c.ra;
    return { azimuth: azimuth(H, phi, c.dec) / rad + 180, altitude: altitude(H, phi, c.dec) / rad };
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dt = 385001 - 20905 * Math.cos(M);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
  }
  function moonAltitude(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = siderealTime(d, lw) - c.ra;
    let h = altitude(H, phi, c.dec);
    h = h + rad * 0.017 / Math.tan(h + rad * 10.26 / (h + rad * 5.10));
    return h / rad;
  }
  function moonIllumination(date) {
    const d = toDays(date || new Date()), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / PI };
  }
  function phaseName(p) {
    const names = ["New 🌑", "Waxing Crescent 🌒", "First Quarter 🌓", "Waxing Gibbous 🌔", "Full 🌕", "Waning Gibbous 🌖", "Last Quarter 🌗", "Waning Crescent 🌘"];
    return names[Math.round(p * 8) % 8];
  }
  // moonrise/set & overhead/underfoot by sampling altitude every 5 min across the local day
  function moonEvents(day, lat, lng) {
    const start = new Date(day); // caller passes local midnight of the hunt's time zone
    let prev = moonAltitude(start, lat, lng), rise = null, set = null, maxAlt = -99, minAlt = 99, over = null, under = null;
    for (let m = 5; m <= 1440; m += 5) {
      const t = new Date(start.getTime() + m * 6e4), a = moonAltitude(t, lat, lng);
      if (prev < 0 && a >= 0 && !rise) rise = t;
      if (prev >= 0 && a < 0 && !set) set = t;
      if (a > maxAlt) { maxAlt = a; over = t; }
      if (a < minAlt) { minAlt = a; under = t; }
      prev = a;
    }
    return { rise, set, overhead: maxAlt > 0 ? over : null, underfoot: minAlt < 0 ? under : null };
  }
  function dayReport(day, lat, lng) {
    const noon = new Date(new Date(day).getTime() + 12 * 36e5);
    const s = sunTimes(noon, lat, lng), m = moonIllumination(noon), me = moonEvents(day, lat, lng);
    return {
      ...s,
      legalStart: new Date(s.sunrise.getTime() - 30 * 6e4),
      legalEnd: new Date(s.sunset.getTime() + 30 * 6e4),
      moonFraction: m.fraction, moonPhase: m.phase, moonName: phaseName(m.phase),
      moonrise: me.rise, moonset: me.set, moonOverhead: me.overhead, moonUnderfoot: me.underfoot,
    };
  }
  window.WS = Object.assign(window.WS || {}, { astro: { sunTimes, sunPosition, moonIllumination, moonEvents, dayReport, phaseName } });
})();
