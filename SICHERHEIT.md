# Sicherheitskonzept

- Passwörter PBKDF2-SHA256 mit 600.000 Iterationen und individuellem Salt, niemals Klartext
- Sitzungscookie HttpOnly, SameSite=Lax, auf HTTPS Secure
- Keine Tokens oder Zugangsdaten im Frontend, keine `.dev.vars` in Git
- Eingaben serverseitig prüfen, HTML aus Benutzertexten escapen, Medien auf Signaturen und Dateigröße prüfen
- Inhalte vor öffentlicher Sichtbarkeit durch Moderation prüfen, private Fotos vor Freigabe nicht öffentlich ausliefern
- Rollen auf API-Ebene, Protokoll von Moderations- und behördlichen Anfragen
- SSE nur nach gültiger Session, Einzelinstanz. Bei Skalierung braucht es einen gemeinsamen Pub/Sub-Dienst.
- Für E-Mail-Sendungen ein globaler stündlicher Datenbankzähler und je Empfänger eine eigene Grenze
- IP-Ländererkennung ist ungenau und VPN-anfällig. Hosting und Geo-IP-Daten regelmäßig überprüfen
- Vor Livebetrieb unabhängige Sicherheitsprüfung/Lasttest und Löschkonzept erforderlich
