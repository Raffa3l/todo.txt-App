/**
 * storage.js — Persistenz via localStorage & File API
 *
 * Verantwortlichkeiten:
 *  - Todos in localStorage speichern und laden
 *  - done.txt-Archiv in localStorage speichern und laden
 *  - todo.txt-Dateien importieren (File API)
 *  - todo.txt / done.txt exportieren (Download-Link)
 *  - App-Einstellungen (Theme, Sortierung) persistieren
 */

const Storage = (() => {

  const KEYS = {
    TODOS:    'todotxt:todos',
    DONE:     'todotxt:done',
    SETTINGS: 'todotxt:settings',
  };

  /* ============================================================
     TODOS
     ============================================================ */

  /**
   * Speichert das aktuelle Todo-Array in localStorage.
   * @param {object[]} todos
   */
  function saveTodos(todos) {
    try {
      localStorage.setItem(KEYS.TODOS, JSON.stringify(todos));
    } catch (e) {
      console.error('Storage: Fehler beim Speichern der Todos', e);
      throw new Error('Speichern fehlgeschlagen – localStorage voll?');
    }
  }

  /**
   * Lädt das Todo-Array aus localStorage.
   * @returns {object[]}
   */
  function loadTodos() {
    try {
      const raw = localStorage.getItem(KEYS.TODOS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Storage: Fehler beim Laden der Todos', e);
      return [];
    }
  }

  /* ============================================================
     ARCHIV (done.txt)
     ============================================================ */

  /**
   * Speichert das Archiv (erledigte Todos) in localStorage.
   * @param {object[]} doneTodos
   */
  function saveDone(doneTodos) {
    try {
      localStorage.setItem(KEYS.DONE, JSON.stringify(doneTodos));
    } catch (e) {
      console.error('Storage: Fehler beim Speichern des Archivs', e);
      throw new Error('Archiv speichern fehlgeschlagen');
    }
  }

  /**
   * Lädt das Archiv aus localStorage.
   * @returns {object[]}
   */
  function loadDone() {
    try {
      const raw = localStorage.getItem(KEYS.DONE);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Storage: Fehler beim Laden des Archivs', e);
      return [];
    }
  }

  /**
   * Fügt erledigte Todos dem Archiv hinzu und entfernt sie aus der Hauptliste.
   * Gibt { todos, done } zurück — die aktualisierten Arrays.
   *
   * @param {object[]} todos    — aktuelle Todo-Liste
   * @param {object[]} archive  — aktuelles Archiv
   * @returns {{ todos: object[], done: object[], count: number }}
   */
  function archiveDone(todos, archive) {
    const toArchive = todos.filter(t => t.done);
    const remaining = todos.filter(t => !t.done);
    const newArchive = [...archive, ...toArchive];

    saveTodos(remaining);
    saveDone(newArchive);

    return { todos: remaining, done: newArchive, count: toArchive.length };
  }

  /* ============================================================
     EINSTELLUNGEN
     ============================================================ */

  const DEFAULT_SETTINGS = {
    theme:      'light',   // 'light' | 'dark'
    sortBy:     'priority',
    sortDesc:   false,
  };

  /**
   * Speichert App-Einstellungen.
   * @param {object} settings
   */
  function saveSettings(settings) {
    try {
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Storage: Fehler beim Speichern der Einstellungen', e);
    }
  }

  /**
   * Lädt App-Einstellungen (mit Fallback auf Defaults).
   * @returns {object}
   */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(KEYS.SETTINGS);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  /* ============================================================
     IMPORT (File API)
     ============================================================ */

  /**
   * Liest eine vom Benutzer gewählte .txt-Datei als String.
   * @param {File} file — File-Objekt aus <input type="file">
   * @returns {Promise<string>}
   */
  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('Keine Datei übergeben')); return; }
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error(`Datei konnte nicht gelesen werden: ${file.name}`));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Importiert eine todo.txt-Datei: liest, parst und speichert die Todos.
   * Bestehende Todos werden durch den Dateiinhalt ERSETZT.
   *
   * @param {File}     file
   * @param {Function} parseFn  — TodoParser.parseFile
   * @returns {Promise<object[]>} — importierte Todos
   */
  async function importTodoFile(file, parseFn) {
    const content = await readFile(file);
    const todos   = parseFn(content);
    saveTodos(todos);
    return todos;
  }

  /**
   * Importiert eine done.txt-Datei und fügt sie dem bestehenden Archiv hinzu.
   *
   * @param {File}     file
   * @param {Function} parseFn
   * @returns {Promise<object[]>} — kombiniertes Archiv
   */
  async function importDoneFile(file, parseFn) {
    const content    = await readFile(file);
    const imported   = parseFn(content);
    const existing   = loadDone();
    const combined   = [...existing, ...imported];
    saveDone(combined);
    return combined;
  }

  /* ============================================================
     EXPORT (Download)
     ============================================================ */

  /**
   * Löst einen Datei-Download im Browser aus.
   * @param {string} content  — Dateiinhalt
   * @param {string} filename — Dateiname
   */
  function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    /* Kurz warten, damit der Download starten kann, dann freigeben */
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Exportiert das Todo-Array als todo.txt.
   * @param {object[]} todos
   * @param {Function} serializeFn — TodoParser.serializeFile
   */
  function exportTodoFile(todos, serializeFn) {
    const content = serializeFn(todos);
    downloadTextFile(content, 'todo.txt');
  }

  /**
   * Exportiert das Archiv als done.txt.
   * @param {object[]} doneTodos
   * @param {Function} serializeFn
   */
  function exportDoneFile(doneTodos, serializeFn) {
    const content = serializeFn(doneTodos);
    downloadTextFile(content, 'done.txt');
  }

  /**
   * Exportiert todo.txt und done.txt als zusammengeführte Datei (alle Todos).
   * @param {object[]} todos
   * @param {object[]} done
   * @param {Function} serializeFn
   */
  function exportAll(todos, done, serializeFn) {
    const content = serializeFn([...todos, ...done]);
    downloadTextFile(content, 'todo-all.txt');
  }

  /* ============================================================
     HILFSFUNKTIONEN
     ============================================================ */

  /**
   * Löscht alle gespeicherten Daten (Todos, Archiv, Einstellungen).
   * Nur für Entwicklung / Reset gedacht.
   */
  function clearAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  }

  /**
   * Gibt Speichernutzung als lesbaren String zurück (ungefähr).
   * @returns {string}
   */
  function storageInfo() {
    let bytes = 0;
    Object.values(KEYS).forEach(k => {
      const v = localStorage.getItem(k);
      if (v) bytes += v.length * 2; // UTF-16
    });
    return bytes < 1024
      ? `${bytes} B`
      : `${(bytes / 1024).toFixed(1)} KB`;
  }

  /* ---------- Öffentliche API ---------- */
  return {
    saveTodos,
    loadTodos,
    saveDone,
    loadDone,
    archiveDone,
    saveSettings,
    loadSettings,
    readFile,
    importTodoFile,
    importDoneFile,
    exportTodoFile,
    exportDoneFile,
    exportAll,
    clearAll,
    storageInfo,
  };

})();
