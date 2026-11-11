/* Company Vendas — service worker (funcionamento offline) */
var VER = 'cv-shell-v1';
var SHELL = ['./', 'index.html', 'app.js', 'pdflib.js', 'config.js', 'manifest.webmanifest', 'company.png', 'icon-192.png', 'icon-512.png', 'catalogo.json'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VER).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return k.indexOf('cv-shell-') === 0 && k !== VER; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase e outros: direto na rede
  // fotos: primeiro do aparelho, senão baixa e guarda
  if (url.pathname.indexOf('/vendas/img/') === 0 || url.pathname.indexOf('/eq-cort-img/') === 0){
    e.respondWith(caches.open('cv-img-v1').then(function(c){
      return c.match(req).then(function(hit){
        return hit || fetch(req).then(function(r){ if (r.ok) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  if (url.pathname.indexOf('/vendas/') !== 0) return;
  // telas e catálogo: tenta a rede (versão nova), se falhar usa a cópia guardada
  e.respondWith(fetch(req).then(function(r){
    if (r.ok){ var cp = r.clone(); caches.open(VER).then(function(c){ c.put(req, cp); }); }
    return r;
  }).catch(function(){
    return caches.match(req, { ignoreSearch: true }).then(function(hit){
      return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    });
  }));
});
