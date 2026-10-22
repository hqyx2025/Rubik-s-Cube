import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PracticeTimer,formatElapsed} from '../rubiks-cube/timer.js';

test('practice timer starts, pauses, resumes and ends without including paused time',()=>{
  let now=100;const t=new PracticeTimer(()=>now);
  assert.equal(t.status,'idle');assert.equal(t.end(),false);assert.equal(t.pause(),false);
  t.start();now=1350;assert.equal(t.elapsed(),1250);assert.equal(t.start(),false);
  t.pause();now=10000;assert.equal(t.elapsed(),1250);assert.equal(t.status,'paused');
  t.start();now=10325;t.end();assert.equal(t.elapsed(),1575);assert.equal(t.status,'ended');
  now=20000;assert.equal(t.elapsed(),1575);t.start();assert.equal(t.elapsed(),0);now+=500;assert.equal(t.elapsed(),500);
  t.reset();assert.equal(t.elapsed(),0);assert.equal(t.status,'idle');
});

test('saved running timers resume paused while retaining elapsed time; invalid timer data is ignored',()=>{
  let now=0;const t=new PracticeTimer(()=>now);t.start();now=60005;
  const restored=PracticeTimer.restore(t.serialize(),()=>now);assert.equal(restored.status,'paused');assert.equal(restored.elapsed(),60005);
  now+=10000;assert.equal(restored.elapsed(),60005);restored.start();now+=100;assert.equal(restored.elapsed(),60105);
  restored.end();assert.equal(PracticeTimer.restore(restored.serialize()).status,'ended');
  for(const data of [null,{status:'running',elapsedMs:-1},{status:'bad',elapsedMs:0},{status:'paused',elapsedMs:Infinity}])assert.equal(PracticeTimer.restore(data).status,'idle');
});

test('elapsed display supports centiseconds and durations longer than an hour',()=>{
  assert.equal(formatElapsed(0),'00:00.00');assert.equal(formatElapsed(61239),'01:01.23');assert.equal(formatElapsed(3600000),'1:00:00.00');assert.equal(formatElapsed(36012300),'10:00:12.30');
});
