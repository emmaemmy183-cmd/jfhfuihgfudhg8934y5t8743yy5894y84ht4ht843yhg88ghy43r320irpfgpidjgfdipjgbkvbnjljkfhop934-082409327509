# Kennely 2027.6 Einrichtung auf Windows

1. Entpacken, PowerShell öffnen: `cd C:\Users\Mah\Downloads\Kennely_Social_16_Node`
2. `Copy-Item .dev.vars.example .dev.vars`
3. In VS Code oder Notepad die `.dev.vars` speichern. Wenn Notepad die Datei nicht speichern kann: VS Code öffnen, auf `.dev.vars` gehen und dort `Strg+S`; Dateiberechtigungen überprüfen. Nicht als `.dev.vars.txt` speichern.
4. Turso MAIN und MEDIA URLs sowie **neue** Tokens aus den beiden Turso-Dashboards eintragen.
5. `npm install` → `npm run db:check` → nach Backup `npm run db:migrate` → `npm test` → `npm run dev`.
6. `http://127.0.0.1:8787` öffnen und registrieren. Lokal sind keine externen E-Mails nötig.
7. Eigene Rolle `npm run owner:assign -- mahmoudbankousli@gmail.com` vergeben, danach neu anmelden.
8. E-Mail: `MAIL_ENABLED=true`, `SENDPULSE_API_KEY` neu ausstellen, `MAIL_FROM=no-support@kennely.de`, `MAIL_REPLY_TO=mahmoudbankousli@gmail.com`, `PUBLIC_ORIGIN=https://kennely.de`. Im produktiven Betrieb `REGISTRATION_MODE=public` erst nach Versandtest setzen.
9. Auf geeignetem Node.js-Host mit HTTPS veröffentlichen. Ohne Cloudflare, Domain bleibt bei one.com.

## Fehlerdiagnose

- `HTTP 404` und `main-db.turso.io` → `.dev.vars` enthält noch Beispielwerte.
- `no such table` → Migration fehlgeschlagen, vorher sichern und `npm run db:migrate` erneut prüfen.
- Browser startet, aber API 500 → Server-Logs und Datenbankstatus prüfen.
- Kein Zugriff außerhalb Deutschlands → Geo-IP-Prüfung ist aktiviert. Entwicklerzugriff auf localhost ist erlaubt.
- Bestätigungsmails gehen nicht raus → SendPulse-Domain, neues API-Secret und Stundenlimit prüfen.

## E-Mail-Grenze

`EMAIL_HOURLY_CAP=10` reserviert ein konservatives Kontingent für den kostenlosen SendPulse-Tarif. Je Empfänger höchstens zwei automatische Mails pro Stunde. Wenn die Grenze erreicht ist, meldet die Anwendung dies klar. Kein E-Mail-Versand für Likes oder normale Nachrichten.

## Datenschutzhinweis für den Betreiber

Der Server muss dauerhaft laufen, Backups und ein Löschkonzept benötigen aktive Wartung. Ein IP-Länderfilter ist nicht gleich einer verlässlichen Feststellung des Wohnorts. Das Konto wird ab 16 zugelassen, tatsächliche Minderjährigenschutzmaßnahmen und die Bearbeitung von Meldungen müssen vor öffentlicher Nutzung organisiert werden.
