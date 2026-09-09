/**
 * Extract a readable message from anything a mutation might throw.
 *
 * Supabase PostgREST failures are PLAIN OBJECTS ({message, details, hint,
 * code}) — not Error instances — so `String(err)` yields "[object Object]".
 * This handles Error instances, message-shaped objects, strings, and falls
 * back to a JSON dump rather than ever returning "[object Object]".
 */
export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err || 'Unknown error';
  if (err instanceof Error) return err.message || 'Unknown error';
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === 'string' && o.message) parts.push(o.message);
    if (typeof o.details === 'string' && o.details) parts.push(o.details);
    if (typeof o.hint === 'string' && o.hint) parts.push(o.hint);
    if (typeof o.code === 'string' && o.code) parts.push(`(${o.code})`);
    if (parts.length > 0) return parts.join(' ');
    try {
      const dumped = JSON.stringify(o);
      return dumped === '{}' ? 'Unknown error' : dumped;
    } catch {
      return 'Unknown error';
    }
  }
  return 'Unknown error';
}

/** Maps Supabase / RPC failures to casual, user-friendly messages. */
export function friendlyError(err: unknown, fallback: string): string {
  const msg = errorMessage(err);
  if (msg.includes('INVITE_NOT_FOUND')) return "That code didn't match any group. Double-check it with your friend.";
  if (msg.includes('INVITE_EXPIRED')) return 'That invite expired. Ask for a fresh code.';
  if (msg.includes('INVITE_MAXED')) return 'That invite already hit its use limit. Ask for a fresh code.';
  if (msg.includes('ALREADY_MEMBER')) return "You're already in this group.";
  if (msg.includes('INVITE_REQUIRED')) return 'Enter the invite code first.';
  if (msg.includes('NOT_AUTHENTICATED')) return 'Your session expired. Log in again and retry.';
  if (msg.includes('GROUP_NAME_REQUIRED')) return 'Give your group a name first.';
  if (msg.includes('GROUP_NAME_TOO_LONG')) return 'Keep the group name under 60 characters.';
  if (msg.includes('NUDGE_COOLDOWN')) return 'Someone just nudged this hangout — give it a few minutes.';
  if (msg.includes('HANGOUT_NOT_ACTIVE')) return 'This hangout is no longer active.';
  if (msg.includes('HANGOUT_NOT_FOUND')) return 'That hangout is gone.';
  if (msg.includes('NOT_IN_GROUP')) return 'You are no longer in this group.';
  if (msg.includes('duplicate key') && msg.includes('username'))
    return 'That username is taken. Try another one.';
  if (msg.includes('duplicate key') && msg.includes('hangout_response_unique'))
    return 'You already responded — updating it instead.';
  if (msg.includes('Invalid login credentials')) return 'Wrong email or password. Try again.';
  if (msg.includes('User already registered')) return 'That email already has an account. Log in instead.';
  if (msg.includes('Password should be')) return 'Password needs to be at least 8 characters.';
  if (msg.includes('Username') && msg.includes('format'))
    return 'Usernames need 3–24 letters, numbers, or underscores.';
  if (msg.includes('availability_time_order')) return 'End time has to be later than start time.';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError'))
    return 'Network hiccup. Check your connection and retry.';
  if (msg.includes('PGRST301') || msg.includes('JWT expired') || msg.includes('invalid JWT'))
    return 'Your session expired. Log in again and retry.';
  return fallback;
}
