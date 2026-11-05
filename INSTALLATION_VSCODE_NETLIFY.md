# Kennely 2027.11 – vollständiges Projekt für Netlify Free

Dies ist **ein komplettes Projektarchiv**, kein Teil-Patch. Grundlage ist die bekannte Kennely-Version 2027.9 mit den vorhandenen APIs und Turso-Schemata. Die Optimierungen sind bewusst kompatibel und betreffen hauptsächlich mobile Darstellung, Barrierefreiheit und die Nutzerverwaltung.

## Änderungen

- CEO/Team-Nutzerverwaltung: Nutzername, Anzeigename und Kontostatus separat und gut lesbar; Aktionen auf dem Handy in einem zweispaltigen Raster, auf sehr schmalen Geräten einspaltig.
- Das Seitenmenü zeigt bei fehlenden alten Benutzernamen eine verständliche Information statt eines leeren `@`.
- Mobilnavigation: sichtbares Plus beim Punkt **Erstellen**. Außerdem wird der bisher unsichtbare Toast außerhalb von Benachrichtigungen tatsächlich ausgeblendet, sodass er den mittleren Navigationsbutton nicht mehr überdeckt.
- Scroll- und Überlaufabsicherung sowie 44px große Aktionsflächen, Fokus-Indikatoren, iPhone-Safe-Area-Abstände.
- `aria-live` für dynamische Trefferliste und `aria-current` in der Navigation.
- Bestehende Turso-Datenbanken, Anmeldung, E-Mail-Freigabe, Beiträge, Stories, Chats, Teamrechte und Moderation bleiben erhalten.
- **Keine neuen Turso-Migrationen** von 2027.9 nach 2027.11 erforderlich.

## Installation in dein bereits geklontes GitHub-Projekt

1. ZIP herunterladen und in einen separaten Ordner entpacken.
2. **Den Inhalt** des entpackten Ordners in `C:\Users\Mah\Downloads\kennenlynew\kennely-github` kopieren. Vorhandene Dateien ersetzen. Den Ordner `.git` nicht löschen.
3. Echte Secrets (`.env`, `.dev.vars`, Turso-Tokens, SendPulse-Schlüssel) **nie** aus dem Archiv übernehmen oder zu GitHub committen.
4. VS-Code-Terminal im GitHub-Klon öffnen und ausführen:

```powershell
npm ci
npm test
npm run check:js
git check-ignore -v .dev.vars
git ls-files .dev.vars
git status
```

`git ls-files .dev.vars` muss **keine Ausgabe** liefern. Bitte die Ausgabe von `git status` prüfen, bevor du committest.

```powershell
git add -A
git --no-pager diff --cached --name-only
git commit -m "Kennely 2027.11 – Mobile und Team UI"
git push origin main
```

Netlify deployt automatisch, wenn das GitHub-Repository mit dem richtigen `main`-Branch verbunden ist. Netlify-Logs und Browser testen.

## Produktionsstart

- HTTPS für `kennely.de` aktiv und `PUBLIC_ORIGIN=https://kennely.de` gesetzt.
- `REGISTRATION_MODE=public` nur bei nachweislich funktionierendem Mailversand (`MAIL_ENABLED=true`, gültiger SendPulse-Schlüssel, bestätigter Absender). Ein `publicReady:true` ist kein Zustellnachweis.
- Die beiden Turso-URLs/Tokens als Netlify-Umgebungsvariablen im Functions-Kontext setzen, alte veröffentlichte Schlüssel widerrufen.
- Neue Konten, Mailbestätigung, Login/Logout, Chat, Moderation, Datenexport/-löschung und Länderbeschränkung **live prüfen**. Nicht jede rechtliche oder sicherheitstechnische Anforderung wird durch erfolgreiche Unit-Tests abgedeckt.
- Falls du von einer älteren Version als 2027.9 aktualisierst, **beide Datenbanken sichern** und die bestehenden Upgrade-Migrationen prüfen.

## Bekannte Grenzen

- Serverlose Funktionen haben keine dauerhafte WebSocket-Verbindung: neue Nachrichten werden in Intervallen abgerufen.
- Das Fehlen eines Benutzernamens im Datenbankdatensatz wird in der Oberfläche nicht automatisch korrigiert; verwalte ihn über die berechtigte Teamfunktion.
- Netlify Free hat Verbrauchsgrenzen; reale Last und mobile Safari müssen auf der veröffentlichten Domain geprüft werden.
- Weder das Archiv noch die automatischen Tests stellen eine Sicherheits- oder Rechtsfreigabe für einen öffentlichen Betrieb dar.
