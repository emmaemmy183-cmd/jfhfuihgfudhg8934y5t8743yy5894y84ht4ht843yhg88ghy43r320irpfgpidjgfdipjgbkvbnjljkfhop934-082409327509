/** Turso Hrana HTTP v3 client. No npm runtime dependency required. */
function databaseConfig(env, which) {
  const prefix = which === 'media' ? 'TURSO_MEDIA' : 'TURSO_MAIN';
  const rawUrl = env[`${prefix}_URL`]?.trim();
  const token = env[`${prefix}_TOKEN`]?.trim();
  if (!rawUrl || !token) throw new Error(`Missing ${prefix} database configuration`);
  if (/DEINNAME|DEINE-DATENBANK|DEINE-ECHTE-DATENBANK/i.test(rawUrl) || /^(?:HAUPT-DATENBANK-TOKEN|MEDIEN-DATENBANK-TOKEN|DEIN_MAIN_TOKEN|DEIN_MEDIA_TOKEN)$/i.test(token)) {
    throw new Error(`${prefix}: Noch Beispielwerte in .dev.vars. Bitte echte Database URL und Database Token aus Turso eintragen.`);
  }
  const url = rawUrl.replace(/^libsql:\/\//, 'https://').replace(/^wss?:\/\//, 'https://').replace(/\/$/, '');
  if (!url.startsWith('https://')) throw new Error(`${prefix}: Turso URL muss mit libsql:// oder https:// beginnen.`);
  const parsed = new URL(url);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${prefix}: Nur die Datenbank-Basisadresse eintragen, ohne /v3/pipeline oder andere Pfade.`);
  }
  return { baseUrl: url, host: parsed.hostname, token, prefix };
}

function arg(value) {
  if (value === null || value === undefined) return { type: 'null' };
  if (value instanceof Uint8Array) return { type: 'blob', base64: bytesToBase64(value) };
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Only safe SQL integers are supported');
    return { type: 'integer', value: String(value) };
  }
  if (typeof value === 'boolean') return { type: 'integer', value: value ? '1' : '0' };
  return { type: 'text', value: String(value) };
}

export function bytesToBase64(bytes) {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(result);
}

export function base64ToBytes(base64) {
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function decodeValue(value) {
  if (!value || value.type === 'null') return null;
  if (value.type === 'blob') return base64ToBytes(value.base64 || '');
  if (value.type === 'integer' || value.type === 'float') return Number(value.value);
  return value.value;
}

export async function execute(env, which, sql, args = []) {
  const config = databaseConfig(env, which);
  const body = JSON.stringify({ baton: null, requests: [
    { type: 'execute', stmt: { sql, args: args.map(arg), want_rows: true } },
    { type: 'close' }
  ] });

  async function request(version) {
    return fetch(`${config.baseUrl}/${version}/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body,
    });
  }

  // Ältere Turso/LibSQL-Instanzen unterstützen gegebenenfalls nur v2.
  // Nur ein 404 beim Endpoint führt zum v2-Versuch; bei Auth-Fehlern kein Retry.
  let response = await request('v3');
  let endpoint = 'v3';
  if (response.status === 404) {
    response = await request('v2');
    endpoint = 'v2';
  }
  if (!response.ok) {
    const hint = response.status === 404
      ? 'Datenbankadresse falsch, Datenbank nicht gefunden oder Hrana-HTTP-Endpunkt nicht unterstützt. Turso-URL im Dashboard prüfen.'
      : response.status === 401 || response.status === 403
      ? 'Datenbank-Token ungültig oder nicht für diese Datenbank ausgestellt.'
      : 'Turso Dashboard und Netzwerk prüfen.';
    throw new Error(`${config.prefix}: Turso-Anfrage an ${config.host} (${endpoint}) fehlgeschlagen: HTTP ${response.status}. ${hint}`);
  }
  const json = await response.json();
  const first = json.results?.[0];
  if (first?.type !== 'ok') throw new Error(`Database query failed: ${first?.error?.message || 'unknown database error'}`);
  const result = first.response?.result;
  if (!result) throw new Error('Database returned unexpected result');
  const cols = result.cols.map(c => c.name);
  const rows = result.rows.map(row => Object.fromEntries(row.map((value, index) => [cols[index], decodeValue(value)])));
  return { rows, count: Number(result.affected_row_count || 0) };
}

export const main = (env, sql, args) => execute(env, 'main', sql, args);
export const media = (env, sql, args) => execute(env, 'media', sql, args);
export async function one(env, sql, args = []) { return (await main(env, sql, args)).rows[0] || null; }
