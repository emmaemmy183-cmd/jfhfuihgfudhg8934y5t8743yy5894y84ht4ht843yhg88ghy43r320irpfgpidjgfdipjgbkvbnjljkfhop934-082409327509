// Gibt nur Hostnamen und Konfigurationsstatus aus. Niemals Schlüssel loggen.
for (const field of ['TURSO_MAIN_URL','TURSO_MEDIA_URL']) {
  try { console.log(field, new URL(process.env[field]).hostname); }
  catch { console.error(field, 'fehlt oder ist ungültig'); process.exitCode=1; }
}
console.log('SendPulse: ',process.env.MAIL_ENABLED==='true'?'aktiviert':'ausgeschaltet');
console.log('Ländersperre:', process.env.COUNTRY_LOCK||'nicht konfiguriert');
