const encoder = new TextEncoder();
export const PASSWORD_ITERATIONS = 600000;

export function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
export function fromHex(value) { return Uint8Array.from(value.match(/.{2}/g) || [], h => Number.parseInt(h, 16)); }
export function randomToken(size = 32) { return toHex(crypto.getRandomValues(new Uint8Array(size))); }
export async function digest(value) { return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
export async function passwordHash(password, saltHex = randomToken(16), iterations = PASSWORD_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' }, base, 256);
  return { hash: toHex(new Uint8Array(bits)), salt: saltHex, iterations };
}
export function constantTimeEquals(a, b) {
  const aBytes = encoder.encode(String(a)); const bBytes = encoder.encode(String(b));
  let diff = aBytes.length ^ bBytes.length;
  const count = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < count; i++) diff |= (aBytes[i] || 0) ^ (bBytes[i] || 0);
  return diff === 0;
}
export async function verifyPassword(password, hash, salt, iterations) {
  const result = await passwordHash(password, salt, Number(iterations));
  return constantTimeEquals(result.hash, hash);
}
export function isAdult(birthDate, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate))) return false;
  const [year, month, day] = birthDate.split('-').map(Number);
  const birthday = new Date(Date.UTC(year, month - 1, day));
  if (birthday.getUTCFullYear() !== year || birthday.getUTCMonth() !== month - 1 || birthday.getUTCDate() !== day) return false;
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate()));
  return birthday <= cutoff && year >= 1900;
}
export function yearsOld(birthDate) {
  const now = new Date(); const [y, m, d] = birthDate.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--;
  return age;
}
export function clean(value, max = 100) { return String(value ?? '').trim().slice(0, max); }
export function cookieValue(header, name) {
  const match = String(header || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
export function sessionCookie(token, request, expire = false) {
  const host = new URL(request.url).hostname;
  const secure = host !== 'localhost' && host !== '127.0.0.1' ? '; Secure' : '';
  return `kn_session=${expire ? '' : token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${expire ? 0 : 60 * 60 * 24 * 7}${secure}`;
}
