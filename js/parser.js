/**
 * parser.js — todo.txt Format-Parser
 *
 * Spezifikation: https://github.com/todotxt/todo.txt
 *
 * Format einer todo.txt-Zeile:
 *   [x ] [(P) ] [YYYY-MM-DD ] [YYYY-MM-DD ] <text> [+Projekt] [@Kontext] [key:value]
 *
 * Beispiele:
 *   (A) 2024-01-10 Bericht schreiben +Arbeit @Büro due:2024-01-15
 *   x 2024-01-12 2024-01-10 Einkaufen +Privat @Stadt
 *   Joggen @Sport
 */

const TodoParser = (() => {

  /* ---------- Reguläre Ausdrücke ---------- */
  const RE_DONE      = /^x /;
  const RE_DONE_DATE = /^x (\d{4}-\d{2}-\d{2}) /;
  const RE_PRIORITY  = /^\(([A-Z])\) /;
  const RE_DATE      = /^(\d{4}-\d{2}-\d{2}) /;
  const RE_PROJECT   = /(?:^|\s)\+([^\s+]+)/g;
  const RE_CONTEXT   = /(?:^|\s)@([^\s@]+)/g;
  const RE_KV        = /(?:^|\s)([a-zA-Z][a-zA-Z0-9_-]*):((?!\s)[^\s]+)/g;

  /* ---------- Eindeutige ID ---------- */
  let _idCounter = Date.now();
  function nextId() { return String(++_idCounter); }

  /**
   * Parst eine einzelne todo.txt-Zeile in ein Todo-Objekt.
   * @param {string} line   — rohe Zeile
   * @param {number} index  — Originalposition in der Datei
   * @returns {object|null} Todo-Objekt oder null bei Leerzeile/Kommentar
   */
  function parseLine(line, index = 0) {
    const raw = line;
    let rest = line;

    if (!rest.trim() || rest.startsWith('#')) return null;

    /* Erledigt? */
    let done = false;
    let completionDate = null;

    if (RE_DONE.test(rest)) {
      done = true;
      const dMatch = RE_DONE_DATE.exec(rest);
      if (dMatch) {
        completionDate = dMatch[1];
        rest = rest.slice(dMatch[0].length);
      } else {
        rest = rest.slice(2); // "x " überspringen
      }
    }

    /* Priorität (nur bei nicht-erledigten Todos relevant) */
    let priority = null;
    const pMatch = RE_PRIORITY.exec(rest);
    if (pMatch) {
      priority = pMatch[1];
      rest = rest.slice(pMatch[0].length);
    }

    /* Erstellungsdatum */
    let creationDate = null;
    const dMatch = RE_DATE.exec(rest);
    if (dMatch) {
      creationDate = dMatch[1];
      rest = rest.slice(dMatch[0].length);
    }

    /* Projekte sammeln */
    const projects = [];
    let m;
    const projectRe = new RegExp(RE_PROJECT.source, 'g');
    while ((m = projectRe.exec(rest)) !== null) {
      if (!projects.includes(m[1])) projects.push(m[1]);
    }

    /* Kontexte sammeln */
    const contexts = [];
    const contextRe = new RegExp(RE_CONTEXT.source, 'g');
    while ((m = contextRe.exec(rest)) !== null) {
      if (!contexts.includes(m[1])) contexts.push(m[1]);
    }

    /* Key-Value-Paare sammeln (z.B. due:2024-01-15, t:2024-01-01) */
    const kv = {};
    const kvRe = new RegExp(RE_KV.source, 'g');
    while ((m = kvRe.exec(rest)) !== null) {
      kv[m[1]] = m[2];
    }

    const due = kv['due'] || null;
    const threshold = kv['t'] || null;

    return {
      id:             nextId(),
      raw,
      done,
      priority,
      completionDate,
      creationDate,
      text:           rest.trim(),
      projects,
      contexts,
      kv,
      due,
      threshold,
      originalIndex:  index,
    };
  }

  /**
   * Parst eine vollständige todo.txt-Datei (mehrzeiliger String).
   * @param {string} content
   * @returns {object[]} Array von Todo-Objekten
   */
  function parseFile(content) {
    return content
      .split('\n')
      .map((line, i) => parseLine(line, i))
      .filter(Boolean);
  }

  /**
   * Serialisiert ein Todo-Objekt zurück in eine todo.txt-Zeile.
   * @param {object} todo
   * @returns {string}
   */
  function serialize(todo) {
    let line = '';

    if (todo.done) {
      line += 'x ';
      if (todo.completionDate) line += todo.completionDate + ' ';
    }

    if (!todo.done && todo.priority) {
      line += `(${todo.priority}) `;
    }

    if (todo.creationDate) {
      line += todo.creationDate + ' ';
    }

    line += todo.text;

    return line;
  }

  /**
   * Serialisiert ein Array von Todos zu einem todo.txt-String.
   * @param {object[]} todos
   * @returns {string}
   */
  function serializeFile(todos) {
    return todos.map(serialize).join('\n');
  }

  /**
   * Erstellt ein neues Todo-Objekt aus einer rohen Eingabezeile.
   * Setzt automatisch das heutige Erstellungsdatum, falls keines angegeben.
   * @param {string} input  — Benutzereingabe (kann vollständiges todo.txt-Format sein)
   * @returns {object}
   */
  function createFromInput(input) {
    const trimmed = input.trim();
    if (!trimmed) return null;

    /* Wenn der Benutzer bereits ein Datum oder Priorität eingegeben hat,
       parsen wir die Zeile direkt. Andernfalls fügen wir heute als Datum hinzu. */
    const hasPriority = RE_PRIORITY.test(trimmed);
    const hasDone     = RE_DONE.test(trimmed);
    const hasDate     = hasPriority
      ? RE_DATE.test(trimmed.replace(RE_PRIORITY, ''))
      : RE_DATE.test(trimmed);

    let line = trimmed;
    if (!hasDone && !hasDate) {
      const today = todayStr();
      if (hasPriority) {
        // "(A) Text" → "(A) 2024-01-10 Text"
        line = trimmed.replace(RE_PRIORITY, `($1) ${today} `);
      } else {
        line = `${today} ${trimmed}`;
      }
    }

    const todo = parseLine(line, -1);
    if (todo) todo.raw = line;
    return todo;
  }

  /**
   * Aktualisiert den Rohtext eines Todos nach einer Bearbeitung.
   * @param {object} todo   — das zu aktualisierende Todo-Objekt
   * @param {string} newRaw — neue todo.txt-Zeile
   * @returns {object}      — aktualisiertes Todo-Objekt (neue Referenz)
   */
  function updateFromRaw(todo, newRaw) {
    const updated = parseLine(newRaw.trim(), todo.originalIndex);
    if (!updated) return todo;
    updated.id = todo.id; // ID beibehalten
    return updated;
  }

  /**
   * Markiert ein Todo als erledigt (oder macht es rückgängig).
   * @param {object} todo
   * @returns {object} neues Todo-Objekt
   */
  function toggleDone(todo) {
    if (todo.done) {
      /* Rückgängig: "x DATE DATE (P) text" → "(P) DATE text" */
      let line = '';
      if (todo.priority) line += `(${todo.priority}) `;
      if (todo.creationDate) line += todo.creationDate + ' ';
      line += todo.text;
      return updateFromRaw(todo, line);
    } else {
      /* Erledigen: Priorität entfernen, Erledigungsdatum setzen */
      let line = `x ${todayStr()} `;
      if (todo.creationDate) line += todo.creationDate + ' ';
      line += todo.text;
      return updateFromRaw(todo, line);
    }
  }

  /* ---------- Hilfsfunktionen ---------- */

  /** Heutiges Datum als YYYY-MM-DD */
  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Gibt den Fälligkeitsstatus zurück.
   * @param {string|null} dueDate — YYYY-MM-DD
   * @returns {'overdue'|'today'|'future'|null}
   */
  function getDueStatus(dueDate) {
    if (!dueDate) return null;
    const today = todayStr();
    if (dueDate < today) return 'overdue';
    if (dueDate === today) return 'today';
    return 'future';
  }

  /**
   * Extrahiert alle einzigartigen Projekte aus einem Todo-Array.
   * @param {object[]} todos
   * @returns {string[]}
   */
  function allProjects(todos) {
    const set = new Set();
    todos.forEach(t => t.projects.forEach(p => set.add(p)));
    return [...set].sort();
  }

  /**
   * Extrahiert alle einzigartigen Kontexte aus einem Todo-Array.
   * @param {object[]} todos
   * @returns {string[]}
   */
  function allContexts(todos) {
    const set = new Set();
    todos.forEach(t => t.contexts.forEach(c => set.add(c)));
    return [...set].sort();
  }

  /**
   * Extrahiert alle vorhandenen Prioritäten aus einem Todo-Array.
   * @param {object[]} todos
   * @returns {string[]}
   */
  function allPriorities(todos) {
    const set = new Set();
    todos.forEach(t => { if (t.priority) set.add(t.priority); });
    return [...set].sort();
  }

  /**
   * Vergleichsfunktion für die Sortierung nach Priorität.
   * Todos ohne Priorität landen am Ende.
   */
  function comparePriority(a, b) {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (!a.priority && !b.priority) return 0;
    if (!a.priority) return 1;
    if (!b.priority) return -1;
    return a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : 0;
  }

  /**
   * Vergleichsfunktion für die Sortierung nach Erstellungsdatum.
   */
  function compareDate(a, b) {
    const da = a.creationDate || '9999-99-99';
    const db = b.creationDate || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  }

  /**
   * Vergleichsfunktion für die Sortierung nach Text.
   */
  function compareText(a, b) {
    return a.text.localeCompare(b.text, 'de', { sensitivity: 'base' });
  }

  /**
   * Sortiert ein Todo-Array nach dem gewählten Kriterium.
   * @param {object[]} todos
   * @param {'priority'|'created'|'text'|'original'} by
   * @param {boolean} descending
   * @returns {object[]}
   */
  function sortTodos(todos, by = 'priority', descending = false) {
    const arr = [...todos];
    let fn;
    switch (by) {
      case 'created':  fn = compareDate;     break;
      case 'text':     fn = compareText;     break;
      case 'original': fn = (a, b) => a.originalIndex - b.originalIndex; break;
      default:         fn = comparePriority; break;
    }
    arr.sort(fn);
    if (descending) arr.reverse();
    return arr;
  }

  /**
   * Filtert Todos nach Suchbegriff und aktiven Filtern.
   * @param {object[]} todos
   * @param {object}   filters — { status, priority, project, context, search }
   * @returns {object[]}
   */
  function filterTodos(todos, filters = {}) {
    const { status, priority, project, context, search } = filters;

    return todos.filter(t => {

      /* Status-Filter */
      if (status === 'active' && t.done)  return false;
      if (status === 'done'   && !t.done) return false;

      /* Prioritäts-Filter */
      if (priority && t.priority !== priority) return false;

      /* Projekt-Filter */
      if (project && !t.projects.includes(project)) return false;

      /* Kontext-Filter */
      if (context && !t.contexts.includes(context)) return false;

      /* Freitext-Suche */
      if (search) {
        const q = search.toLowerCase();
        if (!t.raw.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }

  /* ---------- Öffentliche API ---------- */
  return {
    parseLine,
    parseFile,
    serialize,
    serializeFile,
    createFromInput,
    updateFromRaw,
    toggleDone,
    todayStr,
    getDueStatus,
    allProjects,
    allContexts,
    allPriorities,
    sortTodos,
    filterTodos,
  };

})();
