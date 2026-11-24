import { createInspection, FIXTURE, identifyFixture } from '../lilly-inspect-dev/inspection.mjs';
import { createMockConversation } from './mock-conversation.mjs';
import { isMockProvider } from './mock-provider.mjs';

const deny = reason => Object.freeze({ ok: false, reason });
const id = n => Number.isSafeInteger(n) && n >= 0;
const label = s => typeof s === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(s);
const origin = new URL(FIXTURE).origin;
const TTL = 300000;
function activeTab(rows) {
  const t = rows?.length === 1 ? rows[0] : null;
  return t && id(t.id) && id(t.windowId) && t.active === true && t.status === 'complete' &&
    t.url === FIXTURE && !t.pendingUrl && t.incognito === false ? t : null;
}
const matches = (t, s) => t && t.id === s.tabId && t.windowId === s.windowId;

// Trusted adapter composition, not a packaged extension. Caller must forward
// browser lifecycle changes synchronously to revoke, including popup disposal.
export function createIntegratedFixture({ api, browserId, workerId, provider, now = () => performance.now() }) {
  if (!label(browserId) || !label(workerId) || !isMockProvider(provider) || typeof now !== 'function') throw new TypeError('invalid trusted fixture configuration');
  let session = null, sequence = 0;
  const current = () => api.tabs.query({ active: true, currentWindow: true });
  function drop(s) {
    if (session !== s) return;
    session = null;
    s.observation = null;
    s.inspection?.revoke(); s.chat?.leave();
  }
  function revoke() { if (session) drop(session); }
  function live(s) {
    if (session !== s || !s.chat) return false;
    const state = s.chat.snapshot().presence;
    if (state.mode !== 'observe' || state.generation !== s.generation) { drop(s); return false; }
    return true;
  }
  async function verify(s) {
    if (!live(s) || !matches(activeTab(await current()), s.scope) || !live(s)) return false;
    const rows = await api.scripting.executeScript({ target: { tabId: s.scope.tabId, frameIds: [0] },
      world: 'ISOLATED', func: identifyFixture, args: [FIXTURE] });
    const r = rows?.length === 1 ? rows[0] : null;
    return live(s) && r?.frameId === 0 && r.documentId === s.scope.documentId && r.result === true &&
      matches(activeTab(await current()), s.scope) && live(s);
  }
  async function prepare() {
    if (session) return deny('leave_required');
    const s = { id: ++sequence, stage: 'identifying', observation: null, busy: true };
    session = s;
    try {
      const t = activeTab(await current());
      if (session !== s || !t) { drop(s); return deny('fixture_not_active'); }
      const pinned = { tabId: t.id, windowId: t.windowId };
      // Pin every underlying inspector query to the original tab/window. This
      // preserves the physically witnessed inspector without changing its API.
      const bound = { tabs: { async query() {
        const rows = await current();
        return session === s && matches(activeTab(rows), pinned) ? rows : [];
      } }, scripting: { executeScript(req) {
        if (session !== s || req.target.tabId !== pinned.tabId) throw new Error('scope changed');
        return api.scripting.executeScript(req);
      } } };
      s.inspection = createInspection(bound, now);
      const p = await s.inspection.prepare();
      if (session !== s || !p.ok) { drop(s); return deny(p.reason ?? 'presence_revoked'); }
      s.scope = Object.freeze({ browserId, workerId, windowId: pinned.windowId, tabId: pinned.tabId,
        documentId: p.documentId, frameId: 0, origin });
      s.chat = createMockConversation({ presenceConfig: { browserId, workerId, now },
        readContext: () => session === s ? s.scope : null, provider });
      s.stage = 'identified';
      return Object.freeze({ ok: true, url: FIXTURE, scope: s.scope });
    } catch { drop(s); return deny('browser_unavailable'); }
    finally { s.busy = false; }
  }
  async function confirm() {
    const s = session;
    if (!s || s.stage !== 'identified' || s.busy) return deny('confirmation_required');
    s.stage = 'capturing'; s.busy = true;
    try {
      const grant = s.chat.invite(TTL);
      if (grant.mode !== 'observe') { drop(s); return deny(grant.reason ?? 'invitation_denied'); }
      s.generation = grant.generation;
      const r = await s.inspection.inspect();
      if (!live(s) || !r.ok || !await verify(s)) { drop(s); return deny(r.reason ?? 'presence_revoked'); }
      const acquiredAt = now();
      if (!Number.isFinite(acquiredAt) || acquiredAt < grant.expiresAt - TTL || acquiredAt >= grant.expiresAt || !live(s)) {
        drop(s); return deny('clock_invalid_or_expired');
      }
      // Generation is local to a controller; the session sequence additionally
      // distinguishes re-invitations in the same runtime. No durable identity.
      const source = Object.freeze({ url: FIXTURE, scope: s.scope });
      s.observation = Object.freeze({ type: 'fixture_text_v1', sessionId: s.id, generation: s.generation,
        source, acquiredAt, validUntil: grant.expiresAt, text: r.text });
      s.stage = 'observing';
      return Object.freeze({ ok: true, observation: s.observation });
    } catch { drop(s); return deny('browser_unavailable'); }
    finally { s.busy = false; }
  }
  async function run(prompt) {
    const s = session;
    if (!s || s.stage !== 'observing' || !live(s)) return deny('observation_required');
    if (s.busy) return deny('busy');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8192) return deny('invalid_prompt');
    s.busy = true;
    try {
      if (!await verify(s)) { drop(s); return deny('presence_revoked'); }
      const observation = s.observation;
      const result = await s.chat.run(prompt, observation);
      if (!live(s) || !await verify(s)) { drop(s); return deny('presence_revoked'); }
      return result.ok ? Object.freeze({ ...result, observationSessionId: observation.sessionId }) : result;
    } catch { drop(s); return deny('browser_unavailable'); }
    finally { s.busy = false; }
  }
  function snapshot() {
    const s = session;
    if (!s || (['capturing', 'observing'].includes(s.stage) && !live(s))) return Object.freeze({ stage: 'absent', observation: null });
    // Cached, event-invalidated view only; no partial model text released.
    return Object.freeze({ stage: s.stage, observation: s.observation });
  }
  return Object.freeze({ prepare, confirm, run, revoke, snapshot });
}
