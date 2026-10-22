import {createState, applyMove, FACE, FACES, cellOf} from './model.js';

const names = {U:'黄', D:'白', F:'蓝', B:'绿', L:'橙', R:'红'};
const center = t => t.p.map((v,i)=>v-t.n[i]);
const same = (a,b) => a.p.every((v,i)=>v===b.p[i]) && a.n.every((v,i)=>v===b.n[i]);

export function formulaTargets(formula, initial, moves) {
  const size=initial.size, canonical=createState(size), before=new Map(initial.stickers.map(t=>[t.id,t])),
    pieces=new Map(), reference=new Map(canonical.stickers.map(t=>[t.id,t]));
  let goal=initial;
  for(const move of moves)goal=applyMove(goal,move);
  const destination=new Map(goal.stickers.map(t=>[t.id,t]));
  for(const t of canonical.stickers){
    const p=center(t),key=p.join(',');
    if(!pieces.has(key))pieces.set(key,{key,p,ids:[],colors:[]});
    pieces.get(key).ids.push(t.id);pieces.get(key).colors.push(t.color);
  }
  const changed=p=>p.ids.some(id=>!same(before.get(id),reference.get(id))),
    max=size-1, stage=formula.stage, method=stage==='basic'?formula.method:stage,
    f2l=method==='f2l'||stage==='reduced-f2l',
    orientation=method==='oll'||stage==='reduced-oll'||stage==='parity-oll'||stage==='basic'&&/^[45] /.test(formula.section),
    cross=stage==='cross'||stage==='reduced-cross',
    pll=method==='pll'||stage==='reduced-pll'||stage==='parity-pll'||stage==='basic'&&/^[67] /.test(formula.section);
  let selected, title, rule=orientation?'orientation':'placement';
  if(f2l){
    selected=[...pieces.values()].filter(p=>p.p[0]===max&&p.p[2]===max&&(p.p[1]===-max||p.ids.length===2));
    title=size===3?'前右槽 · 角块与棱块配对归位':'前右槽 · 角块与整组翼棱配对归位';
  }else if(cross){
    selected=[...pieces.values()].filter(p=>p.ids.length===2&&p.p[1]===-max&&changed(p));
    title='底层十字 · 本例要插入的底色棱块';
  }else if(orientation){
    selected=[...pieces.values()].filter(p=>(stage==='parity-oll'?p.ids.length===2:p.ids.length>=2)&&p.colors.includes('U')&&p.ids.some(id=>{
      const t=before.get(id);return t.color==='U'&&!t.n.every((v,i)=>v===reference.get(id).n[i]);
    }));
    title=stage==='parity-oll'?'前上棱组 · 本例要翻正的两枚翼棱':'顶层朝向 · 本例需要翻正的角块与棱块';
  }else if(pll){
    selected=[...pieces.values()].filter(p=>(stage==='parity-pll'?p.ids.length===2:p.ids.length>=2)&&p.colors.includes('U')&&changed(p));
    title=stage==='parity-pll'?'顶层 · 本例需要换位的棱组':'顶层排列 · 本例需要换位的角块与棱块';
  }else if(stage==='centers'){
    selected=[...pieces.values()].filter(p=>p.ids.length===1&&changed(p));
    title='中心块 · 本例要整理的同色中心条';
  }else if(stage==='edges'){
    selected=[...pieces.values()].filter(p=>p.ids.length===2&&changed(p));
    title='合棱工作位 · 本例参与搬运和配对的翼棱';
  }else if(stage==='basic'&&/^[23] /.test(formula.section)){
    const left=formula.name.includes('左');
    selected=[...pieces.values()].filter(p=>p.p[0]===(left?-max:max)&&p.p[2]===max&&
      (/^2 /.test(formula.section)?p.p[1]===-max:p.ids.length===2));
    title=/^2 /.test(formula.section)?'底层角块 · 本例插入的角块':'中层 · 本例插入的棱块';
  }
  if(!selected?.length){
    selected=[...pieces.values()].filter(p=>p.ids.length>=2&&changed(p));
    title='本例目标 · 公式要调整的角块与棱块';rule='placement';
  }
  const groups=selected.map(p=>{
    const kind=p.ids.length===3?'角块':p.ids.length===2?(size===4?'翼棱':'棱块'):'中心块',
      label=p.colors.map(c=>names[c]).join('')+kind;
    return {id:p.key,ids:p.ids,label,goal:p.ids.map(id=>destination.get(id))};
  });
  return {title,rule,groups,stickerIds:groups.flatMap(g=>g.ids)};
}

export function targetProgress(targets, state) {
  if(!targets)return {complete:0,total:0,labels:[]};
  const current=new Map(state.stickers.map(t=>[t.id,t]));
  const labels=targets.groups.map(group=>{
    const arrived=targets.rule==='orientation' ? group.goal.filter(t=>t.color==='U').every(t=>current.get(t.id).n.every((v,i)=>v===t.n[i])) :
      group.goal.every(t=>same(current.get(t.id),t));
    const t=current.get(group.ids[0]),p=center(t),
      location=FACES.filter(f=>p[FACE[f].axis]===(state.size-1)*FACE[f].sign).map(f=>FACE[f].name).join('');
    return {label:group.label,arrived,location:location||FACE[cellOf(t,state.size).face].name};
  });
  return {complete:labels.filter(g=>g.arrived).length,total:labels.length,labels};
}
