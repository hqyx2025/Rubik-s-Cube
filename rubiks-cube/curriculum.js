import {createState, applyMove, inverse, parseFormula, cellOf, FACES, COLORS, FACE, AXES, describeMove} from './model.js';

export const LESSONS = {
  3: [
    {id:'cross', name:'Cross · 底层十字', goal:'先归位4枚底色棱块，并让侧色与中心一致。',
      steps:['先认识中心：三阶中心决定各面的颜色。本页白在下、黄在上、蓝在前、红在右；与参考图配色不同时看相对位置。', '寻找带底色的4枚棱块。先把一枚棱移到顶层，再转U使它的侧色对齐对应中心，最后送到底层。', '检查底面是十字，四个侧面的十字棱也各自对齐。只拼出底面同色还不算完成。'],
      caution:'Cross以观察规划为主，没有适用于所有局面的固定公式。这里的短公式是局部构造示例。'},
    {id:'f2l', name:'F2L · 前两层', goal:'把底角与对应中层棱配成一对，再一起插入正确槽位。',
      steps:['保持十字在底部，找一枚带底色的角块，再找与它另外两色相同的棱块。工作槽统一放在前右，其他槽可通过整块y转向来到前右。', '先辨认角、棱是在顶层还是槽内。需要时用短的外层动作取出，在顶层调整位置并配对；不要把“取出”和“归位”混为同一步。', '按局面图对齐方向后执行公式。依次完成4对，结束时底层和中层全部一致，同时保留十字。'],
      caution:'41种是一个工作槽的基本情况；编号可能与GAN图表不同。按局面识别，不按编号猜公式。'},
    {id:'oll', name:'OLL · 顶面朝向', goal:'保留前两层，使顶面的9枚贴纸颜色一致。',
      steps:['先确认前两层已完成，把目标顶色放在U面。分别观察顶色棱块和角块的朝向。', '从正上方看顶面图案，同时看四条侧边的小色块。仅靠顶面轮廓相似还不够；先转U把实际局面与示意图对齐。', '执行对应公式，检查顶色全部朝上、前两层未被破坏。此阶段不要求侧面最后一层已排列正确。'],
      caution:'完整OLL共57种，解决朝向；下一阶段PLL才处理位置。'},
    {id:'pll', name:'PLL · 顶层排列', goal:'保持顶色朝上，归位顶层角、棱，最后对齐U层。',
      steps:['先确认顶面已同色且前两层完成，观察四个侧面顶排。寻找同色的“头灯”、色条及已归位块。', '按示意图的前后左右摆放局面。只换棱、相邻角换位和对角角换位是目录分组，不能代替完整局面识别。', '执行公式后，必要时补U、U′或U2完成顶层对齐（AUF）。检查六面，而不只检查顶面。'],
      caution:'共21种PLL。图中颜色表示同一局面的关系，不表示一种字母公式能处理所有相似图案。'},
    {id:'basic', name:'入门与补充', goal:'保留原有层先法与基础手法，按自己的节奏过渡到CFOP。',
      steps:['先认识U、D、L、R、F、B六面；字母是面对该面时顺时针90°，撇号是逆时针，2是180°。', '层先法把任务拆得更小；F2L、OLL、PLL会把其中若干阶段合并。可先练短手法，再回到对应CFOP阶段。', '只在实际局面、朝向和前置条件一致时使用。示例是逆序构造的独立练习局面，不是任意局面的自动解法。'],
      caution:'原有35条资料完整保留；这些条目不计入41／57／21的完整CFOP目录。'}
  ],
  4: [
    {id:'centers', name:'1 · 中心块', goal:'把24枚中心块组成6面2×2中心，并保持正确配色。',
      steps:['四阶没有固定中心。先参考一个角块的三色关系确定相邻色；本页对色为白／黄、蓝／绿、红／橙。', '先拼同色1×2中心条，再把两条合成2×2。完成第一面及对面，再依次处理其余中心。', '搬运新中心条时，记住暂时打散已完成中心的那一层，并在插入后还原。最后两面也要按条块整理。'],
      caution:'中心公式用于所示的局部，不能机械重复处理所有中心排列。中心配色正确后再合棱。'},
    {id:'edges', name:'2 · 合棱', goal:'把24枚翼棱配成12组，两枚一组且两面颜色都一致。',
      steps:['找颜色组合相同的两枚翼棱，把它们放到工作切层中。先检查是不同切层还是同切层。', '使用“切层配对→把完成组换出→反向还原切层”的思路。换入工作位的应是尚未配好的棱组。', '已配对的翼棱要成组保存。最后几组空间较少时，可先翻转工作位再配对；完成后检查6面中心和12组翼棱。'],
      caution:'这里只讲降阶法的逐组配棱。没有把四阶合棱误称为三阶F2L，也不做任意四阶自动求解。'},
    {id:'reduced-cross', name:'3 · Cross', goal:'降阶完成后，把成组翼棱作为三阶棱块完成十字。',
      steps:['先确认6面中心和12组棱已完成。', '只转外层，用底色棱组与对应中心配色对齐，构造底层十字。', '检查四组底棱和侧面中心的对应关系。'],
      caution:'接下来沿用CFOP顺序。此处仅提供外层公式示例，不把三阶M或r未经转换套到四阶。'},
    {id:'reduced-f2l', name:'4 · F2L', goal:'把底角与已经配成组的中层棱一起归位。',
      steps:['保持十字在下，把目标槽放在前右。', '观察底角和完整棱组的相对关系，在顶层配对再插入。', '只用外层动作保留中心和翼棱配对，重复完成4个槽。'],
      caution:'三阶r表示两个逻辑层，四阶Rw表示两个实际层，两者不可在所有CFOP公式中直接互换。'},
    {id:'reduced-oll', name:'5 · OLL', goal:'使降阶魔方的整个顶面同色。',
      steps:['前两层完成后，观察顶层各棱组与角块朝向。', '正常三阶局面可用外层OLL；如果有单独一组棱翻转，先看“OLL特殊情况”。', '执行后检查顶色统一，已配翼棱和前两层仍完整。'],
      caution:'本节的正小鱼是一个代表例；三阶完整OLL另在三阶目录中。'},
    {id:'reduced-pll', name:'6 · PLL', goal:'在顶色统一后完成角、棱组的位置排列。',
      steps:['按四个侧面顶排的色条识别换位，棱组视为一个整体。', '正常情况执行外层PLL。如果只剩两组互换且不能对应三阶PLL，先处理“PLL特殊情况”。', '最后补U层对齐，并检查六面。'],
      caution:'四阶特例修正后可能仍需正常PLL；不要把特例公式当成通用终结公式。'},
    {id:'parity-oll', name:'特例 · OLL翻棱', goal:'修正降阶后单组棱翻转造成的朝向特例。',
      steps:['先排除翼棱未配好的情况：同一组的两枚翼棱应相邻、双色一致。', '把需要翻转的那组放在UF（前上）。严格区分Rw双层、U外层以及x整块逻辑转向。', '按步骤执行后检查中心和配棱，再回到正常OLL／PLL完成复原。'],
      caution:'此处的“特例”不是魔方损坏；它是四阶降阶时会出现、三阶不存在的局面。'},
    {id:'parity-pll', name:'特例 · PLL换棱', goal:'修正顶层两组棱互换造成的排列特例。',
      steps:['中心与配棱完整、顶色统一后，再判断是否是两组棱单独互换。', '按示意图摆放。2R只转从右数第二层，2R2仍是该单层半圈；Uw2是上面两层同时半圈。', '完成特例修正后重新识别PLL，必要时补普通PLL和U层对齐。'],
      caution:'内层2R和宽层Rw的区别会逐步显示，请勿照字形猜测层数。'}
  ]
};

const examples = new Map();
let orientations;
function goals(size) {
  if (orientations?.size === size) return orientations.states;
  const states = [createState(size)], seen = new Set();
  for (let i=0;i<states.length;i++) {
    const state = states[i], signature = FACES.map(f => state.stickers.find(t => cellOf(t,size).face===f)?.color).join('');
    if (seen.has(signature)) { states.splice(i--,1); continue; }
    seen.add(signature);
    for (const axis of AXES) {
      const next = applyMove(state,{axis,lo:0,hi:size-1,turns:1});
      const key = FACES.map(f=>next.stickers.find(t=>cellOf(t,size).face===f)?.color).join('');
      if (!seen.has(key)) states.push(next);
    }
  }
  orientations={size,states};return states;
}
export function exampleFor(formula) {
  const cacheKey = `${formula.size}/${formula.alg}`;
  if (examples.has(cacheKey)) return examples.get(cacheKey);
  const size = formula.size || 3, moves = parseFormula(formula.alg,size), steps = parseFormula(formula.alg,size,true);
  let best, score=-1;
  for (const goal of goals(size)) {
    let initial=goal;
    for (const m of moves.slice().reverse()) initial=applyMove(initial,inverse(m));
    const matches=initial.stickers.filter(t=>{
      const c=cellOf(t,size);return c.row>0&&c.row<size-1&&c.col>0&&c.col<size-1&&c.face===t.color;
    }).length;
    if (matches>score) {best=initial;score=matches;}
  }
  const result={state:best,moves,steps};examples.set(cacheKey,result);return result;
}

export function recognition(formula) {
  if (!formula.alg) return formula.note;
  if (formula.size===3 && formula.stage==='oll') {
    const s=exampleFor(formula).state,top=s.stickers.filter(t=>cellOf(t,3).face==='U'&&t.color==='U'),
      corners=top.filter(t=>{const c=cellOf(t,3);return c.row!==1&&c.col!==1;}).length,
      edges=top.length-corners-1;
    return `顶层有${edges}枚顶色棱朝上、${corners}枚顶色角朝上；结合图中的侧边贴纸区分${formula.group}，用U调整至图示朝向。`;
  }
  if (formula.stage==='pll') return `顶色已经统一，观察侧面顶排的头灯与色条，按图识别${formula.name}。分组：${formula.group}。执行前对齐朝向，执行后检查是否需要U层调整。`;
  if (formula.stage==='f2l') {
    const initial=exampleFor(formula).state, solved=createState(3),
      ids=p=>new Set(solved.stickers.filter(t=>t.p.every((v,i)=>v-t.n[i]===p[i])).map(t=>t.id)),
      cornerIds=ids([2,-2,2]),edgeIds=ids([2,0,2]),
      corner=initial.stickers.filter(t=>cornerIds.has(t.id)),edge=initial.stickers.filter(t=>edgeIds.has(t.id)),
      position=piece=>{
        const p=piece[0].p.map((v,i)=>v-piece[0].n[i]);
        return FACES.filter(f=>p[FACE[f].axis]===2*FACE[f].sign).join('');
      },bottom=corner.find(t=>t.color==='D'),front=edge.find(t=>t.color==='F');
    return `前右槽目标：底角位于${position(corner)}，白色贴纸朝${FACE[cellOf(bottom,3).face].name}面；棱块位于${position(edge)}，蓝色贴纸朝${FACE[cellOf(front,3).face].name}面。本例属于“${formula.group}”，先对齐图示位置与底色朝向。`;
  }
  return formula.note || '请把局面和朝向与独立示例对齐，再执行。';
}

export function stepExplanation(move, size, token = '') {
  const slab = move.hi-move.lo+1;
  let description=describeMove(move,size);
  if (slab===1&&move.lo>0&&move.hi<size-1) {
    const face=token.match(/^\d+([RLUDFB])/)?.[1] || {x:'R',y:'U',z:'F'}[move.axis],
      depth=FACE[face].sign>0?size-move.lo:move.lo+1,
      turn=Math.abs(move.turns)===2?'半圈180°':`${move.turns * -FACE[face].sign>0?'顺时针':'逆时针'}90°`;
    description=`从${FACE[face].name}侧数第${depth}层 · 面对${FACE[face].name}面${turn}`;
  }
  return `${description}。${slab===size?'这是整块逻辑转向，接下来的面字母按转向后的面来读。':slab>1?`同时带动连续${slab}层，勿拆成单独外层。`:move.lo>0&&move.hi<size-1?'只转这一内层，两侧外层保持。':'只转该外侧单层，保持其他层不动。'}`;
}

// Original diagrams are generated from the exact example model, not copied from a chart.
export function diagramMarkup(formula) {
  if (!formula.alg) return '';
  const state=exampleFor(formula).state,n=state.size,top=['oll','pll'].includes(formula.stage),parts=[];
  if (top) {
    const sideMap={F:[0,1],B:[0,-1],R:[1,0],L:[-1,0]};
    for(const t of state.stickers){
      const c=cellOf(t,n);let x,y,w=17,h=17;
      if(c.face==='U'){x=22+c.col*18;y=22+c.row*18;}
      else if(sideMap[c.face]&&c.row===0){const [dx,dy]=sideMap[c.face];
        if(dx){x=dx>0?22+n*18+2:12;y=22+(dx>0?n-1-c.col:c.col)*18;w=8;}
        else{x=22+(dy>0?c.col:n-1-c.col)*18;y=dy>0?22+n*18+2:12;h=8;}
      } else continue;
      const color=formula.stage==='oll'&&t.color!=='U'?'var(--line)':COLORS[t.color];
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`);
    }
    const end=44+n*18;return `<svg viewBox="0 0 ${end} ${end}" aria-hidden="true">${parts.join('')}<text x="${end/2}" y="${end-2}" text-anchor="middle">前 F</text></svg>`;
  }
  // Re-project a three-face square net with U/F/R sharing their real edges.
  const project=(f,x,y)=>f==='U'?[76+(x-y)*38/n,8+(x+y)*19/n]:f==='F'?[38+x*38/n,27+x*19/n+y*46/n]:[76+x*38/n,46-x*19/n+y*46/n];
  for(const t of state.stickers){const c=cellOf(t,n);if(!['U','F','R'].includes(c.face))continue;
    const poly=[[c.col,c.row],[c.col+1,c.row],[c.col+1,c.row+1],[c.col,c.row+1]].map(([x,y])=>project(c.face,x,y).join(',')).join(' ');
    parts.push(`<polygon points="${poly}" fill="${COLORS[t.color]}" stroke="var(--bg)" stroke-width=".8"/>`);
  }
  return `<svg viewBox="20 0 112 108" aria-hidden="true">${parts.join('')}<text x="76" y="104" text-anchor="middle">前 F · 右 R</text></svg>`;
}
