// ES5 syntax and XMLHttpRequest only: the TV's webOS version is unknown and its engine may predate ES2015.
(function () {
  'use strict';

  var POLL_MS = 20000;
  var REQUEST_TIMEOUT_MS = 15000;
  var OK_KEY = 13;
  var MEALS = [['lunch', 'Pranzo'], ['dinner', 'Cena']];
  var WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var SCREENSAVER_URI = 'luna://com.webos.service.tvpower/power/';
  var SCREENSAVER_CLIENT = 'com.apparentati.dashboard';

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
    return WEEKDAYS[d.getDay()] + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function describeMeal(p) {
    if (!p) return 'non specificato';
    var parts = [p.is_present ? 'presente' : 'assente'];
    if (p.required_time) parts.push('ore ' + p.required_time.slice(0, 5));
    if (p.guest_names.length) parts.push('ospiti (' + p.guest_names.length + '): ' + p.guest_names.join(', '));
    if (p.note) parts.push('nota: ' + p.note);
    return parts.join(' · ');
  }

  function describeShift(s) {
    if (!s) return 'non assegnata';
    return s.roommates.name + ' (' + (s.status === 'done' ? 'fatto' : 'da fare') + ')';
  }

  function shiftFor(task, week) {
    var matches = task.cleaning_shifts.filter(function (s) { return s.week_start === week; });
    return matches.length ? matches[0] : null;
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
      get('roommates?select=name,meal_presence(meal,is_present,required_time,guest_names,note)' +
        '&active=eq.true&meal_presence.date=eq.' + isoDate(today) + '&order=name.asc'),
      get('cleaning_tasks?select=name,cleaning_shifts(week_start,status,roommates(name))' +
        '&active=eq.true&cleaning_shifts.week_start=in.(' + thisWeek + ',' + nextWeek + ')' +
        '&order=sort_order.asc,name.asc')
    ]).then(function (results) {
      return { today: today, thisWeek: thisWeek, nextWeek: nextWeek, roommates: results[0], tasks: results[1] };
    });
  }

  function renderMeals(data) {
    return MEALS.map(function (meal) {
      var items = data.roommates.map(function (r) {
        var presence = r.meal_presence.filter(function (p) { return p.meal === meal[0]; })[0];
        return '<li>' + escapeHtml(r.name + ': ' + describeMeal(presence)) + '</li>';
      });
      return '<h2>' + meal[1] + '</h2><ul>' + items.join('') + '</ul>';
    }).join('');
  }

  function renderWeek(title, tasks, week) {
    var items = tasks.map(function (t) {
      return '<li>' + escapeHtml(t.name + ': ' + describeShift(shiftFor(t, week))) + '</li>';
    });
    return '<h2>' + title + '</h2><ul>' + items.join('') + '</ul>';
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

  function start(doc) {
    var last = null;
    var lastUpdate = '';
    var toggle = null;

    function setStatus(id, text, isError) {
      var el = doc.getElementById(id);
      el.textContent = text;
      el.className = isError ? 'error' : '';
    }

    function forcedNextWeek() {
      return toggle && toggle.date === isoDate(last.today) ? toggle.show : null;
    }

    function render() {
      doc.getElementById('today').textContent = longDate(last.today);
      doc.getElementById('meals').innerHTML = renderMeals(last);
      doc.getElementById('shifts').innerHTML =
        renderWeek('Turni settimana dal ' + dayMonth(last.thisWeek), last.tasks, last.thisWeek) +
        (nextWeekVisible(last, forcedNextWeek())
          ? renderWeek('Settimana successiva, dal ' + dayMonth(last.nextWeek), last.tasks, last.nextWeek)
          : '');
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

    keepScreenOn(function (text) { setStatus('screensaver', text, false); });

    if (typeof CONFIG === 'undefined') {
      setStatus('sync', 'config.js mancante: esegui tv-app/make-config.ps1 e reinstalla', true);
      return;
    }

    doc.addEventListener('keydown', function (e) {
      if (e.keyCode !== OK_KEY || !last) return;
      toggle = { date: isoDate(last.today), show: !nextWeekVisible(last, forcedNextWeek()) };
      render();
    });

    poll();
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      isoDate: isoDate,
      addDays: addDays,
      weekStart: weekStart,
      escapeHtml: escapeHtml,
      describeMeal: describeMeal,
      describeShift: describeShift,
      nextWeekVisible: nextWeekVisible
    };
  } else {
    start(document);
  }
})();
