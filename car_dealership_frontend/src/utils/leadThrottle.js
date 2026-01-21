const STORAGE_KEY = "pcd_lastLeadSubmissionAt";
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

// PUBLIC_INTERFACE
export function getLeadSubmissionCooldownRemainingMs(windowMs = DEFAULT_WINDOW_MS) {
  /** Returns remaining cooldown in ms (0 if allowed). */
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return 0;
    const elapsed = Date.now() - ts;
    const remaining = windowMs - elapsed;
    return remaining > 0 ? remaining : 0;
  } catch {
    return 0;
  }
}

// PUBLIC_INTERFACE
export function markLeadSubmitted() {
  /** Mark that a lead was submitted "now". */
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Ignore storage errors.
  }
}
