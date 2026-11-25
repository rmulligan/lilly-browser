// Trusted panel only. No page/model messages or authority exposed outside this module.
export function mountParticipation({ api, document, window, runtime, now = () => performance.now(),
  schedule = (fn, ms) => setTimeout(fn, ms), unschedule = id => clearTimeout(id) }) {
  const $ = id => document.getElementById(id);
  let epoch = 0, stage = 'absent', busy = false, terminal = false, disposed = false, timer = null, preview = null;
  const trusted = e => e.isTrusted === true && window.navigator.userActivation.isActive === true && !document.hidden && !disposed;
  const buttons = () => {
    $('identify').disabled = disposed || terminal || busy || stage !== 'absent';
    $('prepare').disabled = disposed || terminal || busy || stage !== 'identified';
    $('confirm').disabled = disposed || terminal || busy || stage !== 'prepared';
  };
  function clearTimer() { if (timer !== null) { unschedule(timer); timer = null; } }
  function clear(message) {
    epoch++; runtime.revoke(); clearTimer(); preview = null; busy = false;
    $('identity').textContent = $('preview').textContent = '';
    $('preview-section').hidden = true;
    if (stage === 'confirming') {
      terminal = true; stage = 'terminal';
      $('status').textContent = 'Effect unknown. Do not retry. Inspect the fixture manually.';
    } else if (!terminal) { stage = 'absent'; $('status').textContent = message; }
    buttons();
  }
  function deadline(at, e) {
    clearTimer(); const remaining = at - now();
    if (!Number.isFinite(remaining) || remaining <= 0) { clear('Invitation expired.'); return; }
    timer = schedule(() => { if (epoch === e) clear('Invitation expired.'); }, remaining);
  }
  async function run(event, kind) {
    if (!trusted(event) || terminal || busy || stage !== ({ identify: 'absent', prepare: 'identified', confirm: 'prepared' })[kind]) return;
    const e = epoch; busy = true;
    if (kind === 'confirm') { stage = 'confirming'; terminal = true; }
    buttons();
    try {
      if (kind === 'identify') deadline(now() + 30000, e);
      if (e !== epoch) return;
      $('status').textContent = kind === 'identify' ? 'Identifying fixture…' : kind === 'prepare' ? 'Preparing exact action…' : 'Confirming one action…';
      const r = await (kind === 'confirm' ? runtime.confirm(preview) : runtime[kind]());
      if (e !== epoch || disposed) return;
      if (document.hidden) { clear('Panel hidden.'); return; }
      if (kind === 'confirm') {
        stage = 'terminal';
        $('status').textContent = r.ok && r.effect === 'applied' ? 'Applied (reported by fixture). Inspect the page manually.' :
          r.effect === 'unknown_do_not_retry' ? 'Effect unknown. Do not retry. Inspect the fixture manually.' :
          'Not applied or denied: ' + r.reason + '. No further actions in this panel.';
        clear(''); return;
      }
      if (!r.ok) { clear('Denied: ' + r.reason); return; }
      if (kind === 'identify') {
        deadline(r.expiresAt, e); if (e !== epoch) return;
        stage = 'identified'; $('identity').textContent = 'Document ' + r.scope.documentId;
        $('status').textContent = 'Identified. Prepare participation.';
      } else {
        const p = r.preview;
        deadline(p.expiresAt, e); if (e !== epoch) return;
        preview = p; stage = 'prepared';
        $('preview').textContent = p.url + '\nDocument ' + p.scope.documentId + '\nAction: ' + p.action.name +
          '\nTarget: ' + p.action.target + '\nBefore: ' + p.action.before + '\nAfter: ' + p.action.after + '\nSHA-256: ' + p.operation.payloadDigest;
        $('preview-section').hidden = false; $('status').textContent = 'Review the exact change, then confirm once.';
      }
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
    window.removeEventListener('blur', lost);
  }
  window.addEventListener('blur', lost);
  window.addEventListener('pagehide', dispose, { once: true });
  for (const kind of ['identify', 'prepare', 'confirm']) $(kind).addEventListener('click', e => void run(e, kind));
  $('leave').addEventListener('click', e => { if (trusted(e)) clear('Available, not present.'); });
  buttons(); return Object.freeze({ dispose });
}
