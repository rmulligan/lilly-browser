import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createInspection, FIXTURE, identifyFixture, readFixture } from '../src/lilly-inspect-dev/inspection.mjs';
const tab = { id: 2, windowId: 1, active: true, status: 'complete', url: FIXTURE, incognito: false };
function harness() {
  let t = 100, tabs = [tab], doc = 'document-a', read = 'public fixture', hook = null;
  const calls = [];
  const api = { tabs: { async query() { return tabs; } }, scripting: { async executeScript(req) {
    calls.push(req); if (hook) await hook(req);
    if (req.target.documentIds && !req.target.documentIds.includes(doc)) throw Error('document unavailable');
    return [{ frameId: 0, documentId: doc, result: req.func === identifyFixture ? true : read }];
  } } };
  return { controller: createInspection(api, () => t), calls, tabs: v => { tabs = v; }, doc: v => { doc = v; },
    read: v => { read = v; }, time: v => { t = v; }, hook: v => { hook = v; } };
}
const readCalls = f => f.calls.filter(x => x.func === readFixture);
async function prepared(f) { assert.equal((await f.controller.prepare()).ok, true); }

test('manifest has only activeTab and scripting; no host grants, worker or content scripts', async () => {
  const m = JSON.parse(await readFile(new URL('../src/lilly-inspect-dev/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(m.permissions, ['activeTab', 'scripting']);
  for (const k of ['host_permissions', 'optional_host_permissions', 'optional_permissions', 'content_scripts', 'background', 'externally_connectable', 'web_accessible_resources']) assert.ok(!(k in m));
  assert.match(m.content_security_policy.extension_pages, /connect-src 'none'/);
});
test('opening or unconfirmed inspection cannot execute a script', async () => {
  const f = harness(); assert.equal((await f.controller.inspect()).reason, 'confirmation_required'); assert.equal(f.calls.length, 0);
});
test('nonfixture, incomplete, pending, incognito or unknown tab denied before injection', async () => {
  for (const patch of [{url:'https://example.test'}, {url:FIXTURE+'#x'}, {status:'loading'}, {pendingUrl:FIXTURE}, {incognito:true}, {incognito:undefined}, {active:false}, {id:undefined}]) {
    const f = harness(); f.tabs([{...tab,...patch}]); assert.equal((await f.controller.prepare()).ok, false); assert.equal(f.calls.length,0);
  }
});
test('prepare does metadata probe only; confirmed read is exact document and one use', async () => {
  const f = harness(); await prepared(f); assert.equal(readCalls(f).length, 0);
  const r = await f.controller.inspect(); assert.equal(r.result, 'LOCAL_FIXTURE_OBSERVED_NO_ACTION_AUTHORITY'); assert.equal(r.text, 'public fixture');
  assert.equal(readCalls(f).length, 1); assert.deepEqual(readCalls(f)[0].target, {tabId:2,documentIds:['document-a']});
  assert.ok(f.calls.every(c => c.world === 'ISOLATED' && c.args[0] === FIXTURE));
  assert.equal((await f.controller.inspect()).ok, false); assert.equal(readCalls(f).length, 1);
});
test('replacement document at same URL denied before reading', async () => {
  const f = harness(); await prepared(f); f.doc('document-b'); assert.equal((await f.controller.inspect()).reason, 'document_changed'); assert.equal(readCalls(f).length, 0);
});
test('switching tab or window invalidates confirmation', async () => {
  for (const patch of [{id:3}, {windowId:2}]) {const f=harness();await prepared(f);f.tabs([{...tab,...patch}]);assert.equal((await f.controller.inspect()).ok,false);assert.equal(readCalls(f).length,0);}
});
test('explicit revoke and expiration deny reads', async () => {
  for (const change of [f=>f.controller.revoke(), f=>f.time(30100),f=>f.time(99),f=>f.time(NaN)]) {const f=harness();await prepared(f);change(f);assert.equal((await f.controller.inspect()).ok,false);assert.equal(readCalls(f).length,0);}
});
test('revoke while metadata probe is pending prevents invitation', async () => {
  const f=harness();f.hook(()=>f.controller.revoke());assert.equal((await f.controller.prepare()).ok,false);assert.equal((await f.controller.inspect()).ok,false);assert.equal(readCalls(f).length,0);
});
test('revocation while read is in flight discards result and no repeat', async () => {
  const f=harness();await prepared(f);f.hook(r=>{if(r.func===readFixture)f.controller.revoke();});const result=await f.controller.inspect();assert.equal(result.ok,false);assert.equal(result.text,undefined);assert.equal((await f.controller.inspect()).ok,false);assert.equal(readCalls(f).length,1);
});
test('navigation at final injection rejects exact target, never falls back', async () => {
  const f=harness();await prepared(f);f.hook(r=>{if(r.func===readFixture)f.doc('document-b');});assert.equal((await f.controller.inspect()).ok,false);assert.equal(readCalls(f).length,1);
});
test('post-read document change rejects even correctly returned result', async () => {
  const f=harness();await prepared(f);f.hook(r=>{if(r.func===identifyFixture && readCalls(f).length)f.doc('document-b');});assert.equal((await f.controller.inspect()).reason,'document_changed');
});
test('missing, empty, oversized or nonstring observation rejected', async () => {
  for(const v of [null,'','x'.repeat(513),{text:'x'}]){const f=harness();await prepared(f);f.read(v);assert.equal((await f.controller.inspect()).ok,false);}
});
test('concurrent confirmation cannot dispatch twice', async () => {
  const f=harness();await prepared(f);const a=f.controller.inspect(),b=f.controller.inspect();assert.equal((await b).reason,'busy');assert.equal((await a).ok,true);assert.equal(readCalls(f).length,1);
});
test('serialized reader checks URL and top frame before accessing DOM; only one text node', () => {
  const win={};win.top=win;
  const run=(func, url, node, frame=win)=>runInNewContext('('+func.toString()+')(expected)',{expected:FIXTURE,window:frame,location:{href:url},document:{getElementById(id){assert.equal(id,'lilly-public-fixture');return node;}}});
  const p={tagName:'P',childNodes:[{}],firstChild:{nodeType:3,nodeValue:'copper key'}};
  assert.equal(run(identifyFixture,FIXTURE,p),true);assert.equal(run(readFixture,FIXTURE,p),'copper key');
  assert.equal(run(readFixture,'https://example.test',p),null);assert.equal(run(readFixture,FIXTURE,p,{top:win}),null);
  for(const node of [null,{...p,tagName:'INPUT'},{...p,childNodes:[{},{}]},{...p,firstChild:{nodeType:1,nodeValue:'x'}}])assert.equal(run(readFixture,FIXTURE,node),null);
});
test('popup uses explicit trusted gestures and text-only output; no message or network handler', async()=>{
  const src=await readFile(new URL('../src/lilly-inspect-dev/popup.mjs',import.meta.url),'utf8');
  assert.match(src,/event\.isTrusted && navigator\.userActivation\.isActive/);assert.match(src,/\$\('result'\)\.textContent = r\.text/);
  assert.doesNotMatch(src,/innerHTML|fetch\(|runtime\.onMessage|setInterval|storage\./);
});
