import { API_URL } from "./config.js?v=5";

const CATEGORIES = [
  { key:"diet", label:"🥗 Diet" },
  { key:"water", label:"💧 Water" },
  { key:"stretch", label:"🧘 Stretch" },
  { key:"exercise", label:"🏋️ Exercise" }
];
const MAJOR_XP = {
  "1": {"0.6":320,"0.7":280,"0.8":240,"0.9":200,"1":160},
  "2": {"0.6":240,"0.7":230,"0.8":220,"0.9":210,"1":200},
  "3": {"0.6":180,"0.7":190,"0.8":200,"0.9":210,"1":220},
  "4": {"0.6":100,"0.7":125,"0.8":150,"0.9":175,"1":200}
};
function majorReward(rank, target){
  return MAJOR_XP[String(rank)]?.[String(Number(target))] ?? 0;
}
const START = "2026-10-01";
const END = "2026-10-31";
const $ = s => document.querySelector(s);

let session = loadSession();
let state = null;
let selectedDate = currentChallengeDate();

function loadSession(){
  try { return JSON.parse(localStorage.getItem("healthQuestSession") || "null"); }
  catch { return null; }
}
function saveSession(){ localStorage.setItem("healthQuestSession", JSON.stringify(session)); }
function clearSession(){ localStorage.removeItem("healthQuestSession"); session=null; state=null; }
function show(view){
  ["connectView","setupView","gameView"].forEach(id => $("#"+id).classList.add("hidden"));
  $("#"+view).classList.remove("hidden");
  $("#logoutBtn").classList.toggle("hidden", view === "connectView");
}
function setMessage(el, text="", kind=""){
  el.textContent=text; el.classList.remove("error","success"); if(kind) el.classList.add(kind);
}
function configured(){ return API_URL && !API_URL.includes("PASTE_YOUR_") && API_URL.startsWith("https://"); }
function monthDates(){
  const out=[]; for(let d=1; d<=31; d++) out.push(`2026-10-${String(d).padStart(2,"0")}`); return out;
}
function isoToday(){
  const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function currentChallengeDate(){ const t=isoToday(); if(t<START) return START; if(t>END) return END; return t; }
function prettyDate(iso){ return new Date(iso+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}); }
function challengeText(){
  const t=isoToday();
  if(t<START) return `Starts October 1 • ${Math.max(0,Math.ceil((new Date(START+"T12:00:00")-new Date())/86400000))} days to go`;
  if(t>END) return "October challenge complete";
  return `${31-Number(t.slice(-2))} days remaining after today`;
}

async function api(action, payload={}){
  if(!configured()) throw new Error("The Google Apps Script URL has not been added to config.js yet.");
  const body = new URLSearchParams();
  body.set("action", action);
  body.set("payload", JSON.stringify(payload));
  const res = await fetch(API_URL, { method:"POST", body });
  if(!res.ok) throw new Error(`Server error (${res.status})`);
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "Request failed");
  return data;
}
function authPayload(extra={}){
  return { groupCode:session?.groupCode||"", pin:session?.pin||"", playerId:session?.playerId||"", ...extra };
}
async function join(){
  const groupCode=$("#groupCode").value.trim().toUpperCase();
  const pin=$("#groupPin").value.trim();
  const name=$("#playerName").value.trim();
  if(!groupCode || !pin || !name) return setMessage($("#connectMsg"),"Enter the group code, PIN, and your name.","error");
  setMessage($("#connectMsg"),"Joining…"); $("#joinBtn").disabled=true;
  try{
    const data=await api("join",{groupCode,pin,name});
    session={groupCode,pin,playerId:data.player.playerId,name:data.player.name}; saveSession();
    await refreshState();
  }catch(e){ setMessage($("#connectMsg"),e.message,"error"); }
  finally{ $("#joinBtn").disabled=false; }
}
async function refreshState(silent=false){
  if(!session) {
    $("#joinBtn").textContent="Join challenge";
    return show("connectView");
  }
  try{
    const data=await api("getState",authPayload({date:selectedDate}));
    state=data.state;
    const me=state.players.find(p=>p.playerId===session.playerId);
    if(!me) throw new Error("Your player was not found in the spreadsheet.");
    session.name=me.name; saveSession();
    $("#joinBtn").textContent="Join challenge";
    if(!hasGoals(session.playerId)){ show("setupView"); renderGoalEditor(); }
    else { show("gameView"); renderGame(); }
  }catch(e){
    if(!silent){
      // Keep the saved session even when Google Sheets / Apps Script is temporarily unavailable.
      show("connectView");
      $("#groupCode").value=session.groupCode||"";
      $("#groupPin").value=session.pin||"";
      $("#playerName").value=session.name||"";
      $("#joinBtn").textContent="Reconnect";
      setMessage(
        $("#connectMsg"),
        "Couldn’t connect to Google Sheets. Your player is still saved on this device. Check your connection, then tap Reconnect. " + e.message,
        "error"
      );
    }
  }
}
function hasGoals(playerId){ return CATEGORIES.every(c=>state.goals.some(g=>g.playerId===playerId && g.category===c.key)); }
function goalsFor(playerId){
  const obj={}; state.goals.filter(g=>g.playerId===playerId).forEach(g=>obj[g.category]=g); return obj;
}
function goalDefinition(playerId, category){
  return goalsFor(playerId)[category]?.description?.trim() || "No detailed definition added.";
}
function checkin(playerId,date,cat){ return state.checkins.find(x=>x.playerId===playerId && x.date===date && x.category===cat); }
function completedCount(playerId,cat){ return monthDates().reduce((n,d)=>n+(checkin(playerId,d,cat)?.done?1:0),0); }
function streakXP(playerId,cat){
  let run=0,xp=0; for(const d of monthDates()){ if(checkin(playerId,d,cat)?.done){run++; if(run%3===0) xp+=10;} else run=0; } return xp;
}
function extraXP(playerId){ return state.checkins.filter(x=>x.playerId===playerId && x.extra).length*5; }
function majorXP(playerId){
  const goals=goalsFor(playerId); let total=0;
  for(const c of CATEGORIES){
    const g=goals[c.key]; if(!g) continue;
    const needed=Math.ceil(Number(g.target)*31);
    if(completedCount(playerId,c.key)>=needed) total+=majorReward(g.rank,g.target);
  }
  return total;
}
function totalXP(playerId){ return majorXP(playerId)+extraXP(playerId)+CATEGORIES.reduce((s,c)=>s+streakXP(playerId,c.key),0); }

function renderGoalEditor(){
  $("#setupPlayerName").textContent=session.name; const wrap=$("#goalEditor"); wrap.innerHTML="";
  const defaults={diet:{rank:3,target:.8},water:{rank:4,target:.9},stretch:{rank:1,target:.6},exercise:{rank:2,target:.9}};
  const existing=goalsFor(session.playerId);
  for(const c of CATEGORIES){
    const row=$("#goalRowTemplate").content.firstElementChild.cloneNode(true); row.dataset.category=c.key;
    row.querySelector(".goal-title").textContent=c.label;
    const rank=row.querySelector(".rank-select"), target=row.querySelector(".target-select"), reward=row.querySelector(".goal-reward");
    const description=row.querySelector(".description-input");
    rank.value=String(existing[c.key]?.rank ?? defaults[c.key].rank);
    target.value=String(existing[c.key]?.target ?? defaults[c.key].target);
    description.value=existing[c.key]?.description || "";
    const update=()=>{ reward.textContent=`${majorReward(rank.value,target.value)} XP`; };
    rank.addEventListener("change",update); target.addEventListener("change",update); update(); wrap.appendChild(row);
  }
}
async function saveGoals(){
  const rows=[...document.querySelectorAll(".goal-row")]; const ranks=rows.map(r=>r.querySelector(".rank-select").value);
  if(new Set(ranks).size!==4) return setMessage($("#goalMsg"),"Use each difficulty rank exactly once.","error");
  const goals=rows.map(r=>({
    category:r.dataset.category,
    rank:Number(r.querySelector(".rank-select").value),
    target:Number(r.querySelector(".target-select").value),
    description:r.querySelector(".description-input").value.trim()
  }));
  $("#saveGoalsBtn").disabled=true; setMessage($("#goalMsg"),"Saving…");
  try{ await api("saveGoals",authPayload({goals})); setMessage($("#goalMsg"),"Goals saved.","success"); await refreshState(true); }
  catch(e){ setMessage($("#goalMsg"),e.message,"error"); }
  finally{ $("#saveGoalsBtn").disabled=false; }
}
function renderDatePicker(){
  const picker=$("#datePicker"); picker.innerHTML=monthDates().map(d=>`<option value="${d}">${prettyDate(d)}</option>`).join(""); picker.value=selectedDate;
}
function renderDailyTasks(){
  $("#checkinDateLabel").textContent=prettyDate(selectedDate); const wrap=$("#dailyTasks"); wrap.innerHTML="";
  for(const c of CATEGORIES){ const x=checkin(session.playerId,selectedDate,c.key)||{}; const row=document.createElement("div"); row.className="task-row"; row.dataset.category=c.key;
    row.innerHTML=`<div class="task-name"><strong>${c.label}</strong><small>Daily completion + optional extra effort</small></div><label class="check-toggle"><input class="done" type="checkbox"> Done</label><label class="check-toggle extra-toggle"><input class="extra" type="checkbox"> Extra +5</label>`;
    row.querySelector(".done").checked=!!x.done; row.querySelector(".extra").checked=!!x.extra; wrap.appendChild(row); }
}
async function saveCheckin(){
  const entries=[...document.querySelectorAll(".task-row")].map(r=>({category:r.dataset.category,done:r.querySelector(".done").checked,extra:r.querySelector(".extra").checked}));
  $("#saveCheckinBtn").disabled=true; setMessage($("#checkinMsg"),"Saving…");
  try{ await api("saveCheckin",authPayload({date:selectedDate,entries})); setMessage($("#checkinMsg"),"Saved ✓","success"); await refreshState(true); }
  catch(e){ setMessage($("#checkinMsg"),e.message,"error"); }
  finally{ $("#saveCheckinBtn").disabled=false; }
}
function renderRandomCheck(){
  const rc=state.randomCheck; const status=rc?.status||"Pending"; const chip=$("#verificationStatus"); chip.textContent=status; chip.className="status-chip "+status.toLowerCase();
  const box=$("#randomCheckBox");
  if(!rc){ box.innerHTML=`<div class="muted">No random check is available for this date yet.</div>`; $("#verificationButtons").classList.add("hidden"); return; }
  const p=state.players.find(x=>x.playerId===rc.playerId); const c=CATEGORIES.find(x=>x.key===rc.category); const claim=checkin(rc.playerId,selectedDate,rc.category)?.done;
  const definition=goalDefinition(rc.playerId,rc.category);
  box.innerHTML=`<div class="muted">${prettyDate(selectedDate)}</div>
    <div class="random-name">${p?.name||"Player"}</div>
    <div class="random-category">${c?.label||rc.category}</div>
    <div class="audit-definition"><strong>Goal definition:</strong> ${escapeHtml(definition)}</div>
    <p class="muted">Claimed complete: <strong>${claim?"Yes":"Not yet"}</strong></p>
    <p class="muted">Use the definition above when auditing the check. Send proof in your group chat, then record the result below.</p>`;
  $("#verificationButtons").classList.remove("hidden");
}
async function setVerification(status){
  try{ await api("setVerification",authPayload({date:selectedDate,status})); await refreshState(true); }
  catch(e){ alert(e.message); }
}
function renderLeaderboard(){
  const list=state.players.map(p=>({...p,xp:totalXP(p.playerId)})).sort((a,b)=>b.xp-a.xp); const max=Math.max(1,...list.map(x=>x.xp));
  $("#leaderboard").innerHTML=list.map((p,i)=>`<div class="leader-row"><div class="rank">#${i+1}</div><div><div class="leader-name">${escapeHtml(p.name)}${p.playerId===session.playerId?" · you":""}</div><div class="bar"><span style="width:${Math.round(p.xp/max*100)}%"></span></div></div><div class="leader-score">${p.xp} XP</div></div>`).join("");
}
function renderProgress(){
  const goals=goalsFor(session.playerId); $("#progressGrid").innerHTML=CATEGORIES.map(c=>{ const g=goals[c.key]; const done=completedCount(session.playerId,c.key); const needed=Math.ceil(Number(g.target)*31); const pct=Math.min(100,Math.round(done/needed*100)); const major=majorReward(g.rank,g.target);
    return `<div class="progress-card"><div class="progress-title">${c.label}</div><div class="progress-number">${done}/${needed}</div><div class="muted">${Math.round(Number(g.target)*100)}% target · difficulty #${g.rank}</div><div class="bar"><span style="width:${pct}%"></span></div><div class="xp-breakdown">${major} major XP · ${streakXP(session.playerId,c.key)} streak XP</div></div>`; }).join("");
}
function renderGroupGoals(){
  const wrap=$("#groupGoals");
  wrap.innerHTML=state.players.map(p=>{
    const goals=goalsFor(p.playerId);
    const cards=CATEGORIES.map(c=>{
      const g=goals[c.key];
      if(!g) return `<div class="group-goal"><strong>${c.label}</strong><div class="muted">Goal not set yet.</div></div>`;
      const needed=Math.ceil(Number(g.target)*31);
      return `<div class="group-goal">
        <div class="group-goal-head"><strong>${c.label}</strong><span>${Math.round(Number(g.target)*100)}% · ${needed} days · difficulty #${g.rank}</span></div>
        <div class="goal-definition">${escapeHtml(g.description?.trim() || "No detailed definition added.")}</div>
      </div>`;
    }).join("");
    return `<div class="player-goals">
      <div class="player-goals-title">${escapeHtml(p.name)}${p.playerId===session.playerId?" · you":""}</div>
      <div class="player-goal-grid">${cards}</div>
    </div>`;
  }).join("");
}

function renderAudit(){
  const rows=(state.randomChecks||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const wrap=$("#auditLog");
  if(!rows.length){
    wrap.innerHTML=`<div class="empty-state">No random checks have been created yet. Each day's check appears when that day arrives.</div>`;
    return;
  }
  wrap.innerHTML=`<div class="audit-table-wrap"><table class="audit-table">
    <thead><tr><th>Date</th><th>Player</th><th>Category</th><th>Goal definition</th><th>Status</th><th>Reviewed by</th></tr></thead>
    <tbody>${rows.map(r=>{
      const player=state.players.find(p=>p.playerId===r.playerId);
      const reviewer=state.players.find(p=>p.playerId===r.reviewedBy);
      const cat=CATEGORIES.find(c=>c.key===r.category);
      return `<tr>
        <td>${escapeHtml(prettyDate(r.date))}</td>
        <td>${escapeHtml(player?.name||"Player")}</td>
        <td>${cat?.label||escapeHtml(r.category)}</td>
        <td>${escapeHtml(goalDefinition(r.playerId,r.category))}</td>
        <td><span class="status-chip ${(r.status||"Pending").toLowerCase()}">${escapeHtml(r.status||"Pending")}</span></td>
        <td>${escapeHtml(reviewer?.name || (r.reviewedBy ? "Player" : "—"))}</td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function renderGame(){
  $("#groupLabel").textContent=`GROUP ${session.groupCode} • ${state.players.length}/3 PLAYERS`; $("#welcomeText").textContent=`${session.name}'s Health Quest`; $("#challengeStatus").textContent=challengeText(); $("#myXp").textContent=totalXP(session.playerId);
  renderDatePicker(); renderDailyTasks(); renderRandomCheck(); renderLeaderboard(); renderProgress(); renderGroupGoals(); renderAudit();
}
function escapeHtml(s){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

$("#joinBtn").addEventListener("click",join);
$("#saveGoalsBtn").addEventListener("click",saveGoals);
$("#saveCheckinBtn").addEventListener("click",saveCheckin);
$("#refreshBtn").addEventListener("click",()=>refreshState());
$("#editGoalsBtn").addEventListener("click",()=>{ show("setupView"); renderGoalEditor(); });
$("#datePicker").addEventListener("change",async e=>{ selectedDate=e.target.value; await refreshState(true); });
$("#verificationButtons").addEventListener("click",e=>{ const status=e.target.dataset.status; if(status) setVerification(status); });
$("#logoutBtn").addEventListener("click",()=>{ clearSession(); $("#joinBtn").textContent="Join challenge"; show("connectView"); });

window.addEventListener("online",()=>{ if(session) refreshState(true); });

(async function init(){
  if(!configured()){ show("connectView"); setMessage($("#connectMsg"),"This copy is not connected yet. Follow README.md and paste your Apps Script /exec URL into config.js.","error"); return; }
  if(session) await refreshState(); else show("connectView");
})();