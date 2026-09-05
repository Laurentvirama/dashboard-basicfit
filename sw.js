const CACHE_NAME="bf-dashboard-v8";
const CORE_ASSETS=["./index.html","./manifest.json","./style.css","./absences.js","./app.js","./icon-192.png","./icon-512.png"];

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));
  self.clients.claim();
});

// Stratégie :
// - fichiers du dashboard (HTML/CSS/JS) -> réseau d'abord (3 s max) puis cache : une mise à jour GitHub est visible dès le premier rechargement, et l'app reste utilisable hors-ligne
// - icônes / polices / bibliothèques CDN -> cache d'abord (ne changent jamais) puis réseau
// - Firestore et API -> réseau uniquement
function networkFirst(req,ms){
  return new Promise(resolve=>{
    let done=false;
    const timer=setTimeout(()=>{if(!done){done=true;caches.match(req).then(c=>resolve(c||fetch(req)))}},ms);
    fetch(req).then(res=>{
      clearTimeout(timer);
      if(res&&res.ok){const clone=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,clone))}
      if(!done){done=true;resolve(res)}
    }).catch(()=>{clearTimeout(timer);if(!done){done=true;caches.match(req).then(c=>resolve(c||Response.error()))}});
  });
}
function cacheFirst(req){
  return caches.match(req).then(cached=>cached||fetch(req).then(res=>{if(res&&res.ok){const clone=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,clone))}return res}));
}
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const url=new URL(e.request.url);
  if(url.hostname.includes("googleapis.com")||url.hostname.includes("firebase"))return; // réseau direct
  const sameOrigin=url.origin===self.location.origin;
  if(sameOrigin&&/\.(html|js|css|json)$|\/$/.test(url.pathname)){e.respondWith(networkFirst(e.request,3000));return}
  e.respondWith(cacheFirst(e.request));
});
