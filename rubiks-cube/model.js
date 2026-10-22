// Exact sticker model. Adapted from Rubik's Cube (Apache-2.0); no rendering dependencies.
export const AXES = ['x', 'y', 'z'];
export const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];
export const COLORS = {
  U: '#ffd500',
  D: '#f5f5f5',
  F: '#0051ba',
  B: '#009b48',
  L: '#ff5800',
  R: '#c41e3a'
};
export const FACE = {
  U: {
    axis: 1,
    sign: 1,
    name: '上'
  },
  D: {
    axis: 1,
    sign: -1,
    name: '下'
  },
  F: {
    axis: 2,
    sign: 1,
    name: '前'
  },
  B: {
    axis: 2,
    sign: -1,
    name: '后'
  },
  R: {
    axis: 0,
    sign: 1,
    name: '右'
  },
  L: {
    axis: 0,
    sign: -1,
    name: '左'
  }
};
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = a => {
  const n = Math.hypot(...a);
  return a.map(v => v / n);
};
export function rotate(v, axis, angle) {
  const a = typeof axis === 'string' ? AXES.indexOf(axis) : axis,
    c = Math.cos(angle),
    s = Math.sin(angle),
    out = [...v],
    i = (a + 1) % 3,
    j = (a + 2) % 3;
  out[i] = v[i] * c - v[j] * s;
  out[j] = v[i] * s + v[j] * c;
  return out;
}
export function createState(size = 3) {
  if (!Number.isInteger(size) || size < 2 || size > 7) throw new Error('阶数必须为2～7');
  const stickers = [];
  for (const face of FACES)
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const a = 2 * col - size + 1,
          b = 2 * row - size + 1;
        const p = {
          U: [a, size, b],
          D: [a, -size, -b],
          F: [a, -b, size],
          B: [-a, -b, -size],
          R: [size, -b, -a],
          L: [-size, -b, a]
        } [face];
        const n = [0, 0, 0];
        n[FACE[face].axis] = FACE[face].sign;
        stickers.push({
          id: `${face}-${row}-${col}`,
          color: face,
          p: p.map(v => v || 0),
          n
        });
      }
  return {
    size,
    stickers
  };
}
export const cloneState = s => ({
  size: s.size,
  stickers: s.stickers.map(t => ({
    ...t,
    p: [...t.p],
    n: [...t.n]
  }))
});
export function faceOf(t) {
  return FACES.find(f => t.n[FACE[f].axis] === FACE[f].sign);
}
export function cellOf(t, size) {
  const [x, y, z] = t.p;
  const [a, b] = {
    U: [x, z],
    D: [x, -z],
    F: [x, -y],
    B: [-x, -y],
    R: [-z, -y],
    L: [z, -y]
  } [faceOf(t)];
  return {
    face: faceOf(t),
    row: Math.round((b + size - 1) / 2),
    col: Math.round((a + size - 1) / 2)
  };
}
export function layerOf(t, axis, size) {
  const a = typeof axis === 'string' ? AXES.indexOf(axis) : axis;
  return Math.round((t.p[a] - t.n[a] + size - 1) / 2);
}
export function affects(t, move, size) {
  const l = layerOf(t, move.axis, size);
  return l >= move.lo && l <= move.hi;
}
export function validMove(m, size) {
  return m && AXES.includes(m.axis) && Number.isInteger(m.lo) && Number.isInteger(m.hi) && m.lo >= 0 && m.lo <= m.hi &&
    m.hi < size && [-2, -1, 1, 2].includes(m.turns);
}
export function applyMove(state, move) {
  if (!validMove(move, state.size)) throw new Error('转层参数无效');
  const out = cloneState(state),
    angle = move.turns * Math.PI / 2;
  for (const t of out.stickers)
    if (affects(t, move, state.size)) {
      t.p = rotate(t.p, move.axis, angle).map(v => Math.round(v) || 0);
      t.n = rotate(t.n, move.axis, angle).map(v => Math.round(v) || 0);
    }
  return out;
}
export const inverse = m => ({
  ...m,
  turns: -m.turns
});
export const solved = state => FACES.every(f => new Set(state.stickers.filter(t => faceOf(t) === f).map(t => t.color))
  .size === 1);
export function faceMove(face, size, turns = 1, width = 1) {
  const f = FACE[face];
  return {
    axis: AXES[f.axis],
    lo: f.sign > 0 ? size - width : 0,
    hi: f.sign > 0 ? size - 1 : width - 1,
    turns: -f.sign * turns
  };
}
export function moveName(m, size) {
  const face = FACES.find(f => FACE[f].axis === AXES.indexOf(m.axis) && (FACE[f].sign === 1 ? m.hi === size - 1 : m
    .lo === 0));
  if (face) {
    const f = FACE[face],
      w = m.hi - m.lo + 1,
      turns = m.turns * -f.sign;
    return `${w===1?'':w===2?'':w}${face}${w>1?'w':''}${Math.abs(turns)===2?'2':turns<0?"'":''}`;
  }
  return `${m.axis.toUpperCase()} 第${m.lo+1}${m.hi===m.lo?'':'～'+(m.hi+1)}层 ${Math.abs(m.turns)*90}°${m.turns>0?'正向':'反向'}`;
}
export function describeMove(m, size) {
  const face = FACES.find(f => FACE[f].axis === AXES.indexOf(m.axis) &&
    (FACE[f].sign === 1 ? m.hi === size - 1 : m.lo === 0)),
    reference = face || {x:'R', y:'U', z:'F'}[m.axis],
    range = m.lo === 0 && m.hi === size - 1 ? `${m.axis.toUpperCase()}轴整块` :
      m.lo === m.hi && face ? `${FACE[face].name}面 ${face}` :
      `${m.axis.toUpperCase()}轴第${m.lo+1}${m.lo===m.hi?'':'～'+(m.hi+1)}层`,
    direction = Math.abs(m.turns) === 2 ? '半圈180°' :
      `${m.turns * -FACE[reference].sign > 0 ? '顺时针' : '逆时针'}90°`;
  return `${range} · ${m.lo===m.hi&&face?'':`从${FACE[reference].name}面看`}${direction}`;
}
export function parseFormula(text, size = 3, detailed = false) {
  if (![3, 4].includes(size)) throw new Error('公式演示目前支持三阶与四阶');
  text = text.replace(/[’′]/g, "'");
  let index = 0;
  const parse = inside => {
    const moves = [];
    while (index < text.length) {
      const c = text[index];
      if (/\s/.test(c)) {
        index++;
        continue;
      }
      if (c === ')') {
        if (!inside) throw new Error('公式括号不匹配');
        index++;
        return moves;
      }
      if (c === '(') {
        index++;
        const nested = parse(true);
        const match = text.slice(index).match(/^\d+/),
          count = match ? Number(match[0]) : 1;
        if (count < 1 || count > 20) throw new Error('公式重复次数超限');
        if (match) index += match[0].length;
        for (let i = 0; i < count; i++) moves.push(...nested.map(m => ({
          ...m
        })));
        continue;
      }
      const match = text.slice(index).match(/^(\d+)?([RLUDFBrludfbMESxyz])(w)?(2)?(')?/);
      if (!match) throw new Error('不支持的公式记号：' + text.slice(index, index + 8));
      index += match[0].length;
      const [, depth, letter, wide, doubled, prime] = match, t = (doubled ? 2 : 1) * (prime ? -1 : 1);
      let move;
      if (/[xyz]/.test(letter)) move = {
        axis: letter,
        lo: 0,
        hi: size - 1,
        turns: -t
      };
      else if (/[MES]/.test(letter)) {
        if (size % 2 === 0) throw new Error('四阶无单一中层，请使用2R等内层记号，或Rw等宽层记号');
        move = {
        axis: {
          M: 'x',
          E: 'y',
          S: 'z'
        } [letter],
        lo: 1,
        hi: 1,
        turns: t * (letter === 'S' ? -1 : 1)
        };
      }
      else {
        const isWide = wide || letter === letter.toLowerCase(),
          width = depth ? Number(depth) : isWide ? 2 : 1;
        if (width < 1 || width > size) throw new Error('公式层数超出当前阶数');
        move = faceMove(letter.toUpperCase(), size, t, width);
        if (depth && !isWide) {
          const layer = FACE[letter].sign > 0 ? size - width : width - 1;
          move.lo = move.hi = layer;
        }
      }
      if (detailed) move.token = match[0];
      moves.push(move);
      if (moves.length > 500) throw new Error('公式过长');
    }
    if (inside) throw new Error('公式括号未闭合');
    return moves;
  };
  const result = parse(false);
  if (result.length > 500) throw new Error('公式过长');
  return result;
}
export function validateState(state) {
  if (!state || !Number.isInteger(state.size) || state.size < 2 || state.size > 7 || !Array.isArray(state.stickers))
    return false;
  const base = createState(state.size),
    ids = new Map(base.stickers.map(t => [t.id, t.color])),
    slots = new Set(base.stickers.map(t => t.p.join(',') + '|' + t.n.join(','))),
    seen = new Set();
  if (state.stickers.length !== base.stickers.length) return false;
  for (const t of state.stickers) {
    if (!t || ids.get(t.id) !== t.color || seen.has(t.id) || !Array.isArray(t.p) || !Array.isArray(t.n) || t.p
      .length !== 3 || t.n.length !== 3 || ![...t.p, ...t.n].every(Number.isInteger)) return false;
    const slot = t.p.join(',') + '|' + t.n.join(',');
    if (!slots.delete(slot)) return false;
    seen.add(t.id);
  }
  return slots.size === 0;
}
// Circular orbits on a sphere, shown through an external perspective projection.
// The external viewpoint avoids an infinite projection pole during a user's drag.
// Apparent ellipses are projections of actual rotation circles, never invented permutations.
export function projection(size) {
  const points = createState(size).stickers.map(t => unit(t.p)),
    pole = unit([1.31, 1.73, 2.17]);
  const u = unit(cross(Math.abs(pole[1]) < .8 ? [0, 1, 0] : [1, 0, 0], pole)),
    v = cross(pole, u);
  const raw = p => {
    const q = unit(p),
      den = 2.6 - dot(q, pole);
    return [dot(q, u) / den, -dot(q, v) / den];
  };
  const mapped = points.map(raw),
    extent = Math.max(...mapped.flat().map(Math.abs)),
    scale = 205 / extent;
  const project = p => {
    const q = raw(p);
    return [250 + q[0] * scale, 250 + q[1] * scale];
  };
  return {
    project,
    pole,
    scale
  };
}
export function orbitPoint(t, axis, angle, project) {
  return project(rotate(t.p, axis, angle));
}
export function orbitKey(t, axis) {
  return `${axis}:${(t.p[AXES.indexOf(axis)]/Math.hypot(...t.p)).toFixed(8)}`;
}
export function buildOrbits(state) {
  const groups = new Map();
  for (const axis of AXES)
    for (const t of state.stickers) {
      const id = orbitKey(t, axis),
        c = t.p[AXES.indexOf(axis)] / Math.hypot(...t.p);
      if (!groups.has(id)) groups.set(id, {
        id,
        axis,
        c,
        representative: t,
        ids: [],
        layers: new Set(),
        fixed: Math.abs(c) > 1 - 1e-10
      });
      const g = groups.get(id);
      g.ids.push(t.id);
      g.layers.add(layerOf(t, axis, state.size));
    }
  return [...groups.values()].map(g => ({
    ...g,
    layers: [...g.layers].sort((a, b) => a - b)
  }));
}
export function distanceToPath(point, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      den = dx * dx + dy * dy,
      t = den ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / den)) : 0;
    best = Math.min(best, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy));
  }
  return best;
}
export const NET = {
  U: [1, 0],
  L: [0, 1],
  F: [1, 1],
  R: [2, 1],
  B: [3, 1],
  D: [1, 2]
};
export function netPoint(t, size) {
  const {
    face,
    row,
    col
  } = cellOf(t, size), [x, y] = NET[face];
  return [(x * size + col + .5) * 32, (y * size + row + .5) * 32];
}
export function settleAngle(angle, velocity = 0) {
  const distance = Math.abs(angle), sign = Math.sign(angle),
    flick = distance > 12 && Math.abs(velocity) >= 135;
  // Most gestures mean a quarter turn. A half turn needs deliberate travel,
  // and a fast release must not promote an ordinary 90° drag to 180°.
  let target = distance >= 160 ? 180 : distance >= 45 ? 90 : 0;
  if (flick) {
    if (Math.sign(velocity) === sign) target = Math.max(90, target);
    else target = Math.max(0, target - 90);
  }
  return sign * target || 0;
}
