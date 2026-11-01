import { API_URL } from "./config.js?v=9";

const CATEGORIES = [
  { key:"diet", label:"🥗 Diet" },
  { key:"water", label:"💧 Water" },
  { key:"stretch", label:"🧘 Stretch Mind/Body" },
  { key:"exercise", label:"🏋️ Exercise" }
];

const WEEKLY_CATEGORIES = [
  { key:"fitness", label:"🏃 Fitness" },
  { key:"nutrition", label:"🥑 Nutrition" },
  { key:"mindfulness", label:"🧠 Spiritual / Mindfulness" }
];

const MAJOR_XP_BY_RANK = {"1":800,"2":600,"3":400,"4":200};
const WEEKLY_XP = 30;
const START = "2026-11-01";
const END = "2026-12-31";
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

function setMessage(el,text="",kind=""){
  el.textContent=text;
  el.classList.remove("error","success");
  if(kind) el.classList.add(kind);
}

function configured(){
  return API_URL && !API_URL.includes("PASTE_YOUR_") && API_URL.startsWith("https://");
}

function isoToday(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function dateFromIso(s){
  const [y,m,d]=s.split("-").map(Number);
  return new Date(y,m-1,d,12,0,0);
}

function isoFromDate(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function addDays(iso,n){
  const d=dateFromIso(iso); d.setDate(d.getDate()+n); return isoFromDate(d);
}

function challengeDates(){
  const out=[];
  for(let d=START; d<=END; d=addDays(d,1)) out.push(d);
  return out;
}

function currentChallengeDate(){
  const t=isoToday();
  if(t<START) return START;
  if(t>END) return END;
  return t;
}

function currentWeekStart(){
  const t=isoToday();
  if(t<START || t>END) return null;
  const d=dateFromIso(t);
  d.setDate(d.getDate()-d.getDay());
  const s=isoFromDate(d);
  return s<START ? START : s;
}

function prettyDate(iso){
  return dateFromIso(iso).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
}

function prettyWeek(iso){
  const end=addDays(iso,6)>END?END:addDays(iso,6);
  return `${prettyDate(iso)} – ${prettyDate(end)}`;
}

function challengeText(){
  const t=isoToday();
  if(t<START){
    const days=Math.ceil((dateFromIso(START)-new Date())/86400000);
    return `Starts November 1 • ${Math.max(0,days)} days to go`;
  }
  if(t>END) return "November + December challenge complete";
  const remaining=Math.round((dateFromIso(END)-dateFromIso(t))/86400000);
  return `${remaining} days remaining after today`;
}

async function api(action,payload={}){
  if(!configured()) throw new Error("The Google Apps Script URL has not been added to config.js yet.");
  const body=new URLSearchParams();
  body.set("action",action);
  body.set("payload",JSON.stringify(payload));
  const res=await fetch(API_URL,{method:"POST",body});
  if(!res.ok) throw new Error(`Server error (${res.status})`);
  const data=await res.json();
  if(!data.ok) throw new Error(data.error||"Request failed");
  return data;
}

function authPayload(extra={}){
  return {groupCode:session?.groupCode||"",pin:session?.pin||"",playerId:session?.playerId||"",...extra};
}

async function join(){
  const groupCode=$("#groupCode").value.trim().toUpperCase();
  const pin=$("#groupPin").value.trim();
  const name=$("#playerName").value.trim();
  const avatar=$("#playerAvatar").value.trim();
  if(!groupCode||!pin||!name) return setMessage($("#connectMsg"),"Enter the group code, PIN, and your name.","error");

  setMessage($("#connectMsg"),"Joining…");
  $("#joinBtn").disabled=true;
  try{
    const data=await api("join",{groupCode,pin,name,avatar});
    session={groupCode,pin,playerId:data.player.playerId,name:data.player.name,avatar:data.player.avatar||""};
    saveSession();
    await refreshState();
  }catch(e){
    setMessage($("#connectMsg"),e.message,"error");
  }finally{
    $("#joinBtn").disabled=false;
  }
}

async function refreshState(silent=false){
  if(!session){
    $("#joinBtn").textContent="Join challenge";
    return show("connectView");
  }
  try{
    const data=await api("getState",authPayload({date:selectedDate}));
    state=data.state;
    const me=state.players.find(p=>p.playerId===session.playerId);
    if(!me) throw new Error("Your player was not found in the spreadsheet.");
    session.name=me.name;
    session.avatar=me.avatar||"";
    saveSession();

    if(!hasSetup(session.playerId)){
      show("setupView");
      renderSetup();
    }else{
      show("gameView");
      renderGame();
    }
  }catch(e){
    if(!silent){
      show("connectView");
      $("#groupCode").value=session.groupCode||"";
      $("#groupPin").value=session.pin||"";
      $("#playerName").value=session.name||"";
      $("#playerAvatar").value=session.avatar||"";
      $("#joinBtn").textContent="Reconnect";
      setMessage($("#connectMsg"),"Couldn’t connect. Your saved player is still on this device. "+e.message,"error");
    }
  }
}

function goalsFor(playerId){
  const obj={};
  (state.goals||[]).filter(g=>g.playerId===playerId).forEach(g=>obj[g.category]=g);
  return obj;
}

function weeklyTasksFor(playerId){
  return (state.weeklyTasks||[]).filter(t=>t.playerId===playerId);
}

function hasSetup(playerId){
  const goals=goalsFor(playerId);
  const tasks=weeklyTasksFor(playerId);
  const goalReady=CATEGORIES.every(c=>goals[c.key]);
  const taskReady=WEEKLY_CATEGORIES.every(c=>tasks.filter(t=>t.category===c.key).length===1);
  return goalReady && taskReady;
}

function goalDefinition(playerId,category){
  return goalsFor(playerId)[category]?.description?.trim() || "No detailed definition added.";
}

function checkin(playerId,date,cat){
  return (state.checkins||[]).find(x=>x.playerId===playerId && x.date===date && x.category===cat);
}

function completedCount(playerId,cat){
  return challengeDates().reduce((n,d)=>n+(checkin(playerId,d,cat)?.done?1:0),0);
}

function majorReward(rank){
  return MAJOR_XP_BY_RANK[String(rank)]||0;
}

function majorProgressXPForCategory(playerId,cat){
  const g=goalsFor(playerId)[cat];
  if(!g) return 0;
  const totalDays=challengeDates().length;
  const needed=Math.ceil(Number(g.target)*totalDays);
  const done=Math.min(completedCount(playerId,cat),needed);
  return Math.round(majorReward(g.rank)*done/needed);
}

function majorXP(playerId){
  return CATEGORIES.reduce((sum,c)=>sum+majorProgressXPForCategory(playerId,c.key),0);
}

function streakXP(playerId,cat){
  let run=0,xp=0;
  for(const d of challengeDates()){
    if(checkin(playerId,d,cat)?.done){
      run++;
      if(run%5===0) xp+=10;
    }else run=0;
  }
  return xp;
}

function extraXP(playerId){
  return (state.checkins||[]).filter(x=>x.playerId===playerId && x.extra).length*5;
}

function randomCheckXP(playerId){
  return (state.randomChecks||[]).filter(r=>
    String(r.playerId)===String(playerId) && r.status==="Verified"
  ).length*5;
}

function weeklyXP(playerId){
  return (state.weeklyAssignments||[]).filter(a=>
    String(a.playerId)===String(playerId) && a.status==="Completed"
  ).length*WEEKLY_XP;
}

function totalXP(playerId){
  return majorXP(playerId)
    + CATEGORIES.reduce((s,c)=>s+streakXP(playerId,c.key),0)
    + extraXP(playerId)
    + randomCheckXP(playerId)
    + weeklyXP(playerId);
}

function renderSetup(){
  $("#setupPlayerName").textContent=session.name;
  $("#setupAvatar").value=session.avatar||"";
  renderGoalEditor();
  renderWeeklyTaskEditor();
  const locked=isoToday()>=START && hasSetup(session.playerId);
  $("#saveGoalsBtn").disabled=locked;
  if(locked) setMessage($("#goalMsg"),"Your setup is locked because the challenge has started.","error");
  else setMessage($("#goalMsg"),"");
}

function renderGoalEditor(){
  const wrap=$("#goalEditor");
  wrap.innerHTML="";
  const existing=goalsFor(session.playerId);
  const defaults={diet:{rank:3,target:.8},water:{rank:4,target:.9},stretch:{rank:1,target:.7},exercise:{rank:2,target:.8}};

  for(const c of CATEGORIES){
    const row=$("#goalRowTemplate").content.firstElementChild.cloneNode(true);
    row.dataset.category=c.key;
    row.querySelector(".goal-title").textContent=c.label;

    const rank=row.querySelector(".rank-select");
    const target=row.querySelector(".target-select");
    const description=row.querySelector(".description-input");
    const reward=row.querySelector(".goal-reward");

    rank.value=String(existing[c.key]?.rank ?? defaults[c.key].rank);
    target.value=String(existing[c.key]?.target ?? defaults[c.key].target);
    description.value=existing[c.key]?.description || "";

    const update=()=>reward.textContent=`${majorReward(rank.value)} XP max`;
    rank.addEventListener("change",update);
    update();
    wrap.appendChild(row);
  }
}

function renderWeeklyTaskEditor(){
  const wrap=$("#weeklyTaskEditor");
  wrap.innerHTML="";
  const existing=weeklyTasksFor(session.playerId);

  for(const category of WEEKLY_CATEGORIES){
    const section=document.createElement("div");
    section.className="task-pool-section";
    const current=existing.find(t=>t.category===category.key);
    section.innerHTML=`<div class="task-pool-title">${category.label}</div>
      <label>Weekly challenge idea
        <textarea class="weekly-task-input" data-category="${category.key}" maxlength="220" rows="3" placeholder="Make this a challenging one-week task.">${escapeHtml(current?.taskText||"")}</textarea>
      </label>`;
    wrap.appendChild(section);
  }
}

async function saveSetup(){
  const goalRows=[...document.querySelectorAll(".goal-row")];
  const ranks=goalRows.map(r=>r.querySelector(".rank-select").value);
  if(new Set(ranks).size!==4) return setMessage($("#goalMsg"),"Use each difficulty rank exactly once.","error");

  const goals=goalRows.map(r=>({
    category:r.dataset.category,
    rank:Number(r.querySelector(".rank-select").value),
    target:Number(r.querySelector(".target-select").value),
    description:r.querySelector(".description-input").value.trim()
  }));

  const weeklyTasks=[...document.querySelectorAll(".weekly-task-input")].map(el=>({
    category:el.dataset.category,
    taskText:el.value.trim()
  }));
  const avatar=$("#setupAvatar").value.trim();

  if(weeklyTasks.some(t=>!t.taskText)){
    return setMessage($("#goalMsg"),"Please fill in all 3 weekly challenge ideas.","error");
  }

  $("#saveGoalsBtn").disabled=true;
  setMessage($("#goalMsg"),"Saving…");
  try{
    await api("saveSetup",authPayload({goals,weeklyTasks,avatar}));
    setMessage($("#goalMsg"),"Challenge setup saved.","success");
    await refreshState(true);
  }catch(e){
    setMessage($("#goalMsg"),e.message,"error");
  }finally{
    $("#saveGoalsBtn").disabled=false;
  }
}

function renderDatePicker(){
  const picker=$("#datePicker");
  picker.innerHTML=challengeDates().map(d=>`<option value="${d}">${prettyDate(d)}</option>`).join("");
  picker.value=selectedDate;
}

function renderDailyTasks(){
  $("#checkinDateLabel").textContent=prettyDate(selectedDate);
  const wrap=$("#dailyTasks");
  wrap.innerHTML="";

  for(const c of CATEGORIES){
    const x=checkin(session.playerId,selectedDate,c.key)||{};
    const row=document.createElement("div");
    row.className="task-row";
    row.dataset.category=c.key;
    row.innerHTML=`<div class="task-name"><strong>${c.label}</strong><small>${escapeHtml(goalDefinition(session.playerId,c.key))}</small></div>
      <label class="check-toggle"><input class="done" type="checkbox"> Done</label>
      <label class="check-toggle extra-toggle"><input class="extra" type="checkbox"> Extra +5</label>`;
    row.querySelector(".done").checked=!!x.done;
    row.querySelector(".extra").checked=!!x.extra;
    wrap.appendChild(row);
  }
}

async function saveCheckin(){
  const entries=[...document.querySelectorAll(".task-row")].map(r=>({
    category:r.dataset.category,
    done:r.querySelector(".done").checked,
    extra:r.querySelector(".extra").checked
  }));

  $("#saveCheckinBtn").disabled=true;
  setMessage($("#checkinMsg"),"Saving…");
  try{
    await api("saveCheckin",authPayload({date:selectedDate,entries}));
    setMessage($("#checkinMsg"),"Saved ✓","success");
    await refreshState(true);
  }catch(e){
    setMessage($("#checkinMsg"),e.message,"error");
  }finally{
    $("#saveCheckinBtn").disabled=false;
  }
}

function renderWeeklyAssignments(){
  const week=currentWeekStart();
  const wrap=$("#weeklyAssignments");

  if(!week){
    $("#weeklyTitle").textContent=isoToday()<START?"Weekly challenges start Nov 1":"Weekly challenge complete";
    wrap.innerHTML=`<div class="empty-state">No active weekly challenge right now.</div>`;
    return;
  }

  $("#weeklyTitle").textContent=prettyWeek(week);
  const rows=(state.weeklyAssignments||[]).filter(a=>a.weekStart===week);

  if(rows.length<state.players.length){
    wrap.innerHTML=`<div class="empty-state">Waiting for all 3 players to submit their 3 weekly challenge ideas before this week's task can be drawn.</div>`;
    return;
  }

  // One shared task for the whole group. The backend keeps one row per player only
  // so completion and XP can be tracked separately.
  const shared=rows[0];
  const cat=WEEKLY_CATEGORIES.find(x=>x.key===shared.category);
  const mine=rows.find(a=>a.playerId===session.playerId);

  const completionSummary=state.players.map(p=>{
    const a=rows.find(x=>x.playerId===p.playerId);
    const done=a?.status==="Completed";
    return `<span class="pill">${escapeHtml(p.avatar||"🙂")} ${escapeHtml(p.name)}: ${done?"✓ Done":"Pending"}</span>`;
  }).join(" ");

  wrap.innerHTML=`<div class="weekly-assignment mine">
    <div>
      <div class="weekly-player">🌍 Group weekly challenge</div>
      <div class="weekly-category">${cat?.label||escapeHtml(shared.category)}</div>
      <div class="weekly-task-text">${escapeHtml(shared.taskText)}</div>
      <div class="weekly-group-status" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">${completionSummary}</div>
    </div>
    <div class="weekly-action">
      <span class="status-chip ${(mine?.status||"Pending").toLowerCase()}">${escapeHtml(mine?.status||"Pending")}</span>
      <button class="weekly-complete-btn" data-week="${shared.weekStart}" data-completed="${mine?.status==="Completed"?"false":"true"}">${mine?.status==="Completed"?"Undo":"Mark complete +30 XP"}</button>
    </div>
  </div>`;
}

async function setWeeklyCompletion(weekStart,completed){
  setMessage($("#weeklyMsg"),"Saving…");
  try{
    await api("setWeeklyCompletion",authPayload({weekStart,completed}));
    setMessage($("#weeklyMsg"),completed?"Weekly challenge completed! +30 XP":"Weekly completion removed.","success");
    await refreshState(true);
  }catch(e){
    setMessage($("#weeklyMsg"),e.message,"error");
  }
}

function renderRandomCheck(){
  const rc=state.randomCheck;
  const chip=$("#verificationStatus");
  const status=rc?.status||"Pending";
  chip.textContent=status;
  chip.className="status-chip "+status.toLowerCase();

  const box=$("#randomCheckBox");
  if(!rc){
    box.innerHTML=`<div class="muted">No random check is available for this date yet.</div>`;
    $("#verificationButtons").classList.add("hidden");
    return;
  }

  const p=state.players.find(x=>x.playerId===rc.playerId);
  const c=CATEGORIES.find(x=>x.key===rc.category);
  const claim=checkin(rc.playerId,selectedDate,rc.category)?.done;

  box.innerHTML=`<div class="muted">${prettyDate(selectedDate)}</div>
    <div class="random-name">${escapeHtml(p?.avatar||"🙂")} ${escapeHtml(p?.name||"Player")}</div>
    <div class="random-category">${c?.label||escapeHtml(rc.category)}</div>
    <div class="audit-definition"><strong>Goal definition:</strong> ${escapeHtml(goalDefinition(rc.playerId,rc.category))}</div>
    <p class="muted">Claimed complete: <strong>${claim?"Yes":"Not yet"}</strong></p>
    <p class="muted">Verified assigned player earns +5 XP.</p>`;

  $("#verificationButtons").classList.remove("hidden");
}

async function setVerification(status){
  try{
    await api("setVerification",authPayload({date:selectedDate,status}));
    await refreshState(true);
  }catch(e){
    alert(e.message);
  }
}

function renderLeaderboard(){
  const list=state.players.map(p=>({...p,xp:totalXP(p.playerId)})).sort((a,b)=>b.xp-a.xp);
  const max=Math.max(1,...list.map(x=>x.xp));

  $("#leaderboard").innerHTML=list.map((p,i)=>{
    const streak=CATEGORIES.reduce((s,c)=>s+streakXP(p.playerId,c.key),0);
    return `<div class="leader-row">
      <div class="rank">#${i+1}</div>
      <div>
        <div class="leader-name">${escapeHtml(p.avatar||"🙂")} ${escapeHtml(p.name)}${p.playerId===session.playerId?" · you":""}</div>
        <div class="bar"><span style="width:${Math.round(p.xp/max*100)}%"></span></div>
        <div class="progress-meta">${majorXP(p.playerId)} major · ${weeklyXP(p.playerId)} weekly · ${streak} streak · ${extraXP(p.playerId)} extra · ${randomCheckXP(p.playerId)} random</div>
      </div>
      <div class="leader-score">${p.xp} XP</div>
    </div>`;
  }).join("");
}

function renderProgress(){
  const totalDays=challengeDates().length;
  const goals=goalsFor(session.playerId);

  $("#progressGrid").innerHTML=CATEGORIES.map(c=>{
    const g=goals[c.key];
    const done=completedCount(session.playerId,c.key);
    const needed=Math.ceil(Number(g.target)*totalDays);
    const pct=Math.min(100,Math.round(done/needed*100));
    const majorMax=majorReward(g.rank);
    const majorEarned=majorProgressXPForCategory(session.playerId,c.key);
    return `<div class="progress-card">
      <div class="progress-title">${c.label}</div>
      <div class="progress-number">${done}/${needed}</div>
      <div class="muted">${Math.round(Number(g.target)*100)}% target · difficulty #${g.rank}</div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="xp-breakdown">${majorEarned}/${majorMax} major XP · ${streakXP(session.playerId,c.key)} streak XP</div>
    </div>`;
  }).join("");
}

function renderGroupGoals(){
  const wrap=$("#groupGoals");
  const totalDays=challengeDates().length;

  wrap.innerHTML=state.players.map(p=>{
    const goals=goalsFor(p.playerId);
    return `<div class="player-goals">
      <div class="player-goals-title">${escapeHtml(p.avatar||"🙂")} ${escapeHtml(p.name)}${p.playerId===session.playerId?" · you":""}</div>
      <div class="player-goal-grid">
        ${CATEGORIES.map(c=>{
          const g=goals[c.key];
          if(!g) return `<div class="group-goal"><strong>${c.label}</strong><div class="muted">Not set yet.</div></div>`;
          const needed=Math.ceil(Number(g.target)*totalDays);
          return `<div class="group-goal">
            <div class="group-goal-head"><strong>${c.label}</strong><span>${needed} days · #${g.rank} · ${majorReward(g.rank)} XP</span></div>
            <div class="goal-definition">${escapeHtml(g.description||"No description.")}</div>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  }).join("");
}

function renderWeeklyHistory(){
  const rows=(state.weeklyAssignments||[]).slice().sort((a,b)=>b.weekStart.localeCompare(a.weekStart)||a.playerId.localeCompare(b.playerId));
  const wrap=$("#weeklyHistory");

  if(!rows.length){
    wrap.innerHTML=`<div class="empty-state">No weekly assignments have been created yet.</div>`;
    return;
  }

  wrap.innerHTML=`<div class="audit-table-wrap"><table class="audit-table">
    <thead><tr><th>Week</th><th>Player</th><th>Category</th><th>Challenge</th><th>Status</th><th>XP</th></tr></thead>
    <tbody>${rows.map(a=>{
      const p=state.players.find(x=>x.playerId===a.playerId);
      const cat=WEEKLY_CATEGORIES.find(x=>x.key===a.category);
      return `<tr>
        <td>${escapeHtml(prettyWeek(a.weekStart))}</td>
        <td>${escapeHtml(p?.avatar||"🙂")} ${escapeHtml(p?.name||"Player")}</td>
        <td>${cat?.label||escapeHtml(a.category)}</td>
        <td>${escapeHtml(a.taskText)}</td>
        <td><span class="status-chip ${a.status.toLowerCase()}">${escapeHtml(a.status)}</span></td>
        <td>${a.status==="Completed"?WEEKLY_XP:0} XP</td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function renderAudit(){
  const rows=(state.randomChecks||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const wrap=$("#auditLog");

  if(!rows.length){
    wrap.innerHTML=`<div class="empty-state">No random checks have been created yet.</div>`;
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
        <td>${escapeHtml(player?.avatar||"🙂")} ${escapeHtml(player?.name||"Player")}</td>
        <td>${cat?.label||escapeHtml(r.category)}</td>
        <td>${escapeHtml(goalDefinition(r.playerId,r.category))}</td>
        <td><span class="status-chip ${(r.status||"Pending").toLowerCase()}">${escapeHtml(r.status||"Pending")}</span>${r.status==="Verified"?" · +5 XP":""}</td>
        <td>${escapeHtml(reviewer?.name||(r.reviewedBy?"Player":"—"))}</td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}

function renderGame(){
  $("#groupLabel").textContent=`GROUP ${session.groupCode} • ${state.players.length}/3 PLAYERS`;
  $("#welcomeText").textContent=`${session.avatar||"🙂"} ${session.name}'s Health Quest`;
  $("#challengeStatus").textContent=challengeText();
  $("#myXp").textContent=totalXP(session.playerId);
  $("#editGoalsBtn").classList.toggle("hidden",isoToday()>=START);

  renderWeeklyAssignments();
  renderDatePicker();
  renderDailyTasks();
  renderRandomCheck();
  renderLeaderboard();
  renderProgress();
  renderGroupGoals();
  renderWeeklyHistory();
  renderAudit();
}

function escapeHtml(s){
  const d=document.createElement("div");
  d.textContent=s??"";
  return d.innerHTML;
}

$("#joinBtn").addEventListener("click",join);
$("#saveGoalsBtn").addEventListener("click",saveSetup);
$("#saveCheckinBtn").addEventListener("click",saveCheckin);
$("#refreshBtn").addEventListener("click",()=>refreshState());
$("#editGoalsBtn").addEventListener("click",()=>{show("setupView");renderSetup();});
$("#datePicker").addEventListener("change",async e=>{selectedDate=e.target.value;await refreshState(true);});
$("#verificationButtons").addEventListener("click",e=>{const status=e.target.dataset.status;if(status)setVerification(status);});
$("#weeklyAssignments").addEventListener("click",e=>{
  const btn=e.target.closest(".weekly-complete-btn");
  if(!btn) return;
  setWeeklyCompletion(btn.dataset.week,btn.dataset.completed==="true");
});
$("#logoutBtn").addEventListener("click",()=>{clearSession();$("#joinBtn").textContent="Join challenge";show("connectView");});
window.addEventListener("online",()=>{if(session)refreshState(true);});

(async function init(){
  if(!configured()){
    show("connectView");
    setMessage($("#connectMsg"),"This copy is not connected yet. Add your Apps Script /exec URL to config.js.","error");
    return;
  }
  if(session) await refreshState();
  else show("connectView");
})();
