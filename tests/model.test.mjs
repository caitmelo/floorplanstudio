import test from 'node:test';
import assert from 'node:assert/strict';
import {newInspection, finalizationProblem, progress, compare, applyPropertyScan} from '../src/model.ts';
import {integrate, IDENTITY, distance, matrix} from '../src/panorama/pose.ts';
test('rounded progress must not permit finalization',()=>{
 const i=newInspection('ingoing');
 i.rooms[0].items=Array.from({length:250},(_,n)=>({id:String(n),name:'Item',condition:n?'good':'unreviewed',note:''})); i.rooms=i.rooms.slice(0,1);
 i.signatures=[{name:'Inspector',role:'Inspector',paths:['M 0 0 L 1 1'],signedAt:new Date().toISOString()}];
 assert.equal(progress(i).percent,100); assert.match(finalizationProblem(i),/Review every/);
 i.rooms[0].items[0].condition='good';assert.equal(finalizationProblem(i),undefined);
});
test('outgoing resets evidence and reviews without mutating baseline',()=>{
 const entry=newInspection('ingoing');entry.rooms[0].items[0].condition='good';entry.rooms[0].items[0].note='Original';
 const exit=newInspection('outgoing',entry); assert.equal(exit.baselineId,entry.id); assert.equal(exit.rooms[0].id,entry.rooms[0].id);
 assert.equal(exit.rooms[0].items[0].condition,'unreviewed'); assert.equal(exit.rooms[0].items[0].note,'');
 exit.rooms[0].items[0].condition='attention';assert.equal(entry.rooms[0].items[0].condition,'good'); assert.equal(compare(exit,entry).filter(x=>x.changed).length,1);
});
test('scan validation rejects unknown rooms before modifying an inspection',()=>{
 const i=newInspection('ingoing');const before=JSON.stringify(i);
 assert.throws(()=>applyPropertyScan(i,{plan:{surfaces:[]},rooms:[{roomId:'missing',plan:{surfaces:[]}}]})); assert.equal(JSON.stringify(i),before);
});
test('gyro integration preserves rotation norm and rejects long gaps',()=>{
 let q=IDENTITY;for(let n=0;n<100;n++) q=integrate(q,{alpha:0,beta:90,gamma:0},.01);
 assert.ok(Math.abs(distance(q,IDENTITY)-90)<1e-7);assert.ok(Math.abs(Math.hypot(...q)-1)<1e-12);
 assert.deepEqual(integrate(q,{alpha:1,beta:1,gamma:1},.3),q);
 const m=matrix(q);assert.ok(Math.abs(m[0]*m[0]+m[1]*m[1]+m[2]*m[2]-1)<1e-12);
});
