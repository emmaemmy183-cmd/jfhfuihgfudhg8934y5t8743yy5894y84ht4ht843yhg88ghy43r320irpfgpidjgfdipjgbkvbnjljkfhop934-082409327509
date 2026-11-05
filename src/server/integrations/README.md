# Integrations

## SendPulse (aktiv im Quellcode, noch mit realem Konto zu testen)

Datei: `src/server/mail.js`. SendPulse Transaktionsmail-API: `POST /smtp/emails` über serverseitige `Authorization`.

Benötigte Secrets: `SENDPULSE_API_KEY`, `MAIL_ENABLED=true`, `PUBLIC_ORIGIN=https://kennely.de`, `MAIL_FROM=no-support@kennely.de`, `MAIL_REPLY_TO=support@kennely.de`. Nur SendPulse aktivierte Sender verwenden.

Nach erfolgreichem Setup werden E-Mail-Bestätigung, Passwort-Reset und vom Team ausdrücklich gewählte Moderationsmails versendet. Der Mailprovider kann Anfragen ablehnen, insbesondere vor Aktivierung der Versanddomain oder bei ausgeschöpftem Kontingent.

## Didit (derzeit nicht eingebunden)

Auf Wunsch werden keine Ausweise verlangt. Dadurch ist die Altersbestimmung nur eine Selbstauskunft anhand des Geburtsdatums; über zusätzliche rechtliche Anforderungen ist noch keine verbindliche Bewertung erfolgt. Eine Didit-Integration kann später modular ergänzt werden, aber es sind keine Didit-Keys oder Workflows aktiv.
