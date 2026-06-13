# todo.txt App

Eine vollständig clientseitige Web-App zur Verwaltung von Aufgaben im [todo.txt-Format](http://github.com/todotxt/todo.txt). Kein Backend, keine Datenbank — alle Daten bleiben im Browser.

**Live:** [github.io/todo.txt-App](https://raffa3l.github.io/todo.txt-App/)

---

## Features

| Feature | Beschreibung |
|---|---|
| **todo.txt-Format** | Vollständige Unterstützung der offiziellen Spezifikation |
| **Prioritäten (A)–(Z)** | Farbliche Hervorhebung, klickbares Cycling durch Klick auf Badge |
| **Projekte +Tag** | Klickbar als Filter, Autocomplete beim Tippen |
| **Kontexte @Tag** | Klickbar als Filter, Autocomplete beim Tippen |
| **Fälligkeitsdaten** | `due:YYYY-MM-DD` mit Überfällig-/Heute-Markierung |
| **Format-Toolbar** | Interaktive Leiste zum Einfügen von Priorität, Tags, Datum |
| **Archiv-Ansicht** | Archivierte Todos sichtbar, aufklappbar, wiederherstellbar |
| **Import/Export** | `todo.txt` und `done.txt` direkt im Browser öffnen/speichern |
| **localStorage** | Automatische Persistenz ohne Server |
| **Dark Mode** | Systemunabhängig umschaltbar |
| **Suche & Filter** | Volltext, Priorität, Projekt, Kontext kombinierbar |
| **Filter-Chips** | Aktive Filter als entfernbare Chips oberhalb der Liste |
| **Sortierung** | Nach Priorität, Datum, Alphabet oder Originalreihenfolge |
| **Bulk-Aktionen** | Mehrere Todos gleichzeitig erledigen oder löschen |
| **Tastaturkürzel** | `n` Neu · `/` Suche · `Esc` Filter zurücksetzen |
| **Autocomplete** | +Projekte und @Kontexte werden beim Eingeben vorgeschlagen |
| **Responsiv** | Funktioniert auf Desktop und Mobilgeräten |

---

## todo.txt Format

```
(A) 2024-01-15 Bericht fertigstellen +Arbeit @Büro due:2024-01-20
(B) Einkaufen gehen +Privat @Stadt
x 2024-01-14 2024-01-10 Zahnarzttermin +Gesundheit
```

| Element | Syntax | Beispiel |
|---|---|---|
| Priorität | `(A)`–`(Z)` am Zeilenanfang | `(A) Todo-Text` |
| Erstellungsdatum | `YYYY-MM-DD` nach Priorität | `(B) 2024-01-10 Text` |
| Erledigt | `x ` am Zeilenanfang | `x 2024-01-15 Text` |
| Erledigungsdatum | Direkt nach `x ` | `x 2024-01-15 2024-01-10 Text` |
| Projekt | `+Name` im Text | `Text +Projektname` |
| Kontext | `@Name` im Text | `Text @Kontext` |
| Fälligkeit | `due:YYYY-MM-DD` | `Text due:2024-01-20` |
| Schwellendatum | `t:YYYY-MM-DD` | `Text t:2024-01-15` |

Referenz: [github.com/todotxt/todo.txt](https://github.com/todotxt/todo.txt)

---

## Schnellstart

### Option A — Direkt öffnen (kein Server nötig)

```bash
git clone https://github.com/NousWorksHQ/todo.txt-App.git
cd todo.txt-App
open index.html   # macOS
# oder: xdg-open index.html  (Linux)
# oder: start index.html     (Windows)
```

> **Hinweis:** Für den Import/Export via File API muss die App über einen HTTP-Server ausgeliefert werden (nicht als `file://`-URL).

### Option B — Mit lokalem Webserver

```bash
# Python 3
python3 -m http.server 8080

# Node.js (npx, kein Install nötig)
npx serve .
```

Dann im Browser: `http://localhost:8080`

---

## Projektstruktur

```
todo-txt-app/
├── index.html              # Einstiegspunkt — alle Komponenten referenziert
├── favicon.svg             # App-Icon (Haken auf blauem Grund)
├── README.md               # Diese Datei
├── LICENSE                 # MIT-Lizenz
├── .gitignore
│
├── css/
│   └── style.css           # Alle Styles (CSS Custom Properties, Dark Mode)
│
└── js/
    ├── parser.js           # todo.txt Format-Parser & Serialisierer
    ├── storage.js          # localStorage & File API (Import/Export)
    ├── ui.js               # DOM-Rendering, Filter-Chips, Archiv, Toasts, Modal
    ├── format-toolbar.js   # Interaktive Formatierungsleiste
    └── app.js              # Hauptlogik, State, Event-Handler
```

### Architektur-Entscheidungen

- **Kein Build-Schritt**: Alle Dateien sind natives ES6+ und laufen direkt im Browser.
- **Keine externen Abhängigkeiten**: Kein Framework, kein CDN. Läuft offline.
- **IIFE-Module**: `TodoParser`, `Storage`, `UI` und `FormatToolbar` sind über IIFEs gekapselt.
- **Event-Delegation**: Die Todo-Liste verwendet ein einzelnes Event-Listener-Pattern statt pro-Item-Handler.
- **XSS-Schutz**: Alle User-Inputs werden via `esc()`-Funktion vor dem Einfügen ins DOM escapt.

---

## Format-Toolbar

Sowohl das Neu-Todo-Feld als auch das Bearbeitungs-Modal enthalten eine Formatierungsleiste:

| Schaltfläche | Funktion |
|---|---|
| `(A)` `(B)` `(C)` `(D)` `(E)` | Priorität setzen — nochmals klicken entfernt sie |
| `✕` | Priorität entfernen |
| `＋ Projekt` | Dropdown mit bestehenden Projekten; freie Eingabe möglich |
| `＠ Kontext` | Dropdown mit bestehenden Kontexten; freie Eingabe möglich |
| `📅 Fällig` | Datumsfeld direkt in der Toolbar einblenden |
| `Heute` | Fälligkeit auf heutiges Datum setzen |
| `✓ Erledigt` | `x DATUM` Präfix ein-/ausschalten |

---

## Tastaturkürzel

| Kürzel | Aktion |
|---|---|
| `n` | Fokus auf neue-Todo-Eingabe |
| `/` | Fokus auf Suche |
| `Esc` | Selektion aufheben / alle Filter zurücksetzen |
| `Tab` | Im Autocomplete: ersten Vorschlag übernehmen |
| `↑` `↓` | Im Autocomplete: navigieren |
| `Enter` | Im Autocomplete oder Datumsfeld: Auswahl bestätigen |

---

## Importieren & Exportieren

### todo.txt importieren
Klick auf **Importieren** → `.txt`-Datei auswählen.  
⚠ Der bestehende Inhalt wird ersetzt (mit Bestätigungsdialog).

### done.txt importieren
Klick auf **Importieren** → Datei mit `done` im Namen auswählen.  
Der Inhalt wird dem bestehenden Archiv **hinzugefügt**.

### todo.txt exportieren
Klick auf **todo.txt** → Datei wird heruntergeladen.

### done.txt exportieren
Klick auf **done.txt** → Archiv wird heruntergeladen.

### Archivieren
Klick auf **Archivieren** → Alle erledigten Todos werden aus der aktiven Liste entfernt und im `done.txt`-Archiv (localStorage) gespeichert. Das Archiv ist am Ende der Hauptliste aufklappbar; einzelne Einträge können wiederhergestellt werden.

---

## Browser-Kompatibilität

| Browser | Version |
|---|---|
| Chrome / Edge | 90+ |
| Firefox | 88+ |
| Safari | 15+ |

Benötigte APIs: `localStorage`, `File API`, `<dialog>`, `CSS Custom Properties`, `ES6 (IIFE)`

---

## Datenschutz

Alle Daten verbleiben ausschliesslich im Browser (`localStorage`). Es werden keine Daten an Server übertragen.

---

## Mitwirken

Pull Requests sind willkommen. Bitte:

1. Fork erstellen
2. Feature-Branch anlegen (`git checkout -b feature/mein-feature`)
3. Commit erstellen (`git commit -m 'Add: mein Feature'`)
4. Push zum Branch (`git push origin feature/mein-feature`)
5. Pull Request öffnen

---

## Lizenz

MIT — siehe [LICENSE](LICENSE)

---

## Inspiration & Referenzen

- [todo.txt Format Spezifikation](https://github.com/todotxt/todo.txt)
- [todotxt.org](http://todotxt.org)
- [Plaintext Productivity](https://plaintext-productivity.net)
