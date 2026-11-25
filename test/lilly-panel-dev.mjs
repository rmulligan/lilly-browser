import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build, inventory } from '../tools/build-lilly-panel.mjs';
import { mountPanel } from '../src/lilly-panel-dev/session-ui.mjs';
import { createIntegratedFixture } from '../src/lilly-presence/integrated-fixture.mjs';
import { createMockProvider } from '../src/lilly-presence/mock-provider.mjs';
import { FIXTURE, identifyFixture, readFixture } from '../src/lilly-inspect-dev/inspection.mjs';
const names = ['identify','confirm','send','leave','prompt','identity','status','observation','source','reply','context','conversation'];
const browserEvents = ['onActivated','onUpdated','onRemoved','onReplaced','onDetached','onAttached'];
const flush = () => new Promise(resolve => setImmediate(resolve));
function events() {
  const callbacks = new Set(); return { addListener: fn => callbacks.add(fn), removeListener: fn => callbacks.delete(fn),
    emit: () => { for (const fn of callbacks) fn(); }, count: () => callbacks.size };
}
function domTarget() {
  const listeners = new Map(); return { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); }, emit(name, e = {}) { for (const fn of listeners.get(name) ?? []) fn(e); } };
}
const chunk = (type, value = '') => JSON.stringify({ type, value });
const script = (text, extra = {}) => ({ events: [chunk('text', text), chunk('end')], ...extra });
function harness(scripts = [script('fixed mock output')]) {
  let now = 100, docId = 'doc-a', text = '<img src=x onerror=alert(1)>', active = true;
  const nodes = Object.fromEntries(names.map(name => [name, { ...domTarget(), textContent: '', value: '', hidden: ['context','conversation'].includes(name), disabled: false }]));
  const document = { ...domTarget(), hidden: false, getElementById: id => nodes[id] };
  const window = { ...domTarget(), navigator: { userActivation: { isActive: true } } };
  const calls = [], timers = new Map(); let timerId = 0;
  const api = { tabs: { ...Object.fromEntries(browserEvents.map(e => [e, events()])), async query() {
    return active ? [{ id: 2, windowId: 1, active: true, status: 'complete', url: FIXTURE, incognito: false }] : [];
  } }, windows: { onFocusChanged: events() }, scripting: { async executeScript(req) {
    calls.push(req); if (req.target.documentIds && !req.target.documentIds.includes(docId)) throw Error('document gone');
    return [{ frameId: 0, documentId: docId, result: req.func === identifyFixture ? true : text }];
  } } };
  const provider = createMockProvider(scripts);
  const runtime = createIntegratedFixture({ api, browserId: 'b', workerId: 'w', provider, now: () => now });
  const panel = mountPanel({ api, document, window, runtime, now: () => now,
    schedule: (fn, ms) => { timers.set(++timerId, { fn, at: now + ms }); return timerId; }, unschedule: id => timers.delete(id) });
  return { nodes, api, document, window, runtime, panel, provider, calls, timers,
    click: (name, isTrusted = true) => nodes[name].emit('click', { isTrusted }),
    time: v => { now = v; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    doc: v => { docId = v; }, text: v => { text = v; }, active: v => { active = v; } };
}
async function joinFixture(f) { f.click('identify'); await flush(); assert.equal(f.nodes.confirm.disabled, false); f.click('confirm'); await flush(); assert.equal(f.nodes.context.hidden, false); }
async function walk(dir, prefix = '') {
  const result = []; for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + e.name; if (e.isDirectory()) result.push(...await walk(join(dir, e.name), path + '/')); else result.push(path);
  } return result.sort();
}
test('build is an exact allowlist, preserves source bytes, refuses overwrite and has narrow manifest', async () => {
  const out = await build(); try {
    assert.deepEqual(await walk(out), [...inventory].sort());
    for (const path of inventory) assert.deepEqual(await readFile(join(out,path)), await readFile(new URL('../' + (path === 'manifest.json' ? 'src/lilly-panel-dev/manifest.json' : path), import.meta.url)));
    const m = JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
    assert.deepEqual(m.permissions, ['sidePanel','activeTab','scripting']); assert.equal(m.incognito, 'not_allowed');
    for (const k of ['host_permissions','optional_host_permissions','optional_permissions','content_scripts','externally_connectable','web_accessible_resources']) assert.ok(!(k in m));
    assert.match(m.content_security_policy.extension_pages,/connect-src 'none'/);
    assert.ok(inventory.includes(m.side_panel.default_path) && inventory.includes(m.background.service_worker));
    await assert.rejects(build(out), { code: 'EEXIST' });
    for (const path of inventory.filter(p=>p.endsWith('.mjs'))) {
      const src=await readFile(join(out,path),'utf8'); assert.doesNotMatch(src,/\b(fetch|WebSocket|XMLHttpRequest|eval)\s*\(|chrome\.storage|innerHTML|setInterval/);
      for (const match of src.matchAll(/from ['"](\.[^'"]+)['"]/g)) await readFile(new URL(match[1], 'file://' + join(out,path)));
    }
  } finally { await rm(out,{recursive:true,force:true}); }
});
test('toolbar handler opens only a non-incognito window and does not inspect', async () => {
  const opened=[]; let listener;
  const old=globalThis.chrome;globalThis.chrome={action:{onClicked:{addListener(fn){listener=fn;}}},sidePanel:{async open(x){opened.push(x);}}};
  try {await import('../src/lilly-panel-dev/background.mjs'); for(const t of [{windowId:1,incognito:true},{windowId:-1,incognito:false},{windowId:1}])listener(t);assert.deepEqual(opened,[]);listener({windowId:7,incognito:false});assert.deepEqual(opened,[{windowId:7}]);}
  finally {if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;}
});
test('initial load and synthetic/unactivated clicks never inspect', async()=>{
  const f=harness(); assert.equal(f.nodes.confirm.disabled,true); f.click('identify',false); f.window.navigator.userActivation.isActive=false; f.click('identify'); await flush();assert.equal(f.calls.length,0);assert.equal(f.provider.stats().opened,0);
});
test('two gestures release only text and provenance; mock reply is separately labeled',async()=>{
  const f=harness();f.click('identify');await flush();assert.equal(f.calls.filter(c=>c.func===readFixture).length,0);assert.match(f.nodes.identity.textContent,/doc-a/);assert.equal(f.nodes.context.hidden,true);
  f.click('confirm');await flush();assert.equal(f.nodes.observation.textContent,'<img src=x onerror=alert(1)>');assert.match(f.nodes.source.textContent,/doc-a/);assert.equal(f.nodes.confirm.disabled,true);assert.equal(f.provider.stats().opened,0);
  f.nodes.prompt.value='What is here?';f.click('send');await flush();assert.equal(f.nodes.reply.textContent,'Mock response: fixed mock output');assert.equal(f.nodes.prompt.value,'');assert.equal(f.calls.filter(c=>c.func===readFixture).length,1);
});
test('leave clears observation, provenance, reply and draft synchronously',async()=>{
  const f=harness();await joinFixture(f);f.nodes.prompt.value='hello';f.click('send');await flush();f.nodes.prompt.value='draft';f.click('leave');
  assert.equal(f.runtime.snapshot().stage,'absent');for(const n of ['identity','observation','source','reply'])assert.equal(f.nodes[n].textContent,'');assert.equal(f.nodes.prompt.value,'');assert.equal(f.nodes.context.hidden,true);assert.equal(f.nodes.send.disabled,true);assert.equal(f.timers.size,0);
});
test('one-shot UI timers clear both confirmation and captured context, without browser reads',async()=>{
  const f=harness();f.click('identify');await flush();const probes=f.calls.length;f.time(30100);assert.equal(f.nodes.confirm.disabled,true);assert.equal(f.calls.length,probes);await joinFixture(f);const reads=f.calls.length;f.time(330100);assert.equal(f.nodes.context.hidden,true);assert.equal(f.calls.length,reads);assert.equal(f.runtime.snapshot().stage,'absent');
});
test('every registered browser lifecycle event revokes existing context',async()=>{
  for(const name of [...browserEvents,'onFocusChanged']){const f=harness();await joinFixture(f);(f.api.tabs[name]??f.api.windows[name]).emit();assert.equal(f.nodes.context.hidden,true,name);assert.equal(f.runtime.snapshot().stage,'absent');}
});
test('hidden panel and pagehide revoke; disposal disables future invitations and removes listeners',async()=>{
  const f=harness();await joinFixture(f);f.document.hidden=true;f.document.emit('visibilitychange');assert.equal(f.nodes.context.hidden,true);f.document.hidden=false;await joinFixture(f);f.window.emit('pagehide');assert.equal(f.nodes.identify.disabled,true);assert.equal(f.api.tabs.onUpdated.count(),0);const n=f.calls.length;f.click('identify');await flush();assert.equal(f.calls.length,n);
});
test('late response after leave and reinvite cannot overwrite new UI state',async()=>{
  const f=harness([script('old',{pauseAt:0,ignoreAbort:true}),script('new')]);await joinFixture(f);f.nodes.prompt.value='old';f.click('send');await flush();f.click('leave');f.text('new context');await joinFixture(f);f.nodes.prompt.value='new';f.click('send');await flush();assert.equal(f.nodes.reply.textContent,'Mock response: new');f.provider.release(0);await flush();assert.equal(f.nodes.reply.textContent,'Mock response: new');assert.equal(f.nodes.observation.textContent,'new context');
});
test('same URL replacement or unavailable fixture cannot display stale output',async()=>{
  const f=harness();await joinFixture(f);f.doc('doc-b');f.nodes.prompt.value='question';f.click('send');await flush();assert.equal(f.nodes.context.hidden,true);assert.equal(f.provider.stats().opened,0);f.active(false);f.click('identify');await flush();assert.match(f.nodes.status.textContent,/Denied/);assert.equal(f.nodes.confirm.disabled,true);
});
test('hidden state detected at completion clears even when visibility event was missed',async()=>{
  const f=harness([script('late',{pauseAt:0})]);await joinFixture(f);f.nodes.prompt.value='hello';f.click('send');await flush();f.document.hidden=true;f.provider.release(0);await flush();assert.equal(f.runtime.snapshot().stage,'absent');assert.equal(f.nodes.context.hidden,true);assert.equal(f.nodes.reply.textContent,'');
});
