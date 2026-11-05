# Kennely 2027.8: Oberfläche, Team und Leistung

## Änderungen
- Neues mehrteiliges mobiles Menü mit eigenen Bereichen für Beiträge, Nachrichten, Favoriten, Aktivitäten, Team und Einstellungen.
- Kompaktere mobile Profile, Navigation und Chatansicht; keine doppelte Leermeldung bei Unterhaltungen.
- Optimistische Likes, gespeicherte Beiträge, Follows und Nachrichten. Netzwerkfehler machen den lokalen Zwischenstand rückgängig.
- Mitteilungen werden beim Öffnen automatisch als gelesen markiert; Polling im Hintergrund nur bei sichtbarem Tab und in längeren Intervallen. Kein WebSocket auf Netlify Free.
- Neue Teamzentrale: getrennte Warteschlangen für Profilfotos, Beitragsmedien, Texte, Meldungen und Einsprüche, zusätzlich Support und Audit.
- Mitarbeiter-Nutzersuche mit Rollenkontrolle; Kontoerstellung und letzter erfolgreicher Login mit Datum und Uhrzeit. Kein Tracking einzelner Login-IP-Adressen, keine Einsicht in private Chats. E-Mail nur für Admin und CEO im begründeten Detailabruf.
- CEO kann eigenes Profilfoto mit mindestens 10 Zeichen Begründung freigeben; das wird gesondert auditiert. Für eine größere Plattform unabhängige Freigabe durch eine andere Person wieder vorziehen.
- Gezielter Datenbank-Index und einmaliges Login-Zeitstempel-Update, keine dauerhafte Ereignisprotokollierung.

## In VS Code aktualisieren
1. Vorherigen geklonten GitHub-Ordner beibehalten (mit `.git`).
2. Inhalt dieses Archivs in den GitHub-Ordner kopieren, vorhandene Projektdateien überschreiben. `.git` und `.dev.vars` nicht anfassen.
3. Im GitHub-Ordner: `npm install`, `npm test`, `npm run check:js`.
4. Alte Turso-Datenbanken zuerst sichern. Danach lokal mit korrekter `.dev.vars`: `npm run db:check` und `npm run db:migrate`. Die Migration ergänzt `last_login_at` und Indizes, bestehende Daten werden nicht gelöscht.
5. `git status`, `git add -A`, `git diff --cached --name-only` prüfen (keine geheimen Dateien), `git commit -m "Kennely 2027.8: Menü, Team, Performance"`, `git push origin main`.
6. Netlify Deploy-Log prüfen; Mobilgerät anschließend einmal neu laden.

## Grenzen
- Automatisierte Tests laufen lokal mit simulierten Turso-Verbindungen. Kein garantierter realer Netlify-Traffic, keine Browserlasttests oder vollständige rechtliche Prüfung.
- Kostenlose Netlify Functions sind kurzlebig; Nachrichten werden per gezielter Abfrage statt Socket synchronisiert.
- Live-Test von SendPulse, Moderation und Domain muss vor öffentlicher Nutzung erfolgen.
