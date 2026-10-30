import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReminders, ownsReminder, createReminderController } from '../src/nativeReminders.js';

test('stable minute IDs, second zero and deduplication for prebuilt/custom times', () => {
  const result = buildReminders([{time_of_day:'12:00'}, {time_of_day:'09:00'}, {time_of_day:'09:00'}]);
  assert.deepEqual(result.map(n => n.id), [110540,110720]);
  assert.deepEqual(result[0].schedule, {on:{hour:9,minute:0,second:0},allowWhileIdle:true});
  assert.equal(result[0].channelId, 'apy_attendance_reminders_v2');
});
test('reject invalid clock strings and malformed items', () => {
  for (const time of ['24:00','12:60','1:00','09:00oops',null]) assert.throws(() => buildReminders([{time_of_day:time}]));
  assert.throws(() => buildReminders([null]));
});
test('ownership includes legacy reminders but preserves updates and tests', () => {
  for (const n of [{id:110540},{id:101},{id:103},{id:999},{id:300,extra:{type:'attendance_reminder'}}]) assert.equal(ownsReminder(n),true);
  for (const id of [9901,1000,55000,100,111440]) assert.equal(ownsReminder({id}),false);
});
function setup() {
  let pending=[{id:101},{id:9901},{id:1500}];
  const storage=new Map();
  const state={cancelled:[],scheduled:[],fail:false,config:{enabled:true,active_times:[{time_of_day:'09:00'}]}};
  const plugin={getPending:async()=>({notifications:pending}),cancel:async({notifications})=>{state.cancelled.push(...notifications.map(n=>n.id));pending=pending.filter(n=>!notifications.some(x=>x.id===n.id));},schedule:async({notifications})=>{if(state.fail)throw Error('device refused');state.scheduled.push(...notifications);pending.push(...notifications);}};
  const controller=createReminderController({plugin,initChannels:async()=>{},storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},isSessionCurrent:()=>state.externalCurrent !== false,fetchConfig:async()=>{if(state.offline)throw Error('offline');return state.config;}});
  controller.setSession('A','tokenA');
  return {controller,state,storage,plugin};
}
test('validation occurs before cancellation; only owned alarms cancelled', async () => {
 const {controller,state}=setup();
 await assert.rejects(async () => controller.save({enabled:true,active_times:[{time_of_day:'99:00'}]}));
 assert.deepEqual(state.cancelled,[]);
 await controller.save({enabled:true,active_times:[{time_of_day:'09:00'}]});
 assert.deepEqual(state.cancelled,[101]);
});
test('native failure rejects and never caches false success', async () => {
 const {controller,state,storage}=setup();state.fail=true;
 await assert.rejects(controller.save(state.config),/device refused/);assert.equal(storage.size,0);
});
test('offline reconciliation uses only current account last successful config', async () => {
 const {controller,state}=setup();await controller.save(state.config);state.offline=true;state.scheduled=[];
 await controller.reconcile();assert.equal(state.scheduled.length,1);
 controller.setSession('B','tokenB');state.scheduled=[];
 await assert.rejects(controller.reconcile(),/offline/);assert.equal(state.scheduled.length,0);
});
test('logout invalidates an in-flight schedule and clears only owned alarms', async () => {
 const {controller,state,plugin}=setup();let release;const original=plugin.schedule;
 plugin.schedule=async args=>{await new Promise(r=>release=r);await original(args);};
 const saving=controller.save(state.config);while(!release) await new Promise(r=>setImmediate(r));
 controller.setSession(null,null);const clearing=controller.clear();release();
 await assert.rejects(saving,/session changed/i);await clearing;
 assert.ok(state.cancelled.includes(110540));assert.ok(!state.cancelled.includes(9901));
});
test('older server fetch cannot overwrite a new preference save', async () => {
 const {controller,state}=setup();let release;
 const reconciliation=controller.reconcile(async()=>new Promise(r=>release=r));
 while(!release) await new Promise(r=>setImmediate(r));
 await controller.save({enabled:true,active_times:[{time_of_day:'12:00'}]});
 release(state.config);await reconciliation;
 assert.deepEqual(state.scheduled.map(n=>n.id),[110720]);
});

test('rejects more than 48 distinct times before touching alarms', async () => {
 const {controller,state}=setup();
 const times=Array.from({length:49},(_,i)=>({time_of_day:`00:${String(i).padStart(2,'0')}`}));
 await assert.rejects(async()=>controller.save({enabled:true,active_times:times}),/48/);
 assert.deepEqual(state.cancelled,[]);
});
test('a newer reconciliation wins over an older server response', async () => {
 const {controller,state}=setup();let release;
 const older=controller.reconcile(()=>new Promise(r=>release=r));
 while(!release) await new Promise(r=>setImmediate(r));
 await controller.reconcile(async()=>({enabled:true,active_times:[{time_of_day:'12:00'}]}));
 release(state.config);await older;
 assert.deepEqual(state.scheduled.map(n=>n.id),[110720]);
});
test('invalid server response must not reactivate cached enabled preferences', async () => {
 const {controller,state}=setup();await controller.save(state.config);state.scheduled=[];
 await assert.rejects(controller.reconcile(async()=>({enabled:false,active_times:[{time_of_day:'24:00'}]})),/HH:MM/);
 assert.deepEqual(state.scheduled,[]);
});
test('account change clears previous reminders before waiting for server preferences', async () => {
 const {controller,state}=setup();await controller.save(state.config);state.cancelled=[];
 controller.setSession('B','tokenB');let release;
 const pending=controller.reconcile(()=>new Promise(r=>release=r));
 while(!release) await new Promise(r=>setImmediate(r));
 assert.ok(state.cancelled.includes(110540));
 release({enabled:false,active_times:[]});await pending;
});
test('channel initialization failure preserves existing alarms', async () => {
 const {state}=setup();
 // Exercise the real controller with a failing device-channel boundary.
 const blocked=createReminderController({plugin:{getPending:async()=>{throw Error('must not cancel');}},initChannels:async()=>{throw Error('channel refused');},storage:{getItem:()=>null,setItem(){}},fetchConfig:async()=>state.config});
 blocked.setSession('A','token');await assert.rejects(blocked.save(state.config),/channel refused/);
 assert.deepEqual(state.cancelled,[]);
});
test('cancellation rejection propagates without scheduling replacement', async () => {
 const {controller,state,plugin,storage}=setup();plugin.cancel=async()=>{throw Error('cancel refused');};
 await assert.rejects(controller.save(state.config),/cancel refused/);
 assert.deepEqual(state.scheduled,[]);assert.equal(storage.size,0);
});
test('disabled configuration stays disabled during offline recovery', async () => {
 const {controller,state}=setup();await controller.save({enabled:false,active_times:[]});state.offline=true;
 await controller.reconcile();assert.deepEqual(state.scheduled,[]);
});

test('credential changes invalidate native completion even before React lifecycle reruns', async () => {
 const {controller,state,plugin,storage}=setup();let release;const original=plugin.schedule;
 plugin.schedule=async args=>{await new Promise(r=>release=r);await original(args);};
 const saving=controller.save(state.config);while(!release) await new Promise(r=>setImmediate(r));
 state.externalCurrent=false;release();await assert.rejects(saving,/session changed/i);
 assert.equal(storage.size,0);assert.ok(state.cancelled.includes(110540));
});
test('initial reconciliation validates server times before cancelling current reminders', async () => {
 const {controller,state}=setup();
 await assert.rejects(controller.reconcile(async()=>({enabled:true,active_times:[{time_of_day:'24:00'}]})),/HH:MM/);
 assert.deepEqual(state.cancelled,[]);
});
