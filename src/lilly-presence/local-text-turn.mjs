// Source-only protocol. Trusted injected transport; no network or tool authority.
export const TEXT_PROTOCOL = 'lilly_text_v1';
export const TEXT_LIMITS = Object.freeze({ prompt: 8192, text: 8192, bytes: 65536, chunks: 256, frames: 128, frame: 32768, durationMs: 30000 });
const URL = 'http://127.0.0.1:8765/lilly-fixture.html';
const deny = reason => Object.freeze({ ok: false, reason });
const label = s => typeof s === 'string' && /^[A-Za-z0-9_.:/-]{1,128}$/.test(s);
const index = n => Number.isSafeInteger(n) && n >= 0;
const str = (s, n) => typeof s === 'string' && s.length <= n && s.isWellFormed();
const finite = n => Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER;
function observationOf(o, t) {
  const source = o?.source, s = source?.scope;
  if (!o || !Object.isFrozen(o) || !Object.isFrozen(source) || !Object.isFrozen(s) ||
      o.type !== 'fixture_text_v1' || !index(o.sessionId) || o.sessionId === 0 || !index(o.generation) || o.generation === 0 ||
      source?.url !== URL || s?.origin !== 'http://127.0.0.1:8765' || s.frameId !== 0 ||
      ![s.browserId, s.workerId, s.documentId].every(label) || !index(s.tabId) || !index(s.windowId) ||
      !str(o.text, 512) || !finite(o.acquiredAt) || !finite(o.validUntil) ||
      o.acquiredAt > t || t >= o.validUntil || o.validUntil - o.acquiredAt > 300000) return null;
  // Whitelist, rather than forwarding the original browser object or extra fields.
  return Object.freeze({ type: o.type, sessionId: o.sessionId, generation: o.generation,
    source: Object.freeze({ url: URL, documentId: s.documentId, frameId: 0 }),
    acquiredAt: o.acquiredAt, validUntil: o.validUntil, text: o.text });
}
// Transport.open(request, signal) must synchronously return a private pull stream
// {next(): Promise<{done,value?:Uint8Array}>, close(): Promise<void> | void}.
// close signals cancellation/release, and must be safe while next is pending.
// Caller cancellation returns promptly, but a noncooperative pull retains the
// single-flight slot until both the pull and close settle. Close failure poisons
// the runtime; no automatic fallback/retry. This is not live resource attestation.
export function createLocalTextTurn({ transport, modelId, readObservation, now = () => performance.now(),
  schedule = (fn, ms) => setTimeout(fn, ms), unschedule = id => clearTimeout(id) }) {
  if (!transport || typeof transport.open !== 'function' || !label(modelId) || typeof readObservation !== 'function' ||
      ![now, schedule, unschedule].every(f => typeof f === 'function')) throw new TypeError('invalid trusted configuration');
  let active = null, poisoned = false, lastTime = -1;
  const revoked = new WeakSet();
  function clock() {
    let t; try { t = now(); } catch { return null; }
    if (!finite(t) || t < lastTime) return null;
    lastTime = t; return t;
  }
  function current() { try { return readObservation(); } catch { return null; } }
  function closeOnce(turn) {
    if (!turn.stream) return Promise.resolve(true);
    if (!turn.closing) turn.closing = Promise.resolve().then(() => turn.stream.close()).then(() => true, () => { poisoned = true; return false; });
    return turn.closing;
  }
  function abort(turn, reason) {
    if (turn.reason) return;
    turn.reason = reason; turn.text = ''; turn.pending = '';
    if (reason === 'presence_revoked' || reason === 'clock_invalid') revoked.add(turn.observation);
    turn.abort.abort(); void closeOnce(turn); turn.resolveCancelled(deny(reason));
  }
  function live(turn) {
    if (turn.reason || active !== turn) return false;
    const t = clock();
    if (t === null) abort(turn, 'clock_invalid');
    else if (t >= turn.observation.validUntil || t >= turn.deadline) abort(turn, 'deadline_expired');
    else if (current() !== turn.observation) abort(turn, 'presence_revoked');
    return !turn.reason;
  }
  const failure = turn => deny(turn.reason ?? 'stale_turn');
  function frame(turn, line) {
    if (!line || line.length > TEXT_LIMITS.frame || turn.terminal || ++turn.frames > TEXT_LIMITS.frames) throw Error('invalid frame');
    const f = JSON.parse(line), r = turn.request;
    // Canonical arrays prevent duplicate object keys and ambiguities. A provider
    // claiming an identity is not proof that the real model executed the turn.
    if (!Array.isArray(f) || f.length !== 7 || JSON.stringify(f) !== line ||
        f[0] !== TEXT_PROTOCOL || f[1] !== r.requestId || f[2] !== r.modelId ||
        f[3] !== r.observation.sessionId || f[4] !== r.observation.generation || !str(f[6], TEXT_LIMITS.text)) throw Error('invalid frame');
    if (f[5] === 'text' && f[6].length > 0 && turn.text.length + f[6].length <= TEXT_LIMITS.text) turn.text += f[6];
    else if (f[5] === 'end' && f[6] === '') turn.terminal = true;
    else if (f[5] === 'error' && f[6].length > 0) throw Error('provider error');
    else throw Error('invalid frame');
  }
  function ingest(turn, text) {
    turn.pending += text;
    let end;
    while ((end = turn.pending.indexOf('\n')) !== -1) {
      const line = turn.pending.slice(0, end); turn.pending = turn.pending.slice(end + 1); frame(turn, line);
    }
    if (turn.pending.length > TEXT_LIMITS.frame || (turn.terminal && turn.pending.length)) throw Error('invalid frame');
  }
  async function execute(turn) {
    let result = deny('invalid_stream');
    try {
      if (!live(turn)) return failure(turn);
      try {
        turn.stream = transport.open(turn.request, turn.abort.signal);
        if (!turn.stream || typeof turn.stream.next !== 'function' || typeof turn.stream.close !== 'function') throw Error('invalid transport');
      } catch { poisoned = true; return deny('transport_open_failed'); }
      if (!live(turn)) return failure(turn);
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      let bytes = 0, chunks = 0;
      for (;;) {
        const chunk = await turn.stream.next();
        if (!live(turn)) return failure(turn);
        if (chunk?.done === true && chunk.value === undefined) { ingest(turn, decoder.decode()); break; }
        if (chunk?.done !== false || !(chunk.value instanceof Uint8Array) || !chunk.value.byteLength ||
            ++chunks > TEXT_LIMITS.chunks || (bytes += chunk.value.byteLength) > TEXT_LIMITS.bytes || turn.terminal) throw Error('invalid chunk');
        ingest(turn, decoder.decode(chunk.value, { stream: true }));
      }
      if (!turn.terminal || turn.pending) result = deny('incomplete_stream');
      else result = Object.freeze({ ok: true, result: 'TEXT_TURN_COMPLETE_NO_AUTHORITY', text: turn.text,
        provenance: Object.freeze({ requestId: turn.request.requestId, modelId, sessionId: turn.observation.sessionId,
          generation: turn.observation.generation, source: turn.request.observation.source, acquiredAt: turn.observation.acquiredAt,
          modelIdentity: 'transport_claim_only' }) });
    } catch { result = turn.reason ? failure(turn) : deny('invalid_stream'); }
    finally {
      const closed = await closeOnce(turn);
      if (!closed) result = deny('transport_close_failed');
      turn.text = ''; turn.pending = '';
    }
    return live(turn) ? result : failure(turn);
  }
  async function run(prompt) {
    if (!str(prompt, TEXT_LIMITS.prompt) || !prompt.trim()) return deny('invalid_prompt');
    if (poisoned) return deny('transport_unqualified');
    if (active) return deny('turn_busy');
    const t = clock(), o = current(), snapshot = t === null ? null : observationOf(o, t);
    if (!snapshot || revoked.has(o)) return deny('observation_required');
    const request = Object.freeze({ protocol: TEXT_PROTOCOL, requestId: crypto.randomUUID(), modelId, prompt, observation: snapshot });
    const turn = { observation: o, request, deadline: Math.min(o.validUntil, t + TEXT_LIMITS.durationMs), abort: new AbortController(),
      text: '', pending: '', terminal: false, frames: 0, reason: null, stream: null, closing: null, callerDone: false, workDone: false };
    const cancelled = new Promise(resolve => { turn.resolveCancelled = resolve; });
    active = turn;
    const release = () => { if (active === turn && turn.callerDone && turn.workDone) active = null; };
    let timer;
    try {
      timer = schedule(() => abort(turn, 'deadline_expired'), turn.deadline - t);
      const work = execute(turn).catch(() => deny('invalid_stream')).then(r => { turn.workDone = true; release(); return r; });
      const r = await Promise.race([work, cancelled]);
      return r.ok && !live(turn) ? failure(turn) : r;
    } catch { abort(turn, 'runtime_unavailable'); turn.workDone = true; return failure(turn); }
    finally { if (timer !== undefined) unschedule(timer); turn.callerDone = true; release(); }
  }
  return Object.freeze({ run,
    cancel() { if (active) abort(active, 'turn_cancelled'); },
    revoke() { const o = current(); if (o && typeof o === 'object') revoked.add(o); if (active) abort(active, 'presence_revoked'); },
    contextChanged() { if (active) live(active); },
    snapshot() { if (active) live(active); return Object.freeze({ busy: active !== null, poisoned }); }
  });
}
