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
  var DEFAULTS = { id: '2026-0012', current: 'D0', status: 'Open', values: {}, files: [], notes: [], dev: false };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === 'object') {
        var m = Object.assign(clone(DEFAULTS), s);
        m.values = Object.assign({}, s.values);
        m.files = Array.isArray(s.files) ? s.files : [];
        m.notes = Array.isArray(s.notes) ? s.notes : [];
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
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

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
      input.addEventListener('input', function () { add.disabled = !input.value.trim(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !add.disabled) add.click();
      });
      add.addEventListener('click', function () {
        var text = input.value.trim();
        if (!text) return;
        state.notes.push({ text: text, at: new Date().toISOString(), stage: state.current, by: 'You' });
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

  // ---- Page shell ----
  var VIEW_ID = null;
  function navItemsHTML(viewId) {
    var curI = stageIdx(state.current);
    var closed = state.status === 'Closed';
    return STAGES.map(function (s, i) {
      var cls = ['disc-item'], skipped = isSkipped(s.id);
      if (skipped) cls.push('is-skipped');
      else if (closed || i < curI) cls.push('is-done');
      if (!closed && s.id === state.current) cls.push('is-current');
      if (s.id === viewId) cls.push('is-viewing');
      var tip = s.id + ' – ' + s.title +
        (skipped ? ' (not required – no systemic action in D5)' : s.id === state.current && !closed ? ' (current stage of this 8D)' : '');
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
        '<span class="brand-sub">E8D Portal · Engineering 8D</span></a>' +
      '<nav class="disc" aria-label="Discipline">' +
        '<div class="disc-row"><span class="disc-label">Discipline</span><ol class="disc-list">' + items + '</ol></div>' +
        '<div class="legend" aria-hidden="true">' +
          '<span class="l-view"><span class="dot"></span>Viewing</span>' +
          '<span class="l-cur"><span class="dot"></span>Current stage of this 8D</span>' +
          '<span class="l-done"><span class="dot"></span>Completed</span>' +
          '<span class="l-skip"><span class="dot"></span>Not required</span>' +
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
    if (stage.approval) return 'Submit';
    if (stage.id === 'D8') return 'Close 8D';
    return 'Next Stage';
  }

  function onPrimary(stage, sub) {
    var i = stageIdx(stage.id);
    // D4 sub-pages: move to the next analysis tool without changing the 8D's stage.
    if (stage.subs && sub < stage.pages.length - 1) return go(stage.pages[sub + 1]);

    if (stage.id === 'D8') {
      if (state.status === 'Closed') return toast('This 8D is already closed.');
      state.status = 'Closed'; state.current = 'D8'; save();
      toast('8D closed. Status changed to Closed and the team is notified.');
      return setTimeout(function () { window.location.reload(); }, 1400);
    }

    var next = nextActive(i);
    var advances = state.status !== 'Closed' && i >= stageIdx(state.current);

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
      state.current = next.id; save();
    }

    if (stage.approval) {
      var who = managerName() || 'the 8D Manager';
      toast('Submitted to ' + who + ' for approval. (Prototype: approval simulated – moving to ' + next.id + '.)');
      return setTimeout(function () { go(next.pages[0]); }, 1600);
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
    var steps = '';
    if (stage.subs) {
      steps = '<nav class="substeps" aria-label="' + stage.id + ' analysis steps">' + stage.subs.map(function (s, i) {
        return '<a class="substep" href="' + stage.pages[i] + '"' + (i === sub ? ' aria-current="page"' : '') + '><b>' + (i + 1) + '</b>' + esc(s) + '</a>';
      }).join('') + '</nav>';
    }
    return '<main class="stage panel" aria-label="Stage Detail">' +
      '<div class="stage-head"><h1 class="sec-title">Stage Detail – ' + esc(title) + '</h1>' +
      '<span class="stage-pill">' + stage.id + (stage.subs ? ' · step ' + (sub + 1) + ' of ' + stage.subs.length : '') +
      (stage.approval ? ' · approval gate' : '') + '</span></div>' +
      ctx + steps + '<div class="stage-body' + (isSkipped(stage.id) ? ' is-skipped' : '') + '"></div>' +
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
    if (isSkipped(stage.id)) {
      document.querySelectorAll('.stage-body .ctl, .stage-body button').forEach(function (c) { c.disabled = true; });
    }

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
    state: function () { return state; },
    currentPage: function () { return stageById(state.current).pages[0]; },
    reset: function () { state = clone(DEFAULTS); save(); }
  };

  if (document.body.hasAttribute('data-stage')) initStagePage();
})();
