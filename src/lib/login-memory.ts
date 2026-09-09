/**
 * Device-local remembered logins. Maps usernames to emails ONLY on this
 * device so users can log in with their @username after the first login.
 * Nothing here ever leaves the browser — unlike a server-side lookup, it
 * cannot be used to enumerate anyone else's email address.
 */

const MAP_KEY = 'sinog:login-map';
const LAST_KEY = 'sinog:last-username';

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {
    /* private mode / corrupt data: act as if nothing is remembered */
  }
  return {};
}

/** Remember that this username signs in with this email on this device. */
export function rememberLogin(username: string, email: string): void {
  const clean = username.trim().toLowerCase();
  if (!clean || !email.trim()) return;
  try {
    const map = readMap();
    map[clean] = email.trim();
    localStorage.setItem(MAP_KEY, JSON.stringify(map));
    localStorage.setItem(LAST_KEY, clean);
  } catch {
    /* private mode: login still works, just not remembered */
  }
}

/** Resolve a typed identifier to an email. Returns null when a username has
 *  never been used on this device (caller should ask for the email). */
export function resolveLoginEmail(identifier: string): string | null {
  const raw = identifier.trim();
  if (!raw) return null;
  const handle = raw.replace(/^@/, '');
  if (!handle) return null;
  if (handle.includes('@')) return raw; // a real email address: pass through
  const hit = readMap()[handle.toLowerCase()];
  return hit ?? null;
}

/** Prefill for the login field: the last username used on this device. */
export function getLastUsername(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
