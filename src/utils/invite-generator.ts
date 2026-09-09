/** Client-side invite code helper. The DB default is the source of truth;
 *  this is only for optimistic display / custom group_invites rows. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  let code = '';
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) code += ALPHABET[buf[i] % ALPHABET.length];
  return code;
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPlausibleInviteCode(raw: string): boolean {
  return normalizeInviteCode(raw).length >= 4;
}
