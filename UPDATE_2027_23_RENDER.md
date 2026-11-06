# Kennely 2027.23 – Einsprüche und Ladezeiten (Render)

## Was repariert wurde

1. **Team > Einsprüche:** Ein Einspruch gegen eine Kontosperre wurde in `account_states` gespeichert, aber der Team-Reiter las bisher nur `social_appeals`. Der Reiter zeigt jetzt beide Arten. Kontosperren-Einsprüche und ihre Begründungen sind nur für Teamrollen mit Recht `account.suspend` (standardmäßig Admin/CEO) abrufbar. Die Entscheidungen „Annehmen & entsperren“ und „Ablehnen“ verwenden die bestehende begründungspflichtige, auditierte API. Bereits eingereichte Einsprüche bleiben vorhanden.
2. **Schnellere Moderation:** `GET /api/social/admin/queue?scope=media|texts|reports|appeals` lädt nur die ausgewählte Kategorie. Ein Reiterwechsel schickt keine vier bis fünf unnötigen großen Turso-Abfragen mehr. Unzulässige Kategorien werden abgewiesen und die Berechtigungen serverseitig geprüft.
3. **Statische Dateien:** Kleine öffentliche Assets werden im Node-Prozess speicherschonend zwischengespeichert (insgesamt maximal 1,5 MB). Versionsmarkierte CSS- und JS-Dateien erhalten einen langfristigen Browsercache. HTML bleibt `no-store`, API-Antworten bleiben privat und `no-store`.
4. **Diagnose:** Setze in Render optional `PERF_LOG=true`, um API-Anfragen über 1000 ms mit HTTP-Status und Endpunkt, aber ohne Query-Parameter oder Geheimnisse, in den Logs zu sehen. Nach der Fehlersuche wieder entfernen.
5. **Beitragsdetails:** Beitrag und zugehörige Kommentare werden parallel geladen, damit das Beitragsfenster nicht unnötig auf zwei Turso-Roundtrips nacheinander wartet.
6. **Race Conditions:** Abgeschlossene Anfragen zum vorherigen Moderationsreiter überschreiben den inzwischen gewechselten Reiter nicht mehr.

## Wichtige Einschränkung

Render Free setzt den Server nach Inaktivität in den Ruhezustand. Den ersten Aufruf nach dem Aufwachen kann dieser Hotfix **nicht** auf Sofortgeschwindigkeit beschleunigen. Auch viele Turso-Netzwerkzugriffe bleiben abhängig vom Hostingstandort, der Netzwerklatenz und dem Tarif. Bei dauerhaft flüssiger Nutzung muss ein dauerhaft laufendes Hosting mit ausreichenden Ressourcen erwogen werden.

## Installation mit VS Code und GitHub

1. Vorher eine Sicherung beider Turso-Datenbanken erstellen. Das Update selbst benötigt **keine neue Datenbankmigration**.
2. ZIP entpacken und Inhalt in dein bestehendes GitHub-Projekt kopieren. Die `.git`- und privaten `.dev.vars`-/`.env`-Dateien NICHT löschen und NICHT hochladen. Dies sind **komplette Projektdateien**, kein Patch.
3. Im Terminal:

```powershell
npm install
npm test
npm run check:js
npm run db:check
npm run policy:count
```

4. Falls `policy:count` weniger als 3000 Einträge meldet, **öffentliche Registrierung geschlossen lassen**, bis der Wortfilter vollständig ist.
5. Die Änderung prüfen und per GitHub veröffentlichen:

```powershell
git check-ignore -v .dev.vars
git ls-files .dev.vars
git status
git add -A
git --no-pager diff --cached --name-only
git commit -m "Kennely 2027.23 Einspruch & Performance Fix"
git push origin main
```

6. In Render im Web Service unter **Events / Deploys** prüfen, ob der neue Commit nach erfolgreichem Build auf **Live** steht. Auto-Deploy für Branch `main` muss aktiv sein.
7. Mit einem Testkonto den Ablauf prüfen: Sperren, Einspruch einreichen, als CEO in **Team > Einsprüche** nachsehen, Entscheidung begründen, Kontostatus erneut prüfen.

## Sicherheit und Daten

- Keine neuen SQL-Tabellen/Spalten, keine alten Einsprüche werden verändert.
- Keine geheimen Tokens im Projekt veröffentlichen. Im früheren Support-Chat waren Tokens in Screenshots sichtbar; diese sollten rotiert worden sein.
- Es gibt absichtlich **keine** öffentliche Einsicht in die Gründe fremder gesperrter Konten.
- Mehrere Teamrechte sind keine Freigabe für ungeprüfte Einsicht in private Chats.

## Prüfung in der Erstellungsumgebung

- 66 automatisierte Tests bestanden, einschließlich eines End-to-End-Tests für gespeicherte Kontosperren-Einsprüche und eines Tests der selektiven Team-Abfrage.
- `npm run check:js` erfolgreich.
- Lokaler HTTP-Test bestätigt `Cache-Control` für CSS/JS vs. HTML.
- Ein vollständiger Test auf dem produktiven Render-Service und auf echten Mobilgeräten ist noch offen.
