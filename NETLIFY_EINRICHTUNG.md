# Kennely auf Netlify Free veröffentlichen

## 1. Sicherheit vor jedem Upload

Alle früher in Chats veröffentlichten Turso- und SendPulse-Tokens widerrufen und neue erstellen.
`*.env`, `.dev.vars` und `node_modules` dürfen niemals auf GitHub hochgeladen werden.

## 2. GitHub aktualisieren

Diese Version ersetzt die vorherige Node-Server-Version. Den Ordnerinhalt in deinem GitHub-Repository aktualisieren.
Wichtig: `netlify.toml` und `netlify/functions/api.mjs` liegen im Repository-Hauptverzeichnis.
Die alten Datenbanken werden beibehalten, keine neue Datenbank erforderlich.

## 3. Netlify verbinden

1. https://app.netlify.com öffnen, **Add new project** → **Import an existing project** → **GitHub**.
2. Kennely-Repository auswählen. Im Repository muss `package.json` im Root liegen.
3. Build: `echo Kennely ohne Build-Schritt` (aus netlify.toml), Publish: `public`, Functions: `netlify/functions`.
4. **Deploy**. Die erste Seite kann geladen werden, obwohl die API mangels Schlüsseln noch 503 meldet.
5. Die echte `.netlify.app`-Adresse im Projekt kopieren.

## 4. Environment Variables in Netlify einrichten

In **Project configuration → Environment variables**:

- `TURSO_MAIN_URL`: aus deinem Turso-Dashboard, z. B. `libsql://...`
- `TURSO_MAIN_TOKEN`: neuer geheimer Main-Token
- `TURSO_MEDIA_URL`: aus Turso
- `TURSO_MEDIA_TOKEN`: neuer geheimer Media-Token
- `IP_HASH_SECRET`: 32 zufällige Bytes als 64 Hexzeichen, generieren mit PowerShell: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
- `PUBLIC_ORIGIN`: zunächst die exakte `https://dein-projekt.netlify.app`-Adresse, später `https://kennely.de`
- `COUNTRY_LOCK`: zuerst `off` für technischen Test; vor öffentlichem Deutschland-Start `DE`
- `REGISTRATION_MODE`: zunächst `closed`. Erst wenn E-Mail-Versand funktioniert und die 16+-Anforderungen überprüft sind, `public`
- `LEGACY_DATING_ENABLED`: `false`
- `MAIL_ENABLED`: zunächst `false`
- `EMAIL_HOURLY_CAP`: `10`
- `MAIL_FROM`: `no-support@kennely.de`
- `MAIL_REPLY_TO`: `mahmoudbankousli@gmail.com`
- `SENDPULSE_API_KEY`: neu ausgestellter Schlüssel, erst bei E-Mail-Tests verwenden

Variablen als geheim behandeln und nach Änderungen **Redeploy** auslösen. Nicht in `netlify.toml` speichern.

## 5. Erste Tests

- `https://DEIN-PROJEKT.netlify.app/api/health` soll mit korrekt gesetzten Variablen `{ "ok": true, ... }` ausgeben.
- Login mit einem **bereits vorhandenen** Testkonto prüfen; `/api/me` ohne Anmeldung gibt `user:null` zurück.
- Beiträge, Fotos und Chats anschließend gezielt testen, inklusive Freigaben im Team-Dashboard.
- Erst nach Sicherung und im Bedarfsfall die Migration **lokal** ausführen: `npm run db:migrate` mit deinen `.dev.vars`.
- Falls der Netlify-Build fehlschlägt, zuerst die Build-Logs und dann Functions-Logs kontrollieren.

## 6. Domain kennely.de verbinden

1. Bei Netlify **Domain management → Add a domain** und `kennely.de` hinzufügen.
2. Netlify zeigt die notwendigen DNS-Einträge an. Diese beim tatsächlich autoritativen DNS-Host setzen.
3. Die bisherige GitHub-Pages-Domainbindung und deren A/CNAME-Einträge auflösen, ohne E-Mail-MX/SPF/DKIM/DMARC zu löschen.
4. Netlify HTTPS abwarten. `PUBLIC_ORIGIN=https://kennely.de` setzen und erneut deployen.

## 7. Echtzeit auf Netlify Free

Netlify Functions besitzen **keinen dauerhaft laufenden Chat-Server**. Diese Version aktualisiert offene Nachrichten alle 15 Sekunden, Benachrichtigungen alle 60 Sekunden und bei erneuter Tab-Aktivierung. Eine Live-Tippanzeige ist hier deaktiviert. Für sekundengenaue Echtzeit später einen externen Realtime-Anbieter ergänzen (mit zusätzlichen Kontingenten/Kosten).

## 8. Kosten und Kapazität

Netlify Free bietet derzeit **300 Credits pro Monat** mit hartem Limit. Jede Seitenanfrage und jede API-Abfrage verbraucht Kontingente. Häufiges Polling kann diese Grenze erreichen. Fotos verbleiben in Turso Media, nicht in Netlify Functions-Dateisystemen. Nur kleine Fotos (max. 650 KB nach Browserkomprimierung) hochladen. Große Medien-/Video-Uploads sind nicht enthalten.

## 9. Wichtige rechtliche und technische Grenzen

Netlify zeigt die Website, wenn du `COUNTRY_LOCK=off` verwendest, auch außerhalb Deutschlands. Bei `DE` setzt der Edge-Länderfilter für statische Seiten und die API eine Geo-IP-Sperre um, die durch VPNs umgangen werden kann.

Die Ausweisprüfung fehlt weiterhin, auch bei 16+ ist eine Selbstauskunft keine sichere Altersprüfung. Die Rechtstexte der Vorlage müssen auf den tatsächlichen Hoster Netlify und Datenverarbeitungen geprüft werden. Nicht automatisch öffentlich registrieren lassen, nur weil ein Deploy erfolgreich war.
