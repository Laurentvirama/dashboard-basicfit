// ═══════════════════════════════════════════════════════════════════════
// MODULE CONGÉS & ABSENCES — remplace le rappel agenda quotidien Workday
// Chargé AVANT app.js (index.html). Toutes les fonctions sont appelées
// après le chargement complet, donc DATA et les helpers d'app.js existent.
// Données : DATA.absences[] = {id, agentId|null, agentName, club, type,
//   dateDebut, dateFin, statut:"approuvé"|"attente"|"refusé", source,
//   note, dateCreated, key}
// ═══════════════════════════════════════════════════════════════════════

const ABS_TYPES=[
  {id:"cp",label:"Congés payés",short:"CP",color:"#F59E0B"},
  {id:"rtt",label:"RTT / Récupération",short:"RTT",color:"#0EA5E9"},
  {id:"css",label:"Congé sans solde",short:"CSS",color:"#6B7280"},
  {id:"formation",label:"Formation",short:"FORM",color:"#3B82F6"},
  {id:"famille",label:"Événement familial",short:"FAM",color:"#8B5CF6"},
  {id:"parental",label:"Maternité / Paternité / Parental",short:"PAR",color:"#EC4899"},
  {id:"autre",label:"Autre absence",short:"AUT",color:"#9CA3AF"},
];
const ABS_JOURS=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
let absWeekOffset=0;
let _absShowHistory=false;
let _absShowAll=false;
let _absImportRows=null;   // lignes en attente de validation (import / saisie rapide)

// ─── Helpers de base ───────────────────────────────────────────────────
function absTypeInfo(id){return ABS_TYPES.find(t=>t.id===id)||ABS_TYPES[ABS_TYPES.length-1]}
function absToday(){return absISO(new Date())}
function absISO(d){const x=new Date(d);if(isNaN(x))return "";return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().split("T")[0]}
function absAddDays(iso,n){const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return absISO(d)}
function absMonday(iso){const d=new Date(iso+"T12:00:00");const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return absISO(d)}
function absDays(a,b){return Math.round((new Date(b+"T12:00:00")-new Date(a+"T12:00:00"))/86400000)+1}
function absFmt(iso){return iso?new Date(iso+"T12:00:00").toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"}):"?"}
function absSettings(){
  if(!DATA.absSettings)DATA.absSettings={seuil:2,alertJours:7,recapDest:""};
  if(!DATA.absSettings.seuil)DATA.absSettings.seuil=2;
  if(!DATA.absSettings.alertJours)DATA.absSettings.alertJours=7;
  return DATA.absSettings;
}
function absList(){
  if(!DATA.absences)DATA.absences=[];
  // garde-fou : une absence sans date de début ne doit jamais faire planter l'affichage
  return DATA.absences.filter(a=>a&&typeof a.dateDebut==="string"&&a.dateDebut.length>=10);
}
function absNorm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z ]/g," ").split(/\s+/).filter(Boolean)}
function absAgentName(a){if(a.agentId){const t=getAgent(a.agentId);if(t)return t.name}return a.agentName||"—"}
function absAgentClub(a){if(a.agentId){const t=getAgent(a.agentId);if(t)return t.club}return a.club||"—"}
function absActiveOn(a,iso){return a.statut!=="refusé"&&a.dateDebut<=iso&&(a.dateFin||a.dateDebut)>=iso}
function absAujourdhui(){const t=absToday();return absList().filter(a=>absActiveOn(a,t)&&a.statut==="approuvé")}
function absAgentsAujourdhui(){const s=new Set();absAujourdhui().forEach(a=>s.add(absNorm(absAgentName(a)).join("")));return s.size}
function absActiveForAgent(agentId){const t=absToday();return absList().find(a=>a.agentId==agentId&&absActiveOn(a,t)&&a.statut==="approuvé")}
function absFiltre(list){return selectedClub==="all"?list:list.filter(a=>absAgentClub(a)===selectedClub)}
function absKey(name,d1,d2){return absNorm(name).sort().join("")+"|"+d1+"|"+(d2||d1)}

// Rapproche un nom (import Workday, saisie libre) avec un agent de l'équipe
function absMatchAgent(name){
  const toks=absNorm(name).sort();
  if(!toks.length)return null;
  const joined=toks.join(" ");
  let best=null,bestScore=0;
  DATA.team.forEach(t=>{
    const tt=absNorm(t.name).sort();
    let score=0;
    if(tt.join(" ")===joined)score=100;
    else{
      const inter=toks.filter(x=>tt.includes(x)).length;
      if(inter>0&&(inter===toks.length||inter===tt.length))score=80;
      else if(inter>=2)score=60;
      else if(inter===1&&toks.length===1)score=50; // nom de famille seul
    }
    if(score>bestScore){bestScore=score;best=t}
  });
  return bestScore>=50?best:null;
}

// Détecte le type d'absence à partir d'un libellé Workday / texte libre
function absDetectType(txt){
  const s=absNorm(txt).join(" ");
  if(/malad|sick|arret de travail|arret maladie|illness/.test(s))return "maladie";
  if(/fermeture|ferie|public holiday|bank holiday/.test(s))return "autre";
  if(/accident|\bat\b|work injury/.test(s))return "AT";
  if(/rtt|recup|repos comp|compensat/.test(s))return "rtt";
  if(/sans solde|unpaid|non pay/.test(s))return "css";
  if(/format|training/.test(s))return "formation";
  if(/matern|patern|parental|adoption/.test(s))return "parental";
  if(/famil|mariage|pacs|naissance|deces|enfant malade/.test(s))return "famille";
  if(/cong|\bcp\b|paid|vacation|holiday|annual|leave|vacances|pto/.test(s))return "cp";
  return "autre";
}

// Convertit n'importe quel format de date (Excel, Workday FR/EN) en YYYY-MM-DD
function absParseDate(v){
  if(v===null||v===undefined||v==="")return "";
  if(v instanceof Date&&!isNaN(v))return absISO(v);
  if(typeof v==="number"){if(v<30000||v>80000)return "";const d=new Date(Math.round((v-25569)*86400000));return isNaN(d)?"":new Date(d.getTime()+d.getTimezoneOffset()*60000).toISOString().split("T")[0]}
  let s=String(v).trim();
  if(/^\d+([.,]\d+)?$/.test(s)){const n=parseFloat(s.replace(",","."));return (n>=30000&&n<=80000&&s.length===5)?absParseDate(n):""} // matricule, unités… ne sont pas des dates
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if(m){let y=m[3].length===2?"20"+m[3]:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`}
  const mois={janv:1,jan:1,fevr:2,fev:2,feb:2,mars:3,mar:3,avr:4,apr:4,mai:5,may:5,juin:6,jun:6,juil:7,jul:7,aout:8,aug:8,sept:9,sep:9,oct:10,nov:11,dec:12};
  m=absNorm(s).join(" ").match(/(\d{1,2}) ([a-z]+)\.? (\d{4})/);
  if(m&&mois[m[2].slice(0,4)]||m&&mois[m[2].slice(0,3)]){const mo=mois[m[2].slice(0,4)]||mois[m[2].slice(0,3)];return `${m[3]}-${String(mo).padStart(2,"0")}-${m[1].padStart(2,"0")}`}
  const d=new Date(s);return isNaN(d)?"":absISO(d);
}

// ─── Couverture : combien d'absents par club et par jour ───────────────
function absAbsentsClubJour(club,iso){
  const names=[];
  absList().forEach(a=>{if(a.statut==="approuvé"&&absActiveOn(a,iso)&&absAgentClub(a)===club)names.push(absAgentName(a)+" ("+absTypeInfo(a.type).short+")")});
  (DATA.arrets||[]).forEach(a=>{if(a.dateDebut<=iso&&(!a.dateFin||a.dateFin>=iso)&&getAgentClub(a.agentId)===club)names.push(getAgentName(a.agentId)+" ("+(a.type==="maladie"?"Maladie":"AT")+")")});
  return names;
}
function absConflits(nbJours){
  const s=absSettings();const out=[];const t=absToday();
  for(let i=0;i<(nbJours||14);i++){
    const iso=absAddDays(t,i);
    DATA.clubs.forEach(c=>{
      const abs=absAbsentsClubJour(c.name,iso);
      const eff=DATA.team.filter(x=>x.club===c.name).length;
      if(abs.length>=s.seuil||(eff>0&&abs.length/eff>=0.5))out.push({date:iso,club:c.name,agents:abs,effectif:eff});
    });
  }
  return out;
}

// ─── Alertes quotidiennes (appelées par checkReminders toutes les 30 s) ─
// Les marqueurs sont stockés en localStorage : chaque appareil (PC, iPhone) reçoit ses propres alertes.
function checkAbsencesAlerts(){
  try{
    const t=absToday();const s=absSettings();
    const LS="bf_abs_notif_"+t;
    let done=[];try{done=JSON.parse(localStorage.getItem(LS)||"[]")}catch(e){}
    const mark=k=>{done.push(k);try{localStorage.setItem(LS,JSON.stringify(done))}catch(e){}};
    // 1. Récap du jour (une fois par jour et par appareil)
    if(!done.includes("daily")){
      mark("daily");
      const auj=absAujourdhui();
      if(auj.length>0)addNotification("🌴 "+auj.length+" agent"+(auj.length>1?"s":"")+" en congé aujourd'hui",auj.map(a=>absAgentName(a)+" — "+absAgentClub(a)+" (jusqu'au "+fmtDateShort(a.dateFin||a.dateDebut)+")").join(" · "),"info");
      const demain=absList().filter(a=>a.statut==="approuvé"&&a.dateDebut===absAddDays(t,1));
      if(demain.length>0)addNotification("📅 Demain : "+demain.length+" départ"+(demain.length>1?"s":"")+" en congé",demain.map(a=>absAgentName(a)+" ("+absAgentClub(a)+") jusqu'au "+fmtDateShort(a.dateFin||a.dateDebut)).join(" · "),"reminder");
    }
    // 2. Départs à J-N (alertJours) — une fois par absence
    absList().forEach(a=>{
      if(a.statut!=="approuvé")return;
      const k="up"+a.id;
      if(done.includes(k))return;
      const d=absDays(t,a.dateDebut)-1;
      if(d>0&&d<=s.alertJours){mark(k);addNotification("📅 J-"+d+" : "+absAgentName(a)+" en "+absTypeInfo(a.type).label.toLowerCase(),absAgentClub(a)+" · du "+fmtDateShort(a.dateDebut)+" au "+fmtDateShort(a.dateFin||a.dateDebut)+" — prévoir le remplacement","reminder")}
    });
    // 3. Couverture à risque dans les prochains jours
    const parClub={};
    absConflits(s.alertJours).forEach(c=>{
      const k="cf"+c.club+c.date;
      if(done.includes(k))return;mark(k);
      (parClub[c.club]=parClub[c.club]||[]).push(c);
    });
    Object.keys(parClub).forEach(club=>{
      const l=parClub[club];const max=Math.max(...l.map(c=>c.agents.length));
      const dates=l.length===1?absFmt(l[0].date):"du "+absFmt(l[0].date)+" au "+absFmt(l[l.length-1].date)+" ("+l.length+" jours)";
      addNotification("⚠ Couverture "+club+" — "+dates,"jusqu'à "+max+" absent"+(max>1?"s":"")+" sur "+l[0].effectif+" : "+[...new Set(l.flatMap(c=>c.agents))].join(", ")+" — prévoir les remplacements","urgent");
    });
    // ménage des marqueurs des jours précédents
    Object.keys(localStorage).forEach(k=>{if(k.startsWith("bf_abs_notif_")&&k!==LS)localStorage.removeItem(k)});
  }catch(e){console.log("checkAbsencesAlerts:",e)}
}

// ─── Rendu : onglet Congés & Absences ──────────────────────────────────
function absChip(a,compact){
  const ti=absTypeInfo(a.type);const att=a.statut==="attente";
  return `<span class="abs-chip${att?' attente':''}" style="--abs-c:${ti.color}" title="${ti.label}${att?' (en attente de validation)':''}">${compact?ti.short:ti.label}${att?' ?':''}</span>`;
}
function absRowActions(a){return `<div style="display:flex;gap:4px"><button class="btn-secondary" onclick="editAbsence(${a.id})">Modifier</button><button class="btn-danger" onclick="deleteAbsence(${a.id})">✕</button></div>`}

function renderAbsencesWeekGrid(){
  const t=absToday();
  const monday=absAddDays(absMonday(t),absWeekOffset*7);
  const jours=[];for(let i=0;i<7;i++)jours.push(absAddDays(monday,i));
  const clubs=selectedClub==="all"?DATA.clubs.map(c=>c.name):[selectedClub];
  const s=absSettings();
  let rows="";
  clubs.forEach(club=>{
    // agents du club ayant une absence ou un arrêt dans la semaine
    const lignes=[];
    DATA.team.filter(x=>x.club===club).forEach(ag=>{
      const cells=jours.map(iso=>{
        const ab=absList().find(a=>a.agentId==ag.id&&absActiveOn(a,iso));
        if(ab)return {abs:ab};
        const ar=(DATA.arrets||[]).find(a=>a.agentId==ag.id&&a.dateDebut<=iso&&(!a.dateFin||a.dateFin>=iso));
        if(ar)return {arret:ar};
        return null;
      });
      if(cells.some(Boolean))lignes.push({name:ag.name,cells});
    });
    // absences importées non rattachées à un agent (nom libre) pour ce club
    absList().filter(a=>!a.agentId&&(a.club===club||(!a.club&&club===clubs[0]))).forEach(a=>{
      const cells=jours.map(iso=>absActiveOn(a,iso)?{abs:a}:null);
      if(cells.some(Boolean)){const ex=lignes.find(l=>l.name===a.agentName);if(ex){cells.forEach((c,i)=>{if(c)ex.cells[i]=c})}else lignes.push({name:a.agentName+" *",cells})}
    });
    const eff=DATA.team.filter(x=>x.club===club).length;
    const counts=jours.map(iso=>absAbsentsClubJour(club,iso).length);
    rows+=`<tr class="abs-club-row"><td>${club} <span style="color:#9CA3AF;font-weight:400">· ${eff} agent${eff>1?'s':''}</span></td>${counts.map((n,i)=>`<td class="${n>=s.seuil||(eff>0&&n/eff>=0.5)?'abs-warn':''}">${n>0?n+' abs.':''}</td>`).join("")}</tr>`;
    if(lignes.length===0)rows+=`<tr><td colspan="8" class="abs-none">Aucune absence prévue</td></tr>`;
    lignes.forEach(l=>{
      rows+=`<tr><td class="abs-name">${l.name}</td>${l.cells.map((c,i)=>{
        if(!c)return `<td class="${jours[i]===t?'abs-today':''}"></td>`;
        if(c.arret)return `<td class="${jours[i]===t?'abs-today':''}"><span class="abs-chip" style="--abs-c:${c.arret.type==='maladie'?'#8B5CF6':'#EC4899'}">${c.arret.type==='maladie'?'MAL':'AT'}</span></td>`;
        return `<td class="${jours[i]===t?'abs-today':''}" onclick="editAbsence(${c.abs.id})" style="cursor:pointer">${absChip(c.abs,true)}</td>`;
      }).join("")}</tr>`;
    });
  });
  const label=absWeekOffset===0?"Cette semaine":absWeekOffset===1?"Semaine prochaine":absWeekOffset===-1?"Semaine dernière":"Semaine du "+fmtDateShort(monday);
  return `<div class="panel"><div class="panel-header"><span class="panel-title">📆 ${label} <span style="font-size:12px;color:#9CA3AF;font-weight:400">du ${fmtDateShort(monday)} au ${fmtDateShort(jours[6])}</span></span>
    <div style="display:flex;gap:6px"><button class="btn-secondary" onclick="absWeekOffset--;render()">◀</button><button class="btn-secondary" onclick="absWeekOffset=0;render()">Aujourd'hui</button><button class="btn-secondary" onclick="absWeekOffset++;render()">▶</button></div></div>
    <div class="abs-grid-wrap"><table class="abs-grid"><thead><tr><th></th>${jours.map(iso=>`<th class="${iso===t?'abs-today':''}">${ABS_JOURS[(new Date(iso+"T12:00:00").getDay()+6)%7]}<br><span>${iso.slice(8,10)}/${iso.slice(5,7)}</span></th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="abs-legend">${ABS_TYPES.map(x=>`<span><i style="background:${x.color}"></i>${x.short} ${x.label}</span>`).join("")}<span><i style="background:#8B5CF6"></i>MAL Maladie</span><span><i style="background:#EC4899"></i>AT Accident</span><span style="color:#9CA3AF">* nom non rattaché à un agent de l'équipe</span></div></div>`;
}

function renderAbsencesTab(){
  const t=absToday();const s=absSettings();
  const all=absFiltre(absList());
  const auj=all.filter(a=>absActiveOn(a,t)&&a.statut==="approuvé");
  const lundi=absMonday(t),dim=absAddDays(lundi,6);
  const semaine=all.filter(a=>a.statut!=="refusé"&&a.dateDebut<=dim&&(a.dateFin||a.dateDebut)>=lundi);
  const avenirAll=all.filter(a=>a.statut!=="refusé"&&(a.dateFin||a.dateDebut)>=t).sort((a,b)=>a.dateDebut.localeCompare(b.dateDebut));
  const j56=absAddDays(t,56);
  const avenir=_absShowAll?avenirAll:avenirAll.filter(a=>a.dateDebut<=j56);
  const plusTard=avenirAll.length-avenir.length;
  const passe=all.filter(a=>(a.dateFin||a.dateDebut)<t).sort((a,b)=>b.dateDebut.localeCompare(a.dateDebut));
  const attente=all.filter(a=>a.statut==="attente"&&(a.dateFin||a.dateDebut)>=t);
  const conflits=absConflits(14).filter(c=>selectedClub==="all"||c.club===selectedClub);
  const j30=absAddDays(t,30);
  const nb30=avenir.filter(a=>a.dateDebut<=j30).length;

  let html=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
    <div class="section-title">🌴 Congés & Absences <span>Le point du matin, sans ouvrir Workday</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn-add" onclick="addAbsenceForm()">+ Congé</button>
      <button class="btn-add" style="background:var(--c-primary)" onclick="importAbsencesWorkday()">📥 Import Workday</button>
      <button class="btn-secondary" onclick="quickAbsenceForm()">📝 Saisie rapide</button>
      <button class="btn-secondary" onclick="copyAbsencesRecap()">📋 Récap semaine</button>
      <button class="btn-secondary" onclick="exportAbsencesICS()">📅 Agenda (.ics)</button>
      <button class="btn-secondary" onclick="exportAbsencesExcel()">📊 Excel</button>
      <button class="btn-secondary" onclick="absCleanupForm()" title="Doublons, fusion, purge des imports">🧹</button>
      <button class="btn-secondary" onclick="absSettingsForm()" title="Seuil d'alerte, délai de prévenance">⚙</button>
    </div></div>`;

  html+=`<div class="stats-grid">
    <div class="stat-card" style="border-left:4px solid #F59E0B"><div class="stat-label">🌴 En congé aujourd'hui</div><div class="stat-value" style="color:#F59E0B">${auj.length}</div><div class="stat-sub">${auj.length?auj.map(a=>absAgentName(a)).join(", "):"Équipe au complet"}</div></div>
    <div class="stat-card"><div class="stat-label">Cette semaine</div><div class="stat-value">${semaine.length}</div><div class="stat-sub">absence${semaine.length>1?'s':''} du ${fmtDateShort(lundi)} au ${fmtDateShort(dim)}</div></div>
    <div class="stat-card"><div class="stat-label">30 prochains jours</div><div class="stat-value" style="color:#0D9488">${nb30}</div><div class="stat-sub">${attente.length?attente.length+' en attente de validation':'toutes validées'}</div></div>
    <div class="stat-card" style="border-left:4px solid ${conflits.length?'#DC2626':'#16A34A'}"><div class="stat-label">⚠ Couverture à risque (14 j)</div><div class="stat-value" style="color:${conflits.length?'#DC2626':'#16A34A'}">${conflits.length}</div><div class="stat-sub">seuil : ${s.seuil} absents ou 50 % de l'effectif</div></div>
  </div>`;

  if(conflits.length){
    html+=`<div class="panel" style="border-left:4px solid #DC2626"><div class="panel-header"><span class="panel-title">⚠ Jours où un club sera en sous-effectif</span><span class="badge" style="background:#FEE2E2;color:#991B1B">${conflits.length}</span></div>
      ${conflits.map(c=>`<div class="panel-row"><div class="row-left"><div class="dot" style="background:#DC2626"></div><div><div class="row-name">${c.club} — ${absFmt(c.date)}</div><div class="row-sub">${c.agents.length} absent${c.agents.length>1?'s':''} sur ${c.effectif} : ${c.agents.join(", ")}</div></div></div></div>`).join("")}
      <div style="padding:10px 20px;font-size:12px;color:#6B7280">💡 Transmets ces créneaux à Concentrix pour anticiper les remplacements (bouton « Récap semaine »).</div></div>`;
  }

  html+=renderAbsencesWeekGrid();

  html+=`<div class="panel"><div class="panel-header"><span class="panel-title">📋 En cours et à venir <span style="font-size:12px;color:#9CA3AF;font-weight:400">${_absShowAll?'toutes':'8 prochaines semaines'}</span></span><div style="display:flex;gap:8px;align-items:center"><span class="badge" style="background:#FEF3C7;color:#92400E">${avenir.length}</span>${plusTard>0||_absShowAll?`<button class="btn-secondary" onclick="_absShowAll=!_absShowAll;render()">${_absShowAll?'Réduire':'+ '+plusTard+' plus tard'}</button>`:''}</div></div>
    ${avenir.length===0?`<div class="empty-state" style="padding:30px"><div class="empty-state-icon">🌴</div><div>Aucune absence enregistrée<br><span style="font-size:12px;color:#9CA3AF">Importe l'export Workday, ou ajoute un congé à la main</span></div></div>`:
    `<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Agent</th><th>Club</th><th>Type</th><th>Du</th><th>Au</th><th>Jours</th><th>Statut</th><th>Source</th><th></th></tr></thead><tbody>
    ${avenir.map(a=>{const enCours=absActiveOn(a,t);const dj=absDays(t,a.dateDebut)-1;return `<tr style="${enCours?'background:#FFFBEB':''}"><td><strong>${absAgentName(a)}</strong>${a.agentId?'':' <span title="Nom non rattaché à un agent" style="color:#F59E0B">*</span>'}${a.note?`<div style="font-size:11px;color:#9CA3AF">${a.note}</div>`:''}</td><td>${absAgentClub(a)}</td><td>${absChip(a)}</td><td>${fmtDateShort(a.dateDebut)}</td><td>${fmtDateShort(a.dateFin||a.dateDebut)}</td><td><strong>${absDays(a.dateDebut,a.dateFin||a.dateDebut)}j</strong></td><td>${enCours?'<span class="badge-sm" style="background:#FEF3C7;color:#92400E">En cours</span>':dj<=s.alertJours?`<span class="badge-sm" style="background:#DBEAFE;color:#1E40AF">J-${dj}</span>`:a.statut==="attente"?'<span class="badge-sm" style="background:#F3F4F6;color:#6B7280">À valider</span>':'<span class="badge-sm" style="background:#D1FAE5;color:#065F46">Validé</span>'}</td><td style="font-size:11px;color:#9CA3AF">${a.source||'manuel'}</td><td>${absRowActions(a)}</td></tr>`}).join("")}
    </tbody></table></div>`}</div>`;

  html+=`<div class="panel"><div class="panel-header"><span class="panel-title">🗂 Historique</span><div style="display:flex;gap:8px;align-items:center"><span class="badge" style="background:#F3F4F6;color:#6B7280">${passe.length}</span><button class="btn-secondary" onclick="_absShowHistory=!_absShowHistory;render()">${_absShowHistory?'Masquer':'Afficher'}</button></div></div>
    ${_absShowHistory?(passe.length===0?'<div class="empty-state" style="padding:20px">Aucune absence passée</div>':`<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Agent</th><th>Club</th><th>Type</th><th>Du</th><th>Au</th><th>Jours</th><th></th></tr></thead><tbody>${passe.map(a=>`<tr><td>${absAgentName(a)}</td><td>${absAgentClub(a)}</td><td>${absChip(a)}</td><td>${fmtDateShort(a.dateDebut)}</td><td>${fmtDateShort(a.dateFin||a.dateDebut)}</td><td>${absDays(a.dateDebut,a.dateFin||a.dateDebut)}j</td><td>${absRowActions(a)}</td></tr>`).join("")}</tbody></table></div>`):''}</div>`;

  html+=`<div style="background:#F0FDFA;border:1px dashed #99F6E4;color:#0F766E;padding:12px 16px;border-radius:8px;font-size:12px">
    💡 <strong>Routine conseillée :</strong> une fois par semaine, ouvre Workday → calendrier / rapport d'absences de ton équipe → Exporter en Excel → bouton « Import Workday » ici. Le dashboard te notifie ensuite chaque matin (absents du jour, départs à J-${s.alertJours}, clubs en sous-effectif) sans que tu aies à retourner sur Workday. Le bouton « Agenda (.ics) » ajoute toutes les absences dans ton calendrier iPhone.
  </div>`;
  return html;
}

// ─── Rendu : module du tableau de bord (7 prochains jours) ─────────────
function renderAbsencesModule(dragAttrs){
  const t=absToday();const s=absSettings();
  const jours=[];for(let i=0;i<7;i++)jours.push(absAddDays(t,i));
  const clubs=selectedClub==="all"?DATA.clubs.map(c=>c.name):[selectedClub];
  const auj=absFiltre(absAujourdhui());
  const total=clubs.reduce((n,c)=>n+jours.reduce((m,iso)=>m+absAbsentsClubJour(c,iso).length,0),0);
  return `<div class="panel draggable" ${dragAttrs}><div class="panel-drag-handle">⋮⋮</div><div class="panel-header"><span class="panel-title">🌴 Congés & absences — 7 prochains jours</span><div style="display:flex;gap:8px;align-items:center"><span class="badge" style="background:${auj.length?'#FEF3C7':'#D1FAE5'};color:${auj.length?'#92400E':'#065F46'}">${auj.length} aujourd'hui</span><button class="btn-secondary" onclick="activeTab='absences';render()">Ouvrir</button></div></div>
    ${total===0?'<div class="empty-state" style="padding:20px;font-size:13px;color:#16A34A">✓ Aucune absence prévue sur 7 jours</div>':`<div class="abs-grid-wrap"><table class="abs-grid abs-mini"><thead><tr><th></th>${jours.map(iso=>`<th class="${iso===t?'abs-today':''}">${ABS_JOURS[(new Date(iso+"T12:00:00").getDay()+6)%7]}<br><span>${iso.slice(8,10)}/${iso.slice(5,7)}</span></th>`).join("")}</tr></thead><tbody>
    ${clubs.map(c=>{const eff=DATA.team.filter(x=>x.club===c).length;return `<tr><td class="abs-name">${c}</td>${jours.map(iso=>{const abs=absAbsentsClubJour(c,iso);const warn=abs.length>=s.seuil||(eff>0&&abs.length/eff>=0.5);return `<td class="${iso===t?'abs-today':''} ${warn?'abs-warn':''}" title="${abs.join(', ')}">${abs.length?abs.length:''}</td>`}).join("")}</tr>`}).join("")}
    </tbody></table></div>
    ${auj.length?`<div style="padding:8px 20px 12px;font-size:12px;color:#6B7280">Aujourd'hui : ${auj.map(a=>`<strong>${absAgentName(a)}</strong> (${absAgentClub(a)}, ${absTypeInfo(a.type).short})`).join(" · ")}</div>`:''}`}</div>`;
}

// ─── Rendu : sections de l'onglet Aujourd'hui ──────────────────────────
function renderAbsencesToday(section){
  const t=absToday();const s=absSettings();
  let html="";
  const aujAll=absAujourdhui();
  const parAgent={};aujAll.forEach(a=>{const k=absNorm(absAgentName(a)).join("");if(!parAgent[k]||(a.dateFin||a.dateDebut)>(parAgent[k].dateFin||parAgent[k].dateDebut))parAgent[k]=a});
  const auj=Object.values(parAgent).sort((a,b)=>absAgentClub(a).localeCompare(absAgentClub(b))||absAgentName(a).localeCompare(absAgentName(b)));
  if(auj.length)html+=section("🌴","En congé aujourd'hui",auj.length,"#F59E0B",auj.slice(0,12).map(a=>`<div class="panel-row"><div class="row-left"><div class="dot" style="background:${absTypeInfo(a.type).color}"></div><div><div class="row-name">${absAgentName(a)}</div><div class="row-sub">${absAgentClub(a)} · ${absTypeInfo(a.type).label} · retour le ${fmtDateShort(absAddDays(a.dateFin||a.dateDebut,1))}</div></div></div></div>`).join("")+(auj.length>12?`<div style="padding:10px 20px"><button class="btn-secondary" onclick="activeTab='absences';render()">Voir les ${auj.length} agents</button></div>`:''));
  const departs=absList().filter(a=>a.statut==="approuvé"&&a.dateDebut>t&&absDays(t,a.dateDebut)-1<=s.alertJours).sort((a,b)=>a.dateDebut.localeCompare(b.dateDebut));
  if(departs.length)html+=section("📅","Départs en congé dans les "+s.alertJours+" jours",departs.length,"#3B82F6",departs.map(a=>`<div class="panel-row"><div class="row-left"><div class="dot" style="background:${absTypeInfo(a.type).color}"></div><div><div class="row-name">${absAgentName(a)} <span style="font-size:11px;color:#3B82F6;font-weight:700">J-${absDays(t,a.dateDebut)-1}</span></div><div class="row-sub">${absAgentClub(a)} · du ${fmtDateShort(a.dateDebut)} au ${fmtDateShort(a.dateFin||a.dateDebut)}</div></div></div></div>`).join(""));
  const conflits=absConflits(s.alertJours);
  if(conflits.length)html+=section("⚠","Couverture à risque",conflits.length,"#DC2626",conflits.map(c=>`<div class="panel-row"><div class="row-left"><div><div class="row-name">${c.club} — ${absFmt(c.date)}</div><div class="row-sub">${c.agents.join(", ")}</div></div></div></div>`).join("")+`<div style="padding:8px 20px"><button class="btn-secondary" onclick="activeTab='absences';render()">Voir le planning</button></div>`);
  const attente=absList().filter(a=>a.statut==="attente"&&(a.dateFin||a.dateDebut)>=t);
  if(attente.length)html+=section("⏳","Demandes à valider dans Workday",attente.length,"#6B7280",`<div style="padding:10px 20px;font-size:13px;color:#6B7280">${attente.map(a=>absAgentName(a)+" ("+fmtDateShort(a.dateDebut)+")").join(", ")}</div>`);
  return html;
}

// ─── Formulaires ───────────────────────────────────────────────────────
function absTypeOpts(sel){return ABS_TYPES.map(x=>`<option value="${x.id}" ${x.id===sel?'selected':''}>${x.label}</option>`).join("")}
function absFormHtml(a){
  a=a||{};const today=absToday();
  return `<div class="form-group"><label class="form-label">Agent</label><select class="form-select" id="fAbA" onchange="document.getElementById('fAbNW').style.display=this.value?'none':'block'"><option value="">— Nom libre (agent hors équipe) —</option>${agentOpts(a.agentId)}</select>
    <div id="fAbNW" style="display:${a.agentId?'none':'block'};margin-top:8px;display:flex;gap:8px"><input class="form-input" id="fAbN" placeholder="Nom Prénom" value="${a.agentName||''}"><select class="form-select" id="fAbC">${clubOpts(a.club)}</select></div></div>
    <div style="display:flex;gap:10px"><div class="form-group" style="flex:1"><label class="form-label">Type</label><select class="form-select" id="fAbT">${absTypeOpts(a.type||"cp")}</select></div>
    <div class="form-group" style="flex:1"><label class="form-label">Statut</label><select class="form-select" id="fAbS"><option value="approuvé" ${a.statut!=="attente"&&a.statut!=="refusé"?'selected':''}>Validé</option><option value="attente" ${a.statut==="attente"?'selected':''}>En attente</option><option value="refusé" ${a.statut==="refusé"?'selected':''}>Refusé</option></select></div></div>
    <div style="display:flex;gap:10px"><div class="form-group" style="flex:1"><label class="form-label">Du *</label><input class="form-input" type="date" id="fAbD" value="${a.dateDebut||today}" onchange="if(!document.getElementById('fAbF').value||document.getElementById('fAbF').value<this.value)document.getElementById('fAbF').value=this.value"></div>
    <div class="form-group" style="flex:1"><label class="form-label">Au (inclus) *</label><input class="form-input" type="date" id="fAbF" value="${a.dateFin||a.dateDebut||today}"></div></div>
    <div class="form-group"><label class="form-label">Note</label><input class="form-input" id="fAbNote" placeholder="Ex : remplacement prévu par Evan, demande Workday n°…" value="${(a.note||'').replace(/"/g,'&quot;')}"></div>`;
}
function absReadForm(){
  const agentId=parseInt(document.getElementById("fAbA").value)||null;
  const name=agentId?getAgentName(agentId):document.getElementById("fAbN").value.trim();
  const d1=document.getElementById("fAbD").value,d2=document.getElementById("fAbF").value||d1;
  if(!name){showToast("⚠ Indique l'agent");return null}
  if(!d1){showToast("⚠ Date de début requise");return null}
  if(d2<d1){showToast("⚠ La date de fin est avant la date de début");return null}
  return {agentId,agentName:name,club:agentId?getAgentClub(agentId):document.getElementById("fAbC").value,type:document.getElementById("fAbT").value,statut:document.getElementById("fAbS").value,dateDebut:d1,dateFin:d2,note:document.getElementById("fAbNote").value};
}
window.addAbsenceForm=function(){
  showModal(`<div class="form-title">🌴 Nouveau congé / absence</div>${absFormHtml()}<div class="form-actions"><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="saveAbsence()">Enregistrer</button></div>`);
};
window.saveAbsence=function(){
  const f=absReadForm();if(!f)return;
  const a=Object.assign({id:nextId(DATA.absences),source:"manuel",dateCreated:new Date().toISOString(),key:absKey(f.agentName,f.dateDebut,f.dateFin)},f);
  DATA.absences.push(a);
  logChange("Congé ajouté : "+f.agentName+" du "+fmtDateShort(f.dateDebut)+" au "+fmtDateShort(f.dateFin));
  saveData();closeModal();render();showToast("✓ Congé enregistré");
};
window.editAbsence=function(id){
  const a=absList().find(x=>x.id===id);if(!a)return;
  showModal(`<div class="form-title">✏ Modifier l'absence</div>${absFormHtml(a)}<div class="form-actions"><button class="btn-danger" style="margin-right:auto" onclick="deleteAbsence(${id})">Supprimer</button><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="updateAbsence(${id})">Enregistrer</button></div>`);
};
window.updateAbsence=function(id){
  const a=absList().find(x=>x.id===id);if(!a)return;const f=absReadForm();if(!f)return;
  Object.assign(a,f,{key:absKey(f.agentName,f.dateDebut,f.dateFin)});
  logChange("Congé modifié : "+f.agentName);saveData();closeModal();render();showToast("✓ Absence mise à jour");
};
window.deleteAbsence=function(id){
  const a=absList().find(x=>x.id===id);if(!a)return;
  if(!confirm("Supprimer l'absence de "+absAgentName(a)+" ?"))return;
  DATA.absences=DATA.absences.filter(x=>x.id!==id);
  logChange("Congé supprimé : "+absAgentName(a));saveData();closeModal();render();
};
window.absSettingsForm=function(){
  const s=absSettings();
  showModal(`<div class="form-title">⚙ Réglages des alertes</div>
    <div class="form-group"><label class="form-label">Alerte sous-effectif à partir de</label><select class="form-select" id="fAbSeuil">${[1,2,3,4].map(n=>`<option value="${n}" ${s.seuil===n?'selected':''}>${n} absent${n>1?'s':''} le même jour dans un club</option>`).join("")}</select><div style="font-size:11px;color:#9CA3AF;margin-top:4px">L'alerte se déclenche aussi dès que 50 % de l'effectif d'un club est absent (congés + arrêts).</div></div>
    <div class="form-group"><label class="form-label">Me prévenir avant un départ en congé</label><select class="form-select" id="fAbJ">${[3,5,7,10,14].map(n=>`<option value="${n}" ${s.alertJours===n?'selected':''}>J-${n}</option>`).join("")}</select></div>
    <div class="form-group"><label class="form-label">Destinataire du récap (email Concentrix / planning)</label><input class="form-input" id="fAbDest" placeholder="ex : planning.bfidf@concentrix.com" value="${s.recapDest||''}"></div>
    <div class="form-actions"><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="DATA.absSettings.seuil=parseInt(document.getElementById('fAbSeuil').value);DATA.absSettings.alertJours=parseInt(document.getElementById('fAbJ').value);DATA.absSettings.recapDest=document.getElementById('fAbDest').value.trim();saveData();closeModal();render();showToast('✓ Réglages enregistrés')">Enregistrer</button></div>`);
};

// ─── Saisie rapide (coller un message WhatsApp / une liste) ────────────
window.quickAbsenceForm=function(){
  showModal(`<div class="form-title">📝 Saisie rapide</div>
    <div style="font-size:12px;color:#6B7280;margin-bottom:10px">Une absence par ligne, dans n'importe quel ordre : <em>nom, date de début, date de fin, type</em>. Les dates sont reconnues au format 14/09/2026, 14/09 ou 2026-09-14. Sans date de fin = 1 journée.<br><span style="color:#9CA3AF">Ex : <code>Evan 14/09/2026 20/09/2026 CP</code> · <code>Rebecca Delesse du 22/09 au 23/09 RTT</code></span></div>
    <div class="form-group"><textarea class="form-textarea" id="fAbQuick" rows="8" placeholder="Evan 14/09/2026 20/09/2026 CP&#10;Erine Dhaussy du 06/10 au 10/10 congés"></textarea></div>
    <div class="form-actions"><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="parseQuickAbsences()">Analyser</button></div>`);
};
window.parseQuickAbsences=function(){
  const txt=document.getElementById("fAbQuick").value;const year=new Date().getFullYear();
  const rows=[];
  txt.split(/\n+/).forEach(line=>{
    line=line.trim();if(!line)return;
    const dateRe=/(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?)/g;
    const dates=[];let m;let first=-1;
    while((m=dateRe.exec(line))){if(first<0)first=m.index;let d=m[1];if(/^\d{1,2}[\/\.\-]\d{1,2}$/.test(d))d+="/"+year;dates.push(absParseDate(d))}
    if(!dates.length||first<0)return rows.push({raw:line,error:"aucune date"});
    const name=line.slice(0,first).replace(/\b(du|le|from)\b\s*$/i,"").replace(/[,;:\-–]+\s*$/,"").trim();
    const rest=line.replace(dateRe,"").slice(first).replace(/\b(du|au|le|à|a|to|from)\b/gi," ").replace(/[,;:\-–]+/g," ").trim();
    let d1=dates[0],d2=dates[1]||dates[0];if(d2<d1){const x=d1;d1=d2;d2=x}
    const ag=absMatchAgent(name);
    rows.push({raw:line,agentName:ag?ag.name:name,agentId:ag?ag.id:null,club:ag?ag.club:"",type:absDetectType(rest||"cp"),dateDebut:d1,dateFin:d2,statut:"approuvé",source:"saisie rapide"});
  });
  absShowImportPreview(rows,"Saisie rapide");
};

// ─── Import Excel / CSV Workday ────────────────────────────────────────
window.importAbsencesWorkday=function(){
  const inp=document.createElement("input");inp.type="file";inp.accept=".xlsx,.xls,.csv";inp.style.display="none";
  inp.onchange=e=>{if(e.target.files[0])processAbsencesImport(e.target.files[0])};
  document.body.appendChild(inp);inp.click();
};
window.processAbsencesImport=async function(file){
  const ok=await loadXLSX();if(!ok)return;
  const data=await file.arrayBuffer();
  let wb;
  try{wb=XLSX.read(data,{type:"array",cellDates:true})}catch(e){showToast("⚠ Fichier illisible : "+file.name);return}
  // Workday met souvent un titre et des lignes vides avant l'en-tête, et parfois le tableau sur une 2e feuille :
  // on scanne toutes les feuilles et on garde celle qui contient le vrai tableau
  const scoreRow=r=>r.filter(c=>String(c).trim()).length+(r.some(c=>/nom|name|worker|employ|collab|salari|agent/i.test(c))?3:0)+(r.some(c=>/d[ée]but|start|from|date/i.test(c))?3:0);
  let best=null;
  wb.SheetNames.forEach(name=>{
    const aoa=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:"",raw:true}).map(r=>r.map(c=>c instanceof Date?absISO(c):c));
    let hi=0,hs=-1;
    aoa.slice(0,25).forEach((r,i)=>{const sc=scoreRow(r);if(sc>hs){hs=sc;hi=i}});
    const body=aoa.slice(hi+1).filter(r=>r.some(c=>String(c).trim()));
    const total=hs*10+body.length;
    if(hs>0&&body.length&&(!best||total>best.total))best={aoa,hi,body,total,name};
  });
  if(!best){showToast("⚠ Aucun tableau trouvé dans "+file.name+" ("+wb.SheetNames.length+" feuille"+(wb.SheetNames.length>1?"s":"")+" : "+wb.SheetNames.join(", ")+")");
    addNotification("📥 Import impossible","Le fichier "+file.name+" ne contient aucune ligne de données. Vérifie dans Workday que la période affichée contient des absences avant d'exporter, ou utilise la Saisie rapide.","info");return}
  const headers=best.aoa[best.hi].map(h=>String(h).trim());
  const body=best.body;
  const find=re=>{const i=headers.findIndex(h=>re.test(h));return i>=0?i:-1};
  const dateCol=find(/^date de l'absence|^date$|absence date|date d'absence/i); // export "une ligne par jour"
  const map={
    nom:find(/^(nom|name|worker|employ|collaborateur|salari|agent|travailleur|employee)/i),
    type:find(/^type d'absence|leave type|time off type|^type|motif|nature|raison|reason/i),
    table:find(/table d'absence|absence table|absence plan|^plan|rubrique/i),
    debut:dateCol>=0?dateCol:find(/d[ée]but|start|from|première|first day|date de d/i),
    fin:dateCol>=0?dateCol:find(/date de fin|^fin|end date|^end|to$|jusqu|last day|dernier/i),
    statut:find(/statut|status|état|etat|approbation|approval/i),
    club:find(/club|site|organisation|organization|lieu|supervisory|location|établissement/i),
    matricule:find(/matricule|employee id|worker id|^id$/i),
    unites:find(/unit[ée]s|units|quantit|dur[ée]e|^jours$|^days$/i),
  };
  if(map.nom<0)map.nom=0;
  const notDate=i=>i===map.nom||i===map.matricule||i===map.unites||/matricule|id\b|unit|semaine|weekday|jour de/i.test(headers[i]);
  if(map.debut<0){map.debut=headers.findIndex((h,i)=>!notDate(i)&&body.some(r=>absParseDate(r[i])))}
  if(map.fin<0){map.fin=headers.findIndex((h,i)=>!notDate(i)&&i!==map.debut&&body.some(r=>absParseDate(r[i])))}
  if(map.fin<0)map.fin=map.debut; // pas de date de fin = absence d'une journée (fusionnées ensuite en périodes)
  _absImportRows={headers,body,map,file:file.name+(wb.SheetNames.length>1?" · feuille « "+best.name+" »":"")};
  absShowMappingForm();
};
window.absShowMappingForm=function(){
  const R=_absImportRows;const opt=(sel)=>`<option value="-1">— aucune —</option>`+R.headers.map((h,i)=>`<option value="${i}" ${i===sel?'selected':''}>${h||'(colonne '+(i+1)+')'}</option>`).join("");
  const champ=(id,label,req)=>`<div class="form-group" style="flex:1;min-width:180px"><label class="form-label">${label}${req?' *':''}</label><select class="form-select" id="fMap_${id}">${opt(R.map[id])}</select></div>`;
  showModal(`<div class="form-title">📥 Import Workday — ${R.file}</div>
    <div style="font-size:12px;color:#6B7280;margin-bottom:12px">${R.body.length} lignes trouvées. Vérifie que les colonnes sont bien reconnues :</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">${champ("nom","Nom de l'agent",1)}${champ("debut","Date (ou date de début)",1)}${champ("fin","Date de fin (si distincte)")}${champ("type","Type d'absence")}${champ("table","Table / plan d'absence")}${champ("matricule","Matricule")}${champ("statut","Statut")}${champ("club","Club / site")}</div>
    <div style="font-size:11px;color:#9CA3AF;margin-top:-4px;margin-bottom:8px">Export Workday « une ligne par jour » : mets la même colonne en date de début et de fin, les jours consécutifs seront fusionnés en périodes.</div>
    <div class="form-group"><label style="font-size:13px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="fMapSkipRef" checked> Ignorer les demandes refusées / annulées</label></div>
    <div class="form-actions"><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="absApplyMapping()">Analyser</button></div>`);
};
window.absApplyMapping=function(){
  const R=_absImportRows;["nom","debut","fin","type","table","matricule","statut","club"].forEach(k=>R.map[k]=parseInt(document.getElementById("fMap_"+k).value));
  if(R.map.fin<0)R.map.fin=R.map.debut;
  const skipRef=document.getElementById("fMapSkipRef").checked;
  const rows=[];
  R.body.forEach(r=>{
    const name=String(r[R.map.nom]||"").trim();if(!name)return;
    const d1=absParseDate(r[R.map.debut]);const d2=R.map.fin>=0?absParseDate(r[R.map.fin])||d1:d1;
    if(!d1)return rows.push({raw:name,error:"date illisible : "+r[R.map.debut]});
    const st=R.map.statut>=0?absNorm(r[R.map.statut]).join(" "):"";
    let statut="approuvé";
    if(/refus|annul|cancel|denied|rejet/.test(st))statut="refusé";
    else if(/attente|pending|soumis|submitted|en cours|awaiting|in progress/.test(st))statut="attente";
    if(statut==="refusé"&&skipRef)return;
    const mat=R.map.matricule>=0?String(r[R.map.matricule]||"").trim():"";
    const ag=(mat&&DATA.team.find(t=>String(t.matricule||"").trim()===mat))||absMatchAgent(name);
    const typeTxt=[R.map.type>=0?r[R.map.type]:"",R.map.table>=0?r[R.map.table]:""].map(x=>String(x||"").trim()).filter(Boolean).join(" ");
    const un=R.map.unites>=0?parseFloat(String(r[R.map.unites]||"").replace(",",".")):NaN;
    const clubRaw=R.map.club>=0?String(r[R.map.club]||""):"";
    const clubMatch=DATA.clubs.find(c=>clubRaw&&(absNorm(clubRaw).join(" ").includes(absNorm(c.name).join(" "))||clubRaw.includes(c.code)));
    rows.push({raw:name,agentName:ag?ag.name:name,agentId:ag?ag.id:null,club:ag?ag.club:(clubMatch?clubMatch.name:clubRaw),type:absDetectType(typeTxt),dateDebut:d1<=d2?d1:d2,dateFin:d2>=d1?d2:d1,statut,source:"Workday "+absToday(),note:(typeTxt&&absDetectType(typeTxt)==="autre"?typeTxt:"")+(un>0&&un<1?" (½ journée)":"")});
  });
  absShowImportPreview(rows,"Import Workday");
};

// Aperçu commun (import + saisie rapide) avant enregistrement
// Fusionne des lignes "une par jour" (ou qui se chevauchent) en une seule absence par agent + type
function absMergeRows(rows){
  const ok=rows.filter(r=>!r.error).sort((a,b)=>(absNorm(a.agentName).join("")+a.type).localeCompare(absNorm(b.agentName).join("")+b.type)||a.dateDebut.localeCompare(b.dateDebut));
  const out=[];
  ok.forEach(r=>{
    const last=out[out.length-1];
    let suivant=absAddDays(last?last.dateFin:r.dateDebut,1);
    if(last){const dow=new Date(suivant+"T12:00:00").getDay();if(dow===6)suivant=absAddDays(suivant,2);else if(dow===0)suivant=absAddDays(suivant,1)}
    if(last&&absNorm(last.agentName).join("")===absNorm(r.agentName).join("")&&last.type===r.type&&r.dateDebut<=suivant){
      if(r.dateFin>last.dateFin)last.dateFin=r.dateFin;
      last.merged=(last.merged||1)+1;
      if(r.note&&!(last.note||"").includes(r.note))last.note=((last.note||"")+" "+r.note).trim();
      if(r.statut==="attente")last.statut="attente";
    } else out.push(Object.assign({},r));
  });
  return out.concat(rows.filter(r=>r.error));
}
window.absShowImportPreview=function(rows,titre){
  const y=new Date().getFullYear();
  rows.forEach(r=>{
    if(r.error)return;
    const y1=parseInt(r.dateDebut.slice(0,4)),y2=parseInt((r.dateFin||r.dateDebut).slice(0,4));
    if(y1<y-1||y1>y+2||y2<y-1||y2>y+2){r.error="dates suspectes ("+r.dateDebut+" → "+r.dateFin+")";return}
    if(absDays(r.dateDebut,r.dateFin)>120){r.error="durée anormale ("+absDays(r.dateDebut,r.dateFin)+" jours) : vérifie la colonne Date de fin"}
  });
  rows=absMergeRows(rows);
  _absImportRows=rows;
  const existing=new Set(absList().map(a=>a.key));
  const seen=new Set();
  rows.forEach(r=>{if(!r.error){r.key=absKey(r.agentName,r.dateDebut,r.dateFin);r.dup=existing.has(r.key)||seen.has(r.key);seen.add(r.key);r.keep=!r.dup}});
  const ok=rows.filter(r=>!r.error);const err=rows.filter(r=>r.error);
  showModal(`<div class="form-title">${titre} — aperçu</div>
    <div style="font-size:12px;color:#6B7280;margin-bottom:10px">${ok.length} absence${ok.length>1?'s':''} reconnue${ok.length>1?'s':''}${ok.some(r=>r.merged)?' (lignes par jour fusionnées en périodes)':''}${err.length?', <span style="color:#DC2626">'+err.length+' ligne'+(err.length>1?'s':'')+' illisible'+(err.length>1?'s':'')+'</span>':''}. Les doublons déjà présents sont décochés. Les types maladie / AT iront dans l'onglet « Maladie & AT ».</div>
    <div style="max-height:45vh;overflow:auto;border:1px solid #F0F0F3;border-radius:8px"><table class="data-table" style="font-size:12px"><thead><tr><th></th><th>Agent</th><th>Club</th><th>Type</th><th>Du</th><th>Au</th><th>Statut</th></tr></thead><tbody>
    ${rows.map((r,i)=>r.error?`<tr style="background:#FEF2F2"><td></td><td colspan="6" style="color:#DC2626">${r.raw} — ${r.error}</td></tr>`:`<tr style="${r.dup?'opacity:.5':''}"><td><input type="checkbox" ${r.keep?'checked':''} onchange="_absImportRows[${i}].keep=this.checked"></td><td>${r.agentName}${r.agentId?' <span style="color:#16A34A">✓</span>':' <span style="color:#F59E0B" title="Non trouvé dans l\'équipe — sera enregistré en nom libre">*</span>'}${r.dup?' <span class="badge-sm" style="background:#F3F4F6;color:#6B7280">déjà présent</span>':''}</td><td>${r.club||'—'}</td><td>${r.type==="maladie"?'🏥 Maladie':r.type==="AT"?'⚠ AT':absTypeInfo(r.type).label}</td><td>${fmtDateShort(r.dateDebut)}</td><td>${fmtDateShort(r.dateFin)}${r.merged?' <span style="color:#9CA3AF">('+r.merged+' j fusionnés)</span>':''}</td><td>${r.statut}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="form-actions"><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="form-submit" onclick="absCommitImport('${titre.replace(/'/g,"")}')">Enregistrer ${ok.filter(r=>r.keep).length} absence${ok.filter(r=>r.keep).length>1?'s':''}</button></div>`);
};
window.absCommitImport=function(titre){
  const rows=(_absImportRows||[]).filter(r=>!r.error&&r.keep);
  let n=0,nArr=0;
  rows.forEach(r=>{
    if((r.type==="maladie"||r.type==="AT")&&!r.agentId){r.note=((r.type==="maladie"?"Arrêt maladie":"Accident du travail")+" — agent hors équipe du dashboard "+(r.note||"")).trim();r.type="autre"}
    if(r.type==="maladie"||r.type==="AT"){
      if(!DATA.arrets)DATA.arrets=[];
      if(DATA.arrets.some(a=>a.agentId==r.agentId&&a.dateDebut===r.dateDebut))return;
      DATA.arrets.push({id:nextId(DATA.arrets),type:r.type,agentId:r.agentId,dateDebut:r.dateDebut,dateFin:r.dateFin,note:"Import "+titre,dateCreated:new Date().toISOString()});nArr++;
    } else {
      DATA.absences.push({id:nextId(DATA.absences),agentId:r.agentId,agentName:r.agentName,club:r.club,type:r.type,statut:r.statut,dateDebut:r.dateDebut,dateFin:r.dateFin,source:r.source||titre,note:r.note||"",dateCreated:new Date().toISOString(),key:r.key});n++;
    }
  });
  _absImportRows=null;
  if(!DATA.importHistory)DATA.importHistory=[];
  DATA.importHistory.unshift({time:new Date().toISOString(),type:"absences",count:n+nArr,label:titre});
  DATA.absLastImport=new Date().toISOString();
  logChange(titre+" : "+n+" absence(s)"+(nArr?" + "+nArr+" arrêt(s)":""));
  addNotification("🌴 "+titre,n+" absence"+(n>1?"s":"")+" enregistrée"+(n>1?"s":"")+(nArr?" · "+nArr+" arrêt"+(nArr>1?"s":"")+" maladie/AT":""),"info");
  // Ré-évalue les alertes tout de suite (départs proches, sous-effectif)
  try{localStorage.removeItem("bf_abs_notif_"+absToday())}catch(e){}
  saveData();closeModal();render();checkAbsencesAlerts();
  showToast("✓ "+(n+nArr)+" ligne"+(n+nArr>1?"s":"")+" importée"+(n+nArr>1?"s":""));
};

// ─── Exports : récap texte, Excel/CSV, agenda .ics ─────────────────────
function absRecapText(){
  const t=absToday();const lundi=absMonday(t);const s=absSettings();
  const jours=[];for(let i=0;i<14;i++)jours.push(absAddDays(lundi,i));
  let txt=`Absences cluster BFFR03.36 — du ${fmtDateShort(lundi)} au ${fmtDateShort(jours[13])}\n(généré le ${fmtDateShort(t)} depuis le dashboard)\n\n`;
  const clubs=selectedClub==="all"?DATA.clubs.map(c=>c.name):[selectedClub];
  clubs.forEach(c=>{
    const lst=absList().filter(a=>a.statut!=="refusé"&&absAgentClub(a)===c&&a.dateDebut<=jours[13]&&(a.dateFin||a.dateDebut)>=lundi).sort((a,b)=>a.dateDebut.localeCompare(b.dateDebut));
    const arr=(DATA.arrets||[]).filter(a=>getAgentClub(a.agentId)===c&&a.dateDebut<=jours[13]&&(!a.dateFin||a.dateFin>=lundi));
    txt+=`▶ ${c} (${getClubCode(c)})\n`;
    if(!lst.length&&!arr.length)txt+="   Aucune absence\n";
    lst.forEach(a=>{txt+=`   • ${absAgentName(a)} — ${absTypeInfo(a.type).label} du ${fmtDateShort(a.dateDebut)} au ${fmtDateShort(a.dateFin||a.dateDebut)}${a.statut==="attente"?" (à valider)":""}\n`});
    arr.forEach(a=>{txt+=`   • ${getAgentName(a.agentId)} — ${a.type==="maladie"?"Arrêt maladie":"Accident du travail"} depuis le ${fmtDateShort(a.dateDebut)}${a.dateFin?" jusqu'au "+fmtDateShort(a.dateFin):" (en cours)"}\n`});
    txt+="\n";
  });
  const conf=absConflits(14).filter(x=>clubs.includes(x.club));
  if(conf.length){txt+="⚠ Jours en sous-effectif (remplacement à prévoir) :\n";conf.forEach(x=>{txt+=`   • ${x.club} — ${absFmt(x.date)} : ${x.agents.join(", ")}\n`})}
  txt+=`\nSeuil d'alerte : ${s.seuil} absents / club. — Laurent Virama, Cluster Manager`;
  return txt;
}
window.copyAbsencesRecap=function(){
  const txt=absRecapText();const s=absSettings();
  const mail=`mailto:${encodeURIComponent(s.recapDest||"")}?subject=${encodeURIComponent("Absences cluster BFFR03.36 — semaine du "+fmtDateShort(absMonday(absToday())))}&body=${encodeURIComponent(txt)}`;
  const wa=`https://wa.me/?text=${encodeURIComponent(txt)}`;
  const copy=()=>{if(navigator.clipboard)navigator.clipboard.writeText(txt).then(()=>showToast("✓ Récap copié")).catch(()=>showToast("Sélectionne le texte et copie-le"));else showToast("Sélectionne le texte et copie-le")};
  showModal(`<div class="form-title">📋 Récap des absences (2 semaines)</div><textarea class="form-textarea" rows="14" style="font-family:monospace;font-size:12px" id="fAbRecap">${txt.replace(/</g,"&lt;")}</textarea>
    <div class="form-actions" style="flex-wrap:wrap"><button class="form-cancel" onclick="closeModal()">Fermer</button><a class="btn-secondary" style="text-decoration:none;padding:10px 16px" href="${wa}" target="_blank">💬 WhatsApp</a><a class="btn-secondary" style="text-decoration:none;padding:10px 16px" href="${mail}">✉ Email${s.recapDest?' → '+s.recapDest:''}</a><button class="form-submit" id="fAbCopyBtn">Copier</button></div>`);
  document.getElementById("fAbCopyBtn").onclick=copy;
};
window.exportAbsencesExcel=function(){
  let csv="\uFEFFAgent;Club;Type;Du;Au;Jours;Statut;Source;Note\n";
  [...absList()].sort((a,b)=>a.dateDebut.localeCompare(b.dateDebut)).forEach(a=>{csv+=`"${absAgentName(a)}";"${absAgentClub(a)}";"${absTypeInfo(a.type).label}";"${a.dateDebut}";"${a.dateFin||a.dateDebut}";${absDays(a.dateDebut,a.dateFin||a.dateDebut)};"${a.statut}";"${a.source||''}";"${(a.note||'').replace(/"/g,'""')}"\n`});
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});const url=URL.createObjectURL(blob);const el=document.createElement("a");el.href=url;el.download=`Absences_BFFR03.36_${absToday()}.csv`;el.click();URL.revokeObjectURL(url);
  showToast("✓ Export Excel généré");
};
window.exportAbsencesICS=function(){
  const t=absToday();const s=absSettings();
  const lst=absList().filter(a=>a.statut!=="refusé"&&(a.dateFin||a.dateDebut)>=absAddDays(t,-7));
  if(!lst.length){showToast("Aucune absence à exporter");return}
  const esc=x=>String(x||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
  const stamp=new Date().toISOString().replace(/[-:]/g,"").split(".")[0]+"Z";
  let ics="BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Dashboard Basic-Fit//Absences//FR\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Absences cluster BFFR03.36\r\n";
  lst.forEach(a=>{
    const d1=a.dateDebut.replace(/-/g,""),d2=absAddDays(a.dateFin||a.dateDebut,1).replace(/-/g,"");
    ics+=`BEGIN:VEVENT\r\nUID:abs-${a.id}-${a.key||d1}@dashboard-basicfit\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${d1}\r\nDTEND;VALUE=DATE:${d2}\r\nSUMMARY:${esc("🌴 "+absAgentName(a)+" — "+absTypeInfo(a.type).short+(a.statut==="attente"?" (à valider)":""))}\r\nLOCATION:${esc(absAgentClub(a))}\r\nDESCRIPTION:${esc(absTypeInfo(a.type).label+(a.note?" — "+a.note:""))}\r\nBEGIN:VALARM\r\nTRIGGER:-P${s.alertJours}D\r\nACTION:DISPLAY\r\nDESCRIPTION:${esc("Départ en congé dans "+s.alertJours+" jours : "+absAgentName(a))}\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
  });
  ics+="END:VCALENDAR\r\n";
  const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});const url=URL.createObjectURL(blob);const el=document.createElement("a");el.href=url;el.download=`Absences_BFFR03.36_${t}.ics`;el.click();URL.revokeObjectURL(url);
  showToast("✓ Fichier agenda généré — ouvre-le pour l'ajouter à ton calendrier");
};

// ─── Filet de sécurité : une erreur JS ne doit jamais laisser un écran blanc ───
window.addEventListener("error",function(ev){
  try{
    const area=document.getElementById("contentArea");
    if(area&&!area.innerHTML.trim()){
      area.innerHTML=`<div class="panel" style="border-left:4px solid #DC2626;padding:20px"><div style="font-weight:700;font-size:15px;margin-bottom:6px">⚠ L'affichage a rencontré une erreur</div><div style="font-size:12px;color:#6B7280;margin-bottom:12px">Tes données sont intactes. Envoie ce message à Claude :</div><pre style="background:#FEF2F2;color:#991B1B;padding:10px;border-radius:8px;font-size:11px;white-space:pre-wrap">${String(ev.message)+(ev.filename?"\n"+ev.filename.split("/").pop()+":"+ev.lineno:"")}</pre><button class="btn-secondary" style="margin-top:12px" onclick="location.reload(true)">Recharger l'application</button></div>`;
    }
  }catch(e){}
});

// ─── Nettoyage : doublons, fusion, purge des imports ───────────────────
window.absCleanupForm=function(){
  const imp=absList().filter(a=>/^Workday/i.test(a.source||""));
  showModal(`<div class="form-title">🧹 Nettoyer les absences</div>
    <div style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px">
      <strong>Fusionner &amp; dédoublonner</strong> : supprime les lignes identiques et regroupe, pour un même agent et un même type, les jours consécutifs en une seule période. Aucune information perdue.<br>
      <strong>Supprimer les imports Workday</strong> : efface les ${imp.length} absence${imp.length>1?'s':''} venant d'un import (les saisies manuelles sont conservées), pour repartir proprement avant un nouvel import.
    </div>
    <div class="form-actions" style="flex-wrap:wrap"><button class="form-cancel" onclick="closeModal()">Annuler</button><button class="btn-danger" style="padding:10px 16px" onclick="absPurgeImports()">Supprimer les imports Workday</button><button class="form-submit" onclick="absDedupe()">Fusionner &amp; dédoublonner</button></div>`);
};
window.absDedupe=function(){
  const before=absList().length;
  const rows=absList().map(a=>Object.assign({},a,{dateFin:a.dateFin||a.dateDebut}));
  const merged=absMergeRows(rows);
  const seen=new Set();const out=[];
  merged.forEach(r=>{const k=absKey(r.agentName,r.dateDebut,r.dateFin)+"|"+r.type;if(seen.has(k))return;seen.add(k);r.key=absKey(r.agentName,r.dateDebut,r.dateFin);delete r.merged;out.push(r)});
  DATA.absences=out;
  logChange("Nettoyage absences : "+before+" → "+out.length);
  saveData();closeModal();render();showToast("✓ "+before+" lignes → "+out.length+" absences");
};
window.absPurgeImports=function(){
  const n=absList().filter(a=>/^Workday/i.test(a.source||"")).length;
  if(!confirm("Supprimer les "+n+" absences importées depuis Workday ? Les saisies manuelles sont conservées."))return;
  DATA.absences=DATA.absences.filter(a=>!/^Workday/i.test(a.source||""));
  logChange("Purge des imports Workday : "+n+" absences supprimées");
  saveData();closeModal();render();showToast("✓ "+n+" absences supprimées");
};
