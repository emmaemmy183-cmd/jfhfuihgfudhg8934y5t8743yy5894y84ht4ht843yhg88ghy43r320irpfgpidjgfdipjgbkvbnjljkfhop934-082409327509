# Kennely Social 2027.13 – vollständiges Netlify-Projekt

**Neu:** [UPDATE_2027_13.md](UPDATE_2027_13.md). Privates Konto und Profilidentität direkt sichtbar, unabhängig von fehlerhaften Nebenabfragen.

# Kennely Social 2027.12 · vollständiges Netlify-Projekt

Eine fotoorientierte Social-Media-Plattform ab 16 Jahren mit Feed, Entdecken,
Profilen, privaten Konten, Nachrichten, Kommentaren, Geschichten, Rollen,
individuellen Mitarbeiterrechten und Moderation. Die Website nutzt **Netlify
Free** für die Auslieferung und Functions, **zwei bestehende Turso-Datenbanken**
für Daten und **SendPulse** für E-Mail. Der Domainname bleibt `kennely.de`.

**Bitte mit [`UPDATE_2027_12.md`](./UPDATE_2027_12.md) beginnen.** Dort sind die
Update-Schritte für ein bestehendes GitHub-Repository, die additive Migration
und die Prüfungen beschrieben. Bisherige Projektversionen 2027.8 bis 2027.11
sind berücksichtigt; die neuen Features basieren auf 2027.10 und die mobilen
UI-Fixes auf 2027.11.

## Neu bzw. vervollständigt

- Nutzername für jeden Account, auch Mitarbeiter, alle 30 Tage änderbar;
  Anzeigename optional, alle sieben Tage änderbar.
- Kommentarthreads in einem Dialog, Likes, Antworten, Melden, bestätigtes
  Löschen durch Kommentarverfasser oder Postersteller, mobile Long-Press-Aktionen.
- Direktnachrichten mit Emoji-Reaktionen und Doppeltipp-Herz; Chat-Header führt
  zum Profil und lässt die Rücknavigation zu.
- Sichtbares, mittiges Plus statt nativer Dateiauswahl; nicht beschnittene
  Feedbilder und Vollbildansicht; zurückhaltendes Laden weiterer Bilder.
- Privatsphäre-Einstellungen für privates Konto, Nachrichtenanfragen, Follower,
  Kommentare und Auffindbarkeit. Berechtigte Teammitglieder dürfen im Rahmen
  ihrer Aufgabe weiterhin Kontakte aufnehmen.
- Inklusive Geschlechtsauswahl, getrennte Labels/Verifikation, abgestufte
  Mitarbeitenden-Berechtigungen und Audit mit Kontoname, Avatar und Badge.
- Stabiles, scrollbareres mobiles Menü, anpassbare Team-Nutzersuche, direkter
  Seitenaufbau nach Loginprüfung ohne kurzen Gastbildschirm.
- Additive, sparsame Turso-Migration; moderierte Wortliste mit mehreren Sprachen,
  zusätzlichen verbotenen rassistischen Beleidigungen und zählbaren Einträgen.

## Lokale Checks

```powershell
npm install
npm run policy:count
npm test
npm run check:js
```

Für lokale Datenbankchecks muss eine **private**, nicht veröffentlichte
`.dev.vars` mit gültigen Turso-Zugangsdaten existieren. Vor Änderungen beide
Datenbanken sichern. Danach:

```powershell
npm run db:check
npm run db:migrate
```

Vor produktiver Freischaltung sind Netlify, SendPulse, E-Mail-Bestätigung,
Länderprüfung, Alters- und Jugendschutz, Datenschutztexte, Medienberechtigungen
und Smartphone-Browser zu testen. Automatische Tests ersetzen keinen
Sicherheitsaudit. Keine Garantie für verzögerungsfreie Netzwerkanfragen.

**Sicherheit:** Die Zip-Datei enthält ausschließlich Vorlagen wie
`.dev.vars.example` und `.env.example`, keine echten Zugangsdaten.
`*.env`, `.dev.vars`, API-Keys und Tokens gehören weder zu GitHub noch ins ZIP.
Früher öffentlich geteilte Secrets widerrufen/ersetzen.

**Wortfilter:** Bei `npm install` wird die externe Sammlung `naughty-words`
installiert. Mindestens 3000 unterscheidbare Einträge müssen mit
`npm run policy:count` bestätigt werden; bei fehlenden Einträgen blockiert die
öffentliche Konfiguration Inhaltsannahme. Eine vollständige Erkennung aller
Schimpfwörter weltweit ist nicht möglich. Treffer gehen zur menschlichen
Prüfung, werden nicht als Rechtsverstoß automatisch gelöscht. Angaben zur
Wortlistenlizenz: [`WORTFILTER_QUELLEN.md`](./WORTFILTER_QUELLEN.md).

## Projektstruktur

- `public/`: Website, CSS, JS, Icons, rechtliche Vorlagen.
- `src/server/`: Backend, Autorisierung, Moderation, Nutzerverwaltung.
- `netlify/functions/`: serverlose API-Anbindung.
- `netlify/edge-functions/`: Länderfilter.
- `db/`: Schemata und additive Migrationen.
- `scripts/`: Prüf-, Migrations- und Kontoverwaltungsskripte.
- `tests/`: API- und Regressionstests.
