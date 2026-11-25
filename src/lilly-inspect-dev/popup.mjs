import { createInspection } from './inspection.mjs';
const controller = createInspection(chrome);
const $ = id => document.getElementById(id);
let uiEpoch = 0, running = false;
function clear() {
  uiEpoch++; controller.revoke(); $('inspect').disabled = true; $('result').textContent = '';
  $('status').textContent = 'Not invited. Identify the fixture to begin.';
}
// Conservatively invalidate on any of these browser events while the popup is open.
for (const event of [chrome.tabs.onActivated, chrome.tabs.onUpdated, chrome.tabs.onRemoved,
  chrome.tabs.onReplaced, chrome.tabs.onDetached, chrome.tabs.onAttached, chrome.windows.onFocusChanged]) event.addListener(clear);
window.addEventListener('pagehide', clear);
function trusted(event) { return event.isTrusted && navigator.userActivation.isActive; }
async function run(event, kind) {
  if (!trusted(event) || running) return;
  running = true; const e = ++uiEpoch;
  $('prepare').disabled = true; $('inspect').disabled = true; $('result').textContent = '';
  try {
    const r = await controller[kind]();
    if (e !== uiEpoch) return;
    $('status').textContent = r.ok ? (kind === 'prepare' ? 'Confirm one read of ' + r.url + ' · document ' + r.documentId : 'Read complete. Invitation spent.') : 'Denied: ' + r.reason;
    if (r.ok && kind === 'prepare') $('inspect').disabled = false;
    if (r.ok && kind === 'inspect') $('result').textContent = r.text;
  } finally { running = false; $('prepare').disabled = false; }
}
$('prepare').addEventListener('click', e => void run(e, 'prepare'));
$('inspect').addEventListener('click', e => void run(e, 'inspect'));
$('leave').addEventListener('click', e => { if (trusted(e)) clear(); });
