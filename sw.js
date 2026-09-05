const CACHE_NAME="bf-dashboard-v4";
const CORE_ASSETS=["./index.html","./manifest.json","./style.css","./absences.js","./app.js","./icon-192.png","./icon-512.png"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});

// Stratégie:
// - assets statiques du dashboard (HTML/CSS/JS/icônes) -> cache-first, mise à jour en arrière-plan (rapide + fonctionne hors-ligne)
// - tout le reste (CDN, Firestore, etc.) -> network-first, fallback cache si hors-ligne
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  const isCoreAsset=url.origin===self.location.origin;

  if(isCoreAsset){
    e.respondWith(
      caches.match(e.request).then(cached=>{
        const fetchPromise=fetch(e.request).then(res=>{
          const resClone=res.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request,resClone));
          return res;
        }).catch(()=>cached);
        return cached||fetchPromise;
      })
    );
  } else {
    e.respondWith(
      fetch(e.request).then(res=>{
        const resClone=res.clone();
        caches.open(CACHE_NAME).then(c=>c.put(e.request,resClone));
        return res;
      }).catch(()=>caches.match(e.request))
    );
  }
});
