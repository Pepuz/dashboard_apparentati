// Supabase URL and publishable key come from the link fragment (#url=...&key=...) and localStorage, never from the repo.
(function () {
  'use strict';

  const POLL_MS = 10000;
  const REQUEST_TIMEOUT_MS = 15000;
  const PICKER_MS = 30000;
  const CONFIG_ITEM = 'config';
  const ROOMMATE_ITEM = 'roommate';
  const MEAL_DAYS = 7;
  const MEALS = [['lunch', 'Pranzo'], ['dinner', 'Cena']];
  const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

  // Date helpers copied from tv-app/app.js, which stays in ES5 for the TV's engine.
  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(d, days) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  }

  function weekStart(d) {
    return addDays(d, -((d.getDay() + 6) % 7));
  }

  function clock(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function dayMonth(iso) {
    return iso.slice(8, 10) + '/' + iso.slice(5, 7);
  }

  function dayTitle(offset, d) {
    return (offset === 0 ? 'Oggi, ' : offset === 1 ? 'Domani, ' : '') + WEEKDAYS[d.getDay()] + ' ' + dayMonth(isoDate(d));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function describeMeal(p) {
    if (!p) return 'non specificato';
    const parts = [p.is_present ? 'presente' : 'assente'];
    if (p.required_time) parts.push('ore ' + p.required_time.slice(0, 5));
    if (p.guest_names.length) parts.push('ospiti (' + p.guest_names.length + '): ' + p.guest_names.join(', '));
    if (p.note) parts.push('nota: ' + p.note);
    return parts.join(' · ');
  }

  // ISO weekday as stored in meal_defaults: 1 = Monday, 7 = Sunday.
  function isoWeekday(d) {
    return d.getDay() || 7;
  }

  function weekdayOf(iso) {
    const parts = iso.split('-').map(Number);
    return isoWeekday(new Date(parts[0], parts[1] - 1, parts[2]));
  }

  // The day's answer wins over the weekly habit; a habit carries no time, guests or note.
  function presenceOf(roommate, date, meal) {
    const answer = roommate.meal_presence.find((p) => p.date === date && p.meal === meal);
    if (answer) return answer;
    const weekday = weekdayOf(date);
    const habit = roommate.meal_defaults.find((h) => h.weekday === weekday && h.meal === meal && h.is_present !== null);
    return habit ? { is_present: habit.is_present, required_time: null, guest_names: [], note: null } : null;
  }

  function habitOf(roommate, weekday, meal) {
    const habit = roommate.meal_defaults.find((h) => h.weekday === weekday && h.meal === meal);
    return habit && habit.is_present !== null ? habit.is_present : null;
  }

  // valueOf(weekday, meal) gives 'yes', 'no' or '' (no habit): every cell is written, a cleared one as null.
  function habitRows(roommateId, valueOf, now) {
    const rows = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      MEALS.forEach((meal) => {
        const value = valueOf(weekday, meal[0]);
        rows.push({
          roommate_id: roommateId,
          weekday: weekday,
          meal: meal[0],
          is_present: value === '' ? null : value === 'yes',
          updated_at: now.toISOString()
        });
      });
    }
    return rows;
  }

  // e.g. "Pranzo: di solito non ci sono lun, mar, mer, gio, ven".
  function habitLines(roommate) {
    const lines = [];
    MEALS.forEach((meal) => {
      [[true, 'di solito ci sono'], [false, 'di solito non ci sono']].forEach((kind) => {
        const days = [];
        for (let weekday = 1; weekday <= 7; weekday++) {
          if (habitOf(roommate, weekday, meal[0]) === kind[0]) days.push(WEEKDAYS[weekday % 7].slice(0, 3));
        }
        if (days.length) lines.push(meal[1] + ': ' + kind[1] + ' ' + days.join(', '));
      });
    });
    return lines;
  }

  function shiftFor(task, week) {
    return task.cleaning_shifts.find((s) => s.week_start === week) || null;
  }

  // Returns {url, key} from the link fragment, or null if it does not carry a usable pair.
  function parseLink(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const url = (params.get('url') || '').replace(/\/+$/, '');
    const key = params.get('key') || '';
    // A forwarded or crafted link must not point the app at another server or carry a secret key.
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key.startsWith('sb_publishable_')) return null;
    return { url: url, key: key };
  }

  function cleanGuests(names) {
    return names.map((n) => n.trim()).filter((n) => n !== '');
  }

  // Upserts write every column: PostgreSQL checks NOT NULL and CHECK constraints before resolving the conflict,
  // and absent_has_no_guests_or_time rejects an absent row that keeps an old time or old guests.
  function presenceRow(roommateId, date, meal, form, now) {
    return {
      roommate_id: roommateId,
      date: date,
      meal: meal,
      is_present: form.present,
      required_time: form.present && form.time ? form.time : null,
      guest_names: form.present ? cleanGuests(form.guests) : [],
      note: form.note.trim() || null,
      updated_at: now.toISOString()
    };
  }

  function shiftRow(taskId, week, roommateId, status, now) {
    return { task_id: taskId, week_start: week, roommate_id: roommateId, status: status, updated_at: now.toISOString() };
  }

  function headcount(presences) {
    const present = presences.filter((p) => p && p.is_present);
    const guests = present.reduce((n, p) => n + p.guest_names.length, 0);
    if (!present.length) return 'nessun presente';
    return present.length + (present.length === 1 ? ' presente' : ' presenti') +
      (guests ? ' + ' + guests + (guests === 1 ? ' ospite' : ' ospiti') : '');
  }

  // One line per answer group, e.g. "Ci sono: Nome (ore 13:00 · ospiti: Ospite)".
  function othersLines(others, date, meal) {
    const groups = [['Ci sono', []], ['Non ci sono', []], ['Senza risposta', []]];
    others.forEach((r) => {
      const p = presenceOf(r, date, meal);
      if (!p) {
        groups[2][1].push(r.name);
        return;
      }
      const extra = [];
      if (p.required_time) extra.push('ore ' + p.required_time.slice(0, 5));
      if (p.guest_names.length) extra.push('ospiti: ' + p.guest_names.join(', '));
      if (p.note) extra.push('nota: ' + p.note);
      groups[p.is_present ? 0 : 1][1].push(r.name + (extra.length ? ' (' + extra.join(' · ') + ')' : ''));
    });
    return groups.filter((g) => g[1].length).map((g) => g[0] + ': ' + g[1].join(', '));
  }

  // Storage can be blocked or wiped by the browser: the app then works from the link for this visit only.
  function loadItem(name) {
    try {
      return JSON.parse(localStorage.getItem(name));
    } catch (e) {
      return null;
    }
  }

  function saveItem(name, value) {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch (e) {}
  }

  // Only the apikey header: publishable keys are not JWTs and do not belong in Authorization.
  async function request(config, path, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(config.url + '/rest/v1/' + path, {
        method: init.method,
        headers: Object.assign({ apikey: config.key }, init.headers),
        body: init.body,
        signal: controller.signal
      });
    } catch (e) {
      throw new Error(controller.signal.aborted ? 'timeout' : 'Supabase non raggiungibile');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).message || '';
      } catch (e) {}
      throw new Error('HTTP ' + res.status + (detail ? ': ' + detail : ''));
    }
    return res;
  }

  async function get(config, path) {
    return (await request(config, path, { method: 'GET' })).json();
  }

  // Success is 201 when the row is inserted and 200 when it is updated; the body is empty either way.
  function upsert(config, table, conflictColumns, row) {
    return request(config, table + '?on_conflict=' + conflictColumns, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(row)
    });
  }

  async function fetchData(config, today) {
    const days = [];
    for (let i = 0; i < MEAL_DAYS; i++) days.push(addDays(today, i));
    const first = isoDate(days[0]);
    const lastDay = isoDate(days[days.length - 1]);
    const thisWeek = isoDate(weekStart(today));
    const nextWeek = isoDate(addDays(weekStart(today), 7));
    const results = await Promise.all([
      get(config, 'roommates?select=id,name,meal_presence(date,meal,is_present,required_time,guest_names,note),' +
        'meal_defaults(weekday,meal,is_present)' +
        '&active=eq.true&meal_presence.date=gte.' + first + '&meal_presence.date=lte.' + lastDay + '&order=name.asc'),
      get(config, 'cleaning_tasks?select=id,name,cleaning_shifts(roommate_id,week_start,status,roommates(name))' +
        '&active=eq.true&cleaning_shifts.week_start=in.(' + thisWeek + ',' + nextWeek + ')' +
        '&order=sort_order.asc,name.asc')
    ]);
    return { days: days, thisWeek: thisWeek, nextWeek: nextWeek, roommates: results[0], tasks: results[1] };
  }

  function guestRow(name) {
    return '<div class="guest"><input name="guest" aria-label="Nome ospite" value="' + escapeHtml(name) + '">' +
      '<button type="button" data-action="remove-guest" aria-label="Togli ospite">×</button></div>';
  }

  function mealForm(date, meal, p) {
    const present = !!(p && p.is_present);
    return '<form data-date="' + escapeHtml(date) + '" data-meal="' + escapeHtml(meal) + '">' +
      '<label><input type="radio" name="present" value="yes" required' + (present ? ' checked' : '') + '> Ci sono</label> ' +
      '<label><input type="radio" name="present" value="no"' + (p && !p.is_present ? ' checked' : '') + '> Non ci sono</label>' +
      '<fieldset class="if-present"' + (present ? '' : ' hidden') + '>' +
      '<label>Orario richiesto <input type="time" name="time" value="' +
      escapeHtml(p && p.required_time ? p.required_time.slice(0, 5) : '') + '"></label> ' +
      '<button type="button" data-action="clear-time">Nessun orario</button>' +
      '<div class="guests">' + (p ? p.guest_names.map(guestRow).join('') : '') + '</div>' +
      '<button type="button" data-action="add-guest">+ ospite</button>' +
      '</fieldset>' +
      '<label>Nota <input name="note" value="' + escapeHtml(p && p.note ? p.note : '') + '"></label>' +
      '<div class="actions"><button type="submit">Salva</button> ' +
      '<button type="button" data-action="cancel">Annulla</button></div>' +
      '</form>';
  }

  function habitsForm(roommate) {
    const option = (value, label, selected) =>
      '<option value="' + value + '"' + (selected ? ' selected' : '') + '>' + label + '</option>';
    let rows = '';
    for (let weekday = 1; weekday <= 7; weekday++) {
      const day = WEEKDAYS[weekday % 7];
      rows += '<tr><th>' + day + '</th>' + MEALS.map((meal) => {
        const habit = habitOf(roommate, weekday, meal[0]);
        return '<td><select name="h-' + weekday + '-' + meal[0] + '" aria-label="' + meal[1] + ' ' + day + '">' +
          option('', 'nessuna', habit === null) + option('yes', 'ci sono', habit === true) +
          option('no', 'non ci sono', habit === false) + '</select></td>';
      }).join('') + '</tr>';
    }
    return '<form data-form="habits"><table><tr><th></th><th>Pranzo</th><th>Cena</th></tr>' + rows + '</table>' +
      '<div class="actions"><button type="submit">Salva</button> ' +
      '<button type="button" data-action="cancel-habits">Annulla</button></div></form>';
  }

  function start(doc) {
    const app = doc.getElementById('app');
    const fromLink = parseLink(location.hash);
    const config = fromLink || loadItem(CONFIG_ITEM);
    let me = loadItem(ROOMMATE_ITEM);
    let last = null;
    let editing = null;
    let editingHabits = false;
    let saveError = null;
    let pickerAt = 0;
    let latest = 0;
    let applied = 0;

    function setStatus(text, isError) {
      const el = doc.getElementById('sync');
      el.textContent = text;
      el.className = isError ? 'error' : '';
    }

    // Replacing identical markup on every poll would swallow a tap that lands between pointerdown and click.
    const painted = new WeakMap();
    function paint(el, html) {
      if (painted.get(el) === html) return;
      el.innerHTML = html;
      painted.set(el, html);
    }

    function renderPicker() {
      paint(app, '<h1>Chi sei?</h1><p>Scegli il tuo nome: resta salvato su questo telefono.</p><ul class="picker">' +
        last.roommates.map((r) =>
          '<li><button data-action="pick" data-id="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + '</button></li>'
        ).join('') + '</ul>');
    }

    function renderMeal(day, meal, mine) {
      const date = isoDate(day);
      const others = last.roommates.filter((r) => r !== mine);
      const own = presenceOf(mine, date, meal[0]);
      const isEditing = editing && editing.date === date && editing.meal === meal[0];
      return '<div class="meal"><h4>' + meal[1] + ' <span class="muted">· ' +
        escapeHtml(headcount(last.roommates.map((r) => presenceOf(r, date, meal[0])))) + '</span></h4>' +
        (isEditing
          ? mealForm(date, meal[0], own)
          : '<p>Tu: ' + escapeHtml(describeMeal(own)) + ' <button data-action="edit" data-date="' + date +
            '" data-meal="' + meal[0] + '"' + (editing ? ' disabled' : '') + '>Modifica</button></p>') +
        othersLines(others, date, meal[0]).map((line) => '<p class="muted">' + escapeHtml(line) + '</p>').join('') +
        '</div>';
    }

    function renderWeek(title, week) {
      return '<h3>' + title + '</h3><ul class="shifts">' + last.tasks.map((t) => {
        const s = shiftFor(t, week);
        const done = s && s.status === 'done';
        const assignee = s && last.roommates.find((r) => r.id === s.roommate_id);
        const options = (s ? '' : '<option value="" selected disabled>scegli</option>') +
          (s && !assignee
            ? '<option value="' + escapeHtml(s.roommate_id) + '" selected disabled>' +
              escapeHtml(s.roommates.name) + ' (non attivo)</option>'
            : '') +
          last.roommates.map((r) =>
            '<option value="' + escapeHtml(r.id) + '"' + (s && s.roommate_id === r.id ? ' selected' : '') + '>' +
            escapeHtml(r.name) + '</option>'
          ).join('');
        return '<li><strong>' + escapeHtml(t.name) + '</strong> ' +
          '<select data-action="assign" data-task="' + escapeHtml(t.id) + '" data-week="' + week + '" aria-label="Responsabile ' +
          escapeHtml(t.name) + '">' + options + '</select>' +
          (s
            ? ' <span class="' + (done ? 'done' : 'pending') + '">' + (done ? 'fatto' : 'da fare') + '</span> ' +
              '<button data-action="toggle-done" data-task="' + escapeHtml(t.id) + '" data-week="' + week +
              '" data-next="' + (done ? 'pending' : 'done') + '">' + (done ? 'Segna da fare' : 'Segna fatto') + '</button>'
            : '') +
          '</li>';
      }).join('') + '</ul>';
    }

    // The sections exist only while a roommate is chosen: a save that ends after "Cambia nome" finds the picker instead.
    function renderMeals() {
      const box = doc.getElementById('meals');
      if (!box) return;
      const mine = last.roommates.find((r) => r.id === me);
      paint(box, last.days.map((day, i) =>
        '<section><h3>' + dayTitle(i, day) + '</h3>' + MEALS.map((meal) => renderMeal(day, meal, mine)).join('') +
        '</section>'
      ).join(''));
    }

    function renderShifts() {
      const box = doc.getElementById('shifts');
      if (!box) return;
      paint(box,
        renderWeek('Settimana dal ' + dayMonth(last.thisWeek), last.thisWeek) +
        renderWeek('Settimana successiva, dal ' + dayMonth(last.nextWeek), last.nextWeek));
    }

    function renderHabits() {
      const box = doc.getElementById('habits');
      if (!box) return;
      const mine = last.roommates.find((r) => r.id === me);
      const lines = habitLines(mine);
      paint(box, editingHabits
        ? habitsForm(mine)
        : (lines.length ? lines.map((line) => '<p>' + escapeHtml(line) + '</p>').join('') : '<p>Nessuna abitudine.</p>') +
          '<p class="muted">Valgono per i pasti a cui non hai risposto.</p>' +
          '<button data-action="edit-habits">Modifica abitudini</button>');
    }

    // A native picker gives no event when it closes without a choice, so a focused select blocks renders for a while only.
    function pickerOpen() {
      return doc.activeElement.tagName === 'SELECT' && Date.now() - pickerAt < PICKER_MS;
    }

    // Each section is redrawn unless that would discard a draft or close an open picker.
    function render() {
      const mine = last.roommates.find((r) => r.id === me);
      if (!mine) {
        editing = null;
        editingHabits = false;
        renderPicker();
        return;
      }
      paint(app, '<header></header><h2>Pasti</h2><div id="meals"></div><h2>Turni</h2><div id="shifts"></div>' +
        '<h2>Abitudini</h2><div id="habits"></div>');
      paint(app.querySelector('header'), '<strong>' + escapeHtml(mine.name) + '</strong> ' +
        '<button data-action="change-name">Cambia nome</button>');
      if (editing === null) renderMeals();
      if (!pickerOpen()) renderShifts();
      if (!editingHabits) renderHabits();
    }

    // Responses can arrive out of order (a slow poll, a refresh on return to the page): an older one never replaces a newer one.
    async function refresh() {
      if (doc.visibilityState !== 'visible') return;
      const id = ++latest;
      try {
        const data = await fetchData(config, new Date());
        if (id < applied) return;
        applied = id;
        last = data;
        render();
        setStatus((saveError ? saveError + ' · ' : '') + 'Aggiornato alle ' + clock(new Date()), saveError !== null);
      } catch (err) {
        if (id > applied) setStatus((saveError ? saveError + ' · ' : '') + 'Errore alle ' + clock(new Date()) + ': ' + err.message, true);
      }
    }

    async function save(table, conflictColumns, row) {
      saveError = null;
      setStatus('Salvataggio…', false);
      try {
        await upsert(config, table, conflictColumns, row);
      } catch (err) {
        saveError = 'Salvataggio non riuscito alle ' + clock(new Date()) + ': ' + err.message;
        setStatus(saveError, true);
        return false;
      }
      return true;
    }

    async function saveMeal(form) {
      const fd = new FormData(form);
      const row = presenceRow(me, form.dataset.date, form.dataset.meal, {
        present: fd.get('present') === 'yes',
        time: fd.get('time'),
        guests: fd.getAll('guest'),
        note: fd.get('note')
      }, new Date());
      const target = editing;
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      if (await save('meal_presence', 'roommate_id,date,meal', row)) {
        if (editing === target) editing = null;
        await refresh();
        // Closes the form even if the re-read after the write failed.
        if (editing === null) renderMeals();
      } else {
        submit.disabled = false;
      }
    }

    async function saveHabits(form) {
      const rows = habitRows(me, (weekday, meal) => form.elements['h-' + weekday + '-' + meal].value, new Date());
      const submit = form.querySelector('[type=submit]');
      submit.disabled = true;
      if (await save('meal_defaults', 'roommate_id,weekday,meal', rows)) {
        // After Annulla or Cambia nome during the save, this form is gone and a reopened one must stay open.
        if (form.isConnected) editingHabits = false;
        await refresh();
        if (!editingHabits) renderHabits();
      } else {
        submit.disabled = false;
      }
    }

    async function saveShift(el, roommateId, status) {
      if (await save('cleaning_shifts', 'task_id,week_start',
        shiftRow(el.dataset.task, el.dataset.week, roommateId, status, new Date()))) {
        await refresh();
      } else if (!pickerOpen()) {
        // The markup is unchanged but the select shows the rejected choice: force the redraw that reverts it.
        painted.delete(doc.getElementById('shifts'));
        renderShifts();
      }
    }

    function tick() {
      refresh();
      setTimeout(tick, POLL_MS);
    }

    app.addEventListener('click', (e) => {
      const el = e.target.closest('button[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'pick') {
        me = el.dataset.id;
        saveItem(ROOMMATE_ITEM, me);
        render();
      } else if (action === 'change-name') {
        me = null;
        editing = null;
        editingHabits = false;
        saveItem(ROOMMATE_ITEM, null);
        render();
      } else if (action === 'edit-habits') {
        editingHabits = true;
        renderHabits();
      } else if (action === 'cancel-habits') {
        editingHabits = false;
        renderHabits();
      } else if (action === 'edit') {
        editing = { date: el.dataset.date, meal: el.dataset.meal };
        renderMeals();
      } else if (action === 'cancel') {
        editing = null;
        renderMeals();
      } else if (action === 'clear-time') {
        el.form.elements.time.value = '';
      } else if (action === 'add-guest') {
        el.form.querySelector('.guests').insertAdjacentHTML('beforeend', guestRow(''));
        el.form.querySelector('.guests .guest:last-child input').focus();
      } else if (action === 'remove-guest') {
        el.parentNode.remove();
      } else if (action === 'toggle-done') {
        // The status comes from the button, so a tap does what its label says; the assignee comes from the latest read.
        const task = last.tasks.find((t) => t.id === el.dataset.task);
        const s = task && shiftFor(task, el.dataset.week);
        if (s) saveShift(el, s.roommate_id, el.dataset.next);
        else refresh();
      }
    });

    function markPicker(e) {
      if (e.target.tagName === 'SELECT') pickerAt = Date.now();
    }
    app.addEventListener('pointerdown', markPicker);
    app.addEventListener('focusin', markPicker);

    app.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.action === 'assign') {
        el.blur();
        // A new assignee has not cleaned the area yet.
        saveShift(el, el.value, 'pending');
      } else if (el.name === 'present') {
        el.form.querySelector('.if-present').hidden = el.value !== 'yes';
      }
    });

    app.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.dataset.form === 'habits') saveHabits(e.target);
      else saveMeal(e.target);
    });

    if (!config) {
      app.innerHTML = '<p>Configurazione mancante: apri il link di casa ricevuto in chat.</p>';
      return;
    }
    if (fromLink) saveItem(CONFIG_ITEM, fromLink);
    doc.getElementById('source').textContent = 'Configurazione: ' +
      (fromLink ? 'dal link' : 'salvata sul telefono') + ' · aperta ' +
      (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches ? 'come app' : 'nel browser');

    doc.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) refresh();
    });
    tick();
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      isoDate: isoDate,
      addDays: addDays,
      weekStart: weekStart,
      dayTitle: dayTitle,
      escapeHtml: escapeHtml,
      describeMeal: describeMeal,
      parseLink: parseLink,
      presenceOf: presenceOf,
      habitRows: habitRows,
      habitLines: habitLines,
      cleanGuests: cleanGuests,
      presenceRow: presenceRow,
      shiftRow: shiftRow,
      headcount: headcount,
      othersLines: othersLines
    };
  } else {
    // Opening the home link on an already open page only changes the fragment, which does not reload it.
    window.addEventListener('hashchange', () => location.reload());
    start(document);
  }
})();
