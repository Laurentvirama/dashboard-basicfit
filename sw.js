const CACHE_NAME="bf-dashboard-v1";
const CORE_ASSETS=["./index.html","./manifest.json"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});
// Network-first pour toujours avoir les données à jour ; fallback cache si hors-ligne
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(
    fetch(e.request).then(res=>{
      const resClone=res.clone();
      caches.open(CACHE_NAME).then(c=>c.put(e.request,resClone));
      return res;
    }).catch(()=>caches.match(e.request))
  );
});
