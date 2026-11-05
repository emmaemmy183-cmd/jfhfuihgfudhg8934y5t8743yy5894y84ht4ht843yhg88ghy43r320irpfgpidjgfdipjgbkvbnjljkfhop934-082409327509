# Mehrsprachiger Wortfilter

Die Produktion verwendet das Paket `naughty-words` Version 1.2.0 aus dem
LDNOOBW-Projekt: https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words

**Attribution:** © 2012–2020 Shutterstock, Inc. und die LDNOOBW-Beitragenden.
**Lizenz:** Creative Commons Attribution 4.0 International
https://creativecommons.org/licenses/by/4.0/

Die mit npm install eingebundene Sammlung deckt zahlreiche Sprachen ab. Die genaue
Zahl unterscheidbarer Begriffe kann durch Duplikate, Schreibvarianten und Releases
variieren. Beim Start kann die Anzahl über `DEFAULT_TERMS.length` geprüft werden.
Es gibt keine vollständige Liste »aller Schimpfwörter in allen Sprachen«.

Treffer führen bei Inhalten **zur menschlichen Prüfung**, nicht zu einer
unwiderruflichen Löschung. Treffer in Nutzernamen werden abgewiesen.
Kontext, Zitate, Reclamations und regionale Besonderheiten können Fehlalarme
verursachen. CEO/Moderation kann einzelne Regeln ergänzen oder ausnehmen.

### Ergänzung 2027.14

Zusätzlich verwendet Kennely das npm-Paket `cuss` Version 2.2.0 (MIT-Lizenz,
© Titus Wormer; https://github.com/words/cuss). Eingebunden werden **ausschließlich**
Einträge mit der höchsten Konfidenzbewertung `2` aus Englisch, Arabisch
(Lateinschrift), Spanisch, Französisch, Italienisch und Portugiesisch.
Kontext und harmlose Homonyme machen menschliche Prüfung weiterhin notwendig.
Wörter mit der Wertung 0 oder 1 werden aus dieser Quelle nicht übernommen.

**Prüfung nach `npm install`:** `npm run policy:count`. Die kombinierte eindeutige
Gesamtzahl muss >= 3.000 sein. Kann der Wert nicht erreicht werden, ist dies
eine offene Einschränkung, keine bestandene Sicherheitsprüfung.
