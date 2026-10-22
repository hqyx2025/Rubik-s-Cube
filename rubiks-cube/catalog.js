import {LESSONS, diagramMarkup, recognition} from './curriculum.js';

const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function mountCatalog(formulas, startDemo, toast) {
  const byId=id=>document.getElementById(id), size=byId('formulaSize'),stage=byId('formulaStage'),group=byId('formulaGroup'),search=byId('formulaSearch'),list=byId('formulaCatalog');
  let currentStage='cross';
  function stages(){
    const previous=currentStage;
    stage.replaceChildren(...LESSONS[size.value].map(lesson=>{
      const b=node('button',lesson.name);b.type='button';b.dataset.lesson=lesson.id;
      b.onclick=()=>{currentStage=lesson.id;groups();render();};return b;
    }));
    currentStage=LESSONS[size.value].some(l=>l.id===previous)?previous:LESSONS[size.value][0].id;
    groups();render();
  }
  function groups(){
    const options=['全部',...new Set(formulas.filter(f=>f.size===Number(size.value)&&f.stage===currentStage).map(f=>f.group))];
    group.replaceChildren(...options.map((label,i)=>new Option(label,i?label:'')));
  }
  function render(){
    for(const b of stage.children)b.setAttribute('aria-pressed',String(b.dataset.lesson===currentStage));
    const lesson=LESSONS[size.value].find(l=>l.id===currentStage),q=search.value.trim().toLowerCase(),
      items=formulas.filter(f=>f.size===Number(size.value)&&f.stage===currentStage&&(!group.value||f.group===group.value)&&(!q||[f.name,f.group,f.alg,f.note].join(' ').toLowerCase().includes(q)));
    list.replaceChildren();
    const guide=node('section',null,'lesson-guide');guide.append(node('h3',lesson.name),node('p',lesson.goal));
    const detail=node('details'),summary=node('summary','本阶段怎么做'),steps=node('ol');
    for(const text of lesson.steps)steps.append(node('li',text));detail.append(summary,steps);
    guide.append(detail,node('p',lesson.caution,'lesson-caution'));list.append(guide);
    byId('formulaResult').textContent=`${size.value}阶 · ${lesson.name} · ${items.length}条`;
    if(!items.length){list.append(node('p','没有匹配条目。可清空搜索或选择“全部”分组。','formula-empty'));return;}
    for(const formula of items){
      const item=node('article',null,'formula-item');item.dataset.formulaId=formula.id;
      const head=node('div',null,'formula-item-heading'),description=node('div');
      description.append(node('small',`${formula.size}阶 · ${formula.group}`),node('h3',formula.name));
      if(formula.alg){const image=node('div',null,'case-diagram');image.innerHTML=diagramMarkup(formula);head.append(image);}
      head.append(description);item.append(head);
      if(formula.alg)item.append(node('p',formula.alg,'algorithm-text'));
      item.append(node('p',recognition(formula)));
      if(formula.note&&recognition(formula)!==formula.note)item.append(node('p',formula.note,'formula-note'));
      const details=node('details'),summary=node('summary','拿法与步骤详解');details.append(summary);
      details.append(node('p',`保持图示朝向。${formula.size===3?'本页黄顶、白底、蓝前、红右。':'四阶先依据中心和角块核对配色；中心可移动。'} 从当前逻辑面正对该面看，顺时针为字母本义。`));
      const walk=node('ol');for(const text of lesson.steps)walk.append(node('li',text));details.append(walk);
      if(formula.alg)details.append(node('p','点击“逐步演示”后，每一个字母都会显示中文方向、层数与角度；可暂停、前后单步，或回到第一步。示例由公式逆序构造，用于这一条的局部学习，不能自动判断你的任意局面。'));
      if(formula.source){const a=node('a','公式核对来源');a.href=formula.source;a.target='_blank';a.rel='noopener noreferrer';a.className='formula-source';details.append(a);}
      item.append(details);
      if(formula.alg){const actions=node('div',null,'formula-item-actions'),play=node('button','逐步演示'),copy=node('button','复制公式');play.type=copy.type='button';play.dataset.formulaDemo=formula.name;play.dataset.formulaId=formula.id;
        play.onclick=()=>startDemo(formula);copy.onclick=async()=>{try{await navigator.clipboard.writeText(formula.alg);toast('公式已复制');}catch{toast('复制未成功，请选中公式文字复制。');}};actions.append(play,copy);item.append(actions);}
      list.append(item);
    }
    list.scrollTop=0;
  }
  size.onchange=()=>{search.value='';stages();};group.onchange=render;search.oninput=render;
  stages();
  return {open(order){if([3,4].includes(order)&&Number(size.value)!==order){size.value=order;search.value='';stages();}}};
}
