// Country code mapping. GDELT 2.0 uses a mix of FIPS 10-4 (the old US
// standard), ISO 3166-1 alpha-2, and a handful of custom codes. The two
// schemes disagree on a dozen or so commonly-seen countries (Israel is `IS`
// in FIPS but `IL` in ISO, Ireland is `EI` vs `IE`, etc.). We normalize to
// ISO 3166-1 alpha-2 for storage so downstream consumers (the UI, the
// centroid lookup, the country dropdown) only need to deal with one set of
// codes.
//
// Sources:
//   - FIPS 10-4 → ISO 3166-1 alpha-2: NIST FIPS 10-4 withdrawn 2008-12-31,
//     superseded by ISO 3166-1.
//   - The set of GDELT-only codes (UK, WE, etc.) is empirically derived
//     from the live feed.

const GDELT_TO_ISO: Record<string, string> = {
  // FIPS 10-4 → ISO 3166-1 alpha-2
  IS: "IL",   // Israel (FIPS IS → ISO IL)
  EI: "IE",   // Ireland (FIPS EI → ISO IE)
  IZ: "IQ",   // Iraq (FIPS IZ → ISO IQ)
  SP: "ES",   // Spain (FIPS SP → ISO ES)
  TU: "TR",   // Turkey (FIPS TU → ISO TR)
  SU: "SD",   // Sudan (FIPS SU → ISO SD)
  BM: "MM",   // Myanmar (FIPS BM → ISO MM)
  CB: "KH",   // Cambodia (FIPS CB → ISO KH)
  RP: "PH",   // Philippines (FIPS RP → ISO PH)
  SF: "ZA",   // South Africa (FIPS SF → ISO ZA)
  RS: "RU",   // Russia (FIPS RS → ISO RU)
  UP: "UA",   // Ukraine (FIPS UP → ISO UA)
  NS: "SR",   // Suriname (FIPS NS → ISO SR)
  // GDELT-only codes
  UK: "GB",   // United Kingdom (ISO uses GB; GDELT uses UK)
  WE: "PS",   // West Bank (GDELT; ISO uses PS for Palestine)
  // FIPS also has CG = Democratic Republic of the Congo; ISO uses CD.
  // We keep the GDELT code "CG" mapped to "CD" so the country dropdown
  // shows the DR Congo correctly.
  CG: "CD",
};

export function normalizeCountry(code: string): string {
  if (!code) return "";
  const upper = code.toUpperCase();
  return GDELT_TO_ISO[upper] ?? upper;
}
