# Kennely 2027.9: Upgrade von 2027.8 zu Netlify Free

**Voraussetzung:** Es besteht bereits ein GitHub-Repository, das mit Netlify verbunden ist. Der Update-Ordner enthält weder `.git` noch echte Geheimnisse. Änderungen an produktiven Nutzerdaten nur nach einem Backup ausführen.

## Funktionsumfang

- Touch-optimierte Oberflächen, eigenes Team-Kürzel im mobilen Header, ausführliches Hamburger-Menü und neue Moderationsregister.
- Sofortige UI-Rückmeldung für Likes/Follows und eigene Chatnachrichten; Hintergrundabgleich. Ankommende Chat-Nachrichten nur über Netlify-taugliches Polling, keine garantierte Echtzeit.
- Unread-Zähler am Nachrichten-Tab; Benachrichtigungen beim Öffnen gesammelt markieren.
- Username erforderlich, 10–24 Zeichen, Anzeigename optional (Fallback = Username). Für bereits bestehende Konten gibt es keine Zwangsumbenennung.
- Privates Konto, Follow-Anfragen, serverseitiger Schutz der Posts und Stories gegen Nicht-Follower; öffentliche Reposts privater Storys gesperrt.
- Geschichten mit Like, Reply und moderiertem Repost; Meldungen und Aufforderungen werden nicht dem Zielpublikum angezeigt.
- Mehrsprachige **kuratierte** Wortliste mit Ausnahmen/Zusätzen und menschlicher Prüfung statt automatischer unwiederbringlicher Löschung. Kein Anspruch auf vollständige Abdeckung aller Sprachen oder tausender Wörter.
- Eigene Team-Register für Profilfotos, Medien, Texte, Meldungen, Kontosperren, Rechte und Wortfilter (je nach Teamrolle).
- CEO kann Rollen, individuelle Capability-Rechte, Badge-Verifikation und Labels bearbeiten; kein Zugriff auf private Chats ohne konkreten gemeldeten Beleg und Protokollierung.
- Sperren: Regelgrund, Einspruch innerhalb der Website und Wiederherstellungsfrist. **Keine automatisierte endgültige Löschung nach 30 Tagen**; gesetzliche Aufbewahrungs- und Beschwerdepflichten können länger sein, und endgültige Löschung erfordert zusätzliche Prüfung und vorhandenes manuelles Löschskript.
- Datensparsame Zuordnungstabellen. Erfolgreicher Login aktualisiert nur `last_login_at` einmal; keine durchgängige Klickhistorie oder IP-Loginhistorie.
- Rechtsseiten `/legal/regeln` und `/legal/beschwerden` mit DSA-Verfahrenshinweisen. Die Angaben sind Vorlagen, keine Rechtsberatung und keine Garantie vollständiger Compliance.

## Windows + VS Code: exakte Schritte

1. Auf dem lokalen PC die beiden Turso-Datenbanken exportieren/sichern, insbesondere vor der Datenbankmigration.
2. `Kennely_Netlify_2027_9_Update.zip` in einen **separaten** Ordner entpacken.
3. In VS Code den bestehenden Git-Klon öffnen, zum Beispiel `C:\Users\Mah\Downloads\kennenlynew\kennely-github`.
4. Den **Inhalt** des entpackten Update-Ordners in das Stammverzeichnis des geklonten Repositorys kopieren und vorhandene Projektdateien ersetzen. **Nicht den `.git`-Ordner löschen.** Bestehende `.dev.vars` lokal belassen.
5. VS Code → Terminal (PowerShell) und folgende Kommandos nacheinander ausführen:

```powershell
npm install
npm test
npm run check:js
npm run db:check
# Datenbankbackup zuerst!
npm run db:migrate
```

6. Nur nach erfolgreicher Migration: Änderungen und Geheimnisschutz prüfen.

```powershell
git status
git check-ignore -v .dev.vars
git ls-files .dev.vars
git add -A
git --no-pager diff --cached --name-only
```

`git ls-files .dev.vars` muss **leer** bleiben; die ausgegebene Liste darf keine Tokens, `.env` oder `.dev.vars` enthalten.

```powershell
git commit -m "Kennely 2027.9 - Privatprofile, Team, Performance"
git push origin main
```

7. Im Netlify-Dashboard unter **Deploys** das neueste Deployment überprüfen. Netlify Free veröffentlicht den Push bei korrekt angebundener Git-Branch-Konfiguration automatisch. Bei Fehlern in den Deploy-Logs nachsehen.
8. Auf `https://kennely.de` mit mindestens zwei Testkonten prüfen: Folgerequest für privates Konto, Chat-Unread-Zähler, Fotowarteschlange, Rollenrechte und Verifizierungs-E-Mail.

## Konfiguration

`REGISTRATION_MODE=public` benötigt funktionierende E-Mail-Bestätigung. SendPulse-Sender muss bestätigt, `MAIL_ENABLED=true`, `SENDPULSE_API_KEY` gültig und `PUBLIC_ORIGIN` die echte HTTPS-Origin sein. **Ein frei sichtbarer Bestätigungslink ohne Zustellung an die tatsächliche Postfachadresse belegt keine E-Mail-Inhaberschaft.** Kein Testschlüssel auf GitHub laden.

Die neuen SQL-Tabellen sind in `db/2027_9.sql`; `scripts/migrate.mjs` ergänzt `profiles.is_private` und `social_dms.read_at` vor Anlage der Indizes. Die Migration ist additiv; sie läuft in den beiden Turso-Datenbanken und ist nicht übergreifend atomar. Vorher Backup anlegen.

## Manuelle Kontolöschung

```powershell
npm run user:delete -- --email=beispiel@example.de
# Erst nach Backup, Prüfen auf Einsprüche und zulässige Aufbewahrung:
npm run user:delete -- --email=beispiel@example.de --bestaetigen
```

Das Skript löscht zugehörige Daten in beiden Datenbanken; bei Verbindungsfehlern kann eine Nachprüfung erforderlich sein. Keine automatische gesetzliche Löschfrist wird hier behauptet. Mitarbeiter sollen nicht ohne explizite Berechtigung und Bestätigung endgültig löschen können.

## Belastung und Kosten

Netlify Free führt keine dauerhaften WebSocket-Server aus. Bei einem offenen Chat werden neue Inhalte im Hintergrund in Intervallen nachgeladen. Polling-, Medien- und Bildaufrufe verbrauchen Kontingent. Für höhere Nutzerzahlen ist eine kosten- und datenschutzbewusste Hosting-Architektur nötig. Die hier vorgesehenen Abfragen sind paginiert/limitiert, aber die Performance unter realer Last ist noch nicht gemessen.
