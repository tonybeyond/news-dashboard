// CAMEO event-root code → human-readable label. The server-side parser
// has the same map; keep these in sync. We re-export here so the browser
// can label the event-root dropdown without re-defining the dictionary.
//
// Full CAMEO taxonomy is huge; this is the high-value conflict/protest
// subset. Add codes as needed.

export const CAMEO_ROOT: Record<string, string> = {
  "01": "MAKE PUBLIC STATEMENT",
  "02": "APPEAL",
  "03": "EXPRESS INTENT TO COOPERATE",
  "04": "CONSULT",
  "05": "ENGAGE IN DIPLOMATIC COOPERATION",
  "06": "ENGAGE IN MATERIAL COOPERATION",
  "07": "PROVIDE AID",
  "08": "YIELD",
  "09": "INVESTIGATE",
  "10": "DEMAND",
  "11": "DISAPPROVE",
  "12": "REJECT",
  "13": "THREATEN",
  "14": "PROTEST",
  "15": "EXHIBIT FORCE POSTURE",
  "16": "REDUCE RELATIONS",
  "17": "COERCE",
  "18": "ASSAULT",
  "19": "FIGHT",
  "20": "USE UNCONVENTIONAL MASS VIOLENCE",
};

// CAMEO root categories that are conflict-adjacent — used to highlight
// "interesting" roots in the dropdown UI.
export const CONFLICT_ROOTS = new Set([
  "13", "14", "15", "16", "17", "18", "19", "20",
]);
