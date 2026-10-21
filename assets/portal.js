/*
 * E8D Portal – clickable prototype
 * Builds the constant header + Issue Detail panel on every page, renders the
 * declarative fields (<div data-f="..."> ...), and simulates the 8D workflow.
 * Demo data is kept in the browser's localStorage only.
 */
(function () {
  'use strict';

  // ---- Stage map (one entry per discipline; D4 has three sub-pages) ----
  var STAGES = [
    { id: 'D0',  title: '8D Initiation',                pages: ['d0.html'] },
    { id: 'D1',  title: 'Team Formation',               pages: ['d1.html'] },
    { id: 'D2',  title: 'Problem Description',          pages: ['d2.html'] },
    { id: 'D3',  title: 'Interim Containment Action',   pages: ['d3.html'] },
    { id: 'D3A', title: 'ICA Submission Request',       pages: ['d3a.html'], approval: true },
    { id: 'D4',  title: 'Root Cause Analysis',          pages: ['d4-fishbone.html', 'd4-5whys.html', 'd4-rca.html'],
                 subs: ['Fish Bone Diagram', '5 Whys', 'Root Cause Analysis'] },
    { id: 'D5',  title: 'Permanent Corrective Actions', pages: ['d5.html'] },
    { id: 'D5A', title: 'PCA Submission Request',       pages: ['d5a.html'], approval: true },
    { id: 'D6',  title: 'Validation of PCA',            pages: ['d6.html'] },
    { id: 'D7',  title: 'Systemic Action',              pages: ['d7.html'] },
    { id: 'D7A', title: 'SA Submission Request',        pages: ['d7a.html'], approval: true },
    { id: 'D8',  title: 'Congratulate the Team',        pages: ['d8.html'] }
  ];

  var STORE_KEY = 'e8d-prototype-v1';
  var DEFAULTS = {
    id: '2026-0012', current: 'D0', status: 'Open', values: {}, files: [], notes: [], dev: false,
    rev: 1, archive: [], viewRev: null,      // revisions (D4–D6 redone when D6 fails)
    approvals: {},                           // { D3A: { submitted, status: { m: 'Approved', a1: 'Pending' } } }
    log: {},                                 // stage timing { D1: { start, end } } in ms
    reminded: {},                            // reminders already sent, per stage + revision
    clockDays: 0                             // demo clock offset (prototype only)
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === 'object') {
        var m = Object.assign(clone(DEFAULTS), s);
        m.values = Object.assign({}, s.values);
        m.files = Array.isArray(s.files) ? s.files : [];
        m.notes = Array.isArray(s.notes) ? s.notes : [];
        m.archive = Array.isArray(s.archive) ? s.archive : [];
        ['approvals', 'log', 'reminded'].forEach(function (k) { m[k] = (s[k] && typeof s[k] === 'object') ? s[k] : {}; });
        // Earlier prototype versions kept Notes as one free-text box: keep it as the first log entry.
        if (m.values.hdr_notes && !m.notes.length) {
          m.notes.push({ text: m.values.hdr_notes, at: new Date().toISOString(), stage: m.current, by: 'Imported' });
          delete m.values.hdr_notes;
        }
        return m;
      }
    } catch (e) { /* storage unavailable */ }
    return clone(DEFAULTS);
  }
  var READONLY = false;                      // true while viewing an archived revision
  function save() {
    if (READONLY) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  var state = load();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function v(key) { return (state.values[key] || '').trim(); }
  function stageIdx(id) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i; return -1; }
  function stageById(id) { return STAGES[stageIdx(id)]; }
  function go(href) { window.location.href = href; }

  // D7 / D7A are only required when D5 › "Systemic action needed?" = Yes.
  function isSkipped(id) { return (id === 'D7' || id === 'D7A') && v('d5_systemic_needed') !== 'Yes'; }
  function nextActive(i) {
    var j = i + 1;
    while (j < STAGES.length - 1 && isSkipped(STAGES[j].id)) j++;
    return STAGES[j];
  }

  // ---- Timeline: target days per discipline and approval gate ----
  var TARGET_DAYS = { D1: 2, D2: 2, D3: 4, D3A: 2, D4: 10, D5: 2, D5A: 2, D6: 15, D7: 10, D7A: 2, D8: 1 };
  var DAY = 86400000;
  function now() { return Date.now() + (state.clockDays || 0) * DAY; }
  function clockOf(id) { return id; }                             // every stage, approval gates included, has its own clock
  function fmtDate(ms) { return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function ensureLog() {
    var p = clockOf(state.current);
    if (!state.log[p]) { state.log[p] = { start: now() }; save(); }
  }
  // Move the 8D to a new stage and keep the stage clock in step.
  function setCurrent(id) {
    var oldP = clockOf(state.current), newP = clockOf(id);
    state.current = id;
    if (oldP !== newP) {
      if (state.log[oldP] && !state.log[oldP].end) state.log[oldP].end = now();
      state.log[newP] = { start: now() };
    }
  }
  function timing(p) {
    var l = state.log[p], d = TARGET_DAYS[p];
    if (!l || !d) return null;
    var due = l.due || l.start + d * DAY, late = (l.end || now()) - due;   // l.due = target date changed by the 8D Manager
    return { start: l.start, end: l.end, due: due, days: d, changed: !!l.due, changes: l.changes || [],
      late: late > 0, lateDays: Math.max(1, Math.floor(late / DAY)), leftDays: Math.ceil(-late / DAY) };
  }
  // 8D Manager sets a new target date for an overdue stage (after the reminder went out).
  function changeTarget(p, newDue, reason) {
    var l = state.log[p], t = timing(p);
    if (!l || !t) return;
    l.changes = (l.changes || []).concat([{ from: t.due, to: newDue, reason: reason, at: now(), by: managerName() || '8D Manager' }]);
    l.due = newDue;
    addSystemNote('Target date for ' + p + ' changed from ' + fmtDate(t.due) + ' to ' + fmtDate(newDue) + ' by ' +
      (managerName() || 'the 8D Manager') + ' (8D Manager). Reason: ' + reason);
    save();
  }
  function addSystemNote(text) {
    state.notes.push({ text: text, at: new Date(now()).toISOString(), stage: state.current, by: 'System' });
  }
  // Prototype stand-in for the scheduled reminder flow: first overdue check records the e-mail in the notes log.
  function checkReminders() {
    if (state.status === 'Closed' || READONLY) return;
    var p = clockOf(state.current), t = timing(p);
    if (!t || t.end || !t.late) return;
    var k = p + '-rev' + state.rev;
    if (state.reminded[k] === t.due) return;      // already reminded for this target date (a new date can trigger a new reminder)
    state.reminded[k] = t.due;
    addSystemNote('Automatic reminder e-mailed to ' + (v('hdr_leader') || 'the 8D Leader') + ' (8D Leader) and ' +
      (managerName() || 'the 8D Manager') + ' (8D Manager): ' + p + ' has passed its ' +
      (t.changed ? 'revised target date' : t.days + '-day target') + ' (due ' + fmtDate(t.due) + ').');
    save();
  }

  // ---- Revisions: D4–D6 are redone when the corrective actions do not resolve the failure ----
  var REV_STAGES = ['D4', 'D5', 'D5A', 'D6'];
  var REV_KEY = /^(d4_|d5_|d6_)/;
  function archived(rev) { for (var i = 0; i < state.archive.length; i++) if (state.archive[i].rev === rev) return state.archive[i]; return null; }
  function startRevision() {
    var snap = {};
    Object.keys(state.values).forEach(function (k) { if (REV_KEY.test(k)) snap[k] = state.values[k]; });
    state.archive.push({
      rev: state.rev, values: snap, closedAt: now(),
      approvals: state.approvals.D5A ? clone(state.approvals.D5A) : null,
      log: { D4: state.log.D4, D5: state.log.D5, D5A: state.log.D5A, D6: state.log.D6 }
    });
    var old = state.rev;
    state.rev = old + 1;
    state.viewRev = state.rev;
    delete state.values.d6_resolved;         // Rev N+1 keeps D4–D6 content as a starting point, except the D6 verdict
    delete state.approvals.D5A;
    ['D4', 'D5', 'D5A', 'D6'].forEach(function (p) { delete state.log[p]; });
    setCurrent('D4');
    addSystemNote('Revision ' + state.rev + ' started: the corrective actions did not resolve the failure. ' +
      'D4–D6 of Rev ' + old + ' archived (read-only); Rev ' + state.rev + ' is pre-filled from Rev ' + old + '.');
    save();
  }
  function setViewRev(rev) {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
      s.viewRev = rev;
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) { /* ignore */ }
    window.location.reload();
  }

  // Auto-growing text boxes: the whole text always stays visible.
  function grow(el) {
    if (!el.offsetParent) return;                       // hidden – measured when shown
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }
  function bindAutogrow(root) {
    root.querySelectorAll('textarea.autogrow').forEach(function (el) {
      if (!el.hasAttribute('data-grow-bound')) {
        el.setAttribute('data-grow-bound', '');
        el.addEventListener('input', function () { grow(el); });
      }
      grow(el);
    });
  }

  // Names entered in a repeatable list (d1_approver_1, d1_approver_2, …)
  function listCount(base, min) { return Math.max(min || 0, +(state.values[base + '_count'] || 0)); }
  function listNames(base) {
    var out = [];
    for (var i = 1, n = listCount(base); i <= n; i++) if (v(base + '_' + i)) out.push(v(base + '_' + i));
    return out;
  }

  // ---- Toast ----
  var toastEl, toastTimer;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }

  // ---- Auto (system-generated) values ----
  function managerName() { return v('d1_manager'); }
  var AUTO = {
    status:   function () { return { val: state.status }; },
    current:  function () { return { val: state.current }; },
    manager:  function () { return { val: managerName() ? managerName() + ' (8D Manager)' : '', ph: 'Auto: 8D Manager (set in D1 › 8D Manager)' }; },
    approvers: function () { return { val: listNames('d1_approver').join(', '), ph: 'None – optional, added in D1' }; },
    notifiers: function () { return { val: listNames('d1_notifier').join(', '), ph: 'None – optional, added in D1' }; }
  };
  function renderAuto() {
    document.querySelectorAll('[data-src]').forEach(function (el) {
      var src = el.getAttribute('data-src'), r;
      if (AUTO[src]) r = AUTO[src]();
      else if (src.indexOf('value:') === 0) r = { val: v(src.slice(6)), ph: el.getAttribute('data-empty') || 'Not filled yet' };
      else return;
      el.value = r.val || '';
      if (r.ph) el.placeholder = r.ph;
      if (el.classList.contains('autogrow')) grow(el);
    });
    document.querySelectorAll('[data-summary]').forEach(renderSummary);
  }

  // ---- Declarative field builder ----
  var TAGS = {
    text: 'Text', textarea: 'Multi-line text', dropdown: 'Choice', person: 'Person',
    auto: 'Auto · read-only', url: 'Hyperlink', file: 'Attachments'
  };

  function buildField(el) {
    var t = el.getAttribute('data-f') || 'text';
    var key = el.getAttribute('data-key') || '';
    var label = el.getAttribute('data-label') || '';
    var ph = el.getAttribute('data-ph') || '';
    var rows = el.getAttribute('data-rows');
    var bare = el.hasAttribute('data-bare');
    var auto = el.hasAttribute('data-autogrow');
    var req = el.hasAttribute('data-required');
    var id = 'f-' + (key || el.getAttribute('data-src') || Math.random().toString(36).slice(2)).replace(/[^\w-]/g, '_');
    var opts = (el.getAttribute('data-options') || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    var aria = bare ? ' aria-label="' + esc(ph) + '"' : '';
    var ctl;

    if (t === 'dropdown') {
      ctl = '<select class="ctl is-empty" id="' + id + '" data-key="' + esc(key) + '"' + aria + '>' +
        '<option value="" disabled selected hidden>' + esc(opts.join(' / ')) + '</option>' +
        opts.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>';
    } else if (t === 'textarea') {
      ctl = '<textarea class="ctl' + (auto ? ' autogrow' : '') + '" id="' + id + '" rows="' + (auto ? 1 : (rows || 3)) + '" placeholder="' + esc(ph) + '" data-key="' + esc(key) + '"' + aria + '></textarea>';
    } else if (t === 'auto') {
      var src = esc(el.getAttribute('data-src'));
      var empty = el.getAttribute('data-empty') ? ' data-empty="' + esc(el.getAttribute('data-empty')) + '"' : '';
      ctl = (rows || auto)
        ? '<textarea class="ctl' + (auto ? ' autogrow' : '') + '" id="' + id + '" rows="' + (auto ? 1 : rows) + '" readonly data-src="' + src + '"' + empty + '></textarea>'
        : '<input class="ctl" id="' + id + '" readonly data-src="' + src + '"' + empty + '>';
    } else if (t === 'file') {
      ctl = '<label class="drop" id="drop-' + id + '"><input type="file" multiple id="' + id + '">' +
        '<span>' + esc(ph || 'Relevant files to be attached') + '</span><br><small>Click to browse or drop files here</small></label>' +
        '<ul class="files" data-files></ul>';
    } else {
      ctl = '<input class="ctl" id="' + id + '" type="' + (t === 'url' ? 'url' : 'text') + '" placeholder="' + esc(ph) +
        '" data-key="' + esc(key) + '"' + aria + (req ? ' aria-required="true"' : '') + '>';
    }

    var notes = [];
    if (!bare) {
      if (t === 'dropdown') notes.push('SharePoint <b>Choice</b> column. Options: ' + opts.map(esc).join(', ') + '.');
      if (t === 'person') notes.push('SharePoint <b>Person</b> column – pick from company directory (Office 365 Users).');
      if (t === 'url') notes.push('SharePoint <b>Hyperlink</b> column.');
      if (req) notes.push('<b>Mandatory</b> – Next Stage is blocked until filled.');
      if (el.getAttribute('data-note')) notes.push(el.getAttribute('data-note'));
      if (key) notes.push('Column: <code>' + esc(key) + '</code>');
    }

    el.classList.add('field', 'field--' + t);
    el.innerHTML =
      (bare ? '' : '<label for="' + id + '">' + esc(label) +
        (req ? '<span class="req" title="Mandatory">*</span>' : '') +
        ' <span class="tag">' + (TAGS[t] || 'Text') + '</span></label>') +
      ctl + (notes.length ? '<p class="dev-note">' + notes.join(' ') + '</p>' : '');
  }

  function bindInputs(root) {
    root.querySelectorAll('.ctl[data-key]').forEach(function (ctl) {
      var key = ctl.getAttribute('data-key');
      if (!key) return;
      var saved = state.values[key];
      if (saved != null) ctl.value = saved;
      if (ctl.tagName === 'SELECT') ctl.classList.toggle('is-empty', !ctl.value);
      var handler = function () {
        state.values[key] = ctl.value;
        if (ctl.tagName === 'SELECT') ctl.classList.toggle('is-empty', !ctl.value);
        save();
        renderAuto();
        updateTabCounts();
        if (key === 'd5_systemic_needed') renderNav();
        if (key === 'd6_resolved') renderRevisionStart();
      };
      ctl.addEventListener('input', handler);
      ctl.addEventListener('change', handler);
    });
  }

  // ---- Attachments (names only – nothing is uploaded) ----
  function bindFiles(root) {
    root.querySelectorAll('.field--file').forEach(function (field) {
      var input = field.querySelector('input[type=file]');
      var drop = field.querySelector('.drop');
      var list = field.querySelector('[data-files]');
      function render() {
        list.innerHTML = state.files.map(function (n, i) {
          return '<li><span title="' + esc(n) + '">' + esc(n) + '</span><button type="button" data-i="' + i + '" aria-label="Remove ' + esc(n) + '">×</button></li>';
        }).join('');
      }
      function add(files) {
        Array.prototype.forEach.call(files, function (f) { if (state.files.indexOf(f.name) < 0) state.files.push(f.name); });
        save(); render();
      }
      input.addEventListener('change', function () { add(input.files); input.value = ''; });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); });
      list.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]');
        if (!b) return;
        state.files.splice(+b.getAttribute('data-i'), 1);
        save(); render();
      });
      render();
    });
  }

  // ---- Notes: append-only event log (entries are locked once added) ----
  var NOTES_VISIBLE = 3;
  function fmtTime(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function bindNotes(root) {
    root.querySelectorAll('[data-notes]').forEach(function (box) {
      var showAll = false;
      box.innerHTML =
        '<label class="notes-label" for="note-new">Notes <span class="tag">Append-only log</span></label>' +
        '<textarea class="ctl autogrow" id="note-new" rows="1" placeholder="Add an event, update or comment…"></textarea>' +
        '<div class="note-actions"><button type="button" class="note-add" disabled>Add note</button>' +
          '<span class="note-hint">Locked once added</span></div>' +
        '<p class="dev-note">Each note is saved as a new, read-only entry with date/time, the 8D stage at that moment and the author ' +
          '(User().FullName in Power Apps). Nobody can edit or delete an entry – corrections are added as a new note. ' +
          'Suggested list <code>E8D_Notes</code>: 8D ID, Note, Stage, Author, Created; item-level permissions set to “create only”.</p>' +
        '<ol class="notes-list" aria-live="polite"></ol>';
      var input = box.querySelector('#note-new');
      var add = box.querySelector('.note-add');
      var list = box.querySelector('.notes-list');

      function render() {
        var notes = state.notes.slice().reverse();          // newest first
        if (!notes.length) { list.innerHTML = '<li class="note-empty">No notes yet.</li>'; return; }
        var shown = showAll ? notes : notes.slice(0, NOTES_VISIBLE);
        list.innerHTML = shown.map(function (n, i) {
          var no = state.notes.length - i;
          return '<li class="note"><div class="note-meta"><b>#' + no + '</b> · ' + esc(fmtTime(n.at)) + ' · ' + esc(n.stage) + ' · ' + esc(n.by) + '</div>' +
            '<p class="note-text">' + esc(n.text) + '</p></li>';
        }).join('') +
          (notes.length > NOTES_VISIBLE
            ? '<li><button type="button" class="note-more">' + (showAll ? 'Show latest ' + NOTES_VISIBLE + ' only' : 'Show all ' + notes.length + ' notes') + '</button></li>'
            : '');
      }
      if (READONLY) {
        input.disabled = true;
        input.placeholder = 'Switch to the current revision to add notes';
      }
      input.addEventListener('input', function () { add.disabled = !input.value.trim(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !add.disabled) add.click();
      });
      add.addEventListener('click', function () {
        var text = input.value.trim();
        if (!text) return;
        state.notes.push({ text: text, at: new Date(now()).toISOString(), stage: state.current, by: 'You' });
        save();
        input.value = ''; add.disabled = true; grow(input);
        render();
        toast('Note #' + state.notes.length + ' added and locked.');
      });
      list.addEventListener('click', function (e) {
        if (e.target.closest('.note-more')) { showAll = !showAll; render(); }
      });
      render();
    });
  }

  // ---- Repeaters: "+ Add" cards for fishbone hypotheses and 5-Why processes ----
  // <div data-repeat="d4_fb_man" data-template="hypothesis" data-min="2" data-add-label="Add hypothesis">
  var CARD_TEMPLATES = {
    hypothesis: function (base, n) {
      var k = base + '_h' + n;
      return '<div class="head" data-f="text" data-bare data-key="' + k + '" data-ph="Hypothesis ' + n + '"></div>' +
        '<div class="indent">' +
          '<div data-f="text" data-bare data-key="' + k + '_a1" data-ph="Action 1"></div>' +
          '<div data-f="text" data-bare data-key="' + k + '_r1" data-ph="Result 1"></div>' +
          '<div data-f="text" data-bare data-key="' + k + '_a2" data-ph="Action 2"></div>' +
          '<div data-f="text" data-bare data-key="' + k + '_r2" data-ph="Result 2"></div>' +
        '</div>';
    },
    process: function (base, n) {
      var k = base + '_p' + n, whys = '';
      for (var w = 1; w <= 5; w++) whys += '<div data-f="textarea" data-autogrow data-bare data-key="' + k + '_w' + w + '" data-ph="' + w + ' Why"></div>';
      return '<div class="head" data-f="textarea" data-autogrow data-bare data-key="' + k + '" data-ph="Process ' + n + '"></div>' +
        '<div class="indent">' + whys + '</div>';
    }
  };

  function bindRepeaters(root) {
    root.querySelectorAll('[data-repeat]').forEach(function (rep) {
      var base = rep.getAttribute('data-repeat');
      var tpl = CARD_TEMPLATES[rep.getAttribute('data-template')];
      var min = +(rep.getAttribute('data-min') || 2);
      var addLabel = rep.getAttribute('data-add-label') || 'Add';
      var countKey = base + '_count';
      function count() { return Math.max(min, +(state.values[countKey] || 0)); }

      function render(focusLast) {
        var n = count(), html = '';
        for (var i = 1; i <= n; i++) {
          html += '<div class="card">' + tpl(base, i) +
            (i > min && i === n ? '<button type="button" class="card-remove" data-remove>Remove</button>' : '') + '</div>';
        }
        html += '<button type="button" class="add-card" data-add><span aria-hidden="true">+</span> ' + esc(addLabel) + '</button>';
        rep.innerHTML = html;
        rep.querySelectorAll('[data-f]').forEach(buildField);
        bindInputs(rep);
        bindAutogrow(rep);
        updateTabCounts();
        if (focusLast) {
          var heads = rep.querySelectorAll('.head .ctl');
          heads[heads.length - 1].focus();
        }
      }

      rep.addEventListener('click', function (e) {
        if (e.target.closest('[data-add]')) {
          state.values[countKey] = String(count() + 1);
          save(); render(true);
        } else if (e.target.closest('[data-remove]')) {
          var card = e.target.closest('.card');
          card.querySelectorAll('.ctl[data-key]').forEach(function (c) { delete state.values[c.getAttribute('data-key')]; });
          state.values[countKey] = String(count() - 1);
          save(); render(false);
        }
      });
      render(false);
    });
  }

  // ---- Lists: repeatable rows / cards built from a <template> ({n} = item number) ----
  // <div data-list="d1_internal" data-min="2" data-add-label="Add internal team member" data-item="team member">
  //   <template> ...fields using {n}... </template></div>
  // data-count-from="d5_ca" mirrors another list's count (no add / remove – used by D6).
  function bindLists(root) {
    root.querySelectorAll('[data-list]').forEach(function (list) {
      var base = list.getAttribute('data-list');
      var min = +(list.getAttribute('data-min') || 0);
      var from = list.getAttribute('data-count-from');
      var tpl = list.querySelector('template').innerHTML;
      var addLabel = list.getAttribute('data-add-label') || 'Add';
      var itemName = list.getAttribute('data-item') || 'item';
      var cls = list.getAttribute('data-item-class') || '';
      var box = document.createElement('div');
      box.className = 'list-items';
      list.appendChild(box);
      function count() { return from ? listCount(from, 1) : listCount(base, min); }

      function render(focusLast) {
        var n = count(), html = '';
        for (var i = 1; i <= n; i++) {
          html += '<div class="list-item ' + cls + '" data-i="' + i + '">' + tpl.replace(/\{n\}/g, i) +
            (!from && i === n && n > min ? '<button type="button" class="list-remove" data-list-remove>Remove ' + esc(itemName) + ' ' + i + '</button>' : '') +
            '</div>';
        }
        if (!from) html += '<button type="button" class="list-add" data-list-add><span aria-hidden="true">+</span> ' + esc(addLabel) + '</button>';
        box.innerHTML = html;
        box.querySelectorAll('[data-f]').forEach(buildField);
        bindInputs(box);
        renderAuto();
        bindAutogrow(box);
        if (focusLast) {
          var items = box.querySelectorAll('.list-item');
          var f = items.length && items[items.length - 1].querySelector('.ctl:not([readonly])');
          if (f) f.focus();
        }
      }

      box.addEventListener('click', function (e) {
        if (e.target.closest('[data-list-add]')) {
          state.values[base + '_count'] = String(count() + 1);
          save(); render(true);
        } else if (e.target.closest('[data-list-remove]')) {
          e.target.closest('.list-item').querySelectorAll('.ctl[data-key]').forEach(function (c) {
            delete state.values[c.getAttribute('data-key')];
          });
          state.values[base + '_count'] = String(count() - 1);
          save(); render(false);
        }
      });
      render(false);
    });
  }

  // ---- Tabs (used on the fishbone page) ----
  function bindTabs(root) {
    root.querySelectorAll('[data-tabs]').forEach(function (wrap) {
      var tabs = wrap.querySelectorAll('.tab');
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.forEach(function (t) { t.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
          wrap.querySelectorAll('.tab-panel').forEach(function (p) {
            p.hidden = p.getAttribute('data-panel') !== tab.getAttribute('data-tab');
          });
        });
      });
    });
    updateTabCounts();
  }
  function updateTabCounts() {
    document.querySelectorAll('[data-tabs] .tab').forEach(function (tab) {
      var panel = document.querySelector('.tab-panel[data-panel="' + tab.getAttribute('data-tab') + '"]');
      var badge = tab.querySelector('.count');
      if (!panel || !badge) return;
      var n = 0;
      panel.querySelectorAll('.ctl[data-key]').forEach(function (c) { if (c.value.trim()) n++; });
      badge.textContent = n;
      badge.classList.toggle('has', n > 0);
    });
  }

  // ---- Approval summary: data-summary="key=Label;key=Label" ----
  // With data-summary-repeat="d5_ca" the pairs are repeated per list item ({n} = item number).
  function renderSummary(dl) {
    var spec = dl.getAttribute('data-summary');
    var base = dl.getAttribute('data-summary-repeat');
    var n = base ? listCount(base, 1) : 1, html = '';
    for (var i = 1; i <= n; i++) {
      var pairs = (base ? spec.replace(/\{n\}/g, i) : spec).split(';').map(function (p) { return p.split('='); });
      html += pairs.map(function (p, j) {
        var val = v(p[0]);
        return '<div' + (base && j === 0 && i > 1 ? ' class="group-start"' : '') + '><dt>' + esc(p[1]) + '</dt><dd class="' + (val ? '' : 'empty') + '">' +
          (val ? esc(val) : 'Not filled yet') + '</dd></div>';
      }).join('');
    }
    dl.innerHTML = html;
  }

  // ---- Approval gates: 8D Manager + every additional approver must approve ----
  function approverList() {
    var list = [{ k: 'm', name: managerName() || '8D Manager (not set in D1)', role: '8D Manager' }];
    for (var i = 1, n = listCount('d1_approver'); i <= n; i++) {
      if (v('d1_approver_' + i)) list.push({ k: 'a' + i, name: v('d1_approver_' + i), role: 'Additional approver' });
    }
    return list;
  }
  function allApproved(gate) {
    var a = state.approvals[gate];
    return !!a && approverList().every(function (p) { return a.status[p.k] === 'Approved'; });
  }
  function renderApprovals() {
    var box = document.querySelector('[data-approvals]');
    if (!box) return;
    var gate = VIEW_ID, a = state.approvals[gate], list = approverList();
    var pending = a ? list.filter(function (p) { return a.status[p.k] !== 'Approved'; }).length : list.length;
    box.innerHTML =
      '<div class="appr-head"><span class="group-label">Approvers</span>' +
        '<span class="appr-summary ' + (a ? (pending ? 'is-pending' : 'is-approved') : '') + '">' +
          (!a ? 'Not submitted yet' : pending ? plural(pending, 'approval') + ' pending' : 'All approved') + '</span></div>' +
      '<div class="tbl appr-tbl"><table><thead><tr><th>Approver</th><th>Role</th><th>Status</th><th><span class="sr">Action</span></th></tr></thead><tbody>' +
      list.map(function (p) {
        var st = a ? (a.status[p.k] || 'Pending') : 'Not submitted';
        return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.role) + '</td>' +
          '<td><span class="pill pill-' + st.toLowerCase().replace(/\s/g, '-') + '">' + st + '</span></td>' +
          '<td>' + (a && st !== 'Approved' && !READONLY ? '<button type="button" class="appr-btn" data-approve="' + p.k + '">Approve (demo)</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="section-sub appr-note">' + (a ? 'Submitted ' + esc(fmtDate(a.submitted)) + '. ' : '') +
        'All approvers must approve before the 8D moves on. Approvers are filled automatically from D1.</p>' +
      '<p class="dev-note">Power Automate: one approval request per approver (“Everyone must approve”), status written back per approver. ' +
        'Rejection returns the 8D to the previous stage with comments (not shown in this prototype).</p>';
  }
  function bindApprovals() {
    var box = document.querySelector('[data-approvals]');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-approve]');
      if (!b) return;
      var gate = VIEW_ID, a = state.approvals[gate];
      a.status[b.getAttribute('data-approve')] = 'Approved';
      var stage = stageById(gate), i = stageIdx(gate);
      if (allApproved(gate)) {
        var next = nextActive(i);
        addSystemNote(gate + ' approved by all approvers.');
        if (state.status !== 'Closed' && i >= stageIdx(state.current)) setCurrent(next.id);
        save(); renderApprovals(); updatePrimary(stage, 0);
        toast(gate + ' approved by everyone – 8D moves to ' + next.id + '.');
        setTimeout(function () { go(next.pages[0]); }, 1500);
      } else {
        save(); renderApprovals(); updatePrimary(stage, 0);
      }
    });
    renderApprovals();
  }

  // ---- D6: start a new revision when the corrective actions did not resolve the failure ----
  function renderRevisionStart() {
    var box = document.querySelector('[data-revision-start]');
    if (!box) return;
    if (READONLY || v('d6_resolved') !== 'No') { box.innerHTML = ''; return; }
    box.innerHTML =
      '<div class="rev-start"><p><b>Corrective actions did not resolve the failure.</b> Start a new revision to rework the root cause from D4. ' +
        'Rev ' + state.rev + ' of D4–D6 is archived (read-only) and Rev ' + (state.rev + 1) + ' starts pre-filled from it. D0–D3 stay unchanged.</p>' +
      '<button type="button" class="btn rev-btn" data-rev-start>Start Rev ' + (state.rev + 1) + ' (back to D4)</button></div>';
    var btn = box.querySelector('[data-rev-start]'), armed = false, t;
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true; btn.textContent = 'Click again to confirm Rev ' + (state.rev + 1);
        t = setTimeout(function () { armed = false; btn.textContent = 'Start Rev ' + (state.rev + 1) + ' (back to D4)'; }, 4000);
        return;
      }
      clearTimeout(t);
      startRevision();
      toast('Rev ' + state.rev + ' started – back to D4.');
      setTimeout(function () { go('d4-fishbone.html'); }, 900);
    });
  }

  // ---- Stage deadline box (Issue Detail) ----
  function dueHTML() {
    if (state.status === 'Closed') {
      var t8 = state.log.D8;
      return '<div class="due-box is-done"><span class="due-k">8D closed</span><span class="due-v">' + (t8 && t8.end ? esc(fmtDate(t8.end)) : '') + '</span></div>';
    }
    var p = clockOf(state.current), t = timing(p);
    if (!t) return '<div class="due-box"><span class="due-k">' + p + ' target</span><span class="due-v">No target time for ' + p + '</span></div>';
    var cls = t.late ? 'is-late' : t.leftDays <= 1 ? 'is-soon' : '';
    var status = t.late ? 'Overdue by ' + plural(t.lateDays, 'day') + ' · reminder sent to 8D Leader & 8D Manager'
      : t.leftDays === 0 ? 'Due today' : plural(t.leftDays, 'day') + ' left';
    var html = '<div class="due-box ' + cls + '"><span class="due-k">' + p + ' target · ' + plural(t.days, 'day') + (t.changed ? ' · date revised' : '') + '</span>' +
      '<span class="due-v">Due ' + esc(fmtDate(t.due)) + '</span><span class="due-s">' + status + '</span>';
    // Always visible, but locked until the target date has passed (and the reminder has gone out);
    // then the 8D Manager can set a new target date with a reason.
    if (!t.end && !READONLY) {
      var open = t.late;
      var d = new Date(now() + 2 * DAY);
      var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var lock = open ? '' : ' disabled';
      html += '<details class="due-change' + (open ? '' : ' is-locked') + '"><summary>Change target date <span>(8D Manager only' + (open ? '' : ' · locked') + ')</span></summary>' +
        (open ? '' : '<p class="due-lock">Unlocks once ' + esc(fmtDate(t.due)) + ' has passed and the reminder has been sent.</p>') +
        '<label for="due-new">New target date</label><input class="ctl" type="date" id="due-new" value="' + iso + '"' + lock + '>' +
        '<label for="due-reason">Reason</label><textarea class="ctl autogrow" id="due-reason" rows="1" placeholder="Why the date needs to move"' + lock + '></textarea>' +
        '<button type="button" class="note-add" id="due-save" disabled>Update target date</button>' +
        '<p class="dev-note">Visible only to the 8D Manager in the real portal (compare User().Email with the 8D Manager). ' +
          'Each change is stored on the stage log (old date, new date, reason, who, when) and added to Notes. ' +
          'A new reminder is sent if the revised date also passes.</p></details>';
    }
    if (t.changes.length) {
      html += '<ul class="due-history">' + t.changes.map(function (c) {
        return '<li>' + esc(fmtDate(c.from)) + ' → ' + esc(fmtDate(c.to)) + ' · ' + esc(c.by) + '</li>';
      }).join('') + '</ul>';
    }
    return html + '</div>';
  }
  function bindDueChange() {
    var btn = document.getElementById('due-save');
    if (!btn) return;
    var date = document.getElementById('due-new'), reason = document.getElementById('due-reason');
    if (date.disabled) return;                       // locked until the stage is overdue
    function check() { btn.disabled = !date.value || !reason.value.trim(); }
    date.addEventListener('input', check);
    reason.addEventListener('input', check);
    btn.addEventListener('click', function () {
      var parts = date.value.split('-');
      var due = new Date(+parts[0], +parts[1] - 1, +parts[2], 23, 59).getTime();   // end of the chosen day
      if (due <= now()) { toast('Choose a date after today.'); date.focus(); return; }
      changeTarget(clockOf(state.current), due, reason.value.trim());
      toast('Target date updated and recorded in Notes.');
      setTimeout(function () { window.location.reload(); }, 900);
    });
  }

  // ---- Page shell ----
  var VIEW_ID = null;
  function navItemsHTML(viewId) {
    var curI = stageIdx(state.current);
    var closed = state.status === 'Closed';
    return STAGES.map(function (s, i) {
      var cls = ['disc-item'], skipped = isSkipped(s.id);
      if (skipped) cls.push('is-skipped');
      else if (closed || i < curI) cls.push('is-done');
      var overdue = false;
      if (!closed && s.id === state.current) {
        cls.push('is-current');
        var t = timing(clockOf(s.id));
        if (t && t.late) { cls.push('is-overdue'); overdue = true; }
      }
      if (s.id === viewId) cls.push('is-viewing');
      var tip = s.id + ' – ' + s.title +
        (skipped ? ' (not required – no systemic action in D5)' : s.id === state.current && !closed ? ' (current stage of this 8D' + (overdue ? ', overdue' : '') + ')' : '');
      return '<li><a class="' + cls.join(' ') + '" href="' + s.pages[0] + '" title="' + esc(tip) + '"' +
        (s.id === viewId ? ' aria-current="page"' : '') + '><span class="dot" aria-hidden="true"></span>' + s.id + '</a></li>';
    }).join('');
  }
  function renderNav() {
    var ol = document.querySelector('.disc-list');
    if (ol) ol.innerHTML = navItemsHTML(VIEW_ID);
  }

  function headerHTML(viewId) {
    var closed = state.status === 'Closed';
    var items = navItemsHTML(viewId);

    return '<header class="topbar">' +
      '<a class="brand" href="index.html" title="Back to prototype start page">' +
        '<span class="brand-id">8D #' + esc(state.id) + '</span>' +
        '<span class="brand-status' + (closed ? ' closed' : '') + '">' + esc(state.status) + '</span>' +
        (state.rev > 1 ? '<span class="brand-status">Rev ' + state.rev + '</span>' : '') +
        '<span class="brand-sub">E8D Portal · Engineering 8D</span></a>' +
      '<nav class="disc" aria-label="Discipline">' +
        '<div class="disc-row"><span class="disc-label">Discipline</span><ol class="disc-list">' + items + '</ol></div>' +
        '<div class="legend" aria-hidden="true">' +
          '<span class="l-view"><span class="dot"></span>Viewing</span>' +
          '<span class="l-cur"><span class="dot"></span>Current stage of this 8D</span>' +
          '<span class="l-done"><span class="dot"></span>Completed</span>' +
          '<span class="l-skip"><span class="dot"></span>Not required</span>' +
          '<span class="l-late"><span class="dot"></span>Overdue</span>' +
        '</div>' +
      '</nav>' +
      '<button type="button" class="dev-toggle" aria-pressed="' + (state.dev ? 'true' : 'false') + '">Dev notes</button>' +
    '</header>' + CONCEPT_NOTE;
  }

  var CONCEPT_NOTE =
    '<div class="concept-note">Concept mock-up created by <b>Dibakar Deb</b> to illustrate the requirements for our E8D portal – ' +
    'its layout, fields and workflow. It is a reference for discussion, not the final application.</div>';

  function issueHTML() {
    return '<aside class="issue panel" aria-label="Issue Detail">' +
      '<h2 class="sec-title">Issue Detail</h2>' +
      '<p class="dev-page">This panel is identical on every stage; only Stage Detail changes.</p>' +
      '<div class="g2 meta">' +
        '<div data-f="auto" data-src="status" data-label="Status" data-note="Open / Closed – system generated from 8D status."></div>' +
        '<div data-f="auto" data-src="current" data-label="Current Stage" data-note="Latest stage reached by the 8D – system generated."></div>' +
      '</div>' +
      dueHTML() +
      '<div class="dev-page"><b>Stage timeline.</b> Targets: ' +
        Object.keys(TARGET_DAYS).map(function (k) { return k + ' ' + TARGET_DAYS[k] + 'd'; }).join(', ') +
        ' (calendar days; each approval gate has its own 2 days). The clock starts when the 8D enters a stage. ' +
        'A scheduled Power Automate flow checks daily and e-mails the 8D Leader and 8D Manager once the target has passed; ' +
        'the 8D Manager can then set a new target date with a reason.' +
        '<div class="clock">Demo clock' + (state.clockDays ? ' (+' + plural(state.clockDays, 'day') + ')' : '') + ': ' +
        '<button type="button" data-clock="1">+1 day</button><button type="button" data-clock="5">+5 days</button>' +
        '<button type="button" data-clock="0">Reset</button></div></div>' +
      '<div data-f="person" data-key="hdr_leader" data-label="8D Leader" data-ph="Name"></div>' +
      '<div data-f="text" data-key="hdr_project_no" data-label="Project Number" data-ph="Project Number"></div>' +
      '<div data-f="text" data-key="hdr_project_name" data-label="Project Name" data-ph="Name"></div>' +
      '<div data-f="text" data-key="hdr_customer" data-label="Customer" data-ph="Name"></div>' +
      '<div data-f="url" data-key="hdr_windchill" data-label="Windchill Link" data-ph="Link"></div>' +
      '<div data-f="file" data-key="attachments" data-label="Attachments" data-ph="Relevant files to be attached" data-note="Store in a SharePoint document library, one folder per 8D ID."></div>' +
      '<div class="notes-log" data-notes></div>' +
    '</aside>';
  }

  function primaryLabel(stage, sub) {
    if (stage.subs && sub < stage.pages.length - 1) return 'Next: ' + stage.subs[sub + 1];
    if (READONLY) return 'Next (read-only)';
    if (stage.approval) {
      var a = state.approvals[stage.id];
      if (!a) return 'Submit for approval';
      return allApproved(stage.id) ? 'Continue to ' + nextActive(stageIdx(stage.id)).id : 'Waiting for approval';
    }
    if (stage.id === 'D8') return 'Close 8D';
    return 'Next Stage';
  }
  function updatePrimary(stage, sub) {
    var b = document.querySelector('[data-act=primary]');
    if (b) b.textContent = primaryLabel(stage, sub);
  }

  function onPrimary(stage, sub) {
    var i = stageIdx(stage.id);
    // D4 sub-pages: move to the next analysis tool without changing the 8D's stage.
    if (stage.subs && sub < stage.pages.length - 1) return go(stage.pages[sub + 1]);
    // Archived revision: browse only.
    if (READONLY) return go(nextActive(i).pages[0]);

    if (stage.id === 'D8') {
      if (state.status === 'Closed') return toast('This 8D is already closed.');
      state.status = 'Closed';
      setCurrent('D8');
      if (state.log.D8) state.log.D8.end = now();
      addSystemNote('8D closed.');
      save();
      toast('8D closed. Status changed to Closed and the team is notified.');
      return setTimeout(function () { window.location.reload(); }, 1400);
    }

    var next = nextActive(i);
    var advances = state.status !== 'Closed' && i >= stageIdx(state.current);

    // Approval gates: submit, then every approver must approve (simulated with the Approve buttons).
    if (stage.approval) {
      var a = state.approvals[stage.id];
      if (!a) {
        if (!managerName()) { toast('Set the 8D Manager in D1 before submitting for approval.'); return; }
        state.approvals[stage.id] = { submitted: now(), status: {} };
        addSystemNote(stage.id + ' submitted for approval to ' + approverList().map(function (p) { return p.name; }).join(', ') + '.');
        save(); renderApprovals(); updatePrimary(stage, sub);
        return toast('Submitted for approval. Use “Approve (demo)” to simulate each approver.');
      }
      if (!allApproved(stage.id)) {
        var n = approverList().filter(function (p) { return a.status[p.k] !== 'Approved'; }).length;
        return toast('Waiting for ' + plural(n, 'approval') + '. All approvers must approve before moving on.');
      }
      if (advances) { setCurrent(next.id); save(); }
      return go(next.pages[0]);
    }

    // Mandatory fields on this page must be filled before the 8D can move forward.
    if (advances) {
      var missing = Array.prototype.filter.call(document.querySelectorAll('.stage-body [data-required] .ctl'), function (c) { return !c.value.trim(); });
      if (missing.length) {
        var wrap = missing[0].closest('[data-required]'), lbl = wrap.querySelector('label');
        var name = wrap.getAttribute('data-req-label') || (lbl ? lbl.firstChild.textContent.trim() : 'A mandatory field');
        toast(name + ' is mandatory before moving to ' + next.id + '.');
        missing[0].focus();
        return;
      }
      setCurrent(next.id); save();
    }

    if (advances) {
      var skippedNote = stageIdx(next.id) > i + 1 ? ' (D7 & D7A not required – no systemic action)' : '';
      toast(stage.id + ' completed – 8D moved to ' + next.id + '.' + skippedNote);
    }
    setTimeout(function () { go(next.pages[0]); }, advances ? 700 : 0);
  }

  function stageHTML(stage, sub) {
    var title = stage.subs ? stage.subs[sub] : stage.title;
    var closed = state.status === 'Closed';
    var ctx = '';
    if (closed) {
      ctx = '<div class="context closed"><span class="dot"></span>This 8D is closed. All stages are read-only in the real tool.</div>';
    } else if (isSkipped(stage.id)) {
      ctx = '<div class="context skipped"><span class="dot"></span><span><b>Not required.</b> D7 and D7A only apply when ' +
        '<a href="d5.html">D5 › Systemic action needed?</a> is set to <b>Yes</b>. This stage is skipped.</span></div>';
    } else if (stage.id !== state.current) {
      var cur = stageById(state.current);
      ctx = '<div class="context"><span class="dot"></span><span>You are viewing <b>' + stage.id + ' – ' + esc(stage.title) +
        '</b>. This 8D is currently at <b><a href="' + cur.pages[0] + '">' + cur.id + ' – ' + esc(cur.title) + '</a></b>.</span></div>';
    }
    // Revision selector on D4–D6 once a second revision exists
    var revbar = '';
    if (REV_STAGES.indexOf(stage.id) >= 0 && state.rev > 1) {
      var viewing = READONLY ? state.viewRev : state.rev, pills = '';
      for (var r = 1; r <= state.rev; r++) {
        pills += '<button type="button" class="rev-pill" data-view-rev="' + r + '"' + (r === viewing ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
          'Rev ' + r + (r === state.rev ? ' · current' : ' · archived') + '</button>';
      }
      revbar = '<div class="revbar"><span class="revbar-k">Revision</span>' + pills + '</div>';
      if (READONLY) {
        var arch = archived(state.viewRev);
        revbar += '<div class="context archived"><span class="dot"></span><span><b>Viewing Rev ' + state.viewRev + ' (archived, read-only).</b> ' +
          'Closed ' + esc(fmtDate(arch.closedAt)) + ' because the corrective actions did not resolve the failure. ' +
          '<button type="button" class="linkish" data-view-rev="' + state.rev + '">Back to Rev ' + state.rev + '</button></span></div>';
      }
    }
    // Target / due date of the viewed discipline
    // Only the target duration here; the due date and overdue status live in the Issue Detail deadline box.
    var td = TARGET_DAYS[clockOf(stage.id)];
    var timeTxt = td ? ' · target ' + plural(td, 'day') : '';
    var steps = '';
    if (stage.subs) {
      steps = '<nav class="substeps" aria-label="' + stage.id + ' analysis steps">' + stage.subs.map(function (s, i) {
        return '<a class="substep" href="' + stage.pages[i] + '"' + (i === sub ? ' aria-current="page"' : '') + '><b>' + (i + 1) + '</b>' + esc(s) + '</a>';
      }).join('') + '</nav>';
    }
    return '<main class="stage panel" aria-label="Stage Detail">' +
      '<div class="stage-head"><h1 class="sec-title">Stage Detail – ' + esc(title) + '</h1>' +
      '<span class="stage-pill">' + stage.id + (stage.subs ? ' · step ' + (sub + 1) + ' of ' + stage.subs.length : '') +
      (stage.approval ? ' · approval gate' : '') + esc(timeTxt) + '</span></div>' +
      revbar + ctx + steps + '<div class="stage-body' + (isSkipped(stage.id) ? ' is-skipped' : '') + (READONLY ? ' is-readonly' : '') + '"></div>' +
      '<div class="actions">' +
        '<button type="button" class="btn" data-act="report">Generate Report</button>' +
        '<button type="button" class="btn" data-act="primary">' + esc(primaryLabel(stage, sub)) + '</button>' +
      '</div></main>';
  }

  function syncHeaderHeight() {
    var h = document.querySelector('.topbar');
    if (h) document.documentElement.style.setProperty('--hdr-h', h.offsetHeight + 'px');
  }

  function setDev(on) {
    state.dev = on; save();
    document.body.classList.toggle('dev', on);
    var b = document.querySelector('.dev-toggle');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function initStagePage() {
    var body = document.body;
    var stage = stageById(body.getAttribute('data-stage'));
    var sub = +(body.getAttribute('data-sub') || 0);
    var content = document.getElementById('stage-content');
    VIEW_ID = stage.id;

    // Viewing an archived revision of D4–D6: show its values, never save.
    if (REV_STAGES.indexOf(stage.id) >= 0 && state.viewRev && state.viewRev < state.rev) {
      var arch = archived(state.viewRev);
      if (arch) {
        var merged = {};
        Object.keys(state.values).forEach(function (k) { if (!REV_KEY.test(k)) merged[k] = state.values[k]; });
        state.values = Object.assign(merged, arch.values);
        if (arch.approvals) state.approvals = Object.assign({}, state.approvals, { D5A: arch.approvals });
        READONLY = true;
      }
    }
    if (!READONLY) { ensureLog(); checkReminders(); }

    var shell = document.createElement('div');
    shell.innerHTML = headerHTML(stage.id) + '<div class="layout">' + issueHTML() + stageHTML(stage, sub) + '</div>';
    shell.querySelector('.stage-body').appendChild(content);
    var anchor = body.firstChild;
    while (shell.firstChild) body.insertBefore(shell.firstChild, anchor);

    document.querySelectorAll('[data-f]').forEach(buildField);
    bindInputs(document);
    bindFiles(document);
    bindNotes(document);
    bindRepeaters(document);
    bindLists(document);
    bindTabs(document);
    renderAuto();
    bindAutogrow(document);
    bindApprovals();
    renderRevisionStart();
    bindDueChange();
    if (isSkipped(stage.id) || READONLY) {
      document.querySelectorAll('.stage-body .ctl, .stage-body button').forEach(function (c) { c.disabled = true; });
    }
    document.querySelectorAll('[data-view-rev]').forEach(function (b) {
      b.addEventListener('click', function () { setViewRev(+b.getAttribute('data-view-rev')); });
    });
    document.querySelectorAll('[data-clock]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = +b.getAttribute('data-clock');
        state.clockDays = d ? (state.clockDays || 0) + d : 0;
        if (READONLY) { try { var s = JSON.parse(localStorage.getItem(STORE_KEY)); s.clockDays = state.clockDays; localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
        save(); window.location.reload();
      });
    });

    document.querySelector('[data-act=report]').addEventListener('click', function () {
      toast('Generate Report – placeholder only. Report output is out of scope for this prototype.');
    });
    document.querySelector('[data-act=primary]').addEventListener('click', function () { onPrimary(stage, sub); });
    document.querySelector('.dev-toggle').addEventListener('click', function () { setDev(!state.dev); });
    setDev(state.dev);

    document.title = stage.id + ' · ' + (stage.subs ? stage.subs[sub] : stage.title) + ' – E8D Portal';
    syncHeaderHeight();
    window.addEventListener('resize', function () {
      syncHeaderHeight();
      document.querySelectorAll('textarea.autogrow').forEach(grow);
    });
  }

  // Public API for the start page
  window.E8D = {
    stages: STAGES,
    conceptNote: CONCEPT_NOTE,
    isSkipped: isSkipped,
    targetDays: TARGET_DAYS,
    readOnly: function () { return READONLY; },
    state: function () { return state; },
    currentPage: function () { return stageById(state.current).pages[0]; },
    reset: function () { state = clone(DEFAULTS); save(); }
  };

  if (document.body.hasAttribute('data-stage')) initStagePage();
})();
