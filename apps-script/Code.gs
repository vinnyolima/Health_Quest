/**
 * Health Quest — Nov + Dec 2026 backend v9
 * Daily goals + 5-day streaks + daily random checks + weekly challenge pool.
 */

const HQ = {
  ROUND_ID: '2026-NOV-DEC',
  START: '2026-11-01',
  END: '2026-12-31',
  MAX_PLAYERS: 3,
  CATEGORIES: ['diet','water','stretch','exercise'],
  WEEKLY_CATEGORIES: ['fitness','nutrition','mindfulness'],
  SHEETS: {
    CONFIG: 'Config',
    PLAYERS: 'Players',
    GOALS: 'Goals',
    CHECKINS: 'Checkins',
    RANDOM: 'RandomChecks',
    WEEKLY_TASKS: 'WeeklyTasks',
    WEEKLY_ASSIGNMENTS: 'WeeklyAssignments'
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Health Quest')
    .addItem('Initialize / repair Nov-Dec challenge', 'setupHealthQuest')
    .addToUi();
}

function setupHealthQuest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss,HQ.SHEETS.CONFIG,['Key','Value']);
  ensureSheet_(ss,HQ.SHEETS.PLAYERS,['PlayerId','Name','JoinedAt','Avatar']);
  ensureSheet_(ss,HQ.SHEETS.GOALS,['PlayerId','Category','DifficultyRank','Target','Description','RoundId']);
  ensureSheet_(ss,HQ.SHEETS.CHECKINS,['Date','PlayerId','Category','Done','Extra','UpdatedAt']);
  ensureSheet_(ss,HQ.SHEETS.RANDOM,['Date','PlayerId','Category','Status','UpdatedAt','ReviewedBy']);
  ensureSheet_(ss,HQ.SHEETS.WEEKLY_TASKS,['TaskId','PlayerId','Category','TaskText','CreatedAt','RoundId']);
  ensureSheet_(ss,HQ.SHEETS.WEEKLY_ASSIGNMENTS,['WeekStart','PlayerId','TaskId','Category','TaskText','Status','CompletedAt']);

  const cfg=readConfig_();
  if(!cfg.GroupCode) setConfig_('GroupCode',randomCode_(6));
  if(!cfg.GroupPIN) setConfig_('GroupPIN',String(Math.floor(1000+Math.random()*9000)));
  setConfig_('ChallengeStart',HQ.START);
  setConfig_('ChallengeEnd',HQ.END);
  setConfig_('MaxPlayers',String(HQ.MAX_PLAYERS));

  formatSheets_();
  SpreadsheetApp.flush();

  const now=readConfig_();
  SpreadsheetApp.getUi().alert(
    'Nov-Dec Health Quest is ready!\\n\\nGroup code: '+now.GroupCode+
    '\\nGroup PIN: '+now.GroupPIN+
    '\\n\\nExisting October check-ins/random checks were preserved but are not used in the new Nov-Dec scoring.'
  );
}

function doGet(){
  return json_({ok:true,name:'Health Quest API',version:9});
}

function doPost(e){
  try{
    const action=String(e.parameter.action||'');
    const payload=JSON.parse(e.parameter.payload||'{}');
    const lock=LockService.getScriptLock();
    lock.waitLock(10000);
    try{
      switch(action){
        case 'join': return json_(join_(payload));
        case 'getState': return json_(getState_(payload));
        case 'saveSetup': return json_(saveSetup_(payload));
        case 'saveCheckin': return json_(saveCheckin_(payload));
        case 'setVerification': return json_(setVerification_(payload));
        case 'setWeeklyCompletion': return json_(setWeeklyCompletion_(payload));
        default: throw new Error('Unknown action.');
      }
    }finally{ lock.releaseLock(); }
  }catch(err){
    return json_({ok:false,error:err&&err.message?err.message:String(err)});
  }
}

function join_(p){
  verifyGroup_(p);
  const name=cleanName_(p.name);
  if(!name) throw new Error('Enter a name.');

  const avatar=cleanAvatar_(p.avatar);
  const sheet=sheet_(HQ.SHEETS.PLAYERS);
  const rows=dataRowsWithRow_(sheet);
  const found=rows.find(r=>String(r.values[1]).toLowerCase()===name.toLowerCase());

  let playerId;
  let savedAvatar=avatar;
  if(found){
    playerId=String(found.values[0]);
    if(avatar){
      sheet.getRange(found.row,4).setValue(avatar);
    }else{
      savedAvatar=String(found.values[3]||'');
    }
  }else{
    if(rows.length>=HQ.MAX_PLAYERS) throw new Error('This challenge already has 3 players.');
    playerId=Utilities.getUuid().slice(0,8);
    sheet.appendRow([playerId,name,new Date(),avatar]);
  }
  return {ok:true,player:{playerId:playerId,name:name,avatar:savedAvatar}};
}

function getState_(p){
  verifyGroup_(p);

  const players=dataRows_(sheet_(HQ.SHEETS.PLAYERS)).map(r=>({
    playerId:String(r[0]),name:String(r[1]),avatar:String(r[3]||'')
  }));
  if(p.playerId && !players.some(x=>x.playerId===String(p.playerId))) throw new Error('Player not found.');

  const goals=dataRows_(sheet_(HQ.SHEETS.GOALS)).map(r=>({
    playerId:String(r[0]),
    category:String(r[1]),
    rank:Number(r[2]),
    target:Number(r[3]),
    description:String(r[4]||''),
    roundId:String(r[5]||'')
  })).filter(g=>g.roundId===HQ.ROUND_ID);

  const checkins=dataRows_(sheet_(HQ.SHEETS.CHECKINS)).map(r=>({
    date:dateString_(r[0]),
    playerId:String(r[1]),
    category:String(r[2]),
    done:toBool_(r[3]),
    extra:toBool_(r[4])
  })).filter(r=>r.date>=HQ.START && r.date<=HQ.END);

  const weeklyTasks=dataRows_(sheet_(HQ.SHEETS.WEEKLY_TASKS)).map(r=>({
    taskId:String(r[0]),
    playerId:String(r[1]),
    category:String(r[2]),
    taskText:String(r[3]||''),
    roundId:String(r[5]||'')
  })).filter(t=>t.roundId===HQ.ROUND_ID);

  const requestedDate=validChallengeDate_(p.date||todayString_());
  const randomCheck=requestedDate?getOrCreateRandomCheck_(requestedDate,players):null;

  const randomChecks=dataRows_(sheet_(HQ.SHEETS.RANDOM)).map(r=>({
    date:dateString_(r[0]),
    playerId:String(r[1]),
    category:String(r[2]),
    status:String(r[3]||'Pending'),
    updatedAt:r[4] instanceof Date?r[4].toISOString():String(r[4]||''),
    reviewedBy:String(r[5]||'')
  })).filter(r=>r.date>=HQ.START && r.date<=HQ.END && r.date<=todayString_());

  const weekStart=currentWeekStart_();
  if(weekStart) getOrCreateWeeklyAssignments_(weekStart,players,weeklyTasks);

  const weeklyAssignments=dataRows_(sheet_(HQ.SHEETS.WEEKLY_ASSIGNMENTS)).map(r=>({
    weekStart:dateString_(r[0]),
    playerId:String(r[1]),
    taskId:String(r[2]),
    category:String(r[3]),
    taskText:String(r[4]||''),
    status:String(r[5]||'Pending'),
    completedAt:r[6] instanceof Date?r[6].toISOString():String(r[6]||'')
  })).filter(r=>r.weekStart>=HQ.START && r.weekStart<=HQ.END);

  return {ok:true,state:{
    players,goals,checkins,weeklyTasks,weeklyAssignments,randomCheck,randomChecks
  }};
}

function saveSetup_(p){
  verifyGroup_(p);
  verifyPlayer_(p.playerId);

  const existingGoals=dataRows_(sheet_(HQ.SHEETS.GOALS)).filter(r=>
    String(r[0])===String(p.playerId) && String(r[5]||'')===HQ.ROUND_ID
  );
  const existingTasks=dataRows_(sheet_(HQ.SHEETS.WEEKLY_TASKS)).filter(r=>
    String(r[1])===String(p.playerId) && String(r[5]||'')===HQ.ROUND_ID
  );
  const alreadyComplete=existingGoals.length>=4 && existingTasks.length>=3;
  if(todayString_()>=HQ.START && alreadyComplete){
    throw new Error('Challenge setup is locked because the Nov-Dec challenge has started.');
  }

  const avatar=cleanAvatar_(p.avatar);
  if(avatar){
    const playerSheet=sheet_(HQ.SHEETS.PLAYERS);
    const playerRow=dataRowsWithRow_(playerSheet).find(x=>String(x.values[0])===String(p.playerId));
    if(playerRow) playerSheet.getRange(playerRow.row,4).setValue(avatar);
  }

  if(!Array.isArray(p.goals)||p.goals.length!==4) throw new Error('Four daily goals are required.');
  const ranks=p.goals.map(g=>Number(g.rank)).sort().join(',');
  if(ranks!=='1,2,3,4') throw new Error('Use each difficulty rank once.');

  p.goals.forEach(g=>{
    if(HQ.CATEGORIES.indexOf(String(g.category))<0) throw new Error('Invalid daily category.');
    if([0.6,0.7,0.8,0.9,1].indexOf(Number(g.target))<0) throw new Error('Invalid target.');
    if(String(g.description||'').length>240) throw new Error('Goal descriptions must be 240 characters or fewer.');
  });

  if(!Array.isArray(p.weeklyTasks)||p.weeklyTasks.length!==3) throw new Error('Three weekly challenge ideas are required.');
  HQ.WEEKLY_CATEGORIES.forEach(cat=>{
    if(p.weeklyTasks.filter(t=>String(t.category)===cat).length!==1){
      throw new Error('Enter exactly 1 weekly task for each weekly category.');
    }
  });
  p.weeklyTasks.forEach(t=>{
    if(HQ.WEEKLY_CATEGORIES.indexOf(String(t.category))<0) throw new Error('Invalid weekly category.');
    const text=cleanTask_(t.taskText);
    if(!text) throw new Error('Weekly challenge tasks cannot be blank.');
  });

  const goalSheet=sheet_(HQ.SHEETS.GOALS);
  deleteRowsWhere_(goalSheet,r=>
    String(r[0])===String(p.playerId) && String(r[5]||'')===HQ.ROUND_ID
  );
  p.goals.forEach(g=>goalSheet.appendRow([
    String(p.playerId),String(g.category),Number(g.rank),Number(g.target),
    cleanDescription_(g.description),HQ.ROUND_ID
  ]));

  const taskSheet=sheet_(HQ.SHEETS.WEEKLY_TASKS);
  deleteRowsWhere_(taskSheet,r=>
    String(r[1])===String(p.playerId) && String(r[5]||'')===HQ.ROUND_ID
  );
  p.weeklyTasks.forEach(t=>taskSheet.appendRow([
    Utilities.getUuid().slice(0,8),
    String(p.playerId),
    String(t.category),
    cleanTask_(t.taskText),
    new Date(),
    HQ.ROUND_ID
  ]));

  return {ok:true};
}

function saveCheckin_(p){
  verifyGroup_(p);
  verifyPlayer_(p.playerId);

  const date=validChallengeDate_(p.date);
  if(!date) throw new Error('Check-ins must be dated Nov 1 – Dec 31, 2026.');
  if(!Array.isArray(p.entries)||p.entries.length!==4) throw new Error('Four check-in entries are required.');

  const sheet=sheet_(HQ.SHEETS.CHECKINS);
  p.entries.forEach(entry=>{
    const category=String(entry.category);
    if(HQ.CATEGORIES.indexOf(category)<0) throw new Error('Invalid category.');
    upsertCheckin_(sheet,date,String(p.playerId),category,!!entry.done,!!entry.extra);
  });

  return {ok:true};
}

function setVerification_(p){
  verifyGroup_(p);
  verifyPlayer_(p.playerId);

  const date=validChallengeDate_(p.date);
  if(!date) throw new Error('Invalid challenge date.');

  const allowed=['Verified','Failed','Excused'];
  if(allowed.indexOf(String(p.status))<0) throw new Error('Invalid verification status.');

  const players=dataRows_(sheet_(HQ.SHEETS.PLAYERS)).map(r=>({
    playerId:String(r[0]),name:String(r[1]),avatar:String(r[3]||'')
  }));

  const rc=getOrCreateRandomCheck_(date,players);
  const randomSheet=sheet_(HQ.SHEETS.RANDOM);
  const rows=dataRowsWithRow_(randomSheet);
  const row=rows.find(x=>dateString_(x.values[0])===date);
  if(!row) throw new Error('Random check not found.');

  randomSheet.getRange(row.row,4,1,3).setValues([[
    String(p.status),new Date(),String(p.playerId)
  ]]);

  if(String(p.status)==='Failed'){
    upsertCheckin_(sheet_(HQ.SHEETS.CHECKINS),date,rc.playerId,rc.category,false,false);
  }

  return {ok:true};
}

function setWeeklyCompletion_(p){
  verifyGroup_(p);
  verifyPlayer_(p.playerId);

  const weekStart=dateString_(p.weekStart);
  if(!isChallengeSunday_(weekStart)) throw new Error('Invalid weekly challenge week.');

  const sheet=sheet_(HQ.SHEETS.WEEKLY_ASSIGNMENTS);
  const row=dataRowsWithRow_(sheet).find(x=>
    dateString_(x.values[0])===weekStart &&
    String(x.values[1])===String(p.playerId)
  );

  if(!row) throw new Error('Weekly assignment not found.');

  const completed=!!p.completed;
  sheet.getRange(row.row,6,1,2).setValues([[
    completed?'Completed':'Pending',
    completed?new Date():''
  ]]);

  return {ok:true};
}

function getOrCreateRandomCheck_(date,players){
  if(!date||!players.length) return null;

  const sheet=sheet_(HQ.SHEETS.RANDOM);
  const rows=dataRowsWithRow_(sheet);
  const existing=rows.find(x=>dateString_(x.values[0])===date);

  if(existing) return {
    date:date,
    playerId:String(existing.values[1]),
    category:String(existing.values[2]),
    status:String(existing.values[3]||'Pending'),
    reviewedBy:String(existing.values[5]||'')
  };

  if(date>todayString_()) return null;

  // Fresh independent random draw, then persist it so refreshes never reroll.
  const player=players[Math.floor(Math.random()*players.length)];
  const category=HQ.CATEGORIES[Math.floor(Math.random()*HQ.CATEGORIES.length)];

  sheet.appendRow([date,player.playerId,category,'Pending',new Date(),'']);
  return {date,playerId:player.playerId,category,status:'Pending',reviewedBy:''};
}

function getOrCreateWeeklyAssignments_(weekStart,players,weeklyTasks){
  if(!weekStart||players.length!==HQ.MAX_PLAYERS) return [];
  if(weekStart>todayString_()) return [];

  const allReady=players.every(p=>{
    const mine=weeklyTasks.filter(t=>t.playerId===p.playerId);
    return HQ.WEEKLY_CATEGORIES.every(cat=>mine.filter(t=>t.category===cat).length===1);
  });
  if(!allReady) return [];

  const sheet=sheet_(HQ.SHEETS.WEEKLY_ASSIGNMENTS);
  const existing=dataRowsWithRow_(sheet).filter(x=>dateString_(x.values[0])===weekStart);

  players.forEach(player=>{
    const already=existing.find(x=>String(x.values[1])===String(player.playerId));
    if(already) return;

    const task=weeklyTasks[Math.floor(Math.random()*weeklyTasks.length)];
    sheet.appendRow([
      weekStart,
      player.playerId,
      task.taskId,
      task.category,
      task.taskText,
      'Pending',
      ''
    ]);
  });

  return dataRows_(sheet).filter(r=>dateString_(r[0])===weekStart);
}

function currentWeekStart_(){
  const today=todayString_();
  if(today<HQ.START||today>HQ.END) return null;

  const d=parseDate_(today);
  d.setDate(d.getDate()-d.getDay());
  const start=dateString_(d);
  return start<HQ.START?HQ.START:start;
}

function isChallengeSunday_(date){
  if(!date||date<HQ.START||date>HQ.END) return false;
  return parseDate_(date).getDay()===0;
}

function parseDate_(s){
  const parts=String(s).split('-').map(Number);
  return new Date(parts[0],parts[1]-1,parts[2],12,0,0);
}

function verifyGroup_(p){
  const cfg=readConfig_();
  if(!cfg.GroupCode||!cfg.GroupPIN) throw new Error('Spreadsheet is not initialized. Run setupHealthQuest() first.');
  if(
    String(p.groupCode||'').toUpperCase()!==String(cfg.GroupCode).toUpperCase() ||
    String(p.pin||'')!==String(cfg.GroupPIN)
  ) throw new Error('Incorrect group code or PIN.');
}

function verifyPlayer_(playerId){
  const exists=dataRows_(sheet_(HQ.SHEETS.PLAYERS)).some(r=>String(r[0])===String(playerId));
  if(!exists) throw new Error('Player not found.');
}

function validChallengeDate_(value){
  const d=dateString_(value);
  return d>=HQ.START&&d<=HQ.END?d:null;
}

function cleanName_(name){ return String(name||'').trim().replace(/[<>]/g,'').slice(0,24); }
function cleanAvatar_(value){ return String(value||'').trim().replace(/[<>]/g,'').slice(0,12); }
function cleanDescription_(value){ return String(value||'').trim().replace(/[<>]/g,'').slice(0,240); }
function cleanTask_(value){ return String(value||'').trim().replace(/[<>]/g,'').slice(0,220); }
function toBool_(v){ return v===true||String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes'; }

function todayString_(){
  return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||'America/New_York','yyyy-MM-dd');
}

function dateString_(v){
  if(v instanceof Date) return Utilities.formatDate(v,Session.getScriptTimeZone()||'America/New_York','yyyy-MM-dd');
  const s=String(v||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:'';
}

function randomCode_(n){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out='';
  for(let i=0;i<n;i++) out+=chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function upsertCheckin_(sheet,date,playerId,category,done,extra){
  const rows=dataRowsWithRow_(sheet);
  const found=rows.find(x=>
    dateString_(x.values[0])===date &&
    String(x.values[1])===playerId &&
    String(x.values[2])===category
  );
  const values=[date,playerId,category,done,extra,new Date()];
  if(found) sheet.getRange(found.row,1,1,6).setValues([values]);
  else sheet.appendRow(values);
}

function deleteRowsWhere_(sheet,predicate){
  const rows=dataRowsWithRow_(sheet)
    .filter(x=>predicate(x.values))
    .map(x=>x.row)
    .sort((a,b)=>b-a);
  rows.forEach(r=>sheet.deleteRow(r));
}

function sheet_(name){
  const s=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if(!s) throw new Error('Missing sheet: '+name+'. Run setupHealthQuest().');
  return s;
}

function dataRows_(sheet){
  const last=sheet.getLastRow();
  return last<2?[]:sheet.getRange(2,1,last-1,sheet.getLastColumn()).getValues();
}

function dataRowsWithRow_(sheet){
  return dataRows_(sheet).map((values,i)=>({row:i+2,values}));
}

function ensureSheet_(ss,name,headers){
  let s=ss.getSheetByName(name);
  if(!s) s=ss.insertSheet(name);
  if(s.getMaxColumns()<headers.length) s.insertColumnsAfter(s.getMaxColumns(),headers.length-s.getMaxColumns());
  if(s.getLastRow()===0) s.appendRow(headers);
  else s.getRange(1,1,1,headers.length).setValues([headers]);
  return s;
}

function readConfig_(){
  const rows=dataRows_(sheet_(HQ.SHEETS.CONFIG));
  const o={};
  rows.forEach(r=>{if(r[0]) o[String(r[0])]=String(r[1]);});
  return o;
}

function setConfig_(key,value){
  const sheet=sheet_(HQ.SHEETS.CONFIG);
  const rows=dataRowsWithRow_(sheet);
  const found=rows.find(x=>String(x.values[0])===key);
  if(found) sheet.getRange(found.row,2).setValue(value);
  else sheet.appendRow([key,value]);
}

function formatSheets_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  Object.values(HQ.SHEETS).forEach(name=>{
    const s=ss.getSheetByName(name);
    if(!s) return;
    s.setFrozenRows(1);
    const lastCol=Math.max(1,s.getLastColumn());
    s.getRange(1,1,1,lastCol)
      .setFontWeight('bold')
      .setBackground('#1f6655')
      .setFontColor('#ffffff');
    s.autoResizeColumns(1,lastCol);
  });

  const goals=ss.getSheetByName(HQ.SHEETS.GOALS);
  if(goals) goals.setColumnWidth(5,340);

  const weeklyTasks=ss.getSheetByName(HQ.SHEETS.WEEKLY_TASKS);
  if(weeklyTasks) weeklyTasks.setColumnWidth(4,420);

  const weeklyAssignments=ss.getSheetByName(HQ.SHEETS.WEEKLY_ASSIGNMENTS);
  if(weeklyAssignments) weeklyAssignments.setColumnWidth(5,420);
}

function json_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
