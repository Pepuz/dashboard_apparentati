// ES5 syntax and XMLHttpRequest only: the TV's webOS version is unknown and its engine may predate ES2015.
(function () {
  'use strict';

  var POLL_MS = 20000;
  var REQUEST_TIMEOUT_MS = 15000;
  var OK_KEY = 13;
  var UP_KEY = 38;
  var DOWN_KEY = 40;
  var LIGHT_THEME = 'theme-light';
  var MIN_FONT_PX = 12;
  var MAX_FONT_PX = 21;
  var MEALS = [['lunch', 'Pranzo'], ['dinner', 'Cena']];
  var WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre',
    'novembre', 'dicembre'];
  var SCREENSAVER_URI = 'luna://com.webos.service.tvpower/power/';
  // Unique per launch: the TV keeps a closed app's registration until it restarts, and re-registering the same name fails with errorCode -3.
  var SCREENSAVER_CLIENT = 'com.apparentati.dashboard.' + Date.now();
  // Absolute: the page runs from the installed package, which has no style.css.
  var ASSET_BASE = 'https://pepuz.github.io/dashboard_apparentati/tv-app/';

  // Inline so the icons arrive from Pages with this file; width and height match the shell's text if style.css does not load.
  function svg(cls, label, body) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" width="26" height="26"' +
      (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' + body + '</svg>';
  }

  var CHECK = '<circle cx="12" cy="12" r="11" fill="#2bd500"/><path d="M6.8 12.4l3.4 3.4 7-7" fill="none" stroke="#fff" ' +
    'stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>';
  var STATE_ICONS = {
    present: svg('state', 'presente', CHECK),
    absent: svg('state', 'assente', '<circle cx="12" cy="12" r="11" fill="#d50004"/><path d="M8 8l8 8M16 8l-8 8" fill="none" ' +
      'stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>'),
    unknown: svg('state', 'non specificato', '<circle cx="12" cy="12" r="11" fill="#5f5f5f"/><path d="M9 9.4a3 3 0 1 1 4.4 2.6' +
      'c-.9.5-1.4 1-1.4 2.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
      '<circle cx="12" cy="17.8" r="1.5" fill="#fff"/>'),
    done: svg('state', 'fatto', CHECK),
    pending: svg('state', 'da fare', '<circle cx="12" cy="12" r="9.6" fill="none" stroke="#5f5f5f" stroke-width="2.8"/>')
  };
  var CARD_ICONS = {
    lunch: svg('icon', '', '<path fill="#eeb111" fill-rule="evenodd" d="M12 1a11 11 0 1 0 0 22a11 11 0 1 0 0-22z' +
      'M6.6 5h1v4.4h-1zM8.3 5h1v4.4h-1zM10 5h1v4.4h-1zM6.6 9.4h4.4v1.6h-4.4zM8.05 11h1.5v8h-1.5z' +
      'M15 5c2.4 1 2.6 4.6 2.1 7.2h-2.1zM15 12.2h1.7v6.8h-1.7z"/>'),
    dinner: svg('icon', '', '<g fill="#5e91cc"><circle cx="12" cy="6" r="1.6"/><path d="M3 17a9 9 0 0 1 18 0z"/>' +
      '<rect x="1" y="18" width="22" height="2.2" rx="1.1"/></g>'),
    shifts: svg('icon accent', '', '<path d="M6 10a6 6 0 0 1 12 0" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path fill="currentColor" d="M3 10h18l-1 2.2H4zM5 13.2h14l-1.6 8.3H6.6z"/>')
  };

  var screensaverBridges = [];

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

  function longDate(d) {
    var weekday = WEEKDAYS[d.getDay()];
    return weekday.charAt(0).toUpperCase() + weekday.slice(1) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' +
      d.getFullYear();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The day's answer wins over the weekly habit; meal_defaults is already filtered to today's weekday.
  function presenceFor(r, meal) {
    var answer = r.meal_presence.filter(function (p) { return p.meal === meal; })[0];
    if (answer) return answer;
    var habit = r.meal_defaults.filter(function (h) { return h.meal === meal && h.is_present !== null; })[0];
    return habit ? { is_present: habit.is_present, required_time: null, guest_names: [], note: null } : undefined;
  }

  // The state icon comes first so the states line up in a column; the preferred time sits on the name line, saving a
  // row per roommate on full days.
  function personHtml(name, p) {
    var state = !p ? 'unknown' : p.is_present ? 'present' : 'absent';
    var html = '<div class="who">' + STATE_ICONS[state] + ' ' + escapeHtml(name) +
      (p && p.required_time ? ' <span class="time">ore ' + p.required_time.slice(0, 5) + '</span>' : '') + '</div>';
    if (p && p.guest_names.length) html += '<div class="detail">Ospiti: ' + escapeHtml(p.guest_names.join(', ')) + '</div>';
    if (p && p.note) html += '<div class="detail">Note: ' + escapeHtml(p.note) + '</div>';
    return '<li class="' + state + '">' + html + '</li>';
  }

  // Same wording as headcount in mobile-app/app.js.
  function headcount(presences) {
    var present = presences.filter(function (p) { return p && p.is_present; });
    var guests = present.reduce(function (n, p) { return n + p.guest_names.length; }, 0);
    if (!present.length) return 'nessun presente';
    return present.length + (present.length === 1 ? ' presente' : ' presenti') +
      (guests ? ' + ' + guests + (guests === 1 ? ' ospite' : ' ospiti') : '');
  }

  function mealCard(meal, roommates) {
    var presences = roommates.map(function (r) { return presenceFor(r, meal[0]); });
    return '<div class="card meal"><h2>' + meal[1] + ' ' + CARD_ICONS[meal[0]] + ' <span class="count">' +
      headcount(presences) + '</span></h2><ul>' +
      roommates.map(function (r, i) { return personHtml(r.name, presences[i]); }).join('') + '</ul></div>';
  }

  function cellHtml(p) {
    var state = !p ? 'unknown' : p.is_present ? 'present' : 'absent';
    var html = '<div class="who">' + STATE_ICONS[state] +
      (p && p.required_time ? ' <span class="time">ore ' + p.required_time.slice(0, 5) + '</span>' : '') + '</div>';
    if (p && p.guest_names.length) html += '<div class="detail">Ospiti: ' + escapeHtml(p.guest_names.join(', ')) + '</div>';
    if (p && p.note) html += '<div class="detail">Note: ' + escapeHtml(p.note) + '</div>';
    return '<div class="cell ' + state + '">' + html + '</div>';
  }

  // One meals card two columns wide: each name once, then a cell for lunch and one for dinner.
  function mealsTable(roommates) {
    var lunch = roommates.map(function (r) { return presenceFor(r, 'lunch'); });
    var dinner = roommates.map(function (r) { return presenceFor(r, 'dinner'); });
    return '<div class="card meal both"><div class="head"><span></span>' +
      '<h2>Pranzo ' + CARD_ICONS.lunch + '<span class="count">' + headcount(lunch) + '</span></h2>' +
      '<h2>Cena ' + CARD_ICONS.dinner + '<span class="count">' + headcount(dinner) + '</span></h2></div><ul>' +
      roommates.map(function (r, i) {
        return '<li><div class="name">' + escapeHtml(r.name) + '</div>' + cellHtml(lunch[i]) + cellHtml(dinner[i]) + '</li>';
      }).join('') + '</ul></div>';
  }

  function shiftHtml(area, s) {
    return '<li><span class="area">' + escapeHtml(area) + '</span> ' + (s
      ? '<span class="who">' + escapeHtml(s.roommates.name) + ' ' + STATE_ICONS[s.status === 'done' ? 'done' : 'pending'] + '</span>'
      : '<span class="who none">non assegnata</span>') + '</li>';
  }

  function shiftFor(task, week) {
    var matches = task.cleaning_shifts.filter(function (s) { return s.week_start === week; });
    return matches.length ? matches[0] : null;
  }

  function weekCard(tasks, week) {
    return '<div class="card week"><h2>Turni ' + CARD_ICONS.shifts + ' <span class="week-start">settimana ' + dayMonth(week) +
      '</span></h2><ul>' + tasks.map(function (t) { return shiftHtml(t.name, shiftFor(t, week)); }).join('') + '</ul></div>';
  }

  // forced is the OK-key choice for today (true/false), or null to apply the weekend rule.
  function nextWeekVisible(data, forced) {
    if (forced !== null) return forced;
    var day = data.today.getDay();
    return (day === 0 || day === 6) && data.tasks.some(function (t) { return shiftFor(t, data.nextWeek) !== null; });
  }

  function get(path) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', CONFIG.supabaseUrl + '/rest/v1/' + path);
      xhr.setRequestHeader('apikey', CONFIG.supabasePublishableKey);
      xhr.timeout = REQUEST_TIMEOUT_MS;
      xhr.onload = function () {
        if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
        else reject(new Error('HTTP ' + xhr.status));
      };
      xhr.onerror = function () { reject(new Error('Supabase non raggiungibile')); };
      xhr.ontimeout = function () { reject(new Error('timeout')); };
      xhr.send();
    });
  }

  function fetchData(today) {
    var thisWeek = isoDate(weekStart(today));
    var nextWeek = isoDate(addDays(weekStart(today), 7));
    return Promise.all([
      get('roommates?select=name,meal_presence(meal,is_present,required_time,guest_names,note),meal_defaults(meal,is_present)' +
        '&active=eq.true&meal_presence.date=eq.' + isoDate(today) +
        '&meal_defaults.weekday=eq.' + (today.getDay() || 7) + '&order=name.asc'),
      get('cleaning_tasks?select=name,cleaning_shifts(week_start,status,roommates(name))' +
        '&active=eq.true&cleaning_shifts.week_start=in.(' + thisWeek + ',' + nextWeek + ')' +
        '&order=sort_order.asc,name.asc')
    ]).then(function (results) {
      return { today: today, thisWeek: thisWeek, nextWeek: nextWeek, roommates: results[0], tasks: results[1] };
    });
  }

  function overflows(el) {
    return el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;
  }

  // Each row has a fixed slot in its card (style.css), so a row can overflow its slot while the card itself does not.
  function overflowing(cards) {
    for (var i = 0; i < cards.length; i++) {
      if (overflows(cards[i])) return true;
      var rows = cards[i].querySelectorAll('li');
      for (var j = 0; j < rows.length; j++) {
        if (overflows(rows[j])) return true;
      }
    }
    return false;
  }

  function setFontSize(cards, value) {
    for (var i = 0; i < cards.length; i++) cards[i].style.fontSize = value;
  }

  // The largest size, from MAX_FONT_PX down a pixel at a time to MIN_FONT_PX, at which every card of the group fits.
  // Only with style.css: without it the cards have no fixed height, nothing overflows and the text would jump to the maximum.
  function fit(cards) {
    var size = MAX_FONT_PX;
    setFontSize(cards, size + 'px');
    while (size > MIN_FONT_PX && overflowing(cards)) {
      size--;
      setFontSize(cards, size + 'px');
    }
  }

  function keepScreenOn(setStatus) {
    if (typeof WebOSServiceBridge === 'undefined') {
      setStatus('Screensaver: WebOSServiceBridge non disponibile (normale fuori dalla TV)');
      return;
    }
    // Undocumented tvpower API from the webOS homebrew community: answering ack:false vetoes each activation.
    var subscription = new WebOSServiceBridge();
    var responder = new WebOSServiceBridge();
    var blocked = 0;
    var lastBlocked = '';
    subscription.onservicecallback = function (msg) {
      var res = JSON.parse(msg);
      if (res.state !== 'Active') {
        setStatus('Screensaver: risposta della TV ' + msg);
        return;
      }
      blocked++;
      lastBlocked = clock(new Date());
      responder.call(SCREENSAVER_URI + 'responseScreenSaverRequest',
        JSON.stringify({ clientName: SCREENSAVER_CLIENT, ack: false, timestamp: res.timestamp }));
    };
    responder.onservicecallback = function (msg) {
      setStatus('Screensaver: attivazione bloccata ' + blocked + ' volte, ultima alle ' + lastBlocked + ', risposta ' + msg);
    };
    subscription.call(SCREENSAVER_URI + 'registerScreenSaverRequest',
      JSON.stringify({ subscribe: true, clientName: SCREENSAVER_CLIENT }));
    // Kept referenced so the bridges are not garbage-collected while subscribed.
    screensaverBridges = [subscription, responder];
  }

  // Loaded here so the installed index.html needs no new sideload; without it the shell's inline style keeps the data readable.
  // onApplied runs once style and fonts are in, because both change how much text fits in a card.
  function loadStyle(doc, setStatus, onApplied) {
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = ASSET_BASE + 'style.css?t=' + Date.now();
    link.onload = function () {
      // Each load rejects if its font cannot be fetched from Pages, and resolves empty if the style declares no such face.
      Promise.all(['1em Inter', '700 1em Inter', '800 1em Inter'].map(function (font) { return doc.fonts.load(font); }))
        .then(function (results) {
          var all = results.every(function (faces) { return faces.length > 0; });
          // webOS can inject a stylesheet with its own font (the webOS 24 simulator does, see style.css): report the font in use.
          var used = doc.defaultView.getComputedStyle(doc.getElementById('today')).fontFamily.split(',')[0].replace(/["']/g, '');
          setStatus('Stile: remoto, font ' + (all ? used : 'di sistema'), !all || used !== 'Inter');
        }, function () {
          setStatus('Stile: remoto, font Inter non caricato', true);
        })
        .then(onApplied);
    };
    link.onerror = function () { setStatus('Stile: non caricato', true); };
    doc.head.appendChild(link);
  }

  function start(doc) {
    var shifts = doc.getElementById('shifts');
    // One section per column, so that without style.css the shell's inline flex layout still shows three columns.
    var dinner = doc.createElement('section');
    shifts.parentNode.insertBefore(dinner, shifts);
    var mealSections = [doc.getElementById('meals'), dinner];
    var last = null;
    var lastUpdate = '';
    var toggle = null;
    var styled = false;

    function setStatus(id, text, isError) {
      var el = doc.getElementById(id);
      el.textContent = text;
      el.className = isError ? 'error' : '';
    }

    function forcedNextWeek() {
      return toggle && toggle.date === isoDate(last.today) ? toggle.show : null;
    }

    function fitAll() {
      if (!styled) return;
      fit(doc.querySelectorAll('.meal'));
      fit(doc.querySelectorAll('.week'));
    }

    function render() {
      doc.getElementById('today').textContent = longDate(last.today);
      mealSections[0].innerHTML = mealsTable(last.roommates);
      mealSections[1].innerHTML = '';
      shifts.innerHTML = weekCard(last.tasks, last.thisWeek) +
        (nextWeekVisible(last, forcedNextWeek()) ? weekCard(last.tasks, last.nextWeek) : '');
      fitAll();
    }

    function poll() {
      fetchData(new Date())
        .then(function (data) {
          last = data;
          render();
          lastUpdate = clock(new Date());
          setStatus('sync', 'Aggiornato alle ' + lastUpdate, false);
        })
        .catch(function (err) {
          setStatus('sync', 'Errore alle ' + clock(new Date()) + ': ' + err.message +
            (last ? '. Dati mostrati: aggiornati alle ' + lastUpdate : '. Nessun dato caricato'), true);
        })
        .then(function () {
          setTimeout(poll, POLL_MS);
        });
    }

    var styleStatus = doc.createElement('div');
    styleStatus.id = 'style';
    doc.querySelector('footer').appendChild(styleStatus);
    loadStyle(doc, function (text, isError) { setStatus('style', text, isError); }, function () {
      styled = true;
      if (last) fitAll();
    });

    keepScreenOn(function (text) { setStatus('screensaver', text, false); });

    if (typeof CONFIG === 'undefined') {
      setStatus('sync', 'config.js mancante: esegui tv-app/make-config.ps1 e reinstalla', true);
      return;
    }

    // Up and down switch theme until the app closes: every LG remote has arrows, only some have color keys.
    doc.addEventListener('keydown', function (e) {
      if (e.keyCode === UP_KEY || e.keyCode === DOWN_KEY) {
        doc.documentElement.classList.toggle(LIGHT_THEME);
      } else if (e.keyCode === OK_KEY && last) {
        toggle = { date: isoDate(last.today), show: !nextWeekVisible(last, forcedNextWeek()) };
        render();
      }
    });

    poll();
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      isoDate: isoDate,
      addDays: addDays,
      weekStart: weekStart,
      longDate: longDate,
      escapeHtml: escapeHtml,
      presenceFor: presenceFor,
      personHtml: personHtml,
      headcount: headcount,
      mealCard: mealCard,
      mealsTable: mealsTable,
      shiftHtml: shiftHtml,
      weekCard: weekCard,
      nextWeekVisible: nextWeekVisible
    };
  } else {
    start(document);
  }
})();
