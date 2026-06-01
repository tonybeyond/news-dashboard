// Approximate country centroids (lat, lon). Used as a fallback when GDELT's
// geocoder returns a clearly broken lat=0 with a meaningless lon. The values
// are picked from a geographic centroid calculation, not the capital — they
// represent the rough center of population/area for each country.
//
// The table covers the most common country codes in GDELT; anything not in
// the map falls back to [0, 0] which the parser rejects, so the event
// simply won't appear on the map (but the feed will still mention it).

const CENTROIDS: Record<string, [number, number]> = {
  AF: [33.0, 65.0],   AL: [41.0, 20.0],   DZ: [28.0, 1.5],
  AO: [-12.0, 18.0],  AR: [-34.0, -64.0], AM: [40.0, 45.0],
  AU: [-25.0, 135.0], AT: [47.5, 14.5],   AZ: [40.5, 47.5],
  BD: [24.0, 90.0],   BE: [50.5, 4.5],    BO: [-17.0, -65.0],
  BR: [-10.0, -53.0], BG: [43.0, 25.0],   BF: [12.0, -1.0],
  BI: [-3.5, 30.0],   KH: [12.0, 105.0],  CM: [6.0, 12.0],
  CA: [56.0, -106.0], CL: [-30.0, -71.0], CN: [35.0, 105.0],
  CO: [4.0, -72.5],   CD: [-4.0, 21.0],   CG: [-1.0, 15.0],
  CR: [10.0, -84.0],  CI: [7.5, -5.5],    HR: [45.0, 16.0],
  CU: [22.0, -79.0],  CY: [35.0, 33.0],   CZ: [50.0, 15.5],
  DK: [56.0, 10.0],   DO: [19.0, -70.5],  EC: [-2.0, -78.0],
  EG: [27.0, 30.0],   SV: [13.5, -88.5],  EE: [59.0, 26.0],
  ET: [8.0, 38.0],    FI: [64.0, 26.0],   FR: [47.0, 2.0],
  GA: [-1.0, 12.0],   GE: [42.0, 43.5],   DE: [51.0, 10.0],
  GH: [8.0, -1.0],    GR: [39.0, 22.0],   GT: [15.5, -90.0],
  GN: [10.0, -10.0],  HT: [19.0, -72.0],  HN: [15.0, -86.0],
  HU: [47.0, 19.0],   IN: [22.0, 79.0],   ID: [-2.0, 118.0],
  IR: [32.0, 53.0],   IQ: [33.0, 44.0],   IE: [53.0, -8.0],
  IL: [31.5, 35.0],   IT: [43.0, 12.0],   JM: [18.0, -77.0],
  JP: [37.0, 138.0],  JO: [31.0, 36.0],   KZ: [48.0, 67.0],
  KE: [0.0, 38.0],    KP: [40.0, 127.0],  KR: [36.0, 128.0],
  KW: [29.5, 47.5],   KG: [41.0, 75.0],   LA: [18.0, 105.0],
  LV: [57.0, 25.0],   LB: [34.0, 36.0],   LY: [27.0, 17.0],
  LT: [55.0, 24.0],   LU: [49.5, 6.0],    MG: [-19.0, 47.0],
  MW: [-13.0, 34.0],  MY: [4.0, 102.0],   ML: [17.0, -4.0],
  MR: [21.0, -10.0],  MX: [23.0, -102.0], MD: [47.0, 29.0],
  MN: [47.0, 105.0],  ME: [43.0, 19.0],   MA: [32.0, -5.0],
  MZ: [-18.0, 35.0],  MM: [21.0, 96.0],   NP: [28.0, 84.0],
  NL: [52.0, 5.5],    NZ: [-41.0, 174.0], NI: [13.0, -85.0],
  NE: [17.0, 8.0],    NG: [9.0, 8.0],     NO: [62.0, 10.0],
  OM: [21.0, 57.0],   PK: [30.0, 70.0],   PS: [32.0, 35.0],
  PA: [9.0, -80.0],   PY: [-23.0, -58.0], PE: [-10.0, -76.0],
  PH: [13.0, 122.0],  PL: [52.0, 19.0],   PT: [39.5, -8.0],
  QA: [25.5, 51.0],   RO: [46.0, 25.0],   RU: [60.0, 100.0],
  SA: [25.0, 45.0],   SN: [14.0, -14.0],  RS: [44.0, 21.0],
  SL: [8.5, -11.5],   SG: [1.35, 103.8],  SK: [48.5, 19.5],
  SI: [46.0, 15.0],   SO: [5.0, 46.0],    ZA: [-29.0, 24.0],
  SS: [7.0, 30.0],    ES: [40.0, -3.5],   LK: [7.0, 81.0],
  SD: [16.0, 30.0],   SE: [62.0, 15.0],   CH: [46.8, 8.2],
  SY: [35.0, 38.0],   TW: [24.0, 121.0],  TJ: [38.5, 71.0],
  TZ: [-6.0, 35.0],   TH: [15.0, 100.0],  TG: [8.0, 1.0],
  TN: [34.0, 10.0],   TR: [39.0, 35.0],   UG: [1.0, 32.0],
  UA: [49.0, 32.0],   AE: [24.0, 54.0],   GB: [54.0, -2.0],
  US: [39.5, -98.5],  UY: [-33.0, -56.0], UZ: [41.0, 64.0],
  VE: [8.0, -66.0],   VN: [16.0, 108.0],  YE: [15.5, 48.0],
  ZM: [-14.0, 28.0],  ZW: [-19.0, 30.0],
  // Common non-ISO
  HK: [22.3, 114.2],  MO: [22.2, 113.5],  PR: [18.2, -66.6],
  EU: [50.5, 7.0],    UN: [40.7, -74.0],
};

export function countryCentroid(code: string): [number, number] | null {
  if (!code) return null;
  return CENTROIDS[code.toUpperCase()] ?? null;
}

export function isSuspiciouslyZero(lat: number, lon: number): boolean {
  // GDELT's geocoder falls back to lat=0 when it can't resolve a place,
  // with a lon that's often positive (Africa) — clear geocoder failure
  // signature. We also flag lat=0 lon=0 (Gulf of Guinea, "no data") and
  // very low lat values (below 1°) for non-equatorial countries, but
  // those heuristics get noisy fast, so we keep the test narrow.
  if (lat === 0) return true;
  if (Math.abs(lat) < 0.0001) return true;
  return false;
}
