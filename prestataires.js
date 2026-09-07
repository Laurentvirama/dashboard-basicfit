// ═══════════════════════════════════════════════════════════════════════
// PRESTATAIRES — annuaire sécurité / nettoyage / intérim (onglet Contacts)
// Données : DATA.prestataires[] = {id, nom, type, horaires, note, contacts:[{id, nom, fonction, email, tel, quand, prio}]}
// prio : 1 = astreinte / à privilégier, 2 = courant, 3 = escalade / direction
// ═══════════════════════════════════════════════════════════════════════
const PRESTA_TYPES=[{id:"securite",label:"Sécurité",icon:"🛡",color:"#3B82F6"},{id:"nettoyage",label:"Nettoyage",icon:"🧹",color:"#0D9488"},{id:"interim",label:"Intérim",icon:"👥",color:"#8B5CF6"},{id:"autre",label:"Autre",icon:"🏢",color:"#6B7280"}];
const PRESTA_SEED=[
 {nom:"UNES",type:"securite",horaires:"Équipe dédiée Basic-Fit : 08h45–19h00 · Permanence après 19h00",contacts:[
   {nom:"Numéro d'astreinte",fonction:"Ligne principale",email:"operateur@reseau-unes.fr",tel:"01 86 37 01 36",quand:"À privilégier",prio:1},
   {nom:"Numéro d'astreinte 2",fonction:"Ligne de secours",email:"operateur@reseau-unes.fr",tel:"07 83 71 20 95",quand:"Si la ligne 1 ne répond pas",prio:1},
   {nom:"Carla LO RUSSO",fonction:"Opératrice plateau",email:"operateur@reseau-unes.fr",tel:"01 86 37 01 36",quand:"Suivi des opérations",prio:2},
   {nom:"Aurélie GAUTHIER",fonction:"Opératrice plateau",email:"operateur@reseau-unes.fr",tel:"01 86 37 01 36",quand:"Suivi des opérations",prio:2},
   {nom:"Uendi SULA",fonction:"Opératrice plateau",email:"operateur@reseau-unes.fr",tel:"01 86 37 01 36",quand:"Suivi des opérations",prio:2},
   {nom:"Christophe ROSE",fonction:"Directeur commercial",email:"c.rose@reseau-unes.fr",tel:"07 84 06 75 26",quand:"Service commercial · responsable urgence si aucune astreinte ne répond",prio:3},
   {nom:"Laura RALIERE",fonction:"Collaboratrice du directeur commercial",email:"l.raliere@reseau-unes.fr",tel:"07 81 02 97 79",quand:"Service commercial",prio:3}]},
 {nom:"GORON",type:"securite",horaires:"Téléphone : jours ouvrés aux horaires clubs · Mail H24 7j/7",contacts:[
   {nom:"Zoran STEVIC",fonction:"Responsable des Opérations — contact prioritaire",email:"z.stevic@goron.fr",tel:"06 71 02 92 91",quand:"Numéro privilégié",prio:1},
   {nom:"Adresse générique",fonction:"Opérations",email:"operations.gds@goron.fr",tel:"",quand:"Demandes courantes (mail H24 7j/7)",prio:2},
   {nom:"Ethan HIDIER",fonction:"Administratif (secondaire)",email:"e.hidier@goron.fr",tel:"",quand:"Administratif",prio:2},
   {nom:"Raphaël SAUVAGE",fonction:"Direction",email:"r.sauvage@goron.fr",tel:"06 62 94 86 02",quand:"En l'absence du contact prioritaire",prio:3}]},
 {nom:"SERIS",type:"securite",horaires:"Service H24 7j/7",contacts:[
   {nom:"Numéro d'astreinte 1",fonction:"Ligne principale",email:"coa@seris-security.com",tel:"02 51 76 99 81",quand:"À privilégier",prio:1},
   {nom:"Numéro d'astreinte 2",fonction:"Ligne de secours",email:"",tel:"02 51 76 37 47",quand:"Si la ligne 1 ne répond pas",prio:1},
   {nom:"Opérateur CODA",fonction:"Suivi courant",email:"coa@seris.fr",tel:"",quand:"Suivi courant",prio:2},
   {nom:"Laura PENNETIER",fonction:"Responsable",email:"lpennetier@seris.fr",tel:"06 14 99 01 13",quand:"Escalade si astreinte injoignable (H24) · toutes informations",prio:3},
   {nom:"Amélie LEGRAND",fonction:"Administratif",email:"alegrand@seris-security.com",tel:"",quand:"Toutes informations + réclamations · journée lun-ven",prio:2}]},
 {nom:"SECURITAS",type:"securite",horaires:"7j/7 – 24h/24",contacts:[
   {nom:"Ligne d'astreinte",fonction:"Numéro unique",email:"",tel:"02 28 09 25 39",quand:"À privilégier",prio:1},
   {nom:"Adresse générique",fonction:"Réponse Nantes",email:"reponse.nantes@securitas.fr",tel:"",quand:"Demandes courantes",prio:2}]},
 {nom:"ARESS",type:"nettoyage",horaires:"Lun–Ven 08h30–19h00 · Sam 08h30–12h00 — pas d'astreinte planning en dehors",contacts:[
   {nom:"Astreinte",fonction:"Urgences",email:"",tel:"+33 5 36 28 98 19",quand:"Numéro à privilégier en cas d'urgence",prio:1},
   {nom:"Support cleaning",fonction:"Contact principal",email:"support.cleaning@aress.fr",tel:"",quand:"Pour toute demande",prio:1},
   {nom:"Tamsir",fonction:"WhatsApp",email:"",tel:"+33 7 74 04 04 32",quand:"Contact WhatsApp secondaire",prio:2},
   {nom:"Achraf",fonction:"Planning (WhatsApp)",email:"",tel:"+33 7 48 33 67 24",quand:"Contact WhatsApp secondaire",prio:2},
   {nom:"Lamine",fonction:"Planning (WhatsApp)",email:"",tel:"+33 7 73 85 52 84",quand:"Contact WhatsApp secondaire",prio:2},
   {nom:"Adresse nettoyage",fonction:"Générique",email:"nettoyage@aress.fr",tel:"",quand:"Demandes courantes",prio:2},
   {nom:"Mehdi SABRALLAH",fonction:"Responsable",email:"mehdi.sabrallah@aress.fr",tel:"+31 6 43 84 74 91",quand:"Grosse urgence uniquement",prio:3},
   {nom:"Karima LAMGHOUACH",fonction:"Responsable",email:"karima@aressgroep.nl",tel:"+32 48 414 64 08",quand:"Grosse urgence uniquement",prio:3}]},
 {nom:"ISOR",type:"nettoyage",horaires:"Astreinte jour 06h–19h / nuit 19h–04h — non couvert 04h–06h · Les 3 adresses mail doivent être mises en copie",contacts:[
   {nom:"Astreinte jour (6h–19h)",fonction:"Priorité en journée",email:"Isor-Basicfit@isorgroup.com",tel:"02 51 72 26 27",quand:"6h–19h",prio:1},
   {nom:"Astreinte nuit (19h–4h)",fonction:"Priorité la nuit",email:"s.carranza@isorgroup.com / j.pecoud@isorgroup.com",tel:"01 45 14 25 06",quand:"19h–4h",prio:1},
   {nom:"G. CRUAUD",fonction:"Interlocutrice planning",email:"g.cruaud@isorgroup.com",tel:"02 51 72 26 27",quand:"Planification / annulation (choix 3)",prio:2},
   {nom:"Justine LORTEAU",fonction:"Assistante",email:"j.lorteau@isorgroup.com",tel:"02 51 72 26 27",quand:"Suivi courant (choix 3)",prio:2},
   {nom:"Adresse générique",fonction:"Isor – Basic-Fit",email:"Isor-Basicfit@isorgroup.com",tel:"",quand:"Demandes courantes",prio:2},
   {nom:"Alexandre BEAUVAIS",fonction:"Responsable ISOR",email:"a.beauvais@isorgroup.com",tel:"06 29 54 31 62",quand:"Sujets nationaux",prio:3},
   {nom:"Frédéric PÉRON",fonction:"Directeur régional — relais exploitation national",email:"f.peron@isorgroup.com",tel:"06 03 59 49 25",quand:"En doublon avec A. Beauvais pour sujets nationaux",prio:3}]},
 {nom:"SIDE",type:"interim",horaires:"Support : lun–ven 8h–20h, sam 8h–18h · Victor Charbit : lun–ven 9h–12h30 / 14h–18h",contacts:[
   {nom:"Support Side",fonction:"Astreinte / support",email:"care@side.co",tel:"01 87 39 21 25",quand:"Hors bureau : 8h–9h, 18h–20h, samedi",prio:1},
   {nom:"Victor CHARBIT",fonction:"Référent",email:"victor.charbit@sidetemp.com",tel:"07 63 47 90 84",quand:"Contact référent",prio:2},
   {nom:"Adresse générique",fonction:"Basic-Fit IDF Centre",email:"basicfit-idfcentre@sidetemp.com",tel:"07 44 09 79 79",quand:"Demandes courantes",prio:2}]}
];
let _prestaFilter="";
function prestaType(id){return PRESTA_TYPES.find(t=>t.id===id)||PRESTA_TYPES[3]}
function prestaSeed(){
  if(!DATA.prestataires){DATA.prestataires=PRESTA_SEED.map((p,i)=>Object.assign({id:i+1,note:""},p,{contacts:p.contacts.map((c,j)=>Object.assign({id:(i+1)*100+j+1},c))}))}
}
function prestaTelHref(t){return "tel:"+String(t||"").replace(/[^0-9+]/g,"")}
function prestaWa(t){let n=String(t||"").replace(/[^0-9+]/g,"");if(n.startsWith("0"))n="33"+n.slice(1);return "https://wa.me/"+n.replace("+","")}
function renderPrestataires(){
  prestaSeed();
  const q=_prestaFilter.toLowerCase();
  const list=DATA.prestataires.filter(p=>!q||(p.nom+" "+prestaType(p.type).label+" "+p.horaires+" "+p.contacts.map(c=>c.nom+" "+c.fonction+" "+c.email+" "+c.tel+" "+c.quand).join(" ")).toLowerCase().includes(q));
  const astreintes=DATA.prestataires.flatMap(p=>p.contacts.filter(c=>c.prio===1&&c.tel).map(c=>({p,c})));
  let html=`<div class="panel" style="border-left:4px solid #DC2626"><div class="panel-header"><span class="panel-title">🚨 Astreintes — à appeler en premier</span><span class="badge" style="background:#FEE2E2;color:#991B1B">${astreintes.length}</span></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;padding:12px 16px">${astreintes.map(({p,c})=>`<a href="${prestaTelHref(c.tel)}" style="text-decoration:none;color:inherit;border:1px solid #F0F0F3;border-radius:10px;padding:10px 12px;display:block;border-left:4px solid ${prestaType(p.type).color}"><div style="font-size:11px;color:#6B7280">${prestaType(p.type).icon} ${p.nom}</div><div style="font-weight:600;font-size:13px">${c.nom}</div><div style="font-size:14px;font-weight:700;color:#0D9488;margin-top:2px">📞 ${c.tel}</div><div style="font-size:11px;color:#9CA3AF">${c.quand||""}</div></a>`).join("")}</div></div>`;
  html+=`<div class="panel"><div class="panel-header"><span class="panel-title">🏢 Prestataires sécurité, nettoyage & intérim</span><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input class="form-input" style="padding:6px 10px;font-size:12px;width:200px" placeholder="🔍 Rechercher (nom, société, rôle…)" value="${_prestaFilter.replace(/"/g,'&quot;')}" oninput="_prestaFilter=this.value;render();document.querySelector('#prestaSearchFocus')?.focus()" id="prestaSearchFocus"><button class="btn-add" onclick="prestaForm()">+ Prestataire</button></div></div>
    <div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px">`;
  if(!list.length)html+=`<div class="empty-state" style="padding:20px">Aucun prestataire ne correspond</div>`;
  list.forEach(p=>{
    const t=prestaType(p.type);
    html+=`<div style="border:1px solid #F0F0F3;border-radius:12px;border-left:4px solid ${t.color};overflow:hidden">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 14px;background:${t.color}0D;flex-wrap:wrap"><div><span class="badge-sm" style="background:${t.color};color:#fff;margin-right:8px">${t.icon} ${t.label}</span><strong style="font-size:15px">${p.nom}</strong><div style="font-size:12px;color:#6B7280;margin-top:3px">🕒 ${p.horaires||"Horaires non renseignés"}</div>${p.note?`<div style="font-size:12px;color:#B45309;margin-top:2px">📝 ${p.note}</div>`:""}</div><div style="display:flex;gap:4px"><button class="btn-secondary" style="font-size:11px" onclick="prestaContactForm(${p.id})">+ Contact</button><button class="btn-secondary" style="font-size:11px" onclick="prestaForm(${p.id})">✏</button></div></div>
      <div style="overflow-x:auto"><table class="data-table" style="font-size:12px"><thead><tr><th></th><th>Nom / fonction</th><th>Téléphone</th><th>Email</th><th>Quand contacter</th><th></th></tr></thead><tbody>
      ${[...p.contacts].sort((a,b)=>(a.prio||2)-(b.prio||2)).map(c=>`<tr><td>${c.prio===1?'<span class="badge-sm" style="background:#FEE2E2;color:#991B1B">Astreinte</span>':c.prio===3?'<span class="badge-sm" style="background:#FEF3C7;color:#92400E">Escalade</span>':''}</td><td><strong>${c.nom}</strong><div style="color:#6B7280">${c.fonction||""}</div></td><td style="white-space:nowrap">${c.tel?`<a href="${prestaTelHref(c.tel)}" class="btn-secondary" style="font-size:11px;padding:3px 8px;text-decoration:none">📞 ${c.tel}</a> <a href="${prestaWa(c.tel)}" target="_blank" class="btn-secondary" style="font-size:11px;padding:3px 6px;text-decoration:none" title="WhatsApp">💬</a>`:'—'}</td><td>${c.email?c.email.split(" / ").map(e=>`<a href="mailto:${e}" style="color:#0D9488">${e}</a>`).join("<br>"):'—'}</td><td style="color:#6B7280">${c.quand||""}</td><td><button class="btn-secondary" style="font-size:10px;padding:3px 6px" onclick="prestaContactForm(${p.id},${c.id})">✏</button></td></tr>`).join("")}
      </tbody></table></div></div>`;
  });
  html+=`</div></div>`;
  return html;
}
window.prestaForm=function(id){
  prestaSeed();const p=id?DATA.prestataires.find(x=>x.id===id):null;
  showModal(`<div class="form-title">${p?'✏ Modifier':'🏢 Nouveau'} prestataire</div>
    <div class="form-group"><label class="form-label">Société *</label><input class="form-input" id="fPrNom" value="${p?p.nom.replace(/"/g,'&quot;'):''}"></div>
    <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="fPrType">${PRESTA_TYPES.map(t=>`<option value="${t.id}" ${p&&p.type===t.id?'selected':''}>${t.icon} ${t.label}</option>`).join("")}</select></div>
    <div class="form-group"><label class="form-label">Horaires / joignabilité</label><input class="form-input" id="fPrHor" value="${p?(p.horaires||'').replace(/"/g,'&quot;'):''}" placeholder="Ex : 7j/7 24h/24"></div>
    <div class="form-group"><label class="form-label">Note</label><input class="form-input" id="fPrNote" value="${p?(p.note||'').replace(/"/g,'&quot;'):''}" placeholder="Ex : mettre les 3 adresses en copie"></div>
    <div class="form-actions">${p?`<button class="btn-danger" style="margin-right:auto" onclick="if(confirm('Supprimer ${p.nom} et tous ses contacts ?')){DATA.prestataires=DATA.prestataires.filter(x=>x.id!==${p.id});saveData();closeModal();render()}">Supprimer</button>`:''}<button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="prestaSave(${p?p.id:0})">Enregistrer</button></div>`);
};
window.prestaSave=function(id){
  const nom=document.getElementById("fPrNom").value.trim();if(!nom){showToast("⚠ Nom de la société requis");return}
  const f={nom,type:document.getElementById("fPrType").value,horaires:document.getElementById("fPrHor").value.trim(),note:document.getElementById("fPrNote").value.trim()};
  if(id){Object.assign(DATA.prestataires.find(x=>x.id===id),f)}else DATA.prestataires.push(Object.assign({id:Date.now(),contacts:[]},f));
  logChange("Prestataire "+(id?"modifié":"ajouté")+" : "+nom);saveData();closeModal();render();
};
window.prestaContactForm=function(pid,cid){
  const p=DATA.prestataires.find(x=>x.id===pid);if(!p)return;const c=cid?p.contacts.find(x=>x.id===cid):null;
  const v=k=>c?(c[k]||'').replace(/"/g,'&quot;'):'';
  showModal(`<div class="form-title">${c?'✏ Modifier':'+ Nouveau'} contact — ${p.nom}</div>
    <div class="form-group"><label class="form-label">Nom *</label><input class="form-input" id="fPcNom" value="${v('nom')}"></div>
    <div class="form-group"><label class="form-label">Fonction</label><input class="form-input" id="fPcFn" value="${v('fonction')}"></div>
    <div style="display:flex;gap:10px"><div class="form-group" style="flex:1"><label class="form-label">Téléphone</label><input class="form-input" id="fPcTel" value="${v('tel')}"></div><div class="form-group" style="flex:1"><label class="form-label">Email</label><input class="form-input" id="fPcMail" value="${v('email')}"></div></div>
    <div class="form-group"><label class="form-label">Quand le contacter</label><input class="form-input" id="fPcQuand" value="${v('quand')}"></div>
    <div class="form-group"><label class="form-label">Priorité</label><select class="form-select" id="fPcPrio"><option value="1" ${c&&c.prio===1?'selected':''}>🚨 Astreinte / à privilégier</option><option value="2" ${!c||c.prio===2?'selected':''}>Courant</option><option value="3" ${c&&c.prio===3?'selected':''}>Escalade / direction</option></select></div>
    <div class="form-actions">${c?`<button class="btn-danger" style="margin-right:auto" onclick="if(confirm('Supprimer ce contact ?')){const p=DATA.prestataires.find(x=>x.id===${pid});p.contacts=p.contacts.filter(x=>x.id!==${cid});saveData();closeModal();render()}">Supprimer</button>`:''}<button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="prestaContactSave(${pid},${cid||0})">Enregistrer</button></div>`);
};
window.prestaContactSave=function(pid,cid){
  const p=DATA.prestataires.find(x=>x.id===pid);if(!p)return;
  const nom=document.getElementById("fPcNom").value.trim();if(!nom){showToast("⚠ Nom requis");return}
  const f={nom,fonction:document.getElementById("fPcFn").value.trim(),tel:document.getElementById("fPcTel").value.trim(),email:document.getElementById("fPcMail").value.trim(),quand:document.getElementById("fPcQuand").value.trim(),prio:parseInt(document.getElementById("fPcPrio").value)};
  if(cid){Object.assign(p.contacts.find(x=>x.id===cid),f)}else p.contacts.push(Object.assign({id:Date.now()},f));
  saveData();closeModal();render();
};
