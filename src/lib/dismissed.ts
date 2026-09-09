/**
 * Per-viewer dismissed sections. Stores a "cleared at" timestamp per key so
 * dismissing a list (e.g. Recent Hangouts) hides everything up to that
 * moment while newer items keep appearing. Device-local only — nothing is
 * deleted for anyone else.
 */

const PREFIX = 'sinog:cleared:';

/** ISO timestamp of when this section was cleared, or null if never. */
export function getClearedAt(key: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw || Number.isNaN(new Date(raw).getTime())) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Dismiss everything currently in the section. */
export function clearSection(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, new Date().toISOString());
  } catch {
    /* private mode: dismissal just won't persist */
  }
}
