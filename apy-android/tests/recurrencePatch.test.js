import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { patchReceiver } from '../scripts/patch-local-notifications.mjs';

test('receiver patch is version guarded and idempotent, preserves stored idle flag', () => {
 const source=readFileSync(new URL('../node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/TimedNotificationPublisher.java',import.meta.url),'utf8');
 assert.throws(()=>patchReceiver(source,'7.0.8'),/7.0.7/);
 assert.throws(()=>patchReceiver('unexpected source','7.0.7'),/source/);
 const patched=patchReceiver(source,'7.0.7');
 assert.equal(patchReceiver(patched,'7.0.7'),patched);
 assert.ok(patched.includes('savedSchedule.getBoolean("allowWhileIdle", false)'));
 assert.ok(patched.includes('ApyAlarmScheduler.schedule('));
});
test('real Java alarm helper retains wakeup/idle on repeated alarms; real calendar handles seconds and tomorrow', () => {
 const root=mkdtempSync(join(tmpdir(),'apy-alarm-test-'));
 const sources={
 'android/app/PendingIntent.java':'package android.app; public class PendingIntent {}',
 'android/app/AlarmManager.java':`package android.app; public class AlarmManager {
 public static final int RTC=1, RTC_WAKEUP=0; public String action; public int type;
 public void set(int t,long when,PendingIntent p){action="set";type=t;}
 public void setExact(int t,long when,PendingIntent p){action="exact";type=t;}
 public void setAndAllowWhileIdle(int t,long when,PendingIntent p){action="idle";type=t;}
 public void setExactAndAllowWhileIdle(int t,long when,PendingIntent p){action="exactIdle";type=t;}
 }`,
 'com/capacitorjs/plugins/localnotifications/AlarmHarness.java':`package com.capacitorjs.plugins.localnotifications;
 import android.app.*; import java.util.*;
 public class AlarmHarness { public static void main(String[] args) {
 AlarmManager a=new AlarmManager(); PendingIntent p=new PendingIntent();
 boolean[] values={false,true};
 for(boolean exact:values) for(boolean idle:values) {
 ApyAlarmScheduler.schedule(a,exact,idle,123,p);
 String expected=idle?(exact?"exactIdle":"idle"):(exact?"exact":"set");
 if(!expected.equals(a.action)||a.type!=(idle?AlarmManager.RTC_WAKEUP:AlarmManager.RTC))throw new AssertionError(expected);
 }
 TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
 Calendar c=Calendar.getInstance(); c.clear(); c.set(2026,9,30,8,30,47);
 DateMatch d=new DateMatch(); d.setHour(9);d.setMinute(0);d.setSecond(0);
 Calendar next=Calendar.getInstance();next.setTimeInMillis(d.nextTrigger(c.getTime()));
 if(next.get(Calendar.SECOND)!=0||next.get(Calendar.HOUR_OF_DAY)!=9)throw new AssertionError("second zero");
 c.set(2026,9,30,9,0,0);next.setTimeInMillis(d.nextTrigger(c.getTime()));
 if(next.get(Calendar.DAY_OF_MONTH)!=31)throw new AssertionError("tomorrow");
 System.out.println("four alarm branches and calendar boundaries passed");
 }} `
 };
 try {
 for(const [path,source] of Object.entries(sources)){const file=join(root,path);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,source);}
 const home=process.env.JAVA_HOME || (existsSync('/opt/homebrew/opt/openjdk@21/bin/javac') ? '/opt/homebrew/opt/openjdk@21' : null);
 const javac=home ? join(home,'bin/javac') : 'javac', java=home ? join(home,'bin/java') : 'java';
 execFileSync(javac,['-d',root,...Object.keys(sources).map(p=>join(root,p)),new URL('../patches/ApyAlarmScheduler.java',import.meta.url).pathname,new URL('../node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/DateMatch.java',import.meta.url).pathname]);
 assert.match(execFileSync(java,['-cp',root,'com.capacitorjs.plugins.localnotifications.AlarmHarness'],{encoding:'utf8'}),/passed/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
