// Supabase URL and publishable key come from the link fragment (#url=...&key=...) and localStorage, never from the repo.
(function () {
  'use strict';

  const POLL_MS = 10000;
  const REQUEST_TIMEOUT_MS = 15000;
  const CONFIG_ITEM = 'config';

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function clock(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  // Returns {url, key} from the link fragment, or null if it does not carry a usable pair.
  function parseLink(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const url = (params.get('url') || '').replace(/\/+$/, '');
    const key = params.get('key') || '';
    // The link is shared with every roommate: accept only a publishable key, as tv-app/make-config.ps1 does.
    if (!url.startsWith('https://') || !key.startsWith('sb_publishable_')) return null;
    return { url: url, key: key };
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

  function isStandalone() {
    return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  }

  function start(doc) {
    const fromLink = parseLink(location.hash);
    const config = fromLink || loadItem(CONFIG_ITEM);
    let latest = 0;

    function setStatus(text, isError) {
      const el = doc.getElementById('sync');
      el.textContent = text;
      el.className = isError ? 'error' : '';
    }

    function render(roommates) {
      doc.getElementById('app').innerHTML = '<h1>Coinquilini</h1><ul>' +
        roommates.map((r) => '<li>' + escapeHtml(r.name) + '</li>').join('') + '</ul>';
    }

    // Responses can arrive out of order when a poll overlaps a refresh on return to the page: only the newest is shown.
    async function refresh() {
      if (doc.visibilityState !== 'visible') return;
      const id = ++latest;
      try {
        const roommates = await get(config, 'roommates?select=id,name&active=eq.true&order=name.asc');
        if (id !== latest) return;
        render(roommates);
        setStatus('Aggiornato alle ' + clock(new Date()), false);
      } catch (err) {
        if (id === latest) setStatus('Errore alle ' + clock(new Date()) + ': ' + err.message, true);
      }
    }

    function tick() {
      refresh();
      setTimeout(tick, POLL_MS);
    }

    if (!config) {
      doc.getElementById('app').innerHTML =
        '<p>Configurazione mancante: apri il link di casa ricevuto in chat.</p>';
      return;
    }
    if (fromLink) saveItem(CONFIG_ITEM, fromLink);
    doc.getElementById('source').textContent = 'Configurazione: ' +
      (fromLink ? 'dal link' : 'salvata sul telefono') + ' · aperta ' +
      (isStandalone() ? 'come app' : 'nel browser');

    doc.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) refresh();
    });
    tick();
  }

  if (typeof module !== 'undefined') {
    module.exports = {
      parseLink: parseLink,
      escapeHtml: escapeHtml
    };
  } else {
    // Opening the home link on an already open page only changes the fragment, which does not reload it.
    window.addEventListener('hashchange', () => location.reload());
    start(document);
  }
})();
