/**
 * app.js — Hauptlogik & Koordination
 *
 * Verantwortlichkeiten:
 *  - Zentraler State (todos, archive, settings, filter, selection)
 *  - Event-Handler für alle Benutzerinteraktionen
 *  - Koordination von Parser, Storage und UI
 */

(function () {
  'use strict';

  /* ============================================================
     STATE
     ============================================================ */
  const state = {
    todos:    [],   // aktive Todos (nicht archiviert)
    archive:  [],   // erledigte, archivierte Todos
    settings: {},   // Theme, Sortierung
    filter: {
      status:   'all',
      priority: null,
      project:  null,
      context:  null,
      search:   '',
    },
    sort: {
      by:   'priority',
      desc: false,
    },
    selected: new Set(),   // IDs selektierter Todos
  };

  /* ============================================================
     INIT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    UI.cacheElements();

    /* State laden */
    state.settings = Storage.loadSettings();
    state.todos    = Storage.loadTodos();
    state.archive  = Storage.loadDone();

    /* Sort aus Settings übernehmen */
    state.sort.by   = state.settings.sortBy   || 'priority';
    state.sort.desc = state.settings.sortDesc  || false;

    /* Theme anwenden */
    applyTheme(state.settings.theme || 'light');

    /* Sortier-Select synchronisieren */
    const sortSel = document.getElementById('sort-select');
    if (sortSel) sortSel.value = state.sort.by;

    /* Leere Liste mit Demo-Todos befüllen */
    if (state.todos.length === 0 && state.archive.length === 0) {
      loadDemoData();
    }

    /* Format-Toolbars initialisieren */
    const getState = () => state;

    const addToolbarEl = document.getElementById('add-format-toolbar');
    const addInput     = document.getElementById('add-todo-input');
    state._addToolbar  = FormatToolbar.create(addInput, getState);
    addToolbarEl.appendChild(state._addToolbar);

    const editToolbarEl = document.getElementById('edit-format-toolbar');
    const editInput     = document.getElementById('edit-todo-input');
    state._editToolbar  = FormatToolbar.create(editInput, getState);
    editToolbarEl.appendChild(state._editToolbar);

    registerEvents();
    render();
  });

  /* ============================================================
     RENDERN
     ============================================================ */
  function render() {
    const filtered = TodoParser.filterTodos(state.todos, state.filter);
    const sorted   = TodoParser.sortTodos(filtered, state.sort.by, state.sort.desc);

    UI.renderList(sorted, state.todos, state.selected);
    UI.renderSidebar(state.todos, state.filter);
    UI.setStatusFilter(state.filter.status);
    UI.renderActiveFilters(state.filter);
    UI.renderArchive(state.archive);
    UI.updateBulkBar(state.selected.size);
    UI.setSelectionMode(state.selected.size > 0);
  }

  /* ============================================================
     TODOS MANIPULIEREN
     ============================================================ */

  function addTodo(raw) {
    const todo = TodoParser.createFromInput(raw);
    if (!todo) return;
    state.todos.unshift(todo);
    persist();
    render();
    UI.showToast('Todo hinzugefügt', 'success');
  }

  function toggleTodo(id) {
    state.todos = state.todos.map(t =>
      t.id === id ? TodoParser.toggleDone(t) : t
    );
    persist();
    render();
  }

  function deleteTodo(id) {
    state.todos = state.todos.filter(t => t.id !== id);
    state.selected.delete(id);
    persist();
    render();
    UI.showToast('Todo gelöscht', 'info');
  }

  function updateTodo(id, newRaw) {
    state.todos = state.todos.map(t =>
      t.id === id ? TodoParser.updateFromRaw(t, newRaw) : t
    );
    persist();
    render();
  }

  function archiveDone() {
    const result = Storage.archiveDone(state.todos, state.archive);
    if (result.count === 0) {
      UI.showToast('Keine erledigten Todos zum Archivieren', 'info');
      return;
    }
    state.todos   = result.todos;
    state.archive = result.done;
    render();
    UI.showToast(`${result.count} Todo${result.count !== 1 ? 's' : ''} in done.txt archiviert`, 'success');
  }

  /* ============================================================
     BULK-AKTIONEN
     ============================================================ */

  function bulkToggleDone() {
    state.todos = state.todos.map(t =>
      state.selected.has(t.id) && !t.done ? TodoParser.toggleDone(t) : t
    );
    clearSelection();
    persist();
    render();
    UI.showToast('Ausgewählte Todos erledigt markiert', 'success');
  }

  function bulkDelete() {
    const count = state.selected.size;
    state.todos = state.todos.filter(t => !state.selected.has(t.id));
    clearSelection();
    persist();
    render();
    UI.showToast(`${count} Todo${count !== 1 ? 's' : ''} gelöscht`, 'info');
  }

  function selectAll() {
    const visible = getVisibleTodos();
    if (state.selected.size === visible.length) {
      clearSelection();
    } else {
      visible.forEach(t => state.selected.add(t.id));
      render();
    }
  }

  function clearSelection() {
    state.selected.clear();
    UI.setSelectionMode(false);
    UI.updateBulkBar(0);
  }

  function getVisibleTodos() {
    return TodoParser.filterTodos(state.todos, state.filter);
  }

  /* ============================================================
     PERSISTENZ
     ============================================================ */

  function persist() {
    Storage.saveTodos(state.todos);
  }

  function persistSettings() {
    state.settings.sortBy   = state.sort.by;
    state.settings.sortDesc = state.sort.desc;
    Storage.saveSettings(state.settings);
  }

  /* ============================================================
     THEME
     ============================================================ */

  function applyTheme(theme) {
    document.body.classList.toggle('theme-dark',  theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    state.settings.theme = theme;
  }

  function toggleTheme() {
    const next = state.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    Storage.saveSettings(state.settings);
  }

  /* ============================================================
     IMPORT / EXPORT
     ============================================================ */

  function handleImport(file) {
    if (!file) return;

    const isDone = file.name.toLowerCase().includes('done');

    if (isDone) {
      Storage.importDoneFile(file, TodoParser.parseFile)
        .then(archive => {
          state.archive = archive;
          render();
          UI.showToast(`done.txt importiert: ${archive.length} Einträge`, 'success');
        })
        .catch(e => UI.showToast(e.message, 'error'));
    } else {
      const existing = state.todos.length;
      if (existing > 0) {
        if (!confirm(`Achtung: Die bestehenden ${existing} Todos werden durch den Inhalt der Datei ersetzt. Fortfahren?`)) return;
      }
      Storage.importTodoFile(file, TodoParser.parseFile)
        .then(todos => {
          state.todos = todos;
          clearSelection();
          render();
          UI.showToast(`todo.txt importiert: ${todos.length} Todos`, 'success');
        })
        .catch(e => UI.showToast(e.message, 'error'));
    }
  }

  function handleExport() {
    Storage.exportTodoFile(state.todos, TodoParser.serializeFile);
    UI.showToast('todo.txt heruntergeladen', 'success');
  }

  function handleExportDone() {
    if (state.archive.length === 0) {
      UI.showToast('Kein Archiv vorhanden – erst archivieren', 'info');
      return;
    }
    Storage.exportDoneFile(state.archive, TodoParser.serializeFile);
    UI.showToast('done.txt heruntergeladen', 'success');
  }

  /* ============================================================
     DEMO-DATEN
     ============================================================ */

  function loadDemoData() {
    const demo = [
      '(A) 2026-01-10 Projektbericht fertigstellen +Arbeit @Büro due:2026-01-20',
      '(B) 2026-01-11 Meeting-Agenda vorbereiten +Arbeit @Büro',
      '(C) 2026-01-12 Einkaufen gehen +Privat @Stadt',
      '(D) 2026-01-08 Buch lesen +Bildung @Zuhause',
      '2026-01-09 Joggen @Sport',
      'x 2026-01-10 2026-01-09 E-Mails beantworten +Arbeit @Büro',
      '(A) 2026-01-13 Zahnarzttermin vereinbaren +Gesundheit due:2026-01-15',
      '(B) 2026-01-14 Monatsabrechnung prüfen +Finanzen @Zuhause',
    ];
    state.todos = demo
      .map((line, i) => TodoParser.parseLine(line, i))
      .filter(Boolean);
    persist();
  }

  /* ============================================================
     EVENT-HANDLER REGISTRIEREN
     ============================================================ */

  function registerEvents() {

    /* --- Todo hinzufügen --- */
    document.getElementById('add-todo-form').addEventListener('submit', e => {
      e.preventDefault();
      const input = document.getElementById('add-todo-input');
      const val   = input.value.trim();
      if (!val) return;
      addTodo(val);
      input.value = '';
      input.focus();
    });

    /* --- Todo-Liste: Delegation für toggle, edit, delete, select, tag-filter --- */
    document.getElementById('todo-list').addEventListener('todo:toggle', e => {
      toggleTodo(e.detail.id);
    });

    document.getElementById('todo-list').addEventListener('todo:edit', e => {
      const todo = state.todos.find(t => t.id === e.detail.id);
      if (todo) UI.openEditModal(todo);
    });

    document.getElementById('todo-list').addEventListener('todo:delete', e => {
      if (confirm('Todo wirklich löschen?')) deleteTodo(e.detail.id);
    });

    document.getElementById('todo-list').addEventListener('todo:select', e => {
      if (e.detail.checked) {
        state.selected.add(e.detail.id);
      } else {
        state.selected.delete(e.detail.id);
      }
      render();
    });

    /* Klick auf Projekt/Kontext-Tag → Filter setzen */
    document.getElementById('todo-list').addEventListener('click', e => {
      const tag = e.target.closest('[data-project]');
      const ctx = e.target.closest('[data-context]');
      if (tag) {
        const val = tag.dataset.project;
        state.filter.project = state.filter.project === val ? null : val;
        render();
      } else if (ctx) {
        const val = ctx.dataset.context;
        state.filter.context = state.filter.context === val ? null : val;
        render();
      }
    });

    /* --- Edit-Modal --- */
    UI.editInput.addEventListener('input', () => {
      UI.updateEditPreview(UI.editInput.value);
      if (state._editToolbar) FormatToolbar.sync(state._editToolbar, UI.editInput);
    });

    /* Edit-Toolbar beim Öffnen synchronisieren */
    UI.editModal.addEventListener('toggle', () => {
      if (UI.editModal.open && state._editToolbar) {
        FormatToolbar.sync(state._editToolbar, UI.editInput);
      }
    });

    document.getElementById('btn-edit-save').addEventListener('click', () => {
      const id  = UI.editModal.dataset.editId;
      const raw = UI.editInput.value.trim();
      if (!id || !raw) return;
      updateTodo(id, raw);
      UI.closeEditModal();
      UI.showToast('Todo gespeichert', 'success');
    });

    document.getElementById('btn-edit-cancel').addEventListener('click', () => UI.closeEditModal());
    document.getElementById('modal-close-btn').addEventListener('click', () => UI.closeEditModal());

    UI.editModal.addEventListener('keydown', e => {
      if (e.key === 'Escape') UI.closeEditModal();
      if (e.key === 'Enter' && !e.shiftKey) {
        document.getElementById('btn-edit-save').click();
      }
    });

    /* Klick ausserhalb des Modals schliessen */
    UI.editModal.addEventListener('click', e => {
      if (e.target === UI.editModal) UI.closeEditModal();
    });

    /* --- Theme-Toggle --- */
    document.getElementById('btn-theme-toggle').addEventListener('click', toggleTheme);

    /* --- Import --- */
    document.getElementById('btn-import').addEventListener('click', () => {
      /* Dateidialog öffnen: todo.txt und done.txt unterstützt */
      const input = document.getElementById('file-input-todo');
      input.accept = '.txt';
      input.onchange = e => handleImport(e.target.files[0]);
      input.click();
    });

    /* --- Export todo.txt --- */
    document.getElementById('btn-export').addEventListener('click', handleExport);

    /* --- Export done.txt --- */
    document.getElementById('btn-export-done').addEventListener('click', handleExportDone);

    /* --- Archivieren --- */
    document.getElementById('btn-archive').addEventListener('click', archiveDone);

    /* --- Status-Filter --- */
    document.getElementById('filter-status').addEventListener('click', e => {
      const item = e.target.closest('[data-filter]');
      if (!item) return;
      state.filter.status = item.dataset.filter;
      render();
    });

    document.getElementById('filter-status').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.target.click();
      }
    });

    /* --- Sidebar: Priorität / Projekt / Kontext --- */
    document.getElementById('sidebar').addEventListener('filter:priority', e => {
      state.filter.priority = e.detail.value;
      render();
    });

    document.getElementById('sidebar').addEventListener('filter:project', e => {
      state.filter.project = e.detail.value;
      render();
    });

    document.getElementById('sidebar').addEventListener('filter:context', e => {
      state.filter.context = e.detail.value;
      render();
    });

    /* --- Suche --- */
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filter.search = e.target.value;
        render();
      }, 200);
    });

    /* --- Sortierung --- */
    document.getElementById('sort-select').addEventListener('change', e => {
      state.sort.by = e.target.value;
      persistSettings();
      render();
    });

    document.getElementById('btn-sort-dir').addEventListener('click', () => {
      state.sort.desc = !state.sort.desc;
      const btn = document.getElementById('btn-sort-dir');
      btn.textContent = state.sort.desc ? '↑' : '↕';
      btn.title       = state.sort.desc ? 'Aufsteigend sortieren' : 'Absteigend sortieren';
      persistSettings();
      render();
    });

    /* --- Alle auswählen --- */
    document.getElementById('btn-select-all').addEventListener('click', selectAll);

    /* --- Bulk-Aktionen --- */
    document.getElementById('btn-bulk-done').addEventListener('click', bulkToggleDone);
    document.getElementById('btn-bulk-delete').addEventListener('click', () => {
      if (confirm(`${state.selected.size} Todo${state.selected.size !== 1 ? 's' : ''} wirklich löschen?`)) {
        bulkDelete();
      }
    });
    document.getElementById('btn-bulk-cancel').addEventListener('click', () => {
      clearSelection();
      render();
    });

    /* --- Tastaturkürzel (global) --- */
    document.addEventListener('keydown', e => {
      /* Nicht auslösen, wenn ein Eingabefeld fokussiert ist */
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.target.isContentEditable) return;

      switch (e.key) {
        case 'n':
          /* n → Fokus auf neue-Todo-Eingabe */
          e.preventDefault();
          document.getElementById('add-todo-input').focus();
          break;
        case '/':
          /* / → Fokus auf Suche */
          e.preventDefault();
          document.getElementById('search-input').focus();
          break;
        case 'Escape':
          /* Esc → Filter/Suche zurücksetzen */
          if (state.selected.size > 0) {
            clearSelection();
            render();
          } else {
            resetFilters();
          }
          break;
      }
    });

    /* --- Archiv: Auf-/Zuklappen --- */
    document.getElementById('btn-archive-toggle').addEventListener('click', () => {
      UI.toggleArchiveList(state.archive);
    });

    /* --- Archiv: Wiederherstellen --- */
    document.getElementById('archive-list').addEventListener('archive:restore', e => {
      const { id } = e.detail;
      const todo   = state.archive.find(t => t.id === id);
      if (!todo) return;

      /* Erledigt-Markierung entfernen und in aktive Liste verschieben */
      const restored = TodoParser.toggleDone(todo); // entfernt x-Präfix
      state.archive  = state.archive.filter(t => t.id !== id);
      state.todos    = [restored, ...state.todos];

      Storage.saveTodos(state.todos);
      Storage.saveDone(state.archive);
      render();
      UI.showToast('Todo wiederhergestellt', 'success');
    });

    /* --- Aktive Filter: Chips entfernen --- */
    document.getElementById('active-filters').addEventListener('filter:remove', e => {
      const { key } = e.detail;
      if (key === 'status')   state.filter.status   = 'all';
      else if (key === 'search') {
        state.filter.search = '';
        document.getElementById('search-input').value = '';
      } else {
        state.filter[key] = null;
      }
      render();
    });

    document.getElementById('active-filters').addEventListener('filter:clear-all', () => {
      resetFilters();
    });

    /* --- Prioritäts-Cycling: Klick auf Prioritäts-Badge --- */
    document.getElementById('todo-list').addEventListener('click', e => {
      const badge = e.target.closest('.todo-prio');
      if (!badge) return;
      const li = badge.closest('.todo-item');
      if (!li) return;
      const id   = li.dataset.id;
      const todo = state.todos.find(t => t.id === id);
      if (!todo || todo.done) return;
      cyclePriority(todo);
    });

    /* --- Autocomplete für das Eingabefeld --- */
    const addInput = document.getElementById('add-todo-input');

    addInput.addEventListener('input', () => {
      const val   = addInput.value;
      const caret = addInput.selectionStart;
      const sugg  = getAutocompleteSuggestions(val, caret);
      UI.showAutocomplete(sugg, chosen => insertAutocompletion(addInput, chosen));
    });

    addInput.addEventListener('keydown', e => {
      if (UI.acDropdown.hidden) return;
      if (['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) {
        e.preventDefault();
        UI.navigateAutocomplete(e.key);
      } else if (e.key === 'Enter') {
        const chosen = UI.navigateAutocomplete('Enter');
        if (chosen) {
          e.preventDefault();
          insertAutocompletion(addInput, chosen);
        }
      } else if (e.key === 'Tab') {
        /* Tab → erstes Ergebnis übernehmen */
        const first = UI.acDropdown.querySelector('.autocomplete-item');
        if (first) {
          e.preventDefault();
          const val = first.querySelector('.font-mono').textContent;
          insertAutocompletion(addInput, val);
          UI.hideAutocomplete();
        }
      }
    });

    addInput.addEventListener('blur', () => {
      /* Kurze Verzögerung, damit mousedown auf Dropdown-Item noch feuern kann */
      setTimeout(() => UI.hideAutocomplete(), 150);
    });
  }

  /* ============================================================
     PRIORITÄTS-CYCLING
     ============================================================ */

  const PRIO_CYCLE = ['A', 'B', 'C', 'D', 'E', null];

  function cyclePriority(todo) {
    const current = todo.priority;
    const idx     = PRIO_CYCLE.indexOf(current);
    const next    = PRIO_CYCLE[(idx + 1) % PRIO_CYCLE.length];

    let line = '';
    if (next) line += `(${next}) `;
    if (todo.creationDate) line += todo.creationDate + ' ';
    line += todo.text;

    state.todos = state.todos.map(t => t.id === todo.id ? TodoParser.updateFromRaw(t, line) : t);
    persist();
    render();
  }

  /* ============================================================
     AUTOCOMPLETE-LOGIK
     ============================================================ */

  /**
   * Ermittelt Autocomplete-Vorschläge basierend auf dem aktuellen Cursor-Wort.
   * Schlägt +Projekte und @Kontexte aus bestehenden Todos vor.
   */
  function getAutocompleteSuggestions(value, caret) {
    /* Wort bis zur Cursorposition isolieren */
    const before  = value.slice(0, caret);
    const match   = before.match(/([+@]\S*)$/);
    if (!match) return [];

    const prefix = match[1]; // z.B. "+Ar" oder "@B"
    const isProject = prefix.startsWith('+');
    const isContext = prefix.startsWith('@');
    if (!isProject && !isContext) return [];

    const term = prefix.slice(1).toLowerCase();

    if (isProject) {
      return TodoParser.allProjects(state.todos)
        .filter(p => p.toLowerCase().startsWith(term) && `+${p}` !== prefix)
        .map(p => `+${p}`)
        .slice(0, 8);
    } else {
      return TodoParser.allContexts(state.todos)
        .filter(c => c.toLowerCase().startsWith(term) && `@${c}` !== prefix)
        .map(c => `@${c}`)
        .slice(0, 8);
    }
  }

  /**
   * Ersetzt das aktuelle Teilwort (z.B. "+Ar") durch die gewählte Vervollständigung.
   */
  function insertAutocompletion(input, chosen) {
    const caret  = input.selectionStart;
    const before = input.value.slice(0, caret);
    const after  = input.value.slice(caret);
    const newBefore = before.replace(/([+@]\S*)$/, chosen);
    input.value = newBefore + after;
    const newCaret = newBefore.length;
    input.setSelectionRange(newCaret, newCaret);
    input.focus();
    UI.hideAutocomplete();
  }

  /* ============================================================
     HILFSFUNKTIONEN
     ============================================================ */

  function resetFilters() {
    state.filter = { status: 'all', priority: null, project: null, context: null, search: '' };
    document.getElementById('search-input').value = '';
    render();
  }

})();
