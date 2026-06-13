/**
 * format-toolbar.js — Interaktive Formatierungsleiste für todo.txt-Eingabefelder
 *
 * Erzeugt eine wiederverwendbare Toolbar, die an ein <input>-Element gebunden wird.
 * Funktioniert für das "Neu"-Eingabefeld und das Bearbeitungs-Modal gleichermassen.
 *
 * Öffentliche API:
 *   FormatToolbar.create(inputEl, getStateFn) → HTMLElement
 *   FormatToolbar.sync(toolbarEl, inputEl)     → void (Zustand aktualisieren)
 */

const FormatToolbar = (() => {

  const PRIORITIES = ['A', 'B', 'C', 'D', 'E'];

  const PRIO_COLORS = {
    A: { bg: '#fee2e2', color: '#dc2626', darkBg: '#450a0a', darkColor: '#fca5a5' },
    B: { bg: '#ffedd5', color: '#ea580c', darkBg: '#431407', darkColor: '#fdba74' },
    C: { bg: '#fef3c7', color: '#d97706', darkBg: '#451a03', darkColor: '#fcd34d' },
    D: { bg: '#ecfccb', color: '#65a30d', darkBg: '#1a2e05', darkColor: '#a3e635' },
    E: { bg: '#e0f2fe', color: '#0891b2', darkBg: '#0c2340', darkColor: '#7dd3fc' },
  };

  const RE_PRIORITY = /^\(([A-Z])\) /;
  const RE_DUE      = /\bdue:\d{4}-\d{2}-\d{2}/;

  /* ============================================================
     HAUPTFUNKTION
     ============================================================ */

  /**
   * Erstellt eine Toolbar und gibt das DOM-Element zurück.
   * @param {HTMLInputElement} inputEl   — das gebundene Eingabefeld
   * @param {Function}         getState — () => { todos: [] } für Projekt-/Kontext-Listen
   * @returns {HTMLElement}
   */
  function create(inputEl, getState) {
    const toolbar = document.createElement('div');
    toolbar.className = 'format-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Formatierungsoptionen');

    /* --- Gruppe 1: Prioritäten --- */
    const prioGroup = makeGroup('Priorität');

    PRIORITIES.forEach(p => {
      const btn = makeBtn(`(${p})`, `Priorität ${p} setzen`);
      btn.dataset.prio = p;
      btn.classList.add('fmt-btn--prio', `fmt-prio-${p}`);
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        togglePriority(inputEl, p);
        sync(toolbar, inputEl);
        inputEl.focus();
      });
      prioGroup.appendChild(btn);
    });

    /* "Keine Priorität"-Button */
    const noPrioBtn = makeBtn('✕', 'Priorität entfernen');
    noPrioBtn.dataset.prio = '';
    noPrioBtn.classList.add('fmt-btn--no-prio');
    noPrioBtn.addEventListener('mousedown', e => {
      e.preventDefault();
      removePriority(inputEl);
      sync(toolbar, inputEl);
      inputEl.focus();
    });
    prioGroup.appendChild(noPrioBtn);
    toolbar.appendChild(prioGroup);

    /* --- Trennlinie --- */
    toolbar.appendChild(makeSep());

    /* --- Gruppe 2: Tags --- */
    const tagGroup = makeGroup('Tags');

    /* +Projekt-Button */
    const projBtn = makeBtn('＋ Projekt', 'Projekt-Tag einfügen');
    projBtn.classList.add('fmt-btn--tag', 'fmt-btn--project');
    const projMenu = makeTagMenu(inputEl, getState, 'project');
    projBtn.addEventListener('mousedown', e => { e.preventDefault(); });
    projBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleMenu(projMenu, projBtn, getState, 'project', inputEl, toolbar);
    });
    tagGroup.appendChild(projBtn);
    tagGroup.appendChild(projMenu);

    /* @Kontext-Button */
    const ctxBtn = makeBtn('＠ Kontext', 'Kontext-Tag einfügen');
    ctxBtn.classList.add('fmt-btn--tag', 'fmt-btn--context');
    const ctxMenu = makeTagMenu(inputEl, getState, 'context');
    ctxBtn.addEventListener('mousedown', e => { e.preventDefault(); });
    ctxBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleMenu(ctxMenu, ctxBtn, getState, 'context', inputEl, toolbar);
    });
    tagGroup.appendChild(ctxBtn);
    tagGroup.appendChild(ctxMenu);

    toolbar.appendChild(tagGroup);

    /* --- Trennlinie --- */
    toolbar.appendChild(makeSep());

    /* --- Gruppe 3: Datum --- */
    const dateGroup = makeGroup('Datum');

    const duePicker = createDuePicker(inputEl, toolbar);
    dateGroup.appendChild(duePicker);

    const todayBtn = makeBtn('Heute', 'Fälligkeit auf heute setzen');
    todayBtn.classList.add('fmt-btn--today');
    todayBtn.addEventListener('mousedown', e => { e.preventDefault(); });
    todayBtn.addEventListener('click', () => {
      insertDue(inputEl, todayStr());
      sync(toolbar, inputEl);
      inputEl.focus();
    });
    dateGroup.appendChild(todayBtn);

    toolbar.appendChild(dateGroup);

    /* --- Gruppe 5: Erledigt-Toggle --- */
    toolbar.appendChild(makeSep());
    const doneGroup = makeGroup('Status');

    const doneBtn = makeBtn('✓ Erledigt', 'Als erledigt markieren');
    doneBtn.classList.add('fmt-btn--done');
    doneBtn.addEventListener('mousedown', e => { e.preventDefault(); });
    doneBtn.addEventListener('click', () => {
      toggleDonePrefix(inputEl);
      sync(toolbar, inputEl);
      inputEl.focus();
    });
    doneGroup.appendChild(doneBtn);
    toolbar.appendChild(doneGroup);

    /* --- Zustand initial synchronisieren --- */
    sync(toolbar, inputEl);

    /* --- Bei Texteingabe Toolbar-Zustand aktualisieren --- */
    inputEl.addEventListener('input', () => sync(toolbar, inputEl));

    /* Tag-Menüs schliessen bei Klick ausserhalb der Toolbar.
       Date-Picker NICHT einschliessen — er wird nur via Button/Escape geschlossen. */
    document.addEventListener('click', e => {
      if (!e.target.closest('.format-toolbar')) {
        toolbar.querySelectorAll('.fmt-tag-menu').forEach(m => { m.hidden = true; });
      }
    });

    return toolbar;
  }

  /* ============================================================
     SYNCHRONISIERUNG (Aktiv-Zustand der Buttons)
     ============================================================ */

  /**
   * Aktualisiert den visuellen Zustand der Toolbar basierend auf dem Input-Inhalt.
   * @param {HTMLElement}      toolbar
   * @param {HTMLInputElement} inputEl
   */
  function sync(toolbar, inputEl) {
    const val     = inputEl.value;
    const match   = RE_PRIORITY.exec(val);
    const curPrio = match ? match[1] : null;
    const isDone  = /^x /.test(val);
    const hasDue  = RE_DUE.test(val);

    /* Prioritäts-Buttons */
    toolbar.querySelectorAll('[data-prio]').forEach(btn => {
      const p = btn.dataset.prio;
      btn.classList.toggle('fmt-btn--active', p === (curPrio || '') && p !== '');
      if (p === '' && !curPrio) btn.classList.add('fmt-btn--active');
      else if (p === '') btn.classList.remove('fmt-btn--active');
    });

    /* Erledigt-Button */
    const doneBtn = toolbar.querySelector('.fmt-btn--done');
    if (doneBtn) doneBtn.classList.toggle('fmt-btn--active', isDone);

    /* Fälligkeits-Button */
    const dueBtn = toolbar.querySelector('.fmt-btn--due');
    if (dueBtn) dueBtn.classList.toggle('fmt-btn--active', hasDue);
  }

  /* ============================================================
     TEXT-MANIPULATIONS-HELFER
     ============================================================ */

  function togglePriority(inputEl, prio) {
    const val   = inputEl.value;
    const match = RE_PRIORITY.exec(val);

    if (match && match[1] === prio) {
      /* Gleiche Priorität nochmal klicken → entfernen */
      inputEl.value = val.slice(match[0].length);
    } else if (match) {
      /* Andere Priorität ersetzen */
      inputEl.value = `(${prio}) ` + val.slice(match[0].length);
    } else {
      /* Keine Priorität → voranstellen */
      inputEl.value = `(${prio}) ` + val;
    }
    fire(inputEl);
  }

  function removePriority(inputEl) {
    inputEl.value = inputEl.value.replace(RE_PRIORITY, '');
    fire(inputEl);
  }

  /**
   * Fügt einen Tag (+Projekt oder @Kontext) an der Cursorposition ein.
   * @param {HTMLInputElement} inputEl
   * @param {string}           tag  — z.B. "+Arbeit" oder "@Büro"
   */
  function insertTag(inputEl, tag) {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end   = inputEl.selectionEnd   ?? inputEl.value.length;
    const val   = inputEl.value;

    const before = val.slice(0, start);
    const after  = val.slice(end);
    const pre    = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const suf    = after.length > 0 && !after.startsWith(' ') ? ' ' : '';

    inputEl.value = before + pre + tag + suf + after;
    const cur = (before + pre + tag).length;
    inputEl.setSelectionRange(cur, cur);
    fire(inputEl);
  }

  /**
   * Fügt `due:YYYY-MM-DD` ein oder ersetzt ein bestehendes Datum.
   */
  function insertDue(inputEl, date) {
    const val = inputEl.value;
    if (RE_DUE.test(val)) {
      inputEl.value = val.replace(RE_DUE, `due:${date}`);
    } else {
      const t = val.trimEnd();
      inputEl.value = t + (t ? ' ' : '') + `due:${date}`;
    }
    fire(inputEl);
  }

  /**
   * Schaltet den `x DATUM ` Präfix um.
   */
  function toggleDonePrefix(inputEl) {
    const val = inputEl.value;
    if (/^x \d{4}-\d{2}-\d{2} /.test(val)) {
      inputEl.value = val.replace(/^x \d{4}-\d{2}-\d{2} /, '');
    } else if (/^x /.test(val)) {
      inputEl.value = val.replace(/^x /, '');
    } else {
      inputEl.value = `x ${todayStr()} ` + val;
    }
    fire(inputEl);
  }

  /* ============================================================
     DATUM-PICKER POPOVER
     ============================================================ */

  /**
   * Erstellt einen Datum-Button mit zuverlässigem Popover.
   * Das Popover enthält ein sichtbares <input type="date"> plus
   * Bestätigen- und Entfernen-Button.
   * @param {HTMLInputElement} inputEl
   * @param {HTMLElement}      toolbar
   * @returns {HTMLElement} wrapper (button + popover)
   */
  /**
   * Einfacher Inline-Datepicker: Button öffnet ein Datumsfeld direkt
   * in der Toolbar-Zeile — kein Popover, keine Overlay-Probleme.
   */
  function createDuePicker(inputEl, toolbar) {
    const wrapper = document.createElement('div');
    wrapper.className = 'fmt-due-wrapper';

    /* --- Fällig-Button --- */
    const btn = makeBtn('📅 Fällig', 'Fälligkeitsdatum setzen');
    btn.classList.add('fmt-btn--due');

    /* --- Inline-Datumsfeld (initial verborgen via CSS-Klasse) --- */
    const dateInput = document.createElement('input');
    dateInput.type      = 'date';
    dateInput.className = 'fmt-date-inline';
    dateInput.setAttribute('aria-label', 'Fälligkeitsdatum');

    /* --- Bestätigen-Button --- */
    const confirmBtn = document.createElement('button');
    confirmBtn.type        = 'button';
    confirmBtn.textContent = '✓';
    confirmBtn.className   = 'fmt-btn fmt-btn--date-confirm';
    confirmBtn.title       = 'Datum übernehmen (Enter)';

    /* --- Entfernen-Button --- */
    const clearBtn = document.createElement('button');
    clearBtn.type        = 'button';
    clearBtn.textContent = '✕';
    clearBtn.className   = 'fmt-btn fmt-btn--date-clear';
    clearBtn.title       = 'Datum entfernen';

    wrapper.appendChild(btn);
    wrapper.appendChild(dateInput);
    wrapper.appendChild(confirmBtn);
    wrapper.appendChild(clearBtn);

    /* --- Öffnen / Schliessen --- */
    function open() {
      closeAllMenus(toolbar);
      const match = RE_DUE.exec(inputEl.value);
      dateInput.value = match ? match[0].slice(4) : '';
      wrapper.classList.add('is-open');
    }

    function close() {
      wrapper.classList.remove('is-open');
    }

    function apply() {
      if (!wrapper.classList.contains('is-open')) return;
      if (dateInput.value) {
        insertDue(inputEl, dateInput.value);
        sync(toolbar, inputEl);
      }
      close();
      inputEl.focus();
    }

    btn.addEventListener('click', () => {
      wrapper.classList.contains('is-open') ? close() : open();
    });

    confirmBtn.addEventListener('click', apply);

    clearBtn.addEventListener('click', () => {
      removeDue(inputEl);
      sync(toolbar, inputEl);
      close();
      inputEl.focus();
    });

    dateInput.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { close(); inputEl.focus(); }
    });

    return wrapper;
  }

  function removeDue(inputEl) {
    inputEl.value = inputEl.value.replace(/\s*\bdue:\d{4}-\d{2}-\d{2}/, '').trim();
    fire(inputEl);
  }

  /* ============================================================
     TAG-MENÜ (Dropdown für Projekte / Kontexte)
     ============================================================ */

  function makeTagMenu(inputEl, getState, type) {
    const menu = document.createElement('ul');
    menu.className  = 'fmt-tag-menu';
    menu.role       = 'listbox';
    menu.hidden     = true;
    return menu;
  }

  function toggleMenu(menu, btn, getState, type, inputEl, toolbar) {
    const isOpen = !menu.hidden;
    closeAllMenus(toolbar);
    if (isOpen) return;

    /* Menü mit aktuellen Werten befüllen */
    menu.innerHTML = '';
    const state   = getState();
    const todos   = state.todos || [];
    const symbol  = type === 'project' ? '+' : '@';

    const items = type === 'project'
      ? TodoParser.allProjects(todos)
      : TodoParser.allContexts(todos);

    /* Freie Eingabe immer ganz oben */
    const freeItem = makeFreeInputItem(symbol, inputEl, menu, toolbar);
    menu.appendChild(freeItem);

    if (items.length > 0) {
      const divider = document.createElement('li');
      divider.className = 'fmt-tag-divider';
      divider.textContent = 'Vorhanden';
      menu.appendChild(divider);

      items.forEach(name => {
        const li = document.createElement('li');
        li.className   = 'fmt-tag-item';
        li.textContent = `${symbol}${name}`;
        li.setAttribute('role', 'option');
        li.addEventListener('mousedown', e => { e.preventDefault(); });
        li.addEventListener('click', () => {
          insertTag(inputEl, `${symbol}${name}`);
          sync(toolbar, inputEl);
          inputEl.focus();
          menu.hidden = true;
        });
        menu.appendChild(li);
      });
    }

    menu.hidden = false;
    /* Fokus auf das Freitext-Input setzen */
    const fi = menu.querySelector('.fmt-free-input');
    if (fi) setTimeout(() => fi.focus(), 0);
  }

  function makeFreeInputItem(symbol, inputEl, menu, toolbar) {
    const li = document.createElement('li');
    li.className = 'fmt-tag-item fmt-tag-free';

    const prefix = document.createElement('span');
    prefix.className   = 'fmt-free-prefix';
    prefix.textContent = symbol;

    const fi = document.createElement('input');
    fi.type        = 'text';
    fi.className   = 'fmt-free-input';
    fi.placeholder = symbol === '+' ? 'ProjektName' : 'Kontext';
    fi.setAttribute('aria-label', symbol === '+' ? 'Neues Projekt eingeben' : 'Neuen Kontext eingeben');

    fi.addEventListener('keydown', e => {
      if (e.key === 'Enter' && fi.value.trim()) {
        e.preventDefault();
        const clean = fi.value.trim().replace(/\s+/g, '');
        insertTag(inputEl, `${symbol}${clean}`);
        sync(toolbar, inputEl);
        inputEl.focus();
        menu.hidden = true;
      } else if (e.key === 'Escape') {
        menu.hidden = true;
        inputEl.focus();
      }
    });

    li.appendChild(prefix);
    li.appendChild(fi);
    return li;
  }

  function closeAllMenus(toolbar) {
    toolbar.querySelectorAll('.fmt-tag-menu').forEach(m => { m.hidden = true; });
    toolbar.querySelectorAll('.fmt-due-wrapper.is-open').forEach(w => w.classList.remove('is-open'));
  }

  /* ============================================================
     DOM-HELFER
     ============================================================ */

  function makeGroup(label) {
    const g = document.createElement('div');
    g.className = 'fmt-group';
    g.setAttribute('aria-label', label);
    return g;
  }

  function makeSep() {
    const s = document.createElement('div');
    s.className  = 'fmt-sep';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  function makeBtn(label, title) {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'fmt-btn';
    btn.textContent = label;
    btn.title       = title;
    btn.setAttribute('aria-label', title);
    return btn;
  }

  function fire(inputEl) {
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /* ============================================================
     ÖFFENTLICHE API
     ============================================================ */
  return { create, sync };

})();
