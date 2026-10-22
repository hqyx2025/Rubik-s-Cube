import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,applyMove,faceMove,inverse,solved,parseFormula,validateState,projection,orbitPoint,cellOf,settleAngle,affects} from '../rubiks-cube/model.js';
import {CubeSession} from '../rubiks-cube/session.js';
import {buildOrbits,orbitKey,distanceToPath} from '../rubiks-cube/model.js';

test('every order, axis and contiguous slice preserves sticker identity and inverse moves',()=>{
  for(let size=2;size<=7;size++){
    const initial=createState(size);assert.equal(initial.stickers.length,6*size*size);
    for(const axis of ['x','y','z'])for(let lo=0;lo<size;lo++)for(let hi=lo;hi<size;hi++)for(const turns of [-2,-1,1,2]){
      const move={axis,lo,hi,turns},next=applyMove(initial,move);assert.ok(validateState(next));assert.deepEqual(applyMove(next,inverse(move)),initial);
      let four=initial;for(let i=0;i<4;i++)four=applyMove(four,{...move,turns:1});assert.deepEqual(four,initial);
      const slots=new Set(next.stickers.map(t=>{const c=cellOf(t,size);assert.ok(c.row>=0&&c.row<size&&c.col>=0&&c.col<size);return `${c.face}/${c.row}/${c.col}`;}));assert.equal(slots.size,6*size*size);
      if(lo===0&&hi===size-1)assert.ok(solved(next));
    }
  }
});
test('circular projection endpoints and intermediate trajectories follow actual rotated stickers',()=>{
  for(let n=2;n<=7;n++){
    const state=createState(n),{project}=projection(n),points=state.stickers.map(t=>project(t.p));
    assert.equal(new Set(points.map(p=>p.map(x=>x.toFixed(6)).join(','))).size,6*n*n);
    for(const axis of ['x','y','z']){
      const move={axis,lo:0,hi:n-1,turns:1},turned=applyMove(state,move);
      state.stickers.forEach((t,i)=>{const end=orbitPoint(t,axis,Math.PI/2,project),actual=project(turned.stickers[i].p);assert.ok(Math.hypot(end[0]-actual[0],end[1]-actual[1])<1e-5);for(const angle of [.15,.53,.9,1.2])assert.ok(orbitPoint(t,axis,angle,project).every(Number.isFinite));});
    }
  }
});
test('every sticker has an actual orbit on every axis, including fixed centers and intermediate angles',()=>{
  for(let n=2;n<=7;n++){
    const initial=createState(n),state=applyMove(initial,{axis:'y',lo:0,hi:n-1,turns:-1}),{project}=projection(n),groups=new Map(buildOrbits(state).map(g=>[g.id,g]));
    const paths=new Map([...groups].map(([id,g])=>[id,g.fixed?null:Array.from({length:129},(_,i)=>orbitPoint(g.representative,g.axis,i/128*2*Math.PI,project))]));
    for(const t of state.stickers)for(const axis of ['x','y','z']){
      const id=orbitKey(t,axis),group=groups.get(id);assert.ok(group?.ids.includes(t.id));assert.ok(group.layers.includes((t.p['xyz'.indexOf(axis)]-t.n['xyz'.indexOf(axis)]+n-1)/2));
      for(const angle of [0,.31,1.17,2.44,4.92]){const p=orbitPoint(t,axis,angle,project);if(group.fixed)assert.ok(Math.hypot(p[0]-project(t.p)[0],p[1]-project(t.p)[1])<1e-7);else assert.ok(distanceToPath(p,paths.get(id))<.3,`${n}/${t.id}/${axis} left its orbit`);}
    }
  }
});
test('formulas parse simultaneous wide turns, rotations and strict errors without partial execution',()=>{
  const moves=parseFormula("(R U R' U')2 r F2 M x'");assert.equal(moves.length,12);assert.deepEqual(moves[8],{axis:'x',lo:1,hi:2,turns:-1});
  let s=createState(3);for(const m of moves)s=applyMove(s,m);for(const m of moves.slice().reverse())s=applyMove(s,inverse(m));assert.deepEqual(s,createState(3));
  for(const text of ['R OOPS','(R U','R)','4Rw','(R)999'])assert.throws(()=>parseFormula(text));assert.throws(()=>parseFormula('M',4));
});
test('history supports atomic scramble undo, branching and verified local recovery',()=>{
  const session=new CubeSession(3),r=faceMove('R',3),u=faceMove('U',3);
  session.commit([r],'R');session.commit([r,u],'打乱','scramble');assert.equal(session.steps,0);assert.equal(session.events.length,2);
  session.seek(1);assert.equal(session.steps,1);assert.deepEqual(session.state,applyMove(createState(3),r));
  session.seek(2);const restored=CubeSession.restore(JSON.parse(JSON.stringify(session.serialize())));assert.deepEqual(restored.state,session.state);
  session.seek(1);session.commit([u],'U');assert.equal(session.events.length,2);assert.equal(session.steps,2);
  const broken=structuredClone(session.serialize());broken.state.stickers[0].color='bad';assert.throws(()=>CubeSession.restore(broken));
  const mismatch=structuredClone(session.serialize());mismatch.cursor=0;assert.throws(()=>CubeSession.restore(mismatch));
});
test('release thresholds and cancelled gestures do not manufacture extra turns',()=>{
  assert.equal(settleAngle(44),0);assert.equal(settleAngle(46),90);assert.equal(settleAngle(134),90);assert.equal(settleAngle(136),180);
  assert.equal(settleAngle(20,150),90);assert.equal(settleAngle(8,150),0);assert.equal(settleAngle(170,300),180);assert.equal(settleAngle(-170,-300),-180);
  const state=createState(7),move={axis:'x',lo:1,hi:4,turns:1};assert.ok(state.stickers.some(t=>affects(t,move,7)));assert.equal(validateState({...state,stickers:state.stickers.slice(1)}),false);
});
test('long histories checkpoint old moves without losing current state or count',()=>{
  const session=new CubeSession(2),move=faceMove('R',2);for(let i=0;i<2004;i++)session.commit([move],'R');
  assert.equal(session.events.length,2000);assert.equal(session.steps,2004);assert.ok(solved(session.state));
  const restored=CubeSession.restore(JSON.parse(JSON.stringify(session.serialize())));assert.deepEqual(restored.state,session.state);assert.equal(restored.steps,2004);restored.seek(0);assert.equal(restored.steps,4);assert.ok(solved(restored.state));
});
test('mixed legal moves and their reverse preserve all orders after sustained sequences',()=>{
  let seed=8351;const rand=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let n=2;n<=7;n++){const moves=[];let state=createState(n);for(let i=0;i<100;i++){const lo=Math.floor(rand()*n),hi=lo+Math.floor(rand()*(n-lo)),m={axis:['x','y','z'][Math.floor(rand()*3)],lo,hi,turns:[-2,-1,1,2][Math.floor(rand()*4)]};moves.push(m);state=applyMove(state,m);assert.ok(validateState(state));}for(const m of moves.reverse())state=applyMove(state,inverse(m));assert.deepEqual(state,createState(n));}
});
