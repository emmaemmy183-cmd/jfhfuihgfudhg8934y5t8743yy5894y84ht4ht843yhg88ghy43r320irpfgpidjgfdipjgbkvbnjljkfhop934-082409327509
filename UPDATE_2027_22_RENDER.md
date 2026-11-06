# Kennely 2027.22 – Update und Umstieg auf Render

Dieses ZIP enthält **das komplette Kennely-Projekt** auf Basis von 2027.20/2027.21, keine einzelnen Patches. Das bisherige GitHub-Repository, die beiden Turso-Datenbanken, die Domain **kennely.de** und Render bleiben erhalten.

## Funktionen und Grenzen

- Foto-Storys mit **0 bis 8 Textebenen** (auf dem Foto sind Texte optional), mehreren Storys pro Account, beweglichen/drehbaren Texten, Größen-/Zoomregler und zwei Finger zur Veränderung. Story-Likes werden in Turso gespeichert. Standardlebenszeit: 24 Stunden.
- Profilbilder groß öffnen; Bio, Stadt, Pronomen, verifizierte HTTPS-Social-Links und **freiwillige sexuelle Orientierung** bearbeiten. Die Orientierung ist **standardmäßig privat**, öffentliche Anzeige nur nach expliziter Aktivierung.
- Identitätsänderungen im Profil; E-Mail-Änderungen nur über Bestätigungslink an die neue Adresse, erneute Anfrage frühestens nach 60 Sekunden.
- Mitarbeiterrechte als Mehrfachauswahl; Support-Chats mit Rollen, Avatar, Badge und einem nur dort verwendeten Support-Namen, der vom CEO festgelegt wird. Moderationsgründe, Kategorien und Audit-Verläufe verbessert. Privater Prüfzugriff bleibt eng begrenzt und protokolliert; keine Freigabe privater Chats.
- Eigener Einspruchs-/Beschwerdepfad, gespeicherte Reaktionen und Status Gesendet/Gesehen. Gelikte Beiträge und Follows reagieren auf dem eigenen Gerät optimistisch; Synchronisierung zwischen verschiedenen Nutzern kann verzögert sein.
- SEO: öffentlich zugängliche `/registrieren`, `/hilfe`, Rechtstexte, `robots.txt`, `sitemap.xml`, Canonical/OG-Tags und Website-Strukturdaten. Google bestimmt allein, ob und wann Sitelinks entstehen.
- Bestehende Datensätze bleiben bei Anwendung der additiven Migrationen erhalten. Datenexport und Accountlöschung berücksichtigen die neuen Profilfelder.

**Einschränkungen:** Kein voll lizenzierter Musikkatalog, keine Reels und kein Videoupload. Support für Gäste nutzt das E-Mail-Programm, während eingeloggte Nutzer echte Support-Chats erhalten. Auf dem kostenlosen Render-Tarif sind Server-Kaltstarts und Verzögerungen möglich. Keine Garantie auf null Bugs ohne Tests auf der echten Domain und mehreren Mobilgeräten.

## 1. Auf deinem PC in VS Code

1. Zuerst **beide Turso-Datenbanken sichern** und eine Kopie deines bisherigen GitHub-Projektordners anlegen.
2. Dieses ZIP vollständig entpacken und die Dateien in deinen vorhandenen `kennely-github`-Ordner kopieren. **Nicht** `.git`, `.dev.vars`, `.env` oder deine lokalen geheimen Werte überschreiben. `node_modules` nicht kopieren.
3. VS Code: `Terminal → Neues Terminal`, im Projektordner:

```powershell
npm install
npm test
npm run check:js
npm run policy:count
npm run db:check
```

**Achtung Wortfilter:** `npm run policy:count` muss mindestens 3.000 reale Begriffe aus den installierten Wörterbuchpaketen melden. Solange diese Prüfung fehlschlägt, `REGISTRATION_MODE=closed` lassen und nicht öffentlich starten.

## 2. Bestehende Turso-Datenbanken migrieren

Die neuen SQL-Dateien sind `db/2027_21.sql` und `db/2027_22.sql` (Supportname und Profilfelder/Bestätigungslinks). Es werden **keine Datenbanken ersetzt**. Nach dem Backup:

```powershell
npm run db:migrate
npm run db:schema
```

Die Befehle verwenden deine lokale `.dev.vars`. Wenn ein Fehler auftritt: **Nicht blind weiterdeployen.** Die Fehlermeldung ohne Tokens/Secrets prüfen. Führe die Migration NICHT erneut auf einem anderen leeren oder falschen Turso-Projekt aus.

## 3. Code über GitHub → Render veröffentlichen

Dein Render **Web Service** ist bereits mit dem GitHub-Branch `main` verbunden. `kennely.de` muss im Render-Dashboard ein gültiges HTTPS-Zertifikat („Certificate Issued“) haben.

```powershell
git check-ignore -v .dev.vars
git ls-files .dev.vars
git status
git add -A
git --no-pager diff --cached --name-only
git commit -m "Kennely 2027.22 Render Update"
git push origin main
```

Vor dem Commit auf **keine** `.dev.vars`, `.env`, echten API-Tokens oder Passwortdateien im Staging achten. `git ls-files .dev.vars` muss leer zurückkommen. Bei fehlenden Änderungen zeigt Git „nothing to commit“ – dann keinen neuen Commit erzwingen.

Render baut nun automatisch neu. In **Render → dein Web Service → Events/Logs** müssen `Build successful`, `Running 'npm start'` und `Your service is live` erscheinen. Verwende `npm install` als Build Command und `npm start` als Start Command.

## 4. Render-Umgebungsvariablen

Mindestens (mit deinen existierenden **neuen**, geheim gehaltenen Werten):

```text
NODE_ENV=production
HOST=0.0.0.0
PUBLIC_ORIGIN=https://kennely.de
REGISTRATION_MODE=closed
LEGACY_DATING_ENABLED=false
```

Weiterhin die bekannten `TURSO_MAIN_URL`, `TURSO_MAIN_TOKEN`, `TURSO_MEDIA_URL`, `TURSO_MEDIA_TOKEN`, `IP_HASH_SECRET`, und bei aktiviertem Mailversand `MAIL_ENABLED`, `MAIL_FROM`, `MAIL_REPLY_TO`, `SENDPULSE_API_KEY`. Die Absenderadresse muss bei SendPulse verifiziert sein. Den Standortfilter `COUNTRY_LOCK` nach deinen tatsächlichen Nutzeranforderungen konfigurieren; „DE“ kann auch echte Nutzer durch ungenaue Geo-IP-Erkennung blockieren. Render stellt `PORT` selbst bereit.

Früher im Chat gezeigte geheime API-Schlüssel und Tokens müssen ersetzt/widerrufen werden. **Niemals** Screenshots von Render-Werten zeigen.

## 5. Google Search Console: Domain kennely.de

Das Eigentum einer **Domain-Property** wird über DNS bestätigt, nicht allein durch das `<meta>`-Tag der Website.

Bei **one.com → DNS-Einstellungen → Persönliche DNS-Einträge** einen **TXT**-Eintrag für die Hauptdomain anlegen:

```text
Typ:   TXT
Host:  @ (oder leer, wenn die one.com-Oberfläche das für die Root-Domain vorsieht)
Wert:  google-site-verification=xRFaT-Pbhld_bCdE5uUFru7y6ownGNSYN4ql4j4-Nvs
```

A-/CNAME-/MX-Einträge **nicht** ersetzen; der Wert gehört ausschließlich in einen TXT-Record. Nach DNS-Propagation in **Google Search Console → Verify** klicken. Anschließend Sitemap `https://kennely.de/sitemap.xml` einreichen, Startseite und Rechtsseiten per URL-Prüfung anstoßen.

Google kann `Kennely` später mit Unterlinks wie „Registrieren“, „Datenschutz“, „Impressum“ darstellen, **garantiert ist das nicht**. Indexierung und Ranking auf allgemeine Begriffe wie „Social Media“ sind nicht erzwingbar.

## 6. Abnahmecheck vor dem öffentlichen Start

- HTTPS auf `https://kennely.de`, Anmeldung, Session-Refresh, E-Mail-Versand und 60-Sekunden-Sperre auf der echten Domain.
- Supportanfrage + Supportantwort über zwei Testkonten; Mitarbeiterprofil, Badge und Name nur dort sichtbar.
- Story ohne Text, Story mit mehreren Texten, Pinch/Drag/Rotation auf realem Handy; Like/Unlike nach Schließen und erneutem Öffnen; Antwort im Chat.
- Sperre → Einspruch → Teamentscheidung → Entsperrung; vollständig protokollierter Grund und Regelkategorie.
- Privatkonto, Follow-Anfrage, Storysichtbarkeit, Blockieren, Likes, Profilzugriff und Berechtigungen mit verschiedenen Konten.
- Datenbankbackup prüfen und wiederherstellen können, Warn-/Moderationsfilter in verschiedenen Sprachen überprüfen.
- Impressum, Datenschutz, Jugendschutz und gesetzliche Pflichten vor öffentlichem Launch unabhängig prüfen.

Nicht alle Live-Szenarien können durch lokale Node-Tests bestätigt werden; diese Checkliste ist Teil der Veröffentlichung.
