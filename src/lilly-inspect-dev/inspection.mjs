// One-shot synthetic fixture inspection; no background execution or model access.
export const FIXTURE = 'http://127.0.0.1:8765/lilly-fixture.html';
const denied = reason => Object.freeze({ ok: false, reason });
const validId = n => Number.isSafeInteger(n) && n >= 0;
const docId = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(s);

// Serialized by Chrome; must not depend on any outer lexical scope.
export function identifyFixture(expected) {
  return window === window.top && location.href === expected;
}
export function readFixture(expected) {
  if (window !== window.top || location.href !== expected) return null;
  const node = document.getElementById('lilly-public-fixture');
  if (!node || node.tagName !== 'P' || node.childNodes.length !== 1 || node.firstChild.nodeType !== 3) return null;
  const text = node.firstChild.nodeValue;
  return typeof text === 'string' && text.length > 0 && text.length <= 512 ? text : null;
}

export function createInspection(api, now = () => performance.now()) {
  let epoch = 0, pending = null, busy = false;
  const revoke = () => { epoch++; pending = null; };
  const current = async () => {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    const t = tabs?.length === 1 ? tabs[0] : null;
    return t && validId(t.id) && validId(t.windowId) && t.active === true && t.status === 'complete' &&
      t.url === FIXTURE && !t.pendingUrl && t.incognito === false ? { tabId: t.id, windowId: t.windowId } : null;
  };
  const same = (a, b) => a && b && a.tabId === b.tabId && a.windowId === b.windowId;
  const inject = async (target, func) => {
    const rows = await api.scripting.executeScript({ target, world: 'ISOLATED', func, args: [FIXTURE] });
    const row = rows?.length === 1 ? rows[0] : null;
    return row && row.frameId === 0 && docId(row.documentId) ? row : null;
  };
  const identify = tab => inject({ tabId: tab.tabId, frameIds: [0] }, identifyFixture);
  const fresh = (p, e) => {
    const t = now();
    return epoch === e && Number.isFinite(t) && t >= p.started && t < p.started + 30000;
  };
  async function prepare() {
    if (busy) return denied('busy');
    revoke(); const e = epoch; busy = true;
    try {
      const started = now();
      if (!Number.isFinite(started) || started < 0) return denied('clock_invalid');
      const tab = await current();
      if (epoch !== e || !tab) return denied('fixture_not_active');
      const row = await identify(tab);
      if (epoch !== e || row?.result !== true) return denied('identity_unverified');
      const candidate = { ...tab, documentId: row.documentId, started };
      if (!same(tab, await current()) || !fresh(candidate, e)) return denied('scope_changed');
      pending = candidate;
      return Object.freeze({ ok: true, url: FIXTURE, documentId: row.documentId });
    } catch { return denied('browser_unavailable'); }
    finally { busy = false; }
  }
  async function inspect() {
    if (busy) return denied('busy');
    const p = pending; pending = null; const e = epoch;
    if (!p) return denied('confirmation_required');
    busy = true;
    try {
      if (!fresh(p, e) || !same(p, await current()) || !fresh(p, e)) return denied('scope_changed');
      const before = await identify(p);
      if (!fresh(p, e) || before?.result !== true || before.documentId !== p.documentId) return denied('document_changed');
      // Final exact document target. No fallback to frame-only content reads.
      const row = await inject({ tabId: p.tabId, documentIds: [p.documentId] }, readFixture);
      if (!fresh(p, e) || row?.documentId !== p.documentId || typeof row.result !== 'string' ||
          !row.result.length || row.result.length > 512) return denied('capture_rejected');
      if (!same(p, await current()) || !fresh(p, e)) return denied('scope_changed');
      const after = await identify(p);
      if (!fresh(p, e) || after?.result !== true || after.documentId !== p.documentId) return denied('document_changed');
      return Object.freeze({ ok: true, result: 'LOCAL_FIXTURE_OBSERVED_NO_ACTION_AUTHORITY', text: row.result });
    } catch { return denied('browser_unavailable'); }
    finally { busy = false; }
  }
  return Object.freeze({ prepare, inspect, revoke });
}
