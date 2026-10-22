import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exampleFor, recognition, stepExplanation, LESSONS, diagramMarkup} from '../rubiks-cube/curriculum.js';
import {applyMove, inverse, createState, parseFormula, validateState, solved, cellOf, faceOf} from '../rubiks-cube/model.js';

const formulas=JSON.parse(readFileSync(new URL('../rubiks-cube/formulas.json',import.meta.url),'utf8'));
test('complete CFOP and four-order learning stages have real, reversible examples',()=>{
  assert.equal(new Set(formulas.map(f=>f.id)).size,formulas.length);
  for(const [stage,count] of [['f2l',41],['oll',57],['pll',21],['basic',36]])assert.equal(formulas.filter(f=>f.size===3&&f.stage===stage).length,count);
  for(const size of [3,4])for(const lesson of LESSONS[size])assert.ok(formulas.some(f=>f.size===size&&f.stage===lesson.id&&f.alg),`${size}/${lesson.id} missing playable example`);
  for(const f of formulas.filter(f=>f.alg)){
    const example=exampleFor(f);let state=example.state;
    assert.ok(validateState(state),f.id);assert.equal(example.steps.length,example.moves.length);assert.ok(recognition(f));
    example.moves.forEach((m,i)=>{assert.ok(stepExplanation(m,f.size));assert.ok(example.steps[i].token);const before=state;state=applyMove(state,m);assert.deepEqual(applyMove(state,inverse(m)),before,f.id);});
    assert.ok(solved(state),f.id);assert.ok(diagramMarkup(f).includes('<svg'));
  }
});

test('OLL covers 57 distinct orientation cases and preserves F2L; PLL is already oriented',()=>{
  const signatures=new Set();
  for(const f of formulas.filter(f=>f.size===3&&['oll','pll'].includes(f.stage))){
    const initial=exampleFor(f).state;
    for(const t of initial.stickers){const center=t.p.map((v,i)=>v-t.n[i]);if(center[1]<2)assert.equal(t.color,faceOf(t),f.id+' breaks F2L');}
    if(f.stage==='pll')assert.ok(initial.stickers.filter(t=>cellOf(t,3).face==='U').every(t=>t.color==='U'),f.id+' PLL not oriented');
    else {
      let s=initial;const views=[];
      for(let i=0;i<4;i++){
        views.push(s.stickers.filter(t=>t.color==='U').map(t=>{const c=cellOf(t,3);return `${c.face}/${c.row}/${c.col}`;}).sort().join('|'));
        s=applyMove(s,{axis:'y',lo:2,hi:2,turns:1});
      }
      const key=views.sort()[0];assert.ok(!signatures.has(key),'duplicate OLL case '+f.id);signatures.add(key);
    }
  }
  assert.equal(signatures.size,57);
});

test('all 41 F2L examples preserve the cross and the three other completed slots',()=>{
  for(const f of formulas.filter(f=>f.size===3&&f.stage==='f2l')){
    for(const t of exampleFor(f).state.stickers){
      const p=t.p.map((v,i)=>v-t.n[i]);
      if(p[1]<2&&!(p[0]===2&&p[2]===2))assert.equal(t.color,faceOf(t),f.id+' disrupts another slot or cross');
    }
  }
});

test('four-order parity examples keep solved centers and paired wings',()=>{
  for(const f of formulas.filter(f=>f.size===4&&f.stage.startsWith('parity'))){
    const state=exampleFor(f).state,edges=new Map();
    for(const t of state.stickers){
      const c=cellOf(t,4);if(c.row>0&&c.row<3&&c.col>0&&c.col<3)assert.equal(t.color,c.face,f.id+' center');
      const p=t.p.map((v,i)=>v-t.n[i]),extremes=p.map((v,i)=>Math.abs(v)===3?`${i}/${Math.sign(v)}`:'').filter(Boolean);
      if(extremes.length===2){const group=extremes.join('|');if(!edges.has(group))edges.set(group,new Map());const faces=edges.get(group);if(!faces.has(c.face))faces.set(c.face,[]);faces.get(c.face).push(t.color);}
    }
    assert.equal(edges.size,12);for(const group of edges.values())for(const colors of group.values()){assert.equal(colors.length,2);assert.equal(new Set(colors).size,1,f.id+' wing pair');}
  }
});

test('four-order notation distinguishes a single inner layer from two wide layers',()=>{
  assert.deepEqual(parseFormula('2R2',4),[{axis:'x',lo:2,hi:2,turns:-2}]);
  assert.deepEqual(parseFormula('Rw2',4),[{axis:'x',lo:2,hi:3,turns:-2}]);
  assert.deepEqual(parseFormula('3Rw',4),[{axis:'x',lo:1,hi:3,turns:-1}]);
  assert.deepEqual(parseFormula('2L',4),[{axis:'x',lo:1,hi:1,turns:1}]);
  for(const text of ['M','E','S','5Rw'])assert.throws(()=>parseFormula(text,4));
  assert.throws(()=>parseFormula('(R U)20 '.repeat(20),4));
  for(const f of formulas.filter(f=>f.size===4&&f.stage.startsWith('reduced'))){const moves=parseFormula(f.alg,4);assert.ok(moves.every(m=>m.lo===m.hi&&(m.lo===0||m.lo===3)),f.id+' should use outer layers');}
});
