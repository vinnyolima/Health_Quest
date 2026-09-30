/**
 * Health Quest — Google Sheets backend
 * Bound this script to the Google Sheet that will store your challenge data.
 * Run setupHealthQuest() once, then deploy as a Web App.
 */

const HQ = {
  START: '2026-10-01',
  END: '2026-10-31',
  MAX_PLAYERS: 3,
  CATEGORIES: ['diet','water','stretch','exercise'],
  SHEETS: {
    CONFIG: 'Config', PLAYERS: 'Players', GOALS: 'Goals', CHECKINS: 'Checkins', RANDOM: 'RandomChecks'
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Health Quest')
    .addItem('Initialize / repair sheets', 'setupHealthQuest')
    .addToUi();
}

function setupHealthQuest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ensureSheet_(ss, HQ.SHEETS.CONFIG, ['Key','Value']);
  ensureSheet_(ss, HQ.SHEETS.PLAYERS, ['PlayerId','Name','JoinedAt']);
  ensureSheet_(ss, HQ.SHEETS.GOALS, ['PlayerId','Category','DifficultyRank','Target']);
  ensureSheet_(ss, HQ.SHEETS.CHECKINS, ['Date','PlayerId','Category','Done','Extra','UpdatedAt']);
  ensureSheet_(ss, HQ.SHEETS.RANDOM, ['Date','PlayerId','Category','Status','UpdatedAt']);

  const cfg = readConfig_();
  if (!cfg.GroupCode) setConfig_('GroupCode', randomCode_(6));
  if (!cfg.GroupPIN) setConfig_('GroupPIN', String(Math.floor(1000 + Math.random()*9000)));
  setConfig_('ChallengeStart', HQ.START);
  setConfig_('ChallengeEnd', HQ.END);
  setConfig_('MaxPlayers', String(HQ.MAX_PLAYERS));

  formatSheets_();
  SpreadsheetApp.flush();
  const now = readConfig_();
  SpreadsheetApp.getUi().alert(
    'Health Quest is ready!\n\nGroup code: ' + now.GroupCode + '\nGroup PIN: ' + now.GroupPIN +
    '\n\nNext: Deploy this Apps Script as a Web App (execute as you; access: Anyone).'
  );
}

function doGet() {
  return json_({ok:true, name:'Health Quest API', version:1});
}

function doPost(e) {
  try {
    const action = String(e.parameter.action || '');
    const payload = JSON.parse(e.parameter.payload || '{}');
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      switch (action) {
        case 'join': return json_(join_(payload));
        case 'getState': return json_(getState_(payload));
        case 'saveGoals': return json_(saveGoals_(payload));
        case 'saveCheckin': return json_(saveCheckin_(payload));
        case 'setVerification': return json_(setVerification_(payload));
        default: throw new Error('Unknown action.');
      }
    } finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ok:false, error: err && err.message ? err.message : String(err)});
  }
}

function join_(p) {
  verifyGroup_(p);
  const name = cleanName_(p.name);
  if (!name) throw new Error('Enter a name.');
  const sheet = sheet_(HQ.SHEETS.PLAYERS);
  const rows = dataRows_(sheet);
  let found = rows.find(r => String(r[1]).toLowerCase() === name.toLowerCase());
  let playerId;
  if (found) {
    playerId = String(found[0]);
  } else {
    if (rows.length >= HQ.MAX_PLAYERS) throw new Error('This challenge already has 3 players.');
    playerId = Utilities.getUuid().slice(0,8);
    sheet.appendRow([playerId, name, new Date()]);
  }
  return {ok:true, player:{playerId:playerId, name:name}};
}

function getState_(p) {
  verifyGroup_(p);
  const players = dataRows_(sheet_(HQ.SHEETS.PLAYERS)).map(r => ({playerId:String(r[0]),name:String(r[1])}));
  if (p.playerId && !players.some(x => x.playerId === String(p.playerId))) throw new Error('Player not found.');
  const goals = dataRows_(sheet_(HQ.SHEETS.GOALS)).map(r => ({playerId:String(r[0]),category:String(r[1]),rank:Number(r[2]),target:Number(r[3])}));
  const checkins = dataRows_(sheet_(HQ.SHEETS.CHECKINS)).map(r => ({date:dateString_(r[0]),playerId:String(r[1]),category:String(r[2]),done:toBool_(r[3]),extra:toBool_(r[4])}));
  const date = validChallengeDate_(p.date || todayString_());
  const randomCheck = date ? getOrCreateRandomCheck_(date, players) : null;
  return {ok:true,state:{players:players,goals:goals,checkins:checkins,randomCheck:randomCheck}};
}

function saveGoals_(p) {
  verifyGroup_(p); verifyPlayer_(p.playerId);
  if (!Array.isArray(p.goals) || p.goals.length !== 4) throw new Error('Four goals are required.');
  const ranks = p.goals.map(g => Number(g.rank)).sort().join(',');
  if (ranks !== '1,2,3,4') throw new Error('Use each difficulty rank once.');
  p.goals.forEach(g => {
    if (HQ.CATEGORIES.indexOf(String(g.category)) < 0) throw new Error('Invalid category.');
    if ([0.6,0.7,0.8,0.9,1].indexOf(Number(g.target)) < 0) throw new Error('Invalid target.');
  });
  const sheet = sheet_(HQ.SHEETS.GOALS);
  deleteRowsWhere_(sheet, r => String(r[0]) === String(p.playerId));
  p.goals.forEach(g => sheet.appendRow([String(p.playerId),String(g.category),Number(g.rank),Number(g.target)]));
  return {ok:true};
}

function saveCheckin_(p) {
  verifyGroup_(p); verifyPlayer_(p.playerId);
  const date = validChallengeDate_(p.date); if (!date) throw new Error('Check-ins must be dated October 1–31, 2026.');
  if (!Array.isArray(p.entries) || p.entries.length !== 4) throw new Error('Four check-in entries are required.');
  const sheet = sheet_(HQ.SHEETS.CHECKINS);
  p.entries.forEach(entry => {
    const category=String(entry.category); if(HQ.CATEGORIES.indexOf(category)<0) throw new Error('Invalid category.');
    upsertCheckin_(sheet,date,String(p.playerId),category,!!entry.done,!!entry.extra);
  });
  return {ok:true};
}

function setVerification_(p) {
  verifyGroup_(p); verifyPlayer_(p.playerId);
  const date = validChallengeDate_(p.date); if (!date) throw new Error('Invalid challenge date.');
  const allowed=['Verified','Failed','Excused']; if(allowed.indexOf(String(p.status))<0) throw new Error('Invalid verification status.');
  const players = dataRows_(sheet_(HQ.SHEETS.PLAYERS)).map(r=>({playerId:String(r[0]),name:String(r[1])}));
  const rc = getOrCreateRandomCheck_(date, players);
  const randomSheet = sheet_(HQ.SHEETS.RANDOM);
  const rows = dataRowsWithRow_(randomSheet);
  const row = rows.find(x=>dateString_(x.values[0])===date);
  if(!row) throw new Error('Random check not found.');
  randomSheet.getRange(row.row,4,1,2).setValues([[String(p.status),new Date()]]);
  if(String(p.status)==='Failed') {
    const checkSheet=sheet_(HQ.SHEETS.CHECKINS);
    upsertCheckin_(checkSheet,date,rc.playerId,rc.category,false,false);
  }
  return {ok:true};
}

function getOrCreateRandomCheck_(date, players) {
  if (!date || !players.length) return null;
  const sheet=sheet_(HQ.SHEETS.RANDOM);
  const rows=dataRowsWithRow_(sheet);
  const existing=rows.find(x=>dateString_(x.values[0])===date);
  if(existing) return {date:date,playerId:String(existing.values[1]),category:String(existing.values[2]),status:String(existing.values[3]||'Pending')};
  if (date > todayString_()) return null; // Do not reveal/create future assignments.

  const cfg=readConfig_();
  const h=hash_(String(cfg.GroupCode)+'|'+date);
  const player=players[h % players.length];
  const category=HQ.CATEGORIES[Math.floor(h / Math.max(1,players.length)) % HQ.CATEGORIES.length];
  sheet.appendRow([date,player.playerId,category,'Pending',new Date()]);
  return {date:date,playerId:player.playerId,category:category,status:'Pending'};
}

function verifyGroup_(p) {
  const cfg=readConfig_();
  if (!cfg.GroupCode || !cfg.GroupPIN) throw new Error('Spreadsheet is not initialized. Run setupHealthQuest() first.');
  if (String(p.groupCode||'').toUpperCase() !== String(cfg.GroupCode).toUpperCase() || String(p.pin||'') !== String(cfg.GroupPIN)) throw new Error('Incorrect group code or PIN.');
}
function verifyPlayer_(playerId) {
  const exists=dataRows_(sheet_(HQ.SHEETS.PLAYERS)).some(r=>String(r[0])===String(playerId));
  if(!exists) throw new Error('Player not found.');
}
function validChallengeDate_(value) { const d=dateString_(value); return d>=HQ.START && d<=HQ.END ? d : null; }
function cleanName_(name) { return String(name||'').trim().replace(/[<>]/g,'').slice(0,24); }
function toBool_(v) { return v===true || String(v).toLowerCase()==='true' || String(v).toLowerCase()==='yes'; }
function todayString_(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd'); }
function dateString_(v){
  if(v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone() || 'America/New_York','yyyy-MM-dd');
  const s=String(v||'').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}
function hash_(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h,16777619); } return h>>>0; }
function randomCode_(n){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let out=''; for(let i=0;i<n;i++) out+=chars[Math.floor(Math.random()*chars.length)]; return out; }

function upsertCheckin_(sheet,date,playerId,category,done,extra){
  const rows=dataRowsWithRow_(sheet); const found=rows.find(x=>dateString_(x.values[0])===date && String(x.values[1])===playerId && String(x.values[2])===category);
  const values=[date,playerId,category,done,extra,new Date()];
  if(found) sheet.getRange(found.row,1,1,6).setValues([values]); else sheet.appendRow(values);
}
function deleteRowsWhere_(sheet,predicate){
  const rows=dataRowsWithRow_(sheet).filter(x=>predicate(x.values)).map(x=>x.row).sort((a,b)=>b-a); rows.forEach(r=>sheet.deleteRow(r));
}
function sheet_(name){ const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if(!s) throw new Error('Missing sheet: '+name+'. Run setupHealthQuest().'); return s; }
function dataRows_(sheet){ const last=sheet.getLastRow(); return last<2?[]:sheet.getRange(2,1,last-1,sheet.getLastColumn()).getValues(); }
function dataRowsWithRow_(sheet){ return dataRows_(sheet).map((values,i)=>({row:i+2,values:values})); }
function ensureSheet_(ss,name,headers){ let s=ss.getSheetByName(name); if(!s) s=ss.insertSheet(name); if(s.getLastRow()===0) s.appendRow(headers); else s.getRange(1,1,1,headers.length).setValues([headers]); return s; }
function readConfig_(){ const rows=dataRows_(sheet_(HQ.SHEETS.CONFIG)); const o={}; rows.forEach(r=>{if(r[0]) o[String(r[0])]=String(r[1]);}); return o; }
function setConfig_(key,value){ const sheet=sheet_(HQ.SHEETS.CONFIG); const rows=dataRowsWithRow_(sheet); const f=rows.find(x=>String(x.values[0])===key); if(f) sheet.getRange(f.row,2).setValue(value); else sheet.appendRow([key,value]); }
function formatSheets_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(); Object.values(HQ.SHEETS).forEach(name=>{ const s=ss.getSheetByName(name); if(!s) return; s.setFrozenRows(1); const lastCol=Math.max(1,s.getLastColumn()); s.getRange(1,1,1,lastCol).setFontWeight('bold').setBackground('#1f6655').setFontColor('#ffffff'); s.autoResizeColumns(1,lastCol); });
  const cfg=ss.getSheetByName(HQ.SHEETS.CONFIG); if(cfg) cfg.setColumnWidths(1,2,180);
}
function json_(obj){ return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
