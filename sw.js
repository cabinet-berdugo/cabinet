// Service worker du Cabinet Berdugo : ouverture rapide, et notifications même application fermée.
const VERSION = 'v-cd22970e15';
const API = 'https://script.google.com/macros/s/AKfycbzbVH_ipWjDwJzQ2q7SCj0VqC5K9pI_4tovfU-ywQ0ez8i24ElDaF0t-nVsg6avISw/exec';
const FICHIERS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(l => Promise.all(l.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// la page : d'abord le réseau (pour avoir toujours la dernière version), sinon la copie ; le reste : la copie
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate' && /\/(index\.html)?$/.test(new URL(r.url).pathname)) {
    // la dernière version d'abord (jamais un ancien écran) ; si le réseau tarde plus de 0,8 s ou manque : la copie du téléphone
    const reseau = fetch(r).then(rep => {
      if (rep.ok) { const c = rep.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); }
      return rep;
    });
    e.waitUntil(reseau.catch(() => {}));
    e.respondWith(new Promise(ok => {
      let fini = false;
      const copie = () => caches.match('./index.html').then(m => { if (!fini && m) { fini = true; ok(m); } return m; });
      const t = setTimeout(copie, 800);
      reseau.then(rep => { if (!fini && rep.ok) { fini = true; clearTimeout(t); ok(rep); } else if (!fini) copie().then(m => { if (!m && !fini) { fini = true; ok(rep); } }); })
        .catch(() => { clearTimeout(t); copie().then(m => { if (!m && !fini) { fini = true; ok(Response.error()); } }); });
    }));
    return;
  }
  e.respondWith(caches.match(r).then(m => m || fetch(r)));
});

function jeton() {
  return new Promise(ok => {
    try {
      const r = indexedDB.open('cabinet', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('k');
      r.onsuccess = () => { const g = r.result.transaction('k').objectStore('k').get('jeton'); g.onsuccess = () => ok(g.result || ''); g.onerror = () => ok(''); };
      r.onerror = () => ok('');
    } catch (e) { ok(''); }
  });
}

// notification reçue (sans contenu) : on lit la dernière notification de la personne, puis on l'affiche
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let titre = 'Cabinet Berdugo', corps = 'Vous avez une nouvelle notification.', url = './', tag = 'cabinet';
    try {
      const k = await jeton();
      if (k) {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'getDerniereNotif', args: [k] }) }).then(x => x.json());
        if (r && r.ok && r.v) {
          titre = r.v.titre; corps = r.v.texte + (r.v.nb > 1 ? ' (et ' + (r.v.nb - 1) + ' autre' + (r.v.nb > 2 ? 's' : '') + ')' : '');
          if (r.v.tache) url = r.v.tache.indexOf('v=') === 0 ? './?' + r.v.tache : './?t=' + r.v.tache;
          tag = r.v.id;
        }
      }
    } catch (err) { }
    await self.registration.showNotification(titre, { body: corps, icon: './icon-192.png', badge: './icon-192.png', tag, data: { url } });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  const q = new URL(url, self.registration.scope).searchParams;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    const ouvert = l[0];
    if (ouvert) { ouvert.postMessage({ type: 'ouvrir', t: q.get('t') || '', v: q.get('v') || '' }); return ouvert.focus(); }
    return self.clients.openWindow(url);
  }));
});
