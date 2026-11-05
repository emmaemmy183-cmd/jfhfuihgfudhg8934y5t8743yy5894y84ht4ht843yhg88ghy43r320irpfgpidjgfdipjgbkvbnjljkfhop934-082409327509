# Kennely 2027.12 installieren und veröffentlichen

Siehe zuerst **[UPDATE_2027_12.md](UPDATE_2027_12.md)** für alle Schritte,
insbesondere Datenbankbackup, npm-Installation, `policy:count`, Tests,
Migration und Geheimnisschutz. Diese Datei ist ein kurzer Einstieg.

1. ZIP separat entpacken; **Inhalt** in den bestehenden GitHub-Klon kopieren.
2. `.git` und lokale `.dev.vars` erhalten; niemals Secrets committen.
3. `npm install`, `npm run policy:count`, `npm test`, `npm run check:js`.
4. Nach MAIN- und MEDIA-Backup `npm run db:check`, `npm run db:migrate`.
5. `git status`, `git ls-files .dev.vars`, `git diff --cached --name-only` und
   das vollständige Update in `git push origin main` senden.
6. Auf Netlify die beiden Turso-Verbindungen, SendPulse und Domain prüfen.
7. Das Deployment in einem echten Handybrowser und mit zwei Accounts testen.

**Wichtig:** Die `naughty-words`-Abhängigkeit wird online durch npm geladen.
Weniger als 3000 Begriffe im Zählcheck bedeuten: Veröffentlichung noch nicht
freigeben. Aktive Moderation und Datensicherung bleiben erforderlich.
