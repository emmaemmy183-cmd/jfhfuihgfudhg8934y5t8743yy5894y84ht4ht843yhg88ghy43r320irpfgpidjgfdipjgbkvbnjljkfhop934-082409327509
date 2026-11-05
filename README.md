# Kennely Social 2027.7 · Netlify Free

Deutsche fotoorientierte Social-Media-Plattform ab 16 Jahren. Die Oberfläche liegt statisch auf Netlify, die API läuft in Netlify Functions und nutzt weiterhin deine beiden Turso-Datenbanken.

## Schnellstart

- Anleitung: **NETLIFY_EINRICHTUNG.md**
- `npm install`
- Lokal (Netlify CLI): `.env.example` nach `.env` kopieren, neue Tokens einsetzen und `npm run dev` ausführen.
- `npm test` für Backend- und Adaptertests.
- Migrationen nach Datenbanksicherung lokal mit `.dev.vars`: `npm run db:migrate`.

**Achtung:** Kein persistenter Node-Server, keine dauerhaften WebSockets oder SSE. Chatpolling alle 15 Sekunden und Benachrichtigungen jede Minute. Keine Reels oder Videos, keine Cloudflare-Voraussetzung, keine `node_modules` im GitHub-Repository.

## Dateiübersicht

- `public/`: HTML, CSS, JS, Logo, Impressum und Datenschutz.
- `netlify/functions/api.mjs`: Netlify API Adapter.
- `netlify/edge-functions/country-gate.js`: Zugriff aus Deutschland auf statische Seiten beschränken.
- `netlify.toml`: Routing, Headers, Funktionen und Netlify-Publikationsordner.
- `src/server/`: Authentifizierung, Turso, Beiträge, Nachrichten, Moderation.
- `scripts/`: Migrationen und Verwaltung bestehender Accounts.

Die sicherheitskritischen Zugangsdaten gehören **nur** in die lokale `.env` bzw. Netlify Environment Variables. Alte Schlüssel, die in Chats oder einem Repository sichtbar waren, unbedingt ersetzen.
