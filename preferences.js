// Only authenticated readers persist preferences. Anonymous choices live in the page.
export function createPreferences({ request, schedule = setTimeout, cancel = clearTimeout, notify = () => {} }) {
  let user = null, values = {}, dirty = {}, timer, flight, revision = 0;
  const allowed = new Set(['blog-theme', 'moon-code-size', 'rubiks-help-seen', 'rubiks-lab-v2']);
  async function refresh() {
    const ticket = ++revision;
    cancel(timer);
    dirty = {};
    let data;
    try { data = await request('/api/account/preferences'); } catch { data = { user: null, values: {} }; }
    if (ticket !== revision) return;
    user = data.user || null;
    values = user ? { ...data.values } : {};
  }
  async function flush({ keepalive = false } = {}) {
    cancel(timer);
    if (flight) { await flight; if (Object.keys(dirty).length) return flush({ keepalive }); return; }
    if (!user || !Object.keys(dirty).length) return;
    const ownerId = user.id, ticket = revision, batch = dirty;
    dirty = {};
    const body = JSON.stringify({ ownerId, values: batch });
    flight = (async () => {
      try {
        await request('/api/account/preferences', { method: 'PUT', body, keepalive: keepalive && new TextEncoder().encode(body).length < 60000 });
      } catch (error) {
        if (ticket !== revision) return;
        if ([401, 409].includes(error.status)) {
          ++revision; user = null; values = {}; dirty = {};
          notify('identity');
        } else {
          dirty = { ...batch, ...dirty };
          notify('error');
        }
      }
    })();
    await flight;
    flight = null;
  }
  return {
    refresh, flush,
    get user() { return user; },
    getItem(key) { return user ? values[key] ?? null : null; },
    setItem(key, value) {
      if (!user || !allowed.has(key)) return false;
      value = String(value);
      if (values[key] === value) return true;
      values[key] = value; dirty[key] = value;
      cancel(timer); timer = schedule(() => { void flush(); }, 200);
      return true;
    }
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), ...options, cache: 'no-store', headers: { 'X-Blog-Request': '1', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!response.ok) throw Object.assign(new Error('无法保存账号设置'), { status: response.status });
  return response.json();
}
export const preferences = createPreferences({ request, notify: type => {
  if (type === 'identity') location.reload();
  else dispatchEvent(new Event('preferences-save-error'));
} });
if (typeof window !== 'undefined') {
  // Old anonymous records have no proven owner and must not be assigned to an account.
  try { for (const key of ['blog-theme', 'moon-code-size', 'rubiks-lab-v2', 'rubiks-help-seen']) localStorage.removeItem(key); } catch {}
  preferences.ready = preferences.refresh();
  let checking = false;
  const checkIdentity = async () => {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const { user } = await request('/api/account/session');
      if ((user?.id ?? null) !== (preferences.user?.id ?? null)) location.reload();
    } catch {} finally { checking = false; }
  };
  addEventListener('focus', checkIdentity);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void preferences.flush({ keepalive: true }); else void checkIdentity();
  });
  addEventListener('pagehide', () => { void preferences.flush({ keepalive: true }); });
}
