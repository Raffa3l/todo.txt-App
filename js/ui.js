/**
 * ui.js — DOM-Rendering & UI-Hilfsfunktionen
 *
 * Alle Funktionen sind rein darstellend: kein State, keine Seiteneffekte
 * ausser DOM-Mutationen. Die Kommunikation nach oben erfolgt via
 * benutzerdefinierte Events oder Callbacks, die app.js registriert.
 */

const UI = (() => {

  /* ============================================================
     ELEMENTE (werden einmalig nach DOMContentLoaded gecacht)
     ============================================================ */
  let els = {};

  function cacheElements() {
    els = {
      todoList:         document.getElementById('todo-list'),
      emptyState:       document.getElementById('empty-state'),
      listInfo:         document.getElementById('list-info'),
      filterPriority:   document.getElementById('filter-priority'),
      filterProjects:   document.getElementById('filter-projects'),
      filterContexts:   document.getElementById('filter-contexts'),
      countAll:         document.getElementById('count-all'),
      countActive:      document.getElementById('count-active'),
      countDone:        document.getElementById('count-done'),
      bulkActions:      document.getElementById('bulk-actions'),
      bulkCount:        document.getElementById('bulk-count'),
      editModal:        document.getElementById('edit-modal'),
      editInput:        document.getElementById('edit-todo-input'),
      editPreview:      document.getElementById('edit-preview'),
      toastContainer:   document.getElementById('toast-container'),
      activeFilters:    document.getElementById('active-filters'),
      acDropdown:       document.getElementById('autocomplete-dropdown'),
      archiveSection:   document.getElementById('archive-section'),
      archiveBadge:     document.getElementById('archive-badge'),
      archiveList:      document.getElementById('archive-list'),
      archiveToggle:    document.getElementById('btn-archive-toggle'),
    };
  }

  /* ============================================================
     TODO-LISTE RENDERN
     ============================================================ */

  /**
   * Rendert die gesamte Todo-Liste.
   * @param {object[]} todos    — gefilterte + sortierte Todos
   * @param {object[]} allTodos — ungefilterte Liste (für Zähler)
   * @param {Set}      selected — IDs der selektierten Todos
   */
  function renderList(todos, allTodos, selected) {
    const list = els.todoList;
    list.innerHTML = '';

    if (todos.length === 0) {
      els.emptyState.hidden = false;
    } else {
      els.emptyState.hidden = true;
      const frag = document.createDocumentFragment();
      todos.forEach(todo => frag.appendChild(createTodoEl(todo, selected)));
      list.appendChild(frag);
    }

    /* Zähler aktualisieren */
    const total  = allTodos.length;
    const done   = allTodos.filter(t => t.done).length;
    const active = total - done;

    els.countAll.textContent    = total;
    els.countActive.textContent = active;
    els.countDone.textContent   = done;

    els.listInfo.textContent =
      `${todos.length} von ${total} Todo${total !== 1 ? 's' : ''}` +
      (done > 0 ? ` · ${done} erledigt` : '');
  }

  /**
   * Erstellt ein einzelnes <li>-Element für ein Todo.
   * @param {object} todo
   * @param {Set}    selected
   * @returns {HTMLLIElement}
   */
  function createTodoEl(todo, selected) {
    const li = document.createElement('li');
    li.className  = 'todo-item' + (todo.done ? ' is-done' : '') + (selected.has(todo.id) ? ' is-selected' : '');
    li.dataset.id = todo.id;
    if (todo.priority) li.dataset.priority = todo.priority;

    /* Selektions-Checkbox */
    const selBox = document.createElement('input');
    selBox.type      = 'checkbox';
    selBox.className = 'todo-select-checkbox';
    selBox.checked   = selected.has(todo.id);
    selBox.setAttribute('aria-label', 'Todo auswählen');
    selBox.addEventListener('change', () => {
      li.dispatchEvent(new CustomEvent('todo:select', { bubbles: true, detail: { id: todo.id, checked: selBox.checked } }));
    });

    /* Erledigt-Checkbox */
    const doneBox = document.createElement('input');
    doneBox.type      = 'checkbox';
    doneBox.className = 'todo-checkbox';
    doneBox.checked   = todo.done;
    doneBox.setAttribute('aria-label', todo.done ? 'Als unerledigt markieren' : 'Als erledigt markieren');
    doneBox.addEventListener('change', () => {
      li.dispatchEvent(new CustomEvent('todo:toggle', { bubbles: true, detail: { id: todo.id } }));
    });

    /* Todo-Body */
    const body = document.createElement('div');
    body.className = 'todo-body';

    /* Text mit markierten Tags */
    const textEl = document.createElement('div');
    textEl.className = 'todo-text';
    textEl.innerHTML = formatTodoText(todo);

    /* Meta-Zeile (Datum, Fälligkeit) */
    const meta = buildMetaEl(todo);

    body.appendChild(textEl);
    if (meta) body.appendChild(meta);

    /* Aktionsbuttons */
    const actions = buildActionsEl(todo);

    li.appendChild(selBox);
    li.appendChild(doneBox);
    li.appendChild(body);
    li.appendChild(actions);

    return li;
  }

  /**
   * Formatiert den Todo-Text mit hervorgehobenen Tags und Priorität.
   * @param {object} todo
   * @returns {string} HTML-String (sicher: kein innerHTML aus User-Input ohne Escaping)
   */
  function formatTodoText(todo) {
    let html = '';

    /* Prioritäts-Badge */
    if (todo.priority && !todo.done) {
      html += `<span class="todo-prio" data-prio="${esc(todo.priority)}">(${esc(todo.priority)})</span> `;
    }

    /* Text tokenisieren: +Projekt, @Kontext, key:value, normaler Text */
    const tokens = tokenize(todo.text);
    tokens.forEach(tok => {
      if (tok.type === 'project') {
        html += `<span class="todo-tag todo-tag--project" data-project="${esc(tok.value)}" role="button" tabindex="0" title="Nach +${esc(tok.value)} filtern">+${esc(tok.value)}</span>`;
      } else if (tok.type === 'context') {
        html += `<span class="todo-tag todo-tag--context" data-context="${esc(tok.value)}" role="button" tabindex="0" title="Nach @${esc(tok.value)} filtern">@${esc(tok.value)}</span>`;
      } else if (tok.type === 'kv') {
        if (tok.key === 'due') {
          /* due: wird in der Meta-Zeile angezeigt, hier ausblenden */
        } else {
          html += `<span class="todo-tag" style="background:var(--color-surface-alt);color:var(--color-text-muted)">${esc(tok.key)}:${esc(tok.value)}</span>`;
        }
      } else {
        html += esc(tok.value);
      }
    });

    return html;
  }

  /**
   * Zerlegt den Todo-Text in typisierte Tokens.
   * @param {string} text
   * @returns {Array<{type:string, value:string, key?:string}>}
   */
  function tokenize(text) {
    const tokens = [];
    const words  = text.split(/(\s+)/);

    words.forEach(word => {
      if (word.match(/^\+\S+$/)) {
        tokens.push({ type: 'project', value: word.slice(1) });
      } else if (word.match(/^@\S+$/)) {
        tokens.push({ type: 'context', value: word.slice(1) });
      } else if (word.match(/^[a-zA-Z][a-zA-Z0-9_-]*:[^\s]+$/)) {
        const idx = word.indexOf(':');
        tokens.push({ type: 'kv', key: word.slice(0, idx), value: word.slice(idx + 1) });
      } else {
        tokens.push({ type: 'text', value: word });
      }
    });

    return tokens;
  }

  /**
   * Erstellt die Meta-Zeile (Datum, Fälligkeit).
   * @param {object} todo
   * @returns {HTMLElement|null}
   */
  function buildMetaEl(todo) {
    const parts = [];

    if (todo.creationDate) {
      parts.push(`<span class="todo-date">Erstellt: ${esc(todo.creationDate)}</span>`);
    }

    if (todo.completionDate) {
      parts.push(`<span class="todo-date">Erledigt: ${esc(todo.completionDate)}</span>`);
    }

    if (todo.due) {
      const status = TodoParser.getDueStatus(todo.due);
      const cls    = status === 'overdue' ? 'is-overdue' : status === 'today' ? 'is-today' : '';
      const label  = status === 'overdue' ? '⚠ Überfällig' : status === 'today' ? '⬤ Heute fällig' : 'Fällig';
      parts.push(`<span class="todo-due ${cls}">${label}: ${esc(todo.due)}</span>`);
    }

    if (parts.length === 0) return null;

    const div = document.createElement('div');
    div.className = 'todo-meta';
    div.innerHTML = parts.join('');
    return div;
  }

  /**
   * Erstellt die Aktions-Buttons für ein Todo-Item.
   * @param {object} todo
   * @returns {HTMLElement}
   */
  function buildActionsEl(todo) {
    const div = document.createElement('div');
    div.className = 'todo-actions';

    const editBtn = makeBtn('✎', 'todo bearbeiten', 'btn btn-icon btn-sm');
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      div.dispatchEvent(new CustomEvent('todo:edit', { bubbles: true, detail: { id: todo.id } }));
    });

    const delBtn = makeBtn('✕', 'todo löschen', 'btn btn-icon btn-sm btn-danger');
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      div.dispatchEvent(new CustomEvent('todo:delete', { bubbles: true, detail: { id: todo.id } }));
    });

    div.appendChild(editBtn);
    div.appendChild(delBtn);
    return div;
  }

  /* ============================================================
     SIDEBAR
     ============================================================ */

  /**
   * Aktualisiert die Sidebar-Filter (Prioritäten, Projekte, Kontexte).
   * @param {object[]} todos      — alle Todos (ungefiltert)
   * @param {object}   activeFilter — { priority, project, context }
   */
  function renderSidebar(todos, activeFilter) {
    const priorities = TodoParser.allPriorities(todos);
    const projects   = TodoParser.allProjects(todos);
    const contexts   = TodoParser.allContexts(todos);

    renderFilterSection(
      els.filterPriority,
      priorities.map(p => ({ value: p, label: `(${p})`, count: todos.filter(t => t.priority === p).length })),
      'priority',
      activeFilter.priority,
      p => `<span class="prio-dot" style="background:${getPrioColor(p)}"></span>`
    );

    renderFilterSection(
      els.filterProjects,
      projects.map(p => ({ value: p, label: `+${p}`, count: todos.filter(t => t.projects.includes(p)).length })),
      'project',
      activeFilter.project,
      () => ''
    );

    renderFilterSection(
      els.filterContexts,
      contexts.map(c => ({ value: c, label: `@${c}`, count: todos.filter(t => t.contexts.includes(c)).length })),
      'context',
      activeFilter.context,
      () => ''
    );
  }

  function renderFilterSection(container, items, type, activeValue, iconFn) {
    container.innerHTML = '';
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'filter-item';
      li.style.color = 'var(--color-text-faint)';
      li.style.fontSize = 'var(--font-size-xs)';
      li.textContent = '—';
      container.appendChild(li);
      return;
    }
    items.forEach(({ value, label, count }) => {
      const li = document.createElement('li');
      li.className  = 'filter-item' + (activeValue === value ? ' active' : '');
      li.dataset[type] = value;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', activeValue === value ? 'true' : 'false');
      li.setAttribute('tabindex', '0');
      li.innerHTML = `${iconFn(value)}<span>${esc(label)}</span><span class="filter-count">${count}</span>`;
      li.addEventListener('click', () => {
        li.dispatchEvent(new CustomEvent(`filter:${type}`, { bubbles: true, detail: { value: activeValue === value ? null : value } }));
      });
      li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } });
      container.appendChild(li);
    });
  }

  /* ============================================================
     STATUS-FILTER (Alle / Offen / Erledigt)
     ============================================================ */

  function setStatusFilter(status) {
    document.querySelectorAll('#filter-status .filter-item').forEach(li => {
      const active = li.dataset.filter === status;
      li.classList.toggle('active', active);
      li.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  /* ============================================================
     BEARBEITUNGS-MODAL
     ============================================================ */

  /**
   * Öffnet das Bearbeitungs-Modal für ein Todo.
   * @param {object} todo
   */
  function openEditModal(todo) {
    els.editInput.value = todo.raw;
    updateEditPreview(todo.raw);
    els.editModal.dataset.editId = todo.id;
    els.editModal.showModal();
    els.editInput.focus();
    els.editInput.select();
  }

  function closeEditModal() {
    els.editModal.close();
    delete els.editModal.dataset.editId;
  }

  function updateEditPreview(raw) {
    const todo = TodoParser.parseLine(raw);
    if (!todo) {
      els.editPreview.textContent = 'Ungültige Zeile';
      return;
    }
    let html = '';
    if (todo.done)     html += `<strong>Erledigt</strong> (${todo.completionDate || '?'}) · `;
    if (todo.priority) html += `Priorität: <strong>(${esc(todo.priority)})</strong> · `;
    if (todo.creationDate) html += `Erstellt: ${esc(todo.creationDate)} · `;
    if (todo.projects.length) html += `Projekte: ${todo.projects.map(p => `<em>+${esc(p)}</em>`).join(', ')} · `;
    if (todo.contexts.length) html += `Kontexte: ${todo.contexts.map(c => `<em>@${esc(c)}</em>`).join(', ')} · `;
    if (todo.due) html += `Fällig: <strong>${esc(todo.due)}</strong>`;
    els.editPreview.innerHTML = html || 'Vorschau…';
  }

  /* ============================================================
     BULK-AKTIONEN
     ============================================================ */

  function updateBulkBar(count) {
    if (count === 0) {
      els.bulkActions.hidden = true;
    } else {
      els.bulkActions.hidden = false;
      els.bulkCount.textContent = `${count} ausgewählt`;
    }
  }

  function setSelectionMode(active) {
    document.getElementById('todo-list').classList.toggle('selection-mode', active);
  }

  /* ============================================================
     TOAST
     ============================================================ */

  /**
   * Zeigt eine kurze Benachrichtigung (3 Sekunden).
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   */
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3100);
  }

  /* ============================================================
     AKTIVE FILTER CHIPS
     ============================================================ */

  /**
   * Rendert die aktiven Filter als entfernbare Chips über der Liste.
   * @param {object} filter — { status, priority, project, context, search }
   */
  function renderActiveFilters(filter) {
    const container = els.activeFilters;
    container.innerHTML = '';

    const chips = [];

    if (filter.status && filter.status !== 'all') {
      chips.push({ label: filter.status === 'done' ? 'Erledigt' : 'Offen', key: 'status' });
    }
    if (filter.priority) chips.push({ label: `(${filter.priority})`,  key: 'priority' });
    if (filter.project)  chips.push({ label: `+${filter.project}`,    key: 'project' });
    if (filter.context)  chips.push({ label: `@${filter.context}`,    key: 'context' });
    if (filter.search)   chips.push({ label: `"${filter.search}"`,    key: 'search' });

    if (chips.length === 0) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    chips.forEach(({ label, key }) => {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';

      const lbl = document.createElement('span');
      lbl.className   = 'filter-chip-label';
      lbl.textContent = label;

      const rem = document.createElement('button');
      rem.className   = 'filter-chip-remove';
      rem.type        = 'button';
      rem.textContent = '×';
      rem.setAttribute('aria-label', `Filter "${label}" entfernen`);
      rem.addEventListener('click', () => {
        container.dispatchEvent(new CustomEvent('filter:remove', { bubbles: true, detail: { key } }));
      });

      chip.appendChild(lbl);
      chip.appendChild(rem);
      container.appendChild(chip);
    });

    if (chips.length > 1) {
      const clearAll = document.createElement('button');
      clearAll.className   = 'filter-chip-clear-all';
      clearAll.type        = 'button';
      clearAll.textContent = 'Alle löschen';
      clearAll.addEventListener('click', () => {
        container.dispatchEvent(new CustomEvent('filter:clear-all', { bubbles: true }));
      });
      container.appendChild(clearAll);
    }
  }

  /* ============================================================
     AUTOCOMPLETE
     ============================================================ */

  let _acIndex = -1;

  /**
   * Zeigt Autocomplete-Vorschläge für das Eingabefeld.
   * @param {string[]} suggestions — Array von Strings (z.B. ['+Arbeit', '@Büro'])
   * @param {Function} onSelect    — Callback(value) wenn ein Eintrag gewählt wird
   */
  function showAutocomplete(suggestions, onSelect) {
    const dd = els.acDropdown;
    dd.innerHTML = '';
    _acIndex = -1;

    if (suggestions.length === 0) {
      dd.hidden = true;
      return;
    }

    suggestions.forEach((s, i) => {
      const li = document.createElement('li');
      li.className   = 'autocomplete-item';
      li.role        = 'option';
      li.dataset.idx = i;

      const type = s.startsWith('+') ? 'Projekt' : s.startsWith('@') ? 'Kontext' : '';
      li.innerHTML = `<span class="font-mono">${esc(s)}</span>${type ? `<span class="ac-type">${type}</span>` : ''}`;

      li.addEventListener('mousedown', e => {
        e.preventDefault(); // Fokus nicht verlieren
        onSelect(s);
        hideAutocomplete();
      });

      dd.appendChild(li);
    });

    dd.hidden = false;
  }

  function hideAutocomplete() {
    els.acDropdown.hidden = true;
    _acIndex = -1;
  }

  /**
   * Keyboard-Navigation im Autocomplete (Pfeil hoch/runter, Enter, Escape).
   * @returns {string|null} — gewählter Wert oder null
   */
  function navigateAutocomplete(key) {
    const dd    = els.acDropdown;
    const items = dd.querySelectorAll('.autocomplete-item');
    if (!items.length || dd.hidden) return null;

    if (key === 'ArrowDown') {
      _acIndex = Math.min(_acIndex + 1, items.length - 1);
    } else if (key === 'ArrowUp') {
      _acIndex = Math.max(_acIndex - 1, 0);
    } else if (key === 'Enter' && _acIndex >= 0) {
      const chosen = items[_acIndex].querySelector('.font-mono').textContent;
      hideAutocomplete();
      return chosen;
    } else if (key === 'Escape') {
      hideAutocomplete();
      return null;
    }

    items.forEach((item, i) => item.classList.toggle('is-active', i === _acIndex));
    if (_acIndex >= 0) items[_acIndex].scrollIntoView({ block: 'nearest' });
    return null;
  }

  /* ============================================================
     HILFSFUNKTIONEN
     ============================================================ */

  /** HTML-Entities escapen (verhindert XSS) */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function makeBtn(label, title, className) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = className;
    btn.innerHTML = label;
    btn.title     = title;
    btn.setAttribute('aria-label', title);
    return btn;
  }

  function getPrioColor(p) {
    const map = { A: '#dc2626', B: '#ea580c', C: '#d97706', D: '#65a30d', E: '#0891b2' };
    return map[p] || '#7c3aed';
  }

  /* ============================================================
     ARCHIV-ANSICHT
     ============================================================ */

  /**
   * Aktualisiert den Archiv-Bereich (Badge + Liste wenn aufgeklappt).
   * @param {object[]} archive
   */
  function renderArchive(archive) {
    const { archiveSection, archiveBadge, archiveList, archiveToggle } = els;

    if (archive.length === 0) {
      archiveSection.hidden = true;
      return;
    }

    archiveSection.hidden = false;
    archiveBadge.textContent = archive.length;

    /* Liste nur neu rendern wenn aufgeklappt */
    const isOpen = archiveToggle.getAttribute('aria-expanded') === 'true';
    if (isOpen) _renderArchiveList(archive);
  }

  function _renderArchiveList(archive) {
    els.archiveList.innerHTML = '';
    const sorted = [...archive].sort((a, b) => {
      const da = a.completionDate || '0000-00-00';
      const db = b.completionDate || '0000-00-00';
      return da < db ? 1 : da > db ? -1 : 0; // neueste zuerst
    });
    const frag = document.createDocumentFragment();
    sorted.forEach(todo => frag.appendChild(createArchiveTodoEl(todo)));
    els.archiveList.appendChild(frag);
  }

  /**
   * Klappt die Archiv-Liste auf oder zu.
   * @param {object[]} archive
   */
  function toggleArchiveList(archive) {
    const { archiveToggle, archiveList } = els;
    const isOpen = archiveToggle.getAttribute('aria-expanded') === 'true';

    if (isOpen) {
      archiveToggle.setAttribute('aria-expanded', 'false');
      archiveList.hidden = true;
    } else {
      archiveToggle.setAttribute('aria-expanded', 'true');
      archiveList.hidden = false;
      _renderArchiveList(archive);
    }
  }

  /**
   * Erstellt ein schreibgeschütztes Todo-Element für die Archiv-Liste.
   * @param {object} todo
   * @returns {HTMLLIElement}
   */
  function createArchiveTodoEl(todo) {
    const li = document.createElement('li');
    li.className  = 'todo-item is-done';
    li.dataset.id = todo.id;

    /* Erledigt-Checkbox (deaktiviert) */
    const doneBox = document.createElement('input');
    doneBox.type      = 'checkbox';
    doneBox.className = 'todo-checkbox';
    doneBox.checked   = true;
    doneBox.disabled  = true;
    doneBox.setAttribute('aria-label', 'Archiviert');

    const body = document.createElement('div');
    body.className = 'todo-body';

    const textEl = document.createElement('div');
    textEl.className = 'todo-text';
    textEl.innerHTML = formatTodoText(todo);

    const meta = buildMetaEl(todo);

    body.appendChild(textEl);
    if (meta) body.appendChild(meta);

    /* Wiederherstellen-Button */
    const actions = document.createElement('div');
    actions.className = 'todo-actions';

    const restoreBtn = makeBtn('↩', 'Wiederherstellen', 'btn btn-icon btn-sm');
    restoreBtn.title = 'In aktive Liste zurücklegen';
    restoreBtn.addEventListener('click', e => {
      e.stopPropagation();
      li.dispatchEvent(new CustomEvent('archive:restore', { bubbles: true, detail: { id: todo.id } }));
    });
    actions.appendChild(restoreBtn);

    li.appendChild(doneBox);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  /* ============================================================
     ÖFFENTLICHE API
     ============================================================ */
  return {
    cacheElements,
    renderList,
    renderSidebar,
    setStatusFilter,
    renderActiveFilters,
    renderArchive,
    toggleArchiveList,
    showAutocomplete,
    hideAutocomplete,
    navigateAutocomplete,
    openEditModal,
    closeEditModal,
    updateEditPreview,
    updateBulkBar,
    setSelectionMode,
    showToast,
    esc,
    get editInput()    { return els.editInput; },
    get editModal()    { return els.editModal; },
    get editPreview()  { return els.editPreview; },
    get acDropdown()   { return els.acDropdown; },
  };

})();
