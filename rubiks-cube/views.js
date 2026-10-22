import {
  AXES,
  FACES,
  FACE,
  COLORS,
  NET,
  affects,
  rotate,
  projection,
  applyMove,
  cellOf,
  netPoint,
  layerOf,
  dot,
  orbitKey,
  distanceToPath
} from './model.js';
const ns = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const key = t => t.p.join(',') + '|' + t.n.join(',');
export class CubeView {
  constructor(canvas) {
    const T = globalThis.THREE;
    this.T = T;
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputEncoding = T.sRGBEncoding;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(38, 1, .1, 200);
    this.scene.add(new T.AmbientLight(0xffffff, .8));
    const light = new T.DirectionalLight(0xffffff, .8);
    light.position.set(4, 8, 6);
    this.scene.add(light);
    const fill = new T.DirectionalLight(0xffffff, .3);
    fill.position.set(-6, -2, -5);
    this.scene.add(fill);
    this.group = new T.Group();
    this.scene.add(this.group);
    this.geo = new T.BoxGeometry(.955, .955, .955);
    this.edgeGeo = new T.EdgesGeometry(this.geo);
    this.materials = Object.fromEntries(Object.entries({
      ...COLORS,
      K: '#15241e'
    }).map(([k, c]) => [k, new T.MeshStandardMaterial({
      color: new T.Color(c).convertSRGBToLinear(),
      roughness: .5,
      metalness: .02
    })]));
    this.edgeMat = new T.LineBasicMaterial({
      color: 0x658d75,
      transparent: true,
      opacity: .85
    });
    this.mutedEdge = new T.LineBasicMaterial({
      color: 0x193d33,
      transparent: true,
      opacity: .13
    });
    this.stickerOutline = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(.92, .92)), new T
      .LineBasicMaterial({
        color: 0xf3f6f5,
        depthTest: false
      }));
    this.stickerOutline.renderOrder = 10;
    this.scene.add(this.stickerOutline);
    this.stickerOutline.visible = false;
    this.raycaster = new T.Raycaster();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      document.getElementById('cubeError').hidden = false;
    });
  }
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(260, r.height), false);
    this.camera.aspect = r.width / Math.max(260, r.height);
    this.camera.updateProjectionMatrix();
    this.draw();
  }
  home(size) {
    const d = size * 2.5;
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(d * .72, d * .6, d * .86);
    this.camera.lookAt(0, 0, 0);
    this.homeDistance = this.camera.position.length();
    this.draw();
  }
  capture() {
    return {
      position: this.camera.position.toArray(),
      up: this.camera.up.toArray()
    };
  }
  restore(data, size) {
    if (!data || !Array.isArray(data.position) || !Array.isArray(data.up) || data.position.length !== 3 || data.up
      .length !== 3 || ![...data.position, ...data.up].every(Number.isFinite)) return this.home(size);
    this.homeDistance = size * 2.5 * Math.hypot(.72, .6, .86);
    this.camera.position.fromArray(data.position);
    this.camera.up.fromArray(data.up).normalize();
    if (this.camera.position.length() < size || this.camera.position.length() > size * 12) return this.home(size);
    this.camera.lookAt(0, 0, 0);
    this.draw();
  }
  orbit(dx, dy, mode) {
    const T = this.T;
    if (mode === 'simple') {
      const p = this.camera.position,
        d = p.length(),
        az = Math.atan2(p.x, p.z) - dx * .007,
        polar = Math.max(.15, Math.min(Math.PI - .15, Math.acos(Math.max(-1, Math.min(1, p.y / d))) + dy * .007));
      p.set(d * Math.sin(polar) * Math.sin(az), d * Math.cos(polar), d * Math.sin(polar) * Math.cos(az));
      this.camera.up.set(0, 1, 0);
    } else {
      const right = new T.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion),
        up = this.camera.up.clone().normalize(),
        q = new T.Quaternion().setFromAxisAngle(up, -dx * .007).multiply(new T.Quaternion().setFromAxisAngle(right, -
          dy * .007));
      this.camera.position.applyQuaternion(q);
      this.camera.up.applyQuaternion(q).normalize();
    }
    this.camera.lookAt(0, 0, 0);
    this.draw();
  }
  zoom(factor) {
    const distance = Math.max(this.homeDistance * .5, Math.min(this.homeDistance * 1.55, this.camera.position
    .length() * factor));
    this.camera.position.setLength(distance);
    this.draw();
  }
  build(state) {
    const T = this.T;
    this.group.clear();
    this.pivot = null;
    const cubes = new Map();
    for (const t of state.stickers) {
      const p = t.p.map((v, i) => v - t.n[i]),
        k = p.join(',');
      if (!cubes.has(k)) cubes.set(k, {
        p,
        faces: {}
      });
      cubes.get(k).faces[t.n.join(',')] = t.color;
    }
    const normals = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];
    for (const c of cubes.values()) {
      const mesh = new T.Mesh(this.geo, normals.map(n => this.materials[c.faces[n.join(',')] || 'K']));
      mesh.position.set(...c.p.map(v => v / 2));
      mesh.userData.p = c.p;
      const edge = new T.LineSegments(this.edgeGeo, this.mutedEdge);
      mesh.add(edge);
      mesh.userData.edge = edge;
      this.group.add(mesh);
    }
    this.meshes = [...this.group.children];
    this.base = state;
    this.activeKey = '';
  }
  sync(state, active, selection, selectedId) {
    const next = active ? `${active.axis}/${active.lo}/${active.hi}` : '';
    if (this.base !== state || this.activeKey !== next) {
      this.build(state);
      if (active) {
        this.pivot = new this.T.Group();
        this.group.add(this.pivot);
        const a = AXES.indexOf(active.axis);
        for (const mesh of this.meshes) {
          const l = (mesh.userData.p[a] + state.size - 1) / 2;
          if (l >= active.lo && l <= active.hi) this.pivot.attach(mesh);
        }
        this.activeKey = next;
      }
    }
    if (this.pivot && active) this.pivot.rotation.set(...AXES.map(a => a === active.axis ? active.angle : 0));
    for (const mesh of this.meshes) {
      const sel = active || selection,
        a = sel ? AXES.indexOf(sel.axis) : 0,
        l = (mesh.userData.p[a] + state.size - 1) / 2;
      mesh.userData.edge.material = sel && l >= sel.lo && l <= sel.hi ? this.edgeMat : this.mutedEdge;
    }
    const sticker = state.stickers.find(t => t.id === selectedId);
    this.stickerOutline.visible = !!sticker;
    if (sticker) {
      const moving = active && affects(sticker, active, state.size),
        p = moving ? rotate(sticker.p, active.axis, active.angle) : sticker.p,
        n = moving ? rotate(sticker.n, active.axis, active.angle) : sticker.n;
      this.stickerOutline.position.set(...p.map((v, i) => v / 2 + n[i] * .003));
      this.stickerOutline.quaternion.setFromUnitVectors(new this.T.Vector3(0, 0, 1), new this.T.Vector3(...n));
      this.stickerOutline.material.color.set(['U', 'D'].includes(sticker.color) ? 0x193d33 : 0xf3f6f5);
    }
    this.draw();
  }
  draw() {
    if (this.camera && this.renderer) this.renderer.render(this.scene, this.camera);
  }
  pick(x, y, state) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera({
      x: (x - r.left) / r.width * 2 - 1,
      y: -(y - r.top) / r.height * 2 + 1
    }, this.camera);
    this.scene.updateMatrixWorld(true);
    const hit = this.raycaster.intersectObjects(this.meshes || [], false)[0];
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray().map(v => Math.round(v) ||
        0),
      center = hit.object.userData.p,
      p = center.map((v, i) => v + n[i]),
      sticker = state.stickers.find(t => key(t) === p.join(',') + '|' + n.join(','));
    return sticker ? {
      sticker,
      point: hit.point.toArray()
    } : null;
  }
  tangent(sticker, axis) {
    const T = this.T,
      p = sticker.p.map(v => v / 2),
      a = new T.Vector3(...p).project(this.camera),
      b = new T.Vector3(...rotate(p, axis, .03)).project(this.camera),
      r = this.canvas.getBoundingClientRect();
    return [(b.x - a.x) * r.width / 2, -(b.y - a.y) * r.height / 2];
  }
  width(size) {
    const T = this.T,
      r = this.canvas.getBoundingClientRect(),
      points = [];
    for (const x of [-size / 2, size / 2])
      for (const y of [-size / 2, size / 2])
        for (const z of [-size / 2, size / 2]) points.push(new T.Vector3(x, y, z).project(this.camera).x);
    return (Math.max(...points) - Math.min(...points)) * r.width / 2;
  }
}

const faceXY = (p, face, n) => {
  const [x, y, z] = p, [a, b] = {
    U: [x, z],
    D: [x, -z],
    F: [x, -y],
    B: [-x, -y],
    R: [-z, -y],
    L: [z, -y]
  } [face], [gx, gy] = NET[face];
  return [(gx * n + (a + n) / 2) * 32, (gy * n + (b + n) / 2) * 32];
};

function travelDirection(t, axis, sign, size) {
  const face = cellOf(t, size).face,
    a = faceXY(t.p, face, size),
    b = faceXY(rotate(t.p, axis, sign * .01), face, size),
    d = [b[0] - a[0], b[1] - a[1]],
    k = Math.abs(d[0]) > Math.abs(d[1]) ? 0 : 1;
  return k === 0 ? [Math.sign(d[0]), 0] : [0, Math.sign(d[1])];
}
export class FlatView {
  constructor(el) {
    this.el = el;
    this.kind = 'circle';
    this.focusAxis = 'all';
    this.transforms = {
      circle: {
        zoom: 1,
        x: 0,
        y: 0
      },
      net: {
        zoom: 1,
        x: 0,
        y: 0
      }
    };
  }
  setKind(kind) {
    this.kind = kind;
    this.cacheKey = '';
  }
  reset() {
    this.transforms[this.kind] = {
      zoom: 1,
      x: 0,
      y: 0
    };
    this.cacheKey = '';
  }
  pan(dx, dy) {
    const t = this.transforms[this.kind],
      r = this.el.getBoundingClientRect();
    t.x += dx * this.w / r.width;
    t.y += dy * this.h / r.height;
    this.applyTransform();
  }
  zoom(factor) {
    const t = this.transforms[this.kind];
    t.zoom = Math.max(.6, Math.min(4, t.zoom * factor));
    this.applyTransform();
  }
  applyTransform() {
    if (!this.world) return;
    const t = this.transforms[this.kind];
    this.world.setAttribute('transform',
      `translate(${this.w/2+t.x} ${this.h/2+t.y}) scale(${t.zoom}) translate(${-this.w/2} ${-this.h/2})`);
  }
  create(state) {
    this.el.replaceChildren();
    this.size = state.size;
    this.w = this.kind === 'circle' ? 500 : state.size * 128;
    this.h = this.kind === 'circle' ? 500 : state.size * 96;
    this.el.setAttribute('viewBox', `-12 -20 ${this.w+24} ${this.h+40}`);
    this.world = svg('g');
    this.el.append(this.world);
    this.paths = svg('g', {
      'class': 'orbit-lines'
    });
    this.tiles = svg('g');
    this.labels = svg('g');
    this.world.append(this.paths, this.tiles, this.labels);
    this.nodes = new Map();
    this.geo = projection(state.size);
    if (this.kind === 'net') {
      const defs = svg('defs');
      this.el.prepend(defs);
      for (const f of FACES) {
        const [gx, gy] = NET[f], x = gx * state.size * 32, y = gy * state.size * 32, clip = svg('clipPath', {
          id: 'face-clip-' + f
        });
        clip.append(svg('rect', {
          x,
          y,
          width: state.size * 32,
          height: state.size * 32
        }));
        defs.append(clip);
        const g = svg('g', {
          'clip-path': `url(#face-clip-${f})`
        });
        g.dataset.netFace = f;
        this.tiles.append(g);
        this.labels.append(svg('text', {
          x: x + 5,
          y: y - 6,
          'class': 'face-name'
        }));
        this.labels.lastChild.textContent = `${FACE[f].name} ${f}`;
      }
    } else {
      for (const axis of AXES) this.addOrbits(state, {
        axis,
        lo: 0,
        hi: state.size - 1
      }, false);
    }
    this.cacheKey = '';
    this.applyTransform();
  }
  addOrbits(state, move, hot) {
    const seen = new Set();
    for (const t of state.stickers) {
      if (!affects(t, move, state.size)) continue;
      const id = orbitKey(t, move.axis);
      if (seen.has(id)) continue;
      seen.add(id);
      const c = t.p[AXES.indexOf(move.axis)] / Math.hypot(...t.p);
      if (Math.abs(c) > 1 - 1e-10) {
        if (hot || this.focusAxis === move.axis) {
          const p = this.geo.project(t.p),
            mark = svg('circle', {
              cx: p[0],
              cy: p[1],
              r: 10,
              fill: 'none',
              'class': 'fixed-center',
              'data-fixed-axis': move.axis
            });
          const title = svg('title');
          title.textContent = `绕${move.axis.toUpperCase()}轴转动时位于轴上，位置不变`;
          mark.append(title);
          this.paths.append(mark);
        }
        continue;
      }
      const points = [];
      for (let i = 0; i <= 128; i++) points.push(this.geo.project(rotate(t.p, move.axis, i / 128 * Math.PI * 2)));
      const d = points.map((p, i) => `${i?'L':'M'}${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('') + 'Z';
      const path = svg('path', {
        d,
        'class': hot ? 'orbit hot' : 'orbit',
        fill: 'none',
        'data-axis': move.axis,
        'data-orbit': id
      });
      const title = svg('title');
      title.textContent = `${move.axis.toUpperCase()}轴的实际转动轨迹`;
      path.append(title);
      path.orbitPoints = points;
      this.paths.append(path);
    }
  }
  render(state, active, selection, selectedId) {
    if (this.size !== state.size || this.lastKind !== this.kind) {
      this.create(state);
      this.lastKind = this.kind;
    }
    this.state = state;
    this.selection = selection;
    const track = active || selection,
      cache = `${state.size}/${track?.axis}/${track?.lo}/${track?.hi}/${this.focusAxis}/${selectedId}`;
    if (this.kind === 'circle') {
      if (this.cacheKey !== cache) {
        this.paths.replaceChildren();
        for (const axis of AXES)
          if (this.focusAxis === 'all' || this.focusAxis === axis) this.addOrbits(state, {
            axis,
            lo: 0,
            hi: state.size - 1
          }, false);
        if (track) this.addOrbits(state, track, true);
        this.cacheKey = cache;
      }
      if (this.nodes.size !== state.stickers.length) {
        this.tiles.replaceChildren();
        this.nodes.clear();
        for (const t of state.stickers) {
          const circle = svg('circle', {
            'data-sticker': t.id,
            r: state.size > 4 ? 4.5 : 7,
            fill: COLORS[t.color]
          });
          circle.append(svg('title'));
          this.tiles.append(circle);
          this.nodes.set(t.id, circle);
        }
      }
      for (const t of state.stickers) {
        const p = this.geo.project(active && affects(t, active, state.size) ? rotate(t.p, active.axis, active.angle) :
            t.p),
          node = this.nodes.get(t.id);
        node.setAttribute('cx', p[0]);
        node.setAttribute('cy', p[1]);
        for (const axis of AXES) node.setAttribute(`data-orbit-${axis}`, orbitKey(t, axis));
        node.setAttribute('class',
          `${track&&affects(t,track,state.size)?'moving ':''}${selectedId===t.id?'picked':''}`);
        node.querySelector('title').textContent =
          `${FACE[cellOf(t,state.size).face].name}面 第${cellOf(t,state.size).row+1}行 第${cellOf(t,state.size).col+1}列；X／Y／Z轴各有对应轨迹`;
      }
    } else this.renderNet(state, active, selection, selectedId);
    this.applyTransform();
  }
  renderNet(state, active, selection, selectedId) {
    for (const g of this.tiles.children) g.replaceChildren();
    this.labels.querySelectorAll('.transfer-arrow').forEach(node => node.remove());
    let phase = 0,
      from = state,
      to = state,
      sign = 1;
    if (active) {
      sign = Math.sign(active.angle) || 1;
      const q = Math.min(2, Math.floor(Math.abs(active.angle) / (Math.PI / 2) + 1e-8));
      phase = Math.abs(active.angle) / (Math.PI / 2) - q;
      from = q ? applyMove(state, {
        ...active,
        turns: q * sign
      }) : state;
      to = phase > 1e-7 ? applyMove(from, {
        ...active,
        turns: sign
      }) : from;
    }
    const groups = Object.fromEntries([...this.tiles.children].map(g => [g.dataset.netFace, g]));
    const place = (t, face, p, hot, angle = 0) => {
      const rect = svg('rect', {
        x: p[0] - 14.7,
        y: p[1] - 14.7,
        width: 29.4,
        height: 29.4,
        rx: 2,
        fill: COLORS[t.color],
        'data-sticker': t.id,
        'class': `${hot?'moving ':''}${selectedId===t.id?'picked':''}`
      });
      if (angle) rect.setAttribute('transform', `rotate(${angle} ${p[0]} ${p[1]})`);
      groups[face].append(rect);
    };
    const transferFaces = new Set();
    for (let i = 0; i < state.stickers.length; i++) {
      const original = state.stickers[i],
        t = from.stickers[i],
        target = to.stickers[i],
        moving = active && affects(original, active, state.size),
        f = cellOf(t, state.size).face;
      if (!moving || phase < 1e-7) {
        place(t, f, netPoint(t, state.size), selection && affects(t, selection, state.size));
        continue;
      }
      if (t.n[AXES.indexOf(active.axis)] !== 0) {
        const angle = sign * phase * Math.PI / 2,
          p = faceXY(rotate(t.p, active.axis, angle), f, state.size),
          basis = {
            U: [1, 0, 0],
            D: [1, 0, 0],
            F: [1, 0, 0],
            B: [-1, 0, 0],
            R: [0, 0, -1],
            L: [0, 0, 1]
          } [f],
          end = faceXY(rotate(t.p.map((v, j) => v + basis[j]), active.axis, angle), f, state.size);
        place(t, f, p, true, Math.atan2(end[1] - p[1], end[0] - p[0]) * 180 / Math.PI);
      } else {
        const a = netPoint(t, state.size),
          b = netPoint(target, state.size),
          da = travelDirection(t, active.axis, sign, state.size),
          db = travelDirection(target, active.axis, sign, state.size),
          span = state.size * 32;
        place(t, f, [a[0] + da[0] * span * phase, a[1] + da[1] * span * phase], true);
        place(target, cellOf(target, state.size).face, [b[0] - db[0] * span * (1 - phase), b[1] - db[1] * span * (1 -
          phase)], true);
        if (!transferFaces.has(f)) {
          transferFaces.add(f);
          const [gx, gy] = NET[f], x = (gx * state.size + state.size / 2) * 32,
            y = (gy * state.size + state.size / 2) * 32,
            dx = da[0], dy = da[1], ex = x + dx * 14, ey = y + dy * 14;
          this.labels.append(svg('path', {
            d: `M${x-dx*14},${y-dy*14}L${ex},${ey}M${ex-dx*7-dy*4},${ey-dy*7+dx*4}L${ex},${ey}L${ex-dx*7+dy*4},${ey-dy*7-dx*4}`,
            class: 'transfer-arrow', fill: 'none', 'aria-hidden': 'true'
          }));
        }
      }
    }
  }
  coordinate(x, y) {
    const m = this.world.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return [p.x, p.y];
  }
  pick(x, y, state, allowOrbit = false) {
    const p = this.coordinate(x, y);
    if (!p) return null;
    const positions = state.stickers.map(t => ({
      sticker: t,
      p: this.kind === 'circle' ? this.geo.project(t.p) : netPoint(t, state.size)
    }));
    const hits = positions.map(v => ({
      ...v,
      d: Math.hypot(p[0] - v.p[0], p[1] - v.p[1])
    })).filter(v => v.d < (this.kind === 'circle' ? 12 : 16)).sort((a, b) => a.d - b.d);
    if (hits.length) {
      if (this.kind === 'circle' && hits[1] && hits[1].d - hits[0].d < 2) return {
        ambiguous: true
      };
      return hits[0];
    }
    if (this.kind !== 'circle' || !allowOrbit) return null;
    const tracks = [...this.paths.querySelectorAll('path[data-orbit]')].map(path => ({
      axis: path.dataset.axis,
      id: path.dataset.orbit,
      d: distanceToPath(p, path.orbitPoints)
    })).sort((a, b) => a.d - b.d);
    const best = tracks[0],
      second = tracks.find(v => v.id !== best?.id);
    if (!best || best.d > 6) return null;
    if (second && second.d - best.d < 1) return {
      ambiguous: true
    };
    const points = positions.filter(v => orbitKey(v.sticker, best.axis) === best.id).sort((a, b) => Math.hypot(p[0] -
      a.p[0], p[1] - a.p[1]) - Math.hypot(p[0] - b.p[0], p[1] - b.p[1]));
    return points[0] ? {
      ...points[0],
      orbitAxis: best.axis
    } : null;
  }
  tangent(t, axis) {
    const angle = .025;
    let a, b;
    if (this.kind === 'circle') {
      a = this.geo.project(t.p);
      b = this.geo.project(rotate(t.p, axis, angle));
    } else {
      const f = cellOf(t, this.state.size).face;
      a = faceXY(t.p, f, this.state.size);
      b = faceXY(rotate(t.p, axis, angle), f, this.state.size);
    }
    const m = this.world.getScreenCTM();
    return [(b[0] - a[0]) * m.a + (b[1] - a[1]) * m.c, (b[0] - a[0]) * m.b + (b[1] - a[1]) * m.d];
  }
}
