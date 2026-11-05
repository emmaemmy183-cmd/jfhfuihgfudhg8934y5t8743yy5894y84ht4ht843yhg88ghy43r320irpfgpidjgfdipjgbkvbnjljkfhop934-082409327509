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

Netlify Functions besitzen **keinen dauerhaft laufenden Chat-Server**. Diese Version aktualisiert offene Nachrichten bei geöffnetem Chat ungefähr alle 12 Sekunden, Benachrichtigungszähler ungefähr alle 36 Sekunden und bei erneuter Tab-Aktivierung. Eine Live-Tippanzeige ist hier deaktiviert. Für sekundengenaue Echtzeit später einen externen Realtime-Anbieter ergänzen (mit zusätzlichen Kontingenten/Kosten).

## 8. Kosten und Kapazität

Netlify Free bietet derzeit **300 Credits pro Monat** mit hartem Limit. Jede Seitenanfrage und jede API-Abfrage verbraucht Kontingente. Häufiges Polling kann diese Grenze erreichen. Fotos verbleiben in Turso Media, nicht in Netlify Functions-Dateisystemen. Nur kleine Fotos (max. 650 KB nach Browserkomprimierung) hochladen. Große Medien-/Video-Uploads sind nicht enthalten.

## 9. Wichtige rechtliche und technische Grenzen

Netlify zeigt die Website, wenn du `COUNTRY_LOCK=off` verwendest, auch außerhalb Deutschlands. Bei `DE` setzt der Edge-Länderfilter für statische Seiten und die API eine Geo-IP-Sperre um, die durch VPNs umgangen werden kann.

Die Ausweisprüfung fehlt weiterhin, auch bei 16+ ist eine Selbstauskunft keine sichere Altersprüfung. Die Rechtstexte der Vorlage müssen auf den tatsächlichen Hoster Netlify und Datenverarbeitungen geprüft werden. Nicht automatisch öffentlich registrieren lassen, nur weil ein Deploy erfolgreich war.

## 10. Update in VS Code auf GitHub und Netlify

1. ZIP entpacken. Inhalt des neuen Kennely-Ordners in das bereits geklonte `kennely-github`-Verzeichnis kopieren und vorhandene Projektdateien ersetzen. **Den vorhandenen `.git`-Ordner niemals löschen oder überschreiben.** Keine `.dev.vars`, `.env` oder sonstige geheimen Schlüssel kopieren.
2. Änderungen im Repository-Terminal prüfen: `git status`.
3. `npm install` und `npm test` ausführen. Bei Problemen zuerst diese beheben.
4. `git add -A`, dann `git diff --cached --name-only` prüfen, dass keine geheimen Dateien im Commit enthalten sind.
5. `git commit -m "Kennely 2027.8: Navigation und Performance"` und `git push origin main`.
6. Netlify → Deploys öffnen, Deployment prüfen. Neue Features erst nach erfolgreichem Deploy und, sofern nötig, der gesicherten Datenbankmigration verwenden.

### Benutzerkonten mit bestehendem Löschskript aus Turso entfernen

Vor der Löschung **beide Datenbanken sichern**. Das Skript arbeitet über zwei Datenbanken, also nicht atomar.

Vorschau: `npm run user:delete -- --email=beispiel@example.com`

Nach Prüfung dauerhaft löschen: `npm run user:delete -- --email=beispiel@example.com --bestaetigen`

Es verwendet die lokale `.dev.vars`. Das Skript darf nur für rechtmäßig zu löschende Konten ausgeführt werden.

### Mitarbeiterbereich

Ein bestehendes CEO-Konto öffnet **Menü → Team und Moderation → Team**. Über die exakte Benutzername-Suche kann der CEO anderen Konten Rollen vergeben. Moderator und höhere Rollen können Profilfotos prüfen. Niemand darf eigene Bilder freigeben. Das CEO-Profilfoto muss somit von einer anderen, dazu berechtigten Person kontrolliert werden.

Die Nutzersuche zeigt sparsame Kontoinformationen, Details benötigen Manager oder höhere Rechte und einen dokumentierten Anlass. Kontakt-E-Mails erscheinen ausschließlich in berechtigten Detailansichten (Admin oder CEO). Passwortdaten und private Nachrichten sind nicht einsehbar. Das letzte Login wird nur bei erfolgreichem Login geschrieben, nicht bei jedem Seitenaufruf.

### Probelauf unbedingt mit zwei Accounts

Mit Konto A ein Profilfoto hochladen. Mit Konto B (Moderator oder höher) im Team den Punkt **Profilfotos** öffnen und freigeben. Mit beiden Konten Folgen, Like, Chat und Benachrichtigungen prüfen. Erst danach öffentlich freischalten.
