import {
  AXES,
  FACES,
  FACE,
  COLORS,
  createState,
  cloneState,
  applyMove,
  faceMove,
  faceOf,
  layerOf,
  affects,
  inverse,
  solved,
  moveName,
  describeMove,
  parseFormula,
  settleAngle,
  rotate,
  dot,
  cellOf
} from './model.js';
import {
  CubeSession
} from './session.js';
import {
  CubeView,
  FlatView
} from './views.js';
import {mountCatalog} from './catalog.js';
import {exampleFor, recognition, stepExplanation} from './curriculum.js';

const $ = id => document.getElementById(id),
  storeKey = 'rubiks-lab-v2',
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let session = new CubeSession(3),
  mode = 'simple',
  view = 'circle',
  selected = null,
  selectedId = null,
  lastAction = '尚未转动',
  active = null,
  animating = false,
  gesture = null,
  player = null,
  historyJob = null,
  queue = [],
  pumping = false,
  saveBlocked = false,
  cameraSaved = null,
  flatSaved = null,
  toastTimer, saveTimer;
const prefs = {
  motion: 'smooth',
  sensitivity: 1,
  axisFocus: 'all'
};
let savedRaw;
try {
  savedRaw = localStorage.getItem(storeKey);
  if (savedRaw) {
    const data = JSON.parse(savedRaw);
    session = CubeSession.restore(data.session);
    if (typeof data.lastAction === 'string' && data.lastAction.length <= 250) lastAction = data.lastAction;
    mode = data.mode === 'advanced' ? 'advanced' : 'simple';
    if (mode === 'simple' && session.state.size > 3) mode = 'advanced';
    view = data.view === 'net' ? 'net' : 'circle';
    if (['smooth', 'slow', 'off'].includes(data.prefs?.motion)) prefs.motion = data.prefs.motion;
    if (Number.isFinite(data.prefs?.sensitivity)) prefs.sensitivity = clamp(data.prefs.sensitivity, .5, 2);
    if (['all', ...AXES].includes(data.prefs?.axisFocus)) prefs.axisFocus = data.prefs.axisFocus;
    cameraSaved = data.camera;
    flatSaved = data.flat;
  }
} catch {
  saveBlocked = true;
}
let cube;
try {
  cube = new CubeView($('cubeCanvas'));
  cube.home(session.state.size);
  if (cameraSaved) cube.restore(cameraSaved, session.state.size);
} catch (error) {
  $('cubeError').hidden = false;
  console.warn('WebGL unavailable:', error.message);
}
const flat = new FlatView($('diagram'));
flat.setKind(view);
flat.focusAxis = prefs.axisFocus;
if (flatSaved)
  for (const kind of ['circle', 'net']) {
    const t = flatSaved[kind];
    if (t && [t.zoom, t.x, t.y].every(Number.isFinite)) flat.transforms[kind] = {
      zoom: clamp(t.zoom, .6, 4),
      x: clamp(t.x, -3000, 3000),
      y: clamp(t.y, -3000, 3000)
    };
  }
const state = () => historyJob?.working || session.state;

function toast(text) {
  $('labToast').textContent = text;
  $('labToast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('labToast').hidden = true, 3600);
}

function notice(text, actions = []) {
  const n = $('savedNotice');
  n.replaceChildren(document.createTextNode(text));
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    n.append(b);
  }
  n.hidden = false;
}

function save() {
  if (saveBlocked) return false;
  const saved = player?.restore;
  try {
    localStorage.setItem(storeKey, JSON.stringify({
      session: (saved?.session || session).serialize(),
      lastAction: saved?.lastAction || lastAction,
      mode: saved?.mode || mode,
      view: saved?.view || view,
      prefs: saved?.prefs || prefs,
      camera: saved?.camera || cube?.capture(),
      flat: saved?.flat || flat.transforms
    }));
    return true;
  } catch {
    saveBlocked = true;
    notice('浏览器存储不可用，当前仍能玩，但这次进度无法自动保存。');
    return false;
  }
}

function laterSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

function frame() {
  cube?.sync(state(), active, selected, selectedId);
  flat.render(state(), active, selected, selectedId);
  $('diagram').dataset.angle = String(active?.angle || 0);
}

function stickerLabel(id) {
  const t = state().stickers.find(t => t.id === id);
  if (!t) return '';
  const c = cellOf(t, state().size);
  return `${FACE[c.face].name}面 第${c.row+1}行第${c.col+1}列`;
}

function selectionLabel(s = selected) {
  if (!s) return '拖动色块或彩点拧一层；拖动三维空白换视角。';
  return `${s.axis.toUpperCase()} · 第${s.lo+1}${s.lo===s.hi?'':'～'+(s.hi+1)}层${s.lo===0&&s.hi===state().size-1?' · 整块转向':''}${selectedId?' · '+stickerLabel(selectedId):''}`;
}

function ui() {
  const n = state().size,
    busy = animating || !!historyJob || !!player,
    wide = $('wideMode').checked && mode === 'advanced';
  $('modeSelect').value = mode;
  $('sizeSelect').value = n;
  for (const option of $('sizeSelect').options) option.disabled = mode === 'simple' && Number(option.value) > 3;
  $('advancedControls').hidden = mode !== 'advanced';
  $('layerEndLabel').hidden = !wide;
  $('exitWideBtn').hidden = !wide;
  $('layerEnd').disabled = !wide;
  if ($('layerStart').options.length !== n) {
    for (const id of ['layerStart', 'layerEnd']) {
      $(id).replaceChildren(...Array.from({
        length: n
      }, (_, i) => new Option(String(i + 1), String(i))));
    }
  }
  if (selected) {
    $('axisSelect').value = selected.axis;
    $('layerStart').value = selected.lo;
    $('layerEnd').value = selected.hi;
  }
  $('rangeInfo').textContent = wide ? `多层模式 · ${selectionLabel()}。范围外拖动不会改变所选范围。` : '普通拖动每次重新判断单层；面板选层仅用于按钮和键盘。';
  $('moveCount').textContent = session.steps;
  const lastActionText = `上一步：${lastAction}`;
  if ($('lastAction').textContent !== lastActionText) $('lastAction').textContent = lastActionText;
  $('solvedBadge').textContent = solved(state()) ? '已还原' : '探索中';
  $('undoBtn').disabled = busy || session.cursor === 0;
  $('redoBtn').disabled = busy || session.cursor === session.events.length;
  for (const id of ['cwBtn', 'ccwBtn', 'halfBtn']) $(id).disabled = busy || !selected;
  $('scrambleBtn').disabled = busy;
  $('resetBtn').disabled = !!historyJob || !!player;
  $('sizeSelect').disabled = !!historyJob || !!player;
  $('modeSelect').disabled = !!historyJob || !!player;
  $('selectionInfo').textContent = selectionLabel();
  $('turnMotion').value = prefs.motion;
  $('sensitivity').value = prefs.sensitivity;
  $('sensitivityValue').textContent = `${prefs.sensitivity.toFixed(1)} 倍`;
  $('diagramTitle').textContent = view === 'circle' ? '圆形原理' : '十字展开';
  $('diagram').setAttribute('aria-label', view === 'circle' ? '可拖动操作的圆形轨道图' : '可拖动操作的十字展开图');
  $('diagramHint').textContent = view === 'circle' ?
    `每个点对应一枚贴纸；轨道是实际转动路径。${flat.focusAxis==='all'?'X／Y／Z均显示，可按轴查看。':flat.focusAxis.toUpperCase()+'轴上的中心点绕该轴位置不变。'} 拖空白平移，滚轮或双指放大。` :
    '拖动格子拧对应的层。跨接缝的色带从对应边缘滑入、滑出。';
  $('orbitTools').hidden = view !== 'circle';
  for (const b of document.querySelectorAll('[data-orbit-focus]')) b.setAttribute('aria-pressed', String(b.dataset
    .orbitFocus === flat.focusAxis));
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view ===
    view));
  for (const b of document.querySelectorAll('[data-face]')) {
    const m = faceMove(b.dataset.face, n);
    b.setAttribute('aria-pressed', String(selected?.axis === m.axis && selected.lo === m.lo && selected.hi === m.hi));
  }
  $('historyCount').textContent = `${session.cursor} / ${session.events.length}`;
  $('historyPause').disabled = !historyJob || historyJob.scramble;
  $('historyJump').disabled = !historyJob || historyJob.scramble;
  $('historyPause').textContent = historyJob?.paused ? '继续回看' : '暂停回看';
  $('historyNote').textContent = historyJob ? `回看中 ${historyJob.index}/${historyJob.moves.length}` : session.baseCount ?
    '较早步骤已保存为检查点' : '';
  historyUI();
  playerUI();
  frame();
}

function historyUI() {
  const list = $('historyList');
  list.replaceChildren();
  const add = (label, cursor, event) => {
    const li = document.createElement('li'),
      button = document.createElement('button');
    button.textContent = label;
    button.dataset.history = cursor;
    if (cursor === session.cursor) button.setAttribute('aria-current', 'step');
    button.disabled = !!player;
    button.onclick = () => seek(cursor);
    li.append(button);
    if (event?.kind === 'scramble') {
      const d = document.createElement('details'),
        s = document.createElement('summary'),
        p = document.createElement('p');
      s.textContent = `查看${event.moves.length}步打乱`;
      p.textContent = event.moves.map(m => moveName(m, state().size)).join(' ');
      d.append(s, p);
      li.append(d);
    }
    list.append(li);
  };
  add('本局起点', 0);
  session.events.forEach((event, i) => add(`${i+1} · ${event.label}`, i + 1, event));
}

function playerUI() {
  if (!player) {
    $('formulaPlayer').hidden = true;
    return;
  }
  $('formulaPlayer').hidden = false;
  $('playerTitle').textContent = player.name;
  const size = player.size;
  $('playerContext').textContent = player.restore ? `独立${size===4?'四':'三'}阶示例 · 退出恢复原局，演示不会覆盖你的进度。` : `正在应用到你的${size}阶局面 · 完成的动作已记入历史，不保证复原。`;
  $('formulaSteps').replaceChildren(...player.moves.map((m, i) => {
    const s = document.createElement('span');
    s.textContent = player.steps?.[i]?.token || moveName(m, size);
    if (i === player.index) s.setAttribute('aria-current', 'step');
    return s;
  }));
  $('formulaPlay').textContent = player.playing ? '暂停' : '播放';
  $('formulaPlay').disabled = !!player.transitioning || !player.playing && player.index >= player.moves.length;
  $('formulaPrev').disabled = animating || player.transitioning || player.index === 0;
  $('formulaNext').disabled = animating || player.transitioning || player.index >= player.moves.length;
  $('formulaReplay').disabled = !!player.transitioning;
  $('formulaFirst').disabled = !!player.transitioning;
  $('exitDemo').disabled = !!player.transitioning;
  $('formulaApply').disabled = !!player.transitioning;
  $('formulaApply').hidden = !player.restore;
  $('formulaProgress').textContent = `${player.index} / ${player.moves.length}`;
  const stepIndex = animating ? player.index - (player.direction<0?1:0) : Math.max(0,player.index-1),
    step = player.moves[stepIndex], token = player.steps?.[stepIndex]?.token || (step && moveName(step,size));
  $('formulaStepDetail').textContent = player.index===0&&!animating ? '起点 · 尚未执行。下一步：'+stepExplanation(player.moves[0],size,player.steps?.[0]?.token) :
    `${animating?'正在执行':'已完成'}第${stepIndex+1}步 ${token} · ${stepExplanation(player.direction<0&&animating?inverse(step):step,size,token)}${player.index===player.moves.length&&!animating?' 本条已完成，可回到第一步或重新播放。':''}`;
  if ($('formulaWalkthrough').dataset.formula !== player.id) {
    $('formulaWalkthrough').dataset.formula = player.id;
    $('formulaRecognition').textContent = recognition(player);
    $('formulaWalkthrough').replaceChildren(...player.moves.map((m,i)=>{
      const token=player.steps?.[i]?.token || moveName(m,size),li=document.createElement('li');li.textContent=`${token}：${stepExplanation(m,size,token)}`;return li;
    }));
  }
  [...$('formulaWalkthrough').children].forEach((li,i)=>i===stepIndex?li.setAttribute('aria-current','step'):li.removeAttribute('aria-current'));
}

function setSelection(sel, id = null) {
  selected = sel ? {
    axis: sel.axis,
    lo: sel.lo,
    hi: sel.hi
  } : null;
  selectedId = id;
  ui();
}

function duration(speed = 360) {
  if (prefs.motion === 'off') return 0;
  return (prefs.motion === 'slow' ? 650 : matchMedia('(prefers-reduced-motion: reduce)').matches ? 180 : 360) * speed /
    360;
}
let animationResolve = null;

function animate(move, from = 0, to = move.turns * Math.PI / 2, speed = 360) {
  return new Promise(resolve => {
    active = {
      ...move,
      angle: from
    };
    animating = true;
    animationResolve = resolve;
    const start = performance.now(),
      ms = duration(speed) * Math.min(1, Math.max(.25, Math.abs(to - from) / (Math.PI / 2)));
    const tick = now => {
      const p = ms ? clamp((now - start) / ms, 0, 1) : 1,
        e = p < .5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      active.angle = from + (to - from) * e;
      frame();
      if (p < 1) requestAnimationFrame(tick);
      else {
        animating = false;
        animationResolve = null;
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}
async function boundary() {
  if (gesture) {
    $('dragCue').hidden = true;
    $('dragArrow').setAttribute('hidden', '');
    const g = gesture;
    gesture = null;
    if (active && !animating) {
      const a = active;
      await animate({
        ...a,
        turns: 1
      }, a.angle, 0, 180);
      active = null;
      frame();
    }
  }
  if (animating) await new Promise(resolve => {
    const check = () => animating ? requestAnimationFrame(check) : resolve();
    check();
  });
}
async function ask(title, text, yes = '继续') {
  const d = $('confirmDialog');
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  $('confirmYes').textContent = yes;
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      d.close();
      resolve(value);
    };
    $('confirmYes').onclick = () => finish(true);
    $('confirmNo').onclick = () => finish(false);
    d.oncancel = e => {
      e.preventDefault();
      finish(false);
    };
    d.showModal();
  });
}
async function branchAllowed() {
  if (session.cursor === session.events.length) return true;
  return ask('从这里继续？', '新的转动会替换这个位置之后的可重做步骤。', '从这里继续');
}
async function request(move) {
  if (player || historyJob) {
    toast('请先退出公式演示或完成历史回看。');
    return;
  }
  if (gesture) return;
  if (queue.length >= 8) {
    toast('转动已排队，请稍等。');
    return;
  }
  queue.push(move);
  pump();
}
async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length) {
    if (!await branchAllowed()) {
      queue = [];
      break;
    }
    const move = queue.shift();
    await animate(move);
    session.commit([move], moveName(move, state().size), move.lo === 0 && move.hi === state().size - 1 ? 'turn' :
      'manual');
    lastAction = describeMove(move, state().size);
    active = null;
    save();
    ui();
  }
  pumping = false;
}

function chosenMove(dir = 1) {
  if (!selected) return null;
  const f = FACES.find(f => AXES[FACE[f].axis] === selected.axis && (FACE[f].sign > 0 ? selected.hi === state().size -
      1 : selected.lo === 0)),
    sign = f ? -FACE[f].sign : -1;
  return {
    ...selected,
    turns: sign * dir
  };
}

// Input: one pointer owns a turn; two pointers always take over the view.
const pointers = new Map();

function pair(surface) {
  return [...pointers.values()].filter(p => p.surface === surface).slice(0, 2);
}
const pairInfo = p => ({
  x: (p[0].x + p[1].x) / 2,
  y: (p[0].y + p[1].y) / 2,
  d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
});

function permitted(sticker, axis) {
  const layer = layerOf(sticker, axis, state().size);
  return mode === 'advanced' || layer === 0 || layer === state().size - 1;
}

function tangent(surface, t, axis) {
  return surface === 'three' ? cube?.tangent(t, axis) || [0, 0] : flat.tangent(t, axis);
}

function candidates(g, dx, dy) {
  const wide = mode === 'advanced' && $('wideMode').checked,
    axes = wide && selected ? [selected.axis] : g.hit.orbitAxis ? [g.hit.orbitAxis] : g.surface === 'flat' && view ===
    'circle' && flat.focusAxis !== 'all' ? [flat.focusAxis] : AXES;
  const len = Math.hypot(dx, dy);
  return axes.filter(axis => permitted(g.hit.sticker, axis) && (g.surface === 'flat' && view === 'circle' || g.hit
    .sticker.n[AXES.indexOf(axis)] === 0)).map(axis => {
    const l = layerOf(g.hit.sticker, axis, state().size),
      v = tangent(g.surface, g.hit.sticker, axis),
      length = Math.hypot(...v),
      direction = v.map(n => n / (length || 1)),
      score = Math.abs((dx * direction[0] + dy * direction[1]) / (len || 1));
    return {
      axis,
      lo: wide && selected ? selected.lo : l,
      hi: wide && selected ? selected.hi : l,
      direction,
      score,
      length
    };
  }).filter(c => c.length > .1 && (!wide || affects(g.hit.sticker, c, state().size))).sort((a, b) => b.score - a
    .score);
}

function beginMulti(surface) {
  const p = pair(surface);
  if (p.length < 2) return;
  gesture = {
    kind: 'multi',
    surface,
    pair: pairInfo(p)
  };
}

function down(e, surface) {
  if (e.button !== 0 && e.button !== 2) return;
  if (gesture && gesture.surface !== surface) return;
  const p = {
    surface,
    x: e.clientX,
    y: e.clientY
  };
  pointers.set(e.pointerId, p);
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {}
  if (pair(surface).length === 2) {
    $('dragCue').hidden = true;
    $('dragArrow').setAttribute('hidden', '');
    if (animating) return;
    const old = gesture;
    gesture = null;
    if (active) {
      const a = active;
      animate({
        ...a,
        turns: 1
      }, a.angle, 0, 180).then(() => {
        active = null;
        beginMulti(surface);
        frame();
      });
    } else beginMulti(surface);
    return;
  }
  if (animating || pumping || player || historyJob) {
    toast('请等当前转动完成；播放中请先暂停并退出。');
    return;
  }
  const hit = e.button === 2 ? null : surface === 'three' ? cube?.pick(e.clientX, e.clientY, state()) : flat.pick(e
    .clientX, e.clientY, state(), true);
  if (hit?.ambiguous) {
    toast('这里有重叠的点，请放大或从附近轨道起手。');
    return;
  }
  if (hit) {
    selectedId = hit.sticker.id;
    frame();
    $('selectionInfo').textContent = `${stickerLabel(selectedId)} · 起手方向明确后锁层`;
  }
  gesture = {
    kind: hit ? 'pending' : surface === 'three' ? 'orbit' : 'pan',
    surface,
    hit,
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    pointerType: e.pointerType,
    angle: 0,
    samples: []
  };
}

function drawArrow(g) {
  const parent = g.surface === 'three' ? $('cubeStage') : $('diagram').parentElement,
    a = $('dragArrow');
  if (a.parentElement !== parent) parent.append(a);
  const r = parent.getBoundingClientRect(),
    x = clamp(g.lastX - r.left, 25, r.width - 25),
    y = clamp(g.lastY - r.top, 25, r.height - 25),
    sign = Math.sign(g.angle) || 1,
    dx = g.direction[0] * sign,
    dy = g.direction[1] * sign,
    tx = x + dx * 30,
    ty = y + dy * 30;
  a.setAttribute('viewBox', '0 0 ' + r.width + ' ' + r.height);
  $('dragArrowLine').setAttribute('d', 'M' + x + ',' + y + 'L' + tx + ',' + ty + 'M' + (tx - dx * 8 - dy * 5) + ',' + (
    ty - dy * 8 + dx * 5) + 'L' + tx + ',' + ty + 'L' + (tx - dx * 8 + dy * 5) + ',' + (ty - dy * 8 - dx * 5));
  a.removeAttribute('hidden');
}

function movePointer(e, surface) {
  const old = pointers.get(e.pointerId);
  if (old) {
    old.x = e.clientX;
    old.y = e.clientY;
  }
  const g = gesture;
  if (!g) {
    if (!animating && !player && !historyJob && e.pointerType === 'mouse' && e.buttons === 0) {
      const hit = surface === 'three' ? cube?.pick(e.clientX, e.clientY, state()) : flat.pick(e.clientX, e.clientY,
        state());
      if (hit && !hit.ambiguous && selectedId !== hit.sticker.id) {
        selectedId = hit.sticker.id;
        frame();
        $('selectionInfo').textContent = `${stickerLabel(selectedId)} · 拖动来确定转层方向`;
      }
    }
    return;
  }
  if (g.surface !== surface || animating) return;
  if (g.kind === 'multi') {
    const p = pair(surface);
    if (p.length < 2) return;
    const v = pairInfo(p),
      prior = g.pair;
    if (surface === 'three') {
      cube?.orbit(v.x - prior.x, v.y - prior.y, mode);
      if (prior.d > 3 && v.d > 3) cube?.zoom(prior.d / v.d);
    } else {
      flat.pan(v.x - prior.x, v.y - prior.y);
      if (prior.d > 3 && v.d > 3) flat.zoom(v.d / prior.d);
    }
    g.pair = v;
    laterSave();
    return;
  }
  if (g.id !== e.pointerId) return;
  const dx = e.clientX - g.lastX,
    dy = e.clientY - g.lastY;
  g.lastX = e.clientX;
  g.lastY = e.clientY;
  if (g.kind === 'orbit') {
    cube?.orbit(dx, dy, mode);
    laterSave();
    return;
  }
  if (g.kind === 'pan') {
    flat.pan(dx, dy);
    laterSave();
    return;
  }
  if (g.kind === 'pending') {
    const x = e.clientX - g.x,
      y = e.clientY - g.y;
    if (Math.hypot(x, y) < (g.pointerType === 'touch' ? 10 : 6)) return;
    const options = candidates(g, x, y),
      best = options[0];
    if (!best || best.score < .766 || (options[1] && best.score - options[1].score < .15)) {
      $('selectionInfo').textContent = mode === 'simple' ? '方向还不明确；可从边缘色块起手，或用面按钮选择。' : '方向还不明确，沿其中一条候选方向继续拖动。';
      return;
    }
    g.kind = 'turn';
    g.move = {
      axis: best.axis,
      lo: best.lo,
      hi: best.hi,
      turns: 1
    };
    g.direction = best.direction;
    g.width = surface === 'three' ? cube?.width(state().size) || 300 : $('diagram').getBoundingClientRect().width * flat
      .transforms[view].zoom * .8;
    g.lockX = e.clientX;
    g.lockY = e.clientY;
    g.samples = [{
      time: performance.now(),
      angle: 0
    }];
    selected = {
      ...g.move
    };
    active = {
      ...g.move,
      angle: 0
    };
    $('dragCue').hidden = false;
    $('dragCue').textContent = selectionLabel();
    drawArrow(g);
    frame();
    return;
  }
  if (g.kind === 'turn') {
    let delta = (dx * g.direction[0] + dy * g.direction[1]) / g.width * Math.PI * prefs.sensitivity;
    // Follow the changing tangent of the circular track instead of reinterpreting its axis.
    if (surface === 'flat' && view === 'circle') {
      const t = {
          ...g.hit.sticker,
          p: rotate(g.hit.sticker.p, g.move.axis, g.angle)
        },
        v = flat.tangent(t, g.move.axis),
        l = Math.hypot(...v);
      if (l > .1) {
        g.direction = v.map(n => n / l);
        delta = (dx * g.direction[0] + dy * g.direction[1]) * .025 / l * prefs.sensitivity;
      }
    }
    g.angle = clamp(g.angle + delta, -Math.PI, Math.PI);
    active.angle = g.angle;
    const time = performance.now();
    g.samples.push({
      time,
      angle: g.angle
    });
    g.samples = g.samples.filter(s => time - s.time < 100);
    $('dragCue').textContent = `${selectionLabel()} · ${Math.round(Math.abs(g.angle)*180/Math.PI)}°`;
    drawArrow(g);
    frame();
  }
}
async function up(e, surface, cancel = false) {
  pointers.delete(e.pointerId);
  const g = gesture;
  if (!g || g.surface !== surface) return;
  if (g.kind === 'multi') {
    if (pair(surface).length < 2) gesture = null;
    return;
  }
  if (g.id !== e.pointerId) return;
  gesture = null;
  $('dragCue').hidden = true;
  $('dragArrow').setAttribute('hidden', '');
  if (g.kind === 'turn') {
    const now = performance.now(),
      recent = g.samples.filter(s => now - s.time <= 80),
      first = recent[0],
      last = recent.at(-1),
      velocity = first && last && last.time > first.time ? (last.angle - first.angle) * 180 / Math.PI / ((last.time -
        first.time) / 1000) : 0,
      target = cancel ? 0 : settleAngle(g.angle * 180 / Math.PI, velocity),
      move = {
        ...g.move,
        turns: target / 90 || 1
      };
    if (target && !await branchAllowed()) {
      await animate(move, g.angle, 0, 180);
      active = null;
      ui();
      return;
    }
    await animate(move, g.angle, target * Math.PI / 180, 180);
    active = null;
    if (target) {
      session.commit([move], moveName(move, state().size), move.lo === 0 && move.hi === state().size - 1 ? 'turn' : 'manual');
      lastAction = describeMove(move, state().size);
    }
    save();
    ui();
  } else if (g.kind === 'pending' && !cancel) {
    const f = faceOf(g.hit.sticker);
    setSelection(faceMove(f, state().size), g.hit.sticker.id);
  } else save();
}
for (const [id, surface] of [
    ['cubeCanvas', 'three'],
    ['diagram', 'flat']
  ]) {
  const el = $(id);
  el.addEventListener('pointerdown', e => down(e, surface));
  el.addEventListener('pointermove', e => movePointer(e, surface));
  el.addEventListener('pointerup', e => up(e, surface));
  el.addEventListener('pointercancel', e => up(e, surface, true));
  el.addEventListener('lostpointercapture', e => {
    if (pointers.has(e.pointerId)) up(e, surface, true);
  });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => {
    e.preventDefault();
    if (animating || gesture) return;
    const factor = Math.exp(clamp(e.deltaY, -120, 120) * .002);
    if (surface === 'three') cube?.zoom(factor);
    else flat.zoom(1 / factor);
    laterSave();
  }, {
    passive: false
  });
}

async function seek(target, action = '回到') {
  if (player || animating || gesture) return;
  if (historyJob) {
    toast('请先完成当前回看。');
    return;
  }
  if (target === session.cursor) return;
  const moves = [];
  if (target < session.cursor)
    for (let i = session.cursor - 1; i >= target; i--) moves.push(...session.events[i].moves.slice().reverse().map(
      inverse));
  else
    for (let i = session.cursor; i < target; i++) moves.push(...session.events[i].moves);
  const event = session.events[action === '撤销' ? session.cursor - 1 : session.cursor],
    label = event?.moves.length === 1 ? describeMove(event.moves[0], state().size) : event?.label || '转动';
  historyJob = {
    target,
    lastAction: action === '回到' ? `回到第${target}条记录` : `${action} · ${label}`,
    moves,
    index: 0,
    working: cloneState(session.state),
    paused: false,
    running: false
  };
  ui();
  runHistory();
}
async function runHistory() {
  const job = historyJob;
  if (!job || job.running) return;
  job.running = true;
  while (historyJob === job && job.index < job.moves.length && !job.paused) {
    const move = job.moves[job.index];
    await animate(move, 0, move.turns * Math.PI / 2, job.moves.length > 6 ? 100 : 300);
    job.working = applyMove(job.working, move);
    job.index++;
    active = null;
    ui();
  }
  job.running = false;
  if (historyJob === job && job.index === job.moves.length) {
    session.seek(job.target);
    lastAction = job.lastAction;
    historyJob = null;
    save();
    ui();
  }
}
$('historyPause').onclick = () => {
  if (historyJob) {
    historyJob.paused = !historyJob.paused;
    ui();
    if (!historyJob.paused) runHistory();
  }
};
$('historyJump').onclick = async () => {
  if (!historyJob) return;
  const job = historyJob;
  job.paused = true;
  await boundary();
  if (historyJob === job) {
    session.seek(job.target);
    lastAction = job.lastAction;
    historyJob = null;
    active = null;
    save();
    ui();
  }
};
$('undoBtn').onclick = () => seek(session.cursor - 1, '撤销');
$('redoBtn').onclick = () => seek(session.cursor + 1, '重做');

async function newGame(size) {
  await boundary();
  queue = [];
  session = new CubeSession(size);
  lastAction = `新开${size}阶魔方`;
  selected = null;
  selectedId = null;
  $('wideMode').checked = false;
  cube?.home(size);
  flat.reset();
  active = null;
  save();
  ui();
}
$('resetBtn').onclick = async () => {
  await boundary();
  if (session.events.length && !await ask('重置当前魔方？', '当前练习局面和步骤会被清除，回到同阶还原态。', '重置')) return;
  newGame(state().size);
};
$('sizeSelect').onchange = async e => {
  const n = Number(e.target.value);
  await boundary();
  if (session.events.length && !await ask('更换阶数？', '更换阶数会新开一局，清除当前练习进度。', '换阶')) {
    ui();
    return;
  }
  newGame(n);
};
$('modeSelect').onchange = async e => {
  const next = e.target.value;
  await boundary();
  if (next === 'simple' && state().size > 3) {
    if (!await ask('进入简单模式？', '简单模式支持2～3阶。你可以留在进阶保留这局，或确认新开三阶局。', '新开三阶局')) {
      ui();
      return;
    }
    mode = next;
    await newGame(3);
  } else {
    mode = next;
    $('wideMode').checked = false;
    if (mode === 'simple') cube?.orbit(0, 0, 'simple');
    save();
    ui();
  }
};
$('scrambleBtn').onclick = async () => {
  if (animating || pumping || gesture || historyJob || player) return;
  if (!await branchAllowed()) return;
  const size = state().size,
    moves = [];
  let prior = '';
  for (let i = 0; i < Math.min(40, 8 * size); i++) {
    const axes = AXES.filter(a => a !== prior),
      axis = axes[Math.floor(Math.random() * axes.length)],
      layer = mode === 'simple' ? (Math.random() < .5 ? 0 : size - 1) : Math.floor(Math.random() * size);
    moves.push({
      axis,
      lo: layer,
      hi: layer,
      turns: Math.random() < .5 ? -1 : 1
    });
    prior = axis;
  }
  const initial = session.state;
  let working = initial;
  historyJob = {
    target: session.cursor,
    moves,
    index: 0,
    working,
    paused: false,
    running: true,
    scramble: true
  };
  ui();
  for (const m of moves) {
    await animate(m, 0, m.turns * Math.PI / 2, 90);
    working = applyMove(working, m);
    historyJob.working = working;
    historyJob.index++;
    active = null;
    frame();
    if (historyJob.paused) {
      const completed = moves.slice(0, historyJob.index);
      historyJob = null;
      active = null;
      if (completed.length) session.commit(completed, `打乱 · 已完成${completed.length}步`, 'scramble');
      lastAction = `打乱 · 已完成${completed.length}步`;
      save();
      ui();
      toast('打乱已暂停，保留完成的步骤，可整次撤销。');
      return;
    }
  }
  historyJob = null;
  session.commit(moves, `打乱 · ${moves.length}步`, 'scramble');
  lastAction = `打乱 · ${moves.length}步（可一次撤销）`;
  save();
  ui();
};
for (const b of document.querySelectorAll('[data-face]')) b.onclick = () => {
  if (animating || player || historyJob) return;
  $('wideMode').checked = false;
  setSelection(faceMove(b.dataset.face, state().size));
};
for (const [id, dir] of [
    ['cwBtn', 1],
    ['ccwBtn', -1],
    ['halfBtn', 2]
  ]) $(id).onclick = () => {
  const m = chosenMove(dir);
  if (m) request(m);
};

function rangeChange() {
  if (animating || player || historyJob) return;
  const lo = Number($('layerStart').value),
    hi = $('wideMode').checked ? Math.max(lo, Number($('layerEnd').value)) : lo;
  setSelection({
    axis: $('axisSelect').value,
    lo,
    hi
  });
}
for (const id of ['axisSelect', 'wideMode', 'layerStart', 'layerEnd']) $(id).onchange = rangeChange;
$('exitWideBtn').onclick = () => {
  $('wideMode').checked = false;
  rangeChange();
};
for (const b of document.querySelectorAll('[data-view]')) b.onclick = async () => {
  await boundary();
  view = b.dataset.view;
  flat.setKind(view);
  ui();
  save();
};
for (const b of document.querySelectorAll('[data-orbit-focus]')) b.onclick = async () => {
  await boundary();
  flat.focusAxis = b.dataset.orbitFocus;
  prefs.axisFocus = flat.focusAxis;
  flat.cacheKey = '';
  ui();
  save();
};
$('homeViewBtn').onclick = () => {
  cube?.home(state().size);
  save();
};
$('homeDiagramBtn').onclick = () => {
  flat.reset();
  frame();
  save();
};
$('settingsBtn').onclick = () => {
  $('labSettings').hidden = !$('labSettings').hidden;
  $('settingsBtn').setAttribute('aria-expanded', String(!$('labSettings').hidden));
};
$('turnMotion').onchange = e => {
  prefs.motion = e.target.value;
  save();
};
$('sensitivity').oninput = e => {
  prefs.sensitivity = Number(e.target.value);
  $('sensitivityValue').textContent = `${prefs.sensitivity.toFixed(1)} 倍`;
  laterSave();
};

let formulas = [];
try {
  const response = await fetch('./formulas.json');
  if (!response.ok) throw new Error('load');
  formulas = await response.json();
} catch {
  toast('公式资料未能加载，请刷新后重试。');
}
const catalog = mountCatalog(formulas, startDemo, toast);
async function startDemo(formula) {
  await boundary();
  if (historyJob) return;
  if (player) await exitPlayer();
  if (player) return;
  let example;
  try {
    example = exampleFor(formula);
  } catch (e) {
    toast(e.message);
    return;
  }
  $('formulaDialog').close();
  const restore = {
    session,
    mode,
    view,
    selected,
    selectedId,
    lastAction,
    camera: cube?.capture(),
    flat: structuredClone(flat.transforms),
    prefs: {...prefs},
    controls: Object.fromEntries(['axisSelect', 'layerStart', 'layerEnd'].map(id => [id, $(id).value])),
    wide: $('wideMode').checked,
    scroll: {x: scrollX, y: scrollY}
  };
  const {moves,steps} = example;
  session = new CubeSession(formula.size);
  session.state = cloneState(example.state);
  session.base = cloneState(session.state);
  player = {
    ...formula,
    moves,
    steps,
    index: 0,
    playing: false,
    initial: structuredClone(session.serialize()),
    restore
  };
  mode = 'advanced';
  selected = null;
  selectedId = null;
  $('wideMode').checked = false;
  lastAction = '示例 · 尚未播放';
  $('formulaWalkthrough').dataset.formula = '';
  $('formulaExplanation').open = false;
  cube?.home(formula.size);
  ui();
  $('formulaPlayer').scrollIntoView({
    block: 'nearest',
    behavior: 'smooth'
  });
}
async function playerStep(dir) {
  if (!player || animating || player.transitioning || player.step) return;
  const p = player;
  p.direction = dir;
  p.step = performPlayerStep(p, dir);
  ui();
  try {
    await p.step;
  } finally {
    p.step = null;
  }
}
async function performPlayerStep(p, dir) {
  if (dir > 0 && p.index < p.moves.length) {
    const m = p.moves[p.index];
    await animate(m);
    session.commit([m], moveName(m, p.size), p.restore ? 'turn' : 'formula');
    p.index++;
    lastAction = `${p.restore?'示例':'公式'} · ${describeMove(m, p.size)}`;
  } else if (dir < 0 && p.index > 0) {
    const m = inverse(p.moves[p.index - 1]);
    await animate(m);
    session.seek(session.cursor - 1);
    p.index--;
    lastAction = `${p.restore?'示例':'公式'} · 上一步 · ${describeMove(m, p.size)}`;
  }
  active = null;
  ui();
  save();
}
async function play() {
  if (!player || player.transitioning) return;
  if (player.playing) {
    player.playing = false;
    ui();
    return;
  }
  if (animating) await boundary();
  if (!player || player.transitioning) return;
  const p = player;
  p.playing = true;
  ui();
  if (!p.playing || p.run) return;
  p.run = (async () => {
    try {
      while (player === p && p.playing && !p.transitioning && p.index < p.moves.length) await playerStep(1);
    } finally {
      if (player === p) {
        p.playing = false;
        ui();
      }
    }
  })();
  try {
    await p.run;
  } finally {
    p.run = null;
  }
}
async function stopPlayer(p) {
  p.playing = false;
  await boundary();
  await p.step;
  await p.run;
}
async function resetPlayer(autoPlay = false) {
  const p = player;
  if (!p || p.transitioning) return;
  p.transitioning = true;
  ui();
  await stopPlayer(p);
  if (player !== p) return;
  session = CubeSession.restore(p.initial);
  p.index = 0;
  p.direction = 1;
  lastAction = `${p.restore?'示例':'公式'} · ${autoPlay?'从头播放':'回到第一步'}`;
  p.transitioning = false;
  active = null;
  ui();
  save();
  if (autoPlay) play();
}
async function exitPlayer() {
  if (!player || player.transitioning) return;
  const p = player;
  p.transitioning = true;
  ui();
  await stopPlayer(p);
  if (p.restore) {
    session = p.restore.session;
    mode = p.restore.mode;
    view = p.restore.view;
    selected = p.restore.selected;
    selectedId = p.restore.selectedId;
    lastAction = p.restore.lastAction;
    flat.transforms = p.restore.flat;
    Object.assign(prefs, p.restore.prefs);
    flat.focusAxis = prefs.axisFocus;
    $('wideMode').checked = p.restore.wide;
    flat.setKind(view);
    if (cube) cube.restore(p.restore.camera, session.state.size);
  }
  player = null;
  active = null;
  save();
  ui();
  if (p.restore) {
    for (const [id, value] of Object.entries(p.restore.controls)) $(id).value = value;
    scrollTo(p.restore.scroll.x, p.restore.scroll.y);
  }
}
$('formulaBtn').onclick = async () => {
  await boundary();
  if (historyJob) return;
  catalog.open(player?.restore?.session.state.size || state().size);
  $('formulaDialog').showModal();
};
$('closeFormula').onclick = () => $('formulaDialog').close();
$('formulaNext').onclick = () => {
  if (player) player.playing = false;
  playerStep(1);
};
$('formulaPrev').onclick = () => {
  if (player) player.playing = false;
  playerStep(-1);
};
$('formulaPlay').onclick = play;
$('formulaFirst').onclick = () => resetPlayer(false);
$('formulaReplay').onclick = () => resetPlayer(true);
$('exitDemo').onclick = exitPlayer;
$('formulaApply').onclick = async () => {
  if (!player?.restore) return;
  const p = player;
  p.playing = false;
  await boundary();
  const original = p.restore;
  if (original.session.state.size !== p.size) {
    toast(`此公式按${p.size}阶解释；你的原局阶数不匹配，不能直接应用。`);
    return;
  }
  const inner = p.moves.some(m => m.lo === m.hi && m.lo === 1 || m.lo !== m.hi);
  if (!await ask('应用到当前局面？', `将对你的${p.size}阶局面执行${p.moves.length}步${inner?'，并进入进阶模式':''}。这不保证复原；完成动作可从历史撤销。`, '应用公式'))
    return;
  if (original.session.cursor !== original.session.events.length && !await branchAllowedFor(original.session))
    return;
  await exitPlayer();
  mode = inner ? 'advanced' : mode;
  player = {
    name: p.name,
    id: p.id,
    size: p.size,
    stage: p.stage,
    group: p.group,
    note: p.note,
    alg: p.alg,
    moves: p.moves,
    steps: p.steps,
    index: 0,
    playing: false,
    initial: structuredClone(session.serialize()),
    restore: null
  };
  ui();
  save();
  play();
};
async function branchAllowedFor(s) {
  return s.cursor === s.events.length || ask('替换后续历史？', '应用公式会从当前步骤建立新分支。', '继续');
}
for (const id of ['helpBtn', 'closeHelp', 'startPlaying']) $(id).onclick = async () => {
  if (id === 'helpBtn') {
    await boundary();
    $('helpDialog').showModal();
  } else {
    $('helpDialog').close();
    try {
      localStorage.setItem('rubiks-help-seen', '1');
    } catch {}
  }
};
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || e.target.closest('input,textarea,select,[contenteditable=true]'))
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) $('redoBtn').click();
    else $('undoBtn').click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    $('redoBtn').click();
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey || mode !== 'advanced' || animating || player || historyJob) return;
  const key = e.key.toLowerCase(),
    n = state().size;
  if (/^[1-7]$/.test(key) && Number(key) <= n) {
    setSelection({
      axis: selected?.axis || 'y',
      lo: Number(key) - 1,
      hi: Number(key) - 1
    });
    e.preventDefault();
    return;
  }
  if (key === 'z' || key === 'c') {
    const m = chosenMove(key === 'z' ? 1 : -1);
    if (m) request(m);
    e.preventDefault();
    return;
  }
  const dir = {
    w: ['y', 1],
    s: ['y', -1],
    a: ['x', -1],
    d: ['x', 1],
    q: ['z', 1],
    e: ['z', -1]
  } [key];
  if (dir) {
    const lo = clamp((selected?.axis === dir[0] ? selected.lo : dir[1] > 0 ? n - 2 : 1) + dir[1], 0, n - 1);
    setSelection({
      axis: dir[0],
      lo,
      hi: lo
    });
    e.preventDefault();
  } else if (key === 'r') {
    const axis = AXES[(AXES.indexOf(selected?.axis || 'y') + 1) % 3];
    setSelection({
      axis,
      lo: selected?.lo || 0,
      hi: selected?.lo || 0
    });
    e.preventDefault();
  }
});
addEventListener('blur', () => {
  queue = [];
  pointers.clear();
  if (player) player.playing = false;
  if (historyJob) historyJob.paused = true;
  if (gesture) boundary();
  save();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    queue = [];
    if (player) player.playing = false;
    if (historyJob) historyJob.paused = true;
    boundary().then(save);
  }
});
addEventListener('pagehide', save);
new MutationObserver(() => cube?.draw()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme']
});
if (saveBlocked && savedRaw) notice('找到的旧进度无法安全恢复。原记录暂时保留，当前可以体验新局，但不会覆盖旧记录。', [
  ['清除旧记录并保存新局', async () => {
    if (await ask('清除本机旧进度？', '只清除此浏览器的魔方旧记录，不影响博客账号与文章。', '清除')) {
      saveBlocked = false;
      if (save()) $('savedNotice').hidden = true;
    }
  }]
]);
else if (savedRaw) notice('已恢复本机保存的魔方与步骤。', [
  ['收起', () => $('savedNotice').hidden = true]
]);
else {
  let seen = false;
  try {
    seen = localStorage.getItem('rubiks-help-seen') === '1';
  } catch {}
  if (!seen) notice('第一次来？拖色块或彩点试一试，操作说明随时可以打开。', [
    ['看看怎么转', () => $('helpDialog').showModal()],
    ['开始体验', () => {
      $('savedNotice').hidden = true;
      try {
        localStorage.setItem('rubiks-help-seen', '1');
      } catch {}
    }]
  ]);
}
ui();
// Read-only inspection surface for model/visual regression checks.
globalThis.cubeLab = Object.freeze({
  get snapshot() {
    return {
      state: cloneState(state()),
      active: active ? {
        ...active
      } : null,
      mode,
      view,
      selection: selected ? {
        ...selected
      } : null,
      history: session.serialize(),
      playing: !!player?.playing,
      demonstration: !!player?.restore,
      historyPreview: !!historyJob,
      camera: cube?.capture(),
      flat: structuredClone(flat.transforms),
      prefs: {...prefs},
      wide: $('wideMode').checked,
      selectedId,
      lastAction
    };
  },
  get input() {
    return gesture ? {
      kind: gesture.kind,
      hit: gesture.hit?.sticker?.id,
      surface: gesture.surface
    } : null;
  },
  get targets() {
    if (!cube) return [];
    const r = $('cubeCanvas').getBoundingClientRect(),
      T = cube.T;
    return state().stickers.filter(t => dot(t.n, cube.camera.position.toArray()) > 0).map(t => {
      const p = new T.Vector3(...t.p.map(v => v / 2)).project(cube.camera);
      return {
        id: t.id,
        x: r.x + (p.x + 1) * r.width / 2,
        y: r.y + (1 - p.y) * r.height / 2,
        tangents: Object.fromEntries(AXES.map(a => [a, cube.tangent(t, a)]))
      };
    });
  }
});
