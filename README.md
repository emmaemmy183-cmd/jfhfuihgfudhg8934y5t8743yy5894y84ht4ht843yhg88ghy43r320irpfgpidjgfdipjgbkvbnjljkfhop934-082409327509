# Kennely Social · Deutschland · Version 2027.6

Kennely ist eine deutschsprachige, fotoorientierte Social-Media-Webanwendung ab 16 Jahren.

## Was enthalten ist

- Startseite mit Stories, Foto- und Textbeiträgen, Kommentaren, Likes, gespeicherten Beiträgen
- Entdecken mit Nutzernamensuche und Profilen
- fünf mobile Haupttabs und ein Menü für Einstellungen und Aktivitäten
- Instagram-artige Profile: Bio, Beiträge, Follower, gefolgte Konten und insgesamt erhaltene Likes
- private Chatnachrichten mit Anfragen; nach Blockierung bleibt der alte Chat lesbar, neue Nachrichten sind gesperrt
- Echtzeitbenachrichtigungen und Tippanzeige über Server-Sent Events auf einem Node.js-Server
- Dark Mode, Profileinstellungen, Passwort ändern/zurücksetzen, Blockieren, Konto löschen, Datenexport
- deutsche Rechtsseiten mit Kontaktadresse `mahmoudbankousli@gmail.com`
- Staff-Dashboard, Rollen, blaue Team-Checks, Foto- und Beitragsmoderation vor Veröffentlichung
- SendPulse für notwendige Mails mit globalem Stundenlimit (Standard: 10) und maximal zwei Mails je Empfänger/Stunde
- zwei Turso-Datenbanken, Fotos bis 650 KB nach Komprimierung, **keine Videos oder Reels**

## Lokale Einrichtung (Windows, Node.js 22+)

1. Alte Turso-Datenbanken sichern. Zugangs-Tokens, die in Chats gelandet sind, zuerst widerrufen.
2. ZIP in einen neuen Ordner entpacken. `Copy-Item .dev.vars.example .dev.vars` ausführen.
3. In `.dev.vars` neue echte Turso-URLs und Tokens eintragen, außerdem `IP_HASH_SECRET` als zufälligen Wert.
4. Die Werte lokal belassen. `.dev.vars` niemals zu GitHub hochladen.
5. Im PowerShell-Fenster diese Befehle ausführen:

```powershell
npm install
npm run db:check
npm run db:migrate
npm test
npm run dev
```

6. Im Browser `http://127.0.0.1:8787` öffnen.

`db:migrate` erweitert das vorhandene Schema. Bestehende User-Daten werden nicht absichtlich gelöscht. Bei unbekannten alten Datenbankständen Backup und Schema prüfen, bevor du migrierst.

## Konto löschen

Im Profil über **Menü → Einstellungen und Aktivitäten → Konto löschen** kann ein angemeldeter Nutzer sein Konto mit Passwortbestätigung löschen. Als Betreiber kannst du einen Löschvorgang vorab **nur ansehen**:

```powershell
npm run user:delete -- --email=beispiel@domain.de
```

Nur nach Backup und expliziter Entscheidung:

```powershell
npm run user:delete -- --email=beispiel@domain.de --bestaetigen
```

Der CLI-Befehl bearbeitet auch Referenzen und Bilder; zwei verteilte Datenbanken sind dabei nicht atomar, weshalb vor einer Löschung ein Backup nötig ist. Für laufende Meldungen oder gesetzliche Aufbewahrungspflichten die rechtliche Lage prüfen. Bitte keine komplette `users`-Tabelle löschen.

## CEO-Rechte

Nach Erstellung eines eigenen Kontos:

```powershell
npm run owner:assign -- mahmoudbankousli@gmail.com
```

Anschließend ab- und neu anmelden. Wenn schon ein Owner existiert, weist das Skript keine zweite Owner-Rolle zu.

## E-Mail

Die Domain `kennely.de` muss in SendPulse authentifiziert sein, und das Absenderpostfach `no-support@kennely.de` muss zum Senden zugelassen sein. Antworten werden an `mahmoudbankousli@gmail.com` gerichtet. `MAIL_ENABLED=false` ist beim lokalen Start okay; öffentliche Registrierung setzt funktionierende Bestätigungs-E-Mails voraus. Die globale SendPulse-Beschränkung von 10 pro Stunde ist in Turso gespeichert und kann bis max. 50 mit `EMAIL_HOURLY_CAP` angepasst werden. Für Likes, Follower oder normale Chats werden keine E-Mails gesendet.

## Veröffentlichung ohne Cloudflare

Kennely benötigt **Node.js 22+ mit dauerhaftem Prozess, HTTPS, eigener Domain und optional einem Reverse Proxy**. Ein gewöhnliches statisches Webhosting ist nicht ausreichend. one.com kann weiterhin der Domainregistrar bleiben. Ob das gebuchte one.com-Hosting diesen Node-Prozess ausführen kann, musst du beim Anbieter prüfen; andernfalls brauchst du einen geeigneten Node-Hosting-Dienst oder VPS. Ein dauerhafter Server ist nicht unbegrenzt kostenlos.

- `NODE_ENV=production` und `PUBLIC_ORIGIN=https://kennely.de` konfigurieren.
- `REGISTRATION_MODE=public` erst nach vollständigem Test und funktionierendem SendPulse-Versand aktivieren.
- `COUNTRY_LOCK=DE` schaltet eine IP-basierte Deutschlandkontrolle ein. Sie setzt die im Projekt als optionale NPM-Abhängigkeit vorgesehene Geo-IP-Datenbank voraus und ist weder perfekt noch VPN-sicher.
- `HOST=127.0.0.1` hinter HTTPS-Reverse-Proxy und `TRUST_PROXY=true` ausschließlich bei vertrauenswürdiger Proxy-Konfiguration.
- `npm start` auf dem Server ausführen. Prozessmanager und Sicherungsplan sind Verantwortung des Betreibers.
- one.com DNS: A/AAAA Record auf die IP des Servers bzw. CNAME nach Vorgabe des Hosts; HTTPS beim Host aktivieren. Niemals pauschal vorhandene MX/SPF/DKIM-Einträge löschen.

## Sicherheit und rechtliche Punkte

Diese Entwicklungsdateien sind kein von Juristen geprüfter Live-Dienst. Die Rechtsseiten verwenden bekannte Betreiberangaben, können aber ohne tatsächlichen Node-Hoster, echte Datenflüsse, Vereinbarungen zur Auftragsverarbeitung, definierte Löschfristen und Tests nicht vollständig sein. Vor dem öffentlichen Start die internen Dateien `VOR_DEM_LAUNCH.md`, `SICHERHEIT.md` und `RECHTSPRUEFUNG.md` durcharbeiten.

Mit 16- und 17-jährigen Nutzern gelten stärkere Anforderungen an Privatsphäre, Meldewege und Jugendschutz. Die bloße Eingabe des Geburtsdatums bestätigt das Alter nicht verlässlich.

## Technologie

- Node.js Standardbibliothek für Webserver und SSE, keine Browser-Bibliotheken von Drittanbietern
- Turso libSQL HTTP (zwei Datenbanken)
- optionale `geoip-lite`-Datenbank für Standortkontrolle
- HTML/CSS/ES Modules, minimale Browser-Abhängigkeiten

