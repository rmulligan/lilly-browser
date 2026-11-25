import { createPresenceController } from './controller.mjs';

export const ACTION_URL = 'http://127.0.0.1:8765/lilly-participation.html';
export const ACTION = Object.freeze({ name: 'mark_reviewed', target: 'lilly-review-state', before: 'Not reviewed', after: 'Reviewed' });
const denied = reason => Object.freeze({ ok: false, reason });
const uncertain = reason => Object.freeze({ ok: false, reason, effect: 'unknown_do_not_retry' });
const index = n => Number.isSafeInteger(n) && n >= 0;
const label = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(s);

// Chrome serializes these functions; no outer lexical dependencies.
export function identifyActionFixture() {
  return window === window.top && location.href === 'http://127.0.0.1:8765/lilly-participation.html';
}
export function markReviewed() {
  if (window !== window.top || location.href !== 'http://127.0.0.1:8765/lilly-participation.html') return 'not_applied';
  const nodes = document.querySelectorAll('#lilly-review-state');
  if (nodes.length !== 1) return 'not_applied';
  const node = nodes[0];
  if (node.tagName !== 'P' || node.childNodes.length !== 1 || node.firstChild.nodeType !== 3 ||
      node.firstChild.nodeValue !== 'Not reviewed') return 'not_applied';
  node.firstChild.nodeValue = 'Reviewed';
  return node.firstChild.nodeValue === 'Reviewed' ? 'applied' : 'unknown';
}

// Trusted source-only adapter. Owner gesture authentication and browser event
// forwarding belong to a future UI. Never expose this object to a page/model.
export function createFixtureParticipation({ api, browserId, workerId, now = () => performance.now() }) {
  const { owner, guard } = createPresenceController({ browserId, workerId, now, maxTtlMs: 30000 });
  let session = null, seq = 0, inflight = false, dispatchedOnce = false;
  const current = async () => {
    const rows = await api.tabs.query({ active: true, currentWindow: true });
    const t = rows?.length === 1 ? rows[0] : null;
    return t && index(t.id) && index(t.windowId) && t.active === true && t.status === 'complete' &&
      t.url === ACTION_URL && !t.pendingUrl && t.incognito === false ? t : null;
  };
  const same = (t, s) => t && t.id === s.tabId && t.windowId === s.windowId;
  function drop(s) { if (session === s) { session = null; owner.leave(); } }
  function revoke() { if (session) drop(session); }
  function live(s, mode) {
    if (session !== s) return false;
    const state = owner.status();
    if (state.mode !== mode || state.generation !== s.generation) { drop(s); return false; }
    return true;
  }
  async function probe(s) {
    if (!same(await current(), s.scope) || session !== s) return false;
    const rows = await api.scripting.executeScript({ target: { tabId: s.scope.tabId, frameIds: [0] }, world: 'ISOLATED', func: identifyActionFixture });
    const r = rows?.length === 1 ? rows[0] : null;
    return session === s && r?.frameId === 0 && r.documentId === s.scope.documentId && r.result === true &&
      same(await current(), s.scope) && session === s;
  }
  async function identify() {
    if (dispatchedOnce) return denied('dispatch_already_attempted');
    if (session || inflight) return denied('leave_or_wait_required');
    const s = { id: ++seq, stage: 'identifying' }; session = s; inflight = true;
    try {
      const started = now();
      const t = await current();
      if (session !== s || !t || !Number.isFinite(started) || started < 0) { drop(s); return denied('fixture_not_active'); }
      const rows = await api.scripting.executeScript({ target: { tabId: t.id, frameIds: [0] }, world: 'ISOLATED', func: identifyActionFixture });
      const r = rows?.length === 1 ? rows[0] : null;
      if (session !== s || r?.frameId !== 0 || r.result !== true || !label(r.documentId)) { drop(s); return denied('identity_unverified'); }
      s.scope = Object.freeze({ browserId, workerId, windowId: t.windowId, tabId: t.id, documentId: r.documentId, frameId: 0, origin: new URL(ACTION_URL).origin });
      const after = await current(), elapsed = now() - started;
      if (session !== s || !same(after, s.scope) || !Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 30000) { drop(s); return denied('scope_changed'); }
      const state = owner.invite(s.scope, Math.floor(30000 - elapsed));
      if (state.mode !== 'observe') { drop(s); return denied('invitation_denied'); }
      s.generation = state.generation; s.stage = 'identified';
      return Object.freeze({ ok: true, scope: s.scope, expiresAt: state.expiresAt });
    } catch { drop(s); return denied('browser_unavailable'); }
    finally { inflight = false; }
  }
  async function prepare() {
    const s = session;
    if (!s || inflight || s.stage !== 'identified' || !live(s, 'observe')) return denied('identification_required');
    inflight = true;
    try {
      if (!await probe(s) || !live(s, 'observe')) { drop(s); return denied('scope_changed'); }
      const state = owner.participate(s.scope);
      if (state.mode !== 'participate') { drop(s); return denied('participation_denied'); }
      s.generation = state.generation;
      const payload = new TextEncoder().encode(JSON.stringify([ACTION_URL, ACTION.name, ACTION.target, ACTION.before, ACTION.after]));
      const hash = await crypto.subtle.digest('SHA-256', payload);
      if (!live(s, 'participate')) return denied('presence_revoked');
      s.operation = Object.freeze({ id: 'review-' + s.id, kind: 'interact', target: ACTION.target,
        payloadDigest: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') });
      const begin = guard.begin(s.scope);
      if (!begin.ok) { drop(s); return denied(begin.reason); }
      const prepared = guard.prepare(begin.lease, s.operation, s.scope);
      if (!prepared.ok) { drop(s); return denied(prepared.reason); }
      s.ticket = prepared.ticket; s.stage = 'prepared';
      s.preview = Object.freeze({ scope: s.scope, url: ACTION_URL, action: ACTION, operation: s.operation, expiresAt: state.expiresAt });
      return Object.freeze({ ok: true, preview: s.preview });
    } catch { drop(s); return denied('preparation_failed'); }
    finally { inflight = false; }
  }
  async function confirm(preview) {
    const s = session;
    if (!s || inflight || s.stage !== 'prepared' || !live(s, 'participate')) return denied('approval_required');
    // A copied/mismatched approval burns the session. Only the exact preview
    // object returned to the trusted owner UI can be confirmed.
    if (preview !== s.preview) { drop(s); return denied('approval_mismatch'); }
    s.stage = 'dispatching'; inflight = true; let dispatched = false;
    try {
      if (!await probe(s) || !live(s, 'participate')) { drop(s); return denied('scope_changed'); }
      const receipt = guard.consume(s.ticket, s.operation, s.scope);
      if (!receipt.ok || !live(s, 'participate')) { drop(s); return denied('dispatch_denied'); }
      // No await between the final policy check and dispatch. The synthetic
      // guard receipt alone is not an execution receipt or general authority.
      dispatched = true; dispatchedOnce = true;
      const rows = await api.scripting.executeScript({ target: { tabId: s.scope.tabId, documentIds: [s.scope.documentId] }, world: 'ISOLATED', func: markReviewed });
      const r = rows?.length === 1 ? rows[0] : null;
      if (!live(s, 'participate') || r?.frameId !== 0 || r.documentId !== s.scope.documentId ||
          !await probe(s) || !live(s, 'participate')) return uncertain('post_dispatch_unverified');
      if (r.result === 'not_applied') return Object.freeze({ ok: false, reason: 'precondition_failed', effect: 'not_applied' });
      if (r.result !== 'applied') return uncertain('effect_unverified');
      return Object.freeze({ ok: true, result: 'FIXTURE_DOM_EFFECT_REPORTED', effect: 'applied', operationId: s.operation.id });
    } catch { return dispatched ? uncertain('dispatch_error') : denied('browser_unavailable'); }
    finally { drop(s); inflight = false; }
  }
  return Object.freeze({ identify, prepare, confirm, revoke });
}
