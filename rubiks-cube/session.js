import {
  createState,
  cloneState,
  applyMove,
  validMove,
  validateState
} from './model.js';
const countEvents = (events, start = 0) => events.reduce((n, e) => e.kind === 'scramble' ? 0 : n + (['manual',
  'formula', 'turn'
].includes(e.kind) ? e.moves.length : 0), start);
export class CubeSession {
  constructor(size = 3) {
    this.base = createState(size);
    this.state = cloneState(this.base);
    this.events = [];
    this.cursor = 0;
    this.baseCount = 0;
  }
  commit(moves, label, kind = 'manual') {
    if (!moves.length || !moves.every(m => validMove(m, this.state.size))) throw new Error('不能保存无效操作');
    this.events.splice(this.cursor);
    for (const move of moves) this.state = applyMove(this.state, move);
    this.events.push({
      label,
      kind,
      moves: moves.map(m => ({
        ...m
      }))
    });
    this.cursor = this.events.length;
    while (this.events.reduce((n, e) => n + e.moves.length, 0) > 2000) {
      const first = this.events.shift();
      for (const m of first.moves) this.base = applyMove(this.base, m);
      this.baseCount = countEvents([first], this.baseCount);
      this.cursor--;
    }
  }
  at(cursor) {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > this.events.length) throw new Error('历史位置无效');
    let state = cloneState(this.base);
    for (const event of this.events.slice(0, cursor))
      for (const m of event.moves) state = applyMove(state, m);
    return state;
  }
  seek(cursor) {
    this.state = this.at(cursor);
    this.cursor = cursor;
  }
  get steps() {
    return countEvents(this.events.slice(0, this.cursor), this.baseCount);
  }
  serialize() {
    return {
      version: 2,
      base: this.base,
      state: this.state,
      events: this.events,
      cursor: this.cursor,
      baseCount: this.baseCount
    };
  }
  static restore(data) {
    if (data?.version !== 2 || !validateState(data.base) || !validateState(data.state) || data.base.size !== data
      .state.size || !Array.isArray(data.events) || data.events.length > 2000 || !Number.isInteger(data.cursor) ||
      data.cursor < 0 || data.cursor > data.events.length || !Number.isInteger(data.baseCount) || data.baseCount < 0)
      throw new Error('本机进度格式不兼容或已损坏');
    let total = 0;
    for (const e of data.events) {
      if (!e || typeof e.label !== 'string' || e.label.length > 250 || !['manual', 'formula', 'scramble', 'turn']
        .includes(e.kind) || !Array.isArray(e.moves) || !e.moves.length || !e.moves.every(m => validMove(m, data.base
          .size))) throw new Error('步骤记录无效');
      total += e.moves.length;
    }
    if (total > 2000) throw new Error('保存的步骤过多');
    const session = new CubeSession(data.base.size);
    session.base = cloneState(data.base);
    session.events = structuredClone(data.events);
    session.cursor = data.cursor;
    session.baseCount = data.baseCount;
    const actual = session.at(data.cursor);
    if (JSON.stringify(actual) !== JSON.stringify(data.state)) throw new Error('局面与历史不一致');
    session.state = actual;
    return session;
  }
}
