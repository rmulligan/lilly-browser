// Trusted extension UI. No automatic observation, provider call or network path.
export function mountPanel({ api, document, window, runtime, now = () => performance.now(),
  schedule = (fn, ms) => setTimeout(fn, ms), unschedule = timer => clearTimeout(timer) }) {
  const $ = id => document.getElementById(id);
  let epoch = 0, busy = false, timer = null, stage = 'absent', disposed = false;
  const trusted = event => event.isTrusted === true && window.navigator.userActivation.isActive === true && !document.hidden && !disposed;
  function buttons() {
    $('identify').disabled = disposed || busy || stage !== 'absent';
    $('confirm').disabled = disposed || busy || stage !== 'identified';
    $('send').disabled = $('prompt').disabled = disposed || busy || stage !== 'observing';
  }
  function clearTimer() { if (timer !== null) { unschedule(timer); timer = null; } }
  function clear(reason = 'Available, not present.') {
    epoch++; runtime.revoke(); clearTimer(); busy = false; stage = 'absent';
    $('identity').textContent = $('observation').textContent = $('source').textContent = $('reply').textContent = '';
    $('prompt').value = ''; $('context').hidden = $('conversation').hidden = true;
    $('status').textContent = reason; buttons();
  }
  function deadline(at, e) {
    clearTimer(); const remaining = at - now();
    if (!Number.isFinite(remaining) || remaining <= 0) { clear('Invitation expired.'); return; }
    timer = schedule(() => { if (epoch === e) clear('Invitation expired.'); }, remaining);
  }
  async function run(event, kind) {
    if (!trusted(event) || busy || stage !== ({ prepare: 'absent', confirm: 'identified', run: 'observing' })[kind]) return;
    const prompt = $('prompt').value;
    if (kind === 'run' && (!prompt.trim() || prompt.length > 8192)) { $('reply').textContent = 'Enter a message of at most 8192 characters.'; return; }
    const e = epoch; busy = true; buttons();
    try {
      if (kind === 'prepare') deadline(now() + 30000, e);
      if (e !== epoch) return;
      $('status').textContent = kind === 'prepare' ? 'Identifying fixture…' : kind === 'confirm' ? 'Acquiring observation…' : 'Mock turn in progress…';
      if (kind === 'run') $('reply').textContent = '';
      const r = await (kind === 'run' ? runtime.run(prompt) : runtime[kind]());
      if (e !== epoch || disposed) return;
      if (document.hidden) { clear('Panel hidden. Invite again.'); return; }
      const state = runtime.snapshot();
      if (e !== epoch) return;
      if (!r.ok) {
        if (kind === 'run' && state.stage === 'observing') { $('status').textContent = 'Observing a captured fixture.'; $('reply').textContent = 'Mock turn denied: ' + r.reason; }
        else clear('Denied: ' + r.reason);
        return;
      }
      if (kind === 'prepare' && state.stage === 'identified') {
        stage = 'identified'; $('identity').textContent = r.url + '\nDocument ' + r.scope.documentId;
        $('status').textContent = 'Identified. Confirm one read.';
      } else if (kind === 'confirm' && state.stage === 'observing' && state.observation === r.observation) {
        const o = r.observation; deadline(o.validUntil, e); if (e !== epoch) return;
        stage = 'observing'; $('identity').textContent = ''; $('observation').textContent = o.text;
        $('source').textContent = o.source.url + '\nDocument ' + o.source.scope.documentId + '\nSession ' + o.sessionId + ' · generation ' + o.generation;
        $('context').hidden = $('conversation').hidden = false; $('status').textContent = 'Observing a captured fixture.';
      } else if (kind === 'run' && state.stage === 'observing' && state.observation?.sessionId === r.observationSessionId) {
        $('reply').textContent = 'Mock response: ' + r.text; $('prompt').value = ''; $('status').textContent = 'Observing a captured fixture.';
      } else clear('Context changed. Invite again.');
    } catch { if (e === epoch) clear('Development runtime unavailable.'); }
    finally { if (e === epoch) { busy = false; buttons(); } }
  }
  const events = [api.tabs.onActivated, api.tabs.onUpdated, api.tabs.onRemoved, api.tabs.onReplaced,
    api.tabs.onDetached, api.tabs.onAttached, api.windows.onFocusChanged];
  const lost = () => clear('Browser context changed. Invite again.');
  for (const event of events) event.addListener(lost);
  const hidden = () => { if (document.hidden) lost(); };
  document.addEventListener('visibilitychange', hidden);
  function dispose() {
    if (disposed) return; disposed = true; clear('Panel closed.');
    for (const event of events) event.removeListener(lost);
    document.removeEventListener('visibilitychange', hidden);
  }
  window.addEventListener('pagehide', dispose, { once: true });
  $('identify').addEventListener('click', e => void run(e, 'prepare'));
  $('confirm').addEventListener('click', e => void run(e, 'confirm'));
  $('send').addEventListener('click', e => void run(e, 'run'));
  $('leave').addEventListener('click', e => { if (trusted(e)) clear(); });
  buttons();
  return Object.freeze({ dispose });
}
