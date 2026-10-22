import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exampleFor} from '../rubiks-cube/curriculum.js';
import {formulaTargets,targetProgress} from '../rubiks-cube/targets.js';
import {applyMove,inverse,createState} from '../rubiks-cube/model.js';

const rows=JSON.parse(readFileSync(new URL('../rubiks-cube/formulas.json',import.meta.url),'utf8'));
test('F2L tracks the entire target corner and edge pair, not a moving layer',()=>{
  for(const f of rows.filter(f=>f.size===3&&f.stage==='f2l')){
    const example=exampleFor(f),targets=formulaTargets(f,example.state,example.moves);
    assert.equal(targets.groups.length,2);assert.equal(targets.stickerIds.length,5);
    assert.ok(targets.groups.some(g=>g.label==='白蓝红角块'));assert.ok(targets.groups.some(g=>g.label==='蓝红棱块'));
    let state=example.state;const fixedIds=[...targets.stickerIds];
    for(const m of example.moves){state=applyMove(state,m);assert.deepEqual(targets.stickerIds,fixedIds);}
    assert.deepEqual(targetProgress(targets,state).labels.map(g=>g.arrived),[true,true]);
    for(const m of example.moves.slice().reverse())state=applyMove(state,inverse(m));assert.deepEqual(state,example.state);
  }
});

test('every playable formula has complete physical target pieces and reaches its target',()=>{
  const canonical=new Map([3,4].map(n=>[n,createState(n)]));
  for(const f of rows.filter(f=>f.alg)){
    const e=exampleFor(f),targets=formulaTargets(f,e.state,e.moves);assert.ok(targets.groups.length,f.id);
    assert.equal(new Set(targets.stickerIds).size,targets.stickerIds.length);
    for(const g of targets.groups){
      const stickers=canonical.get(f.size).stickers.filter(t=>g.ids.includes(t.id)),position=stickers[0].p.map((v,i)=>v-stickers[0].n[i]);
      assert.equal(stickers.length,g.ids.length);
      for(const t of stickers)assert.deepEqual(t.p.map((v,i)=>v-t.n[i]),position,f.id+' mixed pieces');
      assert.equal(canonical.get(f.size).stickers.filter(t=>t.p.every((v,i)=>v-t.n[i]===position[i])).length,g.ids.length,f.id+' missing a face');
    }
    let state=e.state;for(const m of e.moves)state=applyMove(state,m);
    const progress=targetProgress(targets,state);assert.equal(progress.complete,progress.total,f.id);
    if(f.stage.startsWith('parity'))assert.ok(targets.groups.every(g=>g.ids.length===2),f.id+' must focus wing pairs');
    if(f.stage==='centers')assert.ok(targets.groups.every(g=>g.ids.length===1));
    if(f.stage==='edges')assert.ok(targets.groups.every(g=>g.ids.length===2));
  }
});

test('target result checks orientation separately from placement and does not pretend arbitrary applications are solved',()=>{
  const f=rows.find(f=>f.id==='3-f2l-1'),e=exampleFor(f),targets=formulaTargets(f,e.state,e.moves);
  assert.equal(targetProgress(targets,e.state).complete,0);
  let unrelated=applyMove(createState(3),{axis:'z',lo:2,hi:2,turns:1});
  for(const m of e.moves)unrelated=applyMove(unrelated,m);
  assert.ok(targetProgress(targets,unrelated).complete<2);
  const oll=rows.find(f=>f.id==='3-oll-27'),oe=exampleFor(oll),ot=formulaTargets(oll,oe.state,oe.moves);
  assert.equal(ot.rule,'orientation');let oriented=oe.state;for(const m of oe.moves)oriented=applyMove(oriented,m);
  oriented=applyMove(oriented,{axis:'y',lo:2,hi:2,turns:1});assert.equal(targetProgress(ot,oriented).complete,ot.groups.length);
});
