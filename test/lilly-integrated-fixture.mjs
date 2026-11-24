import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegratedFixture } from '../src/lilly-presence/integrated-fixture.mjs';
import { createMockProvider } from '../src/lilly-presence/mock-provider.mjs';
import { FIXTURE, identifyFixture, readFixture } from '../src/lilly-inspect-dev/inspection.mjs';
const tab = { id: 2, windowId: 1, active: true, status: 'complete', url: FIXTURE, incognito: false };
const scope = { browserId: 'b', workerId: 'w', windowId: 1, tabId: 2, documentId: 'doc-a', frameId: 0, origin: 'http://127.0.0.1:8765' };
const observation = { type: 'fixture_text_v1', sessionId: 1, generation: 1, source: { url: FIXTURE, scope }, acquiredAt: 100, validUntil: 300100, text: 'copper key' };
const event = (type, value = '') => JSON.stringify({ type, value });
const end = event('end');
const script = (value, extra = {}) => ({ events: [event('text', value), end], ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(scripts = [script('fixture response')]) {
  let time = 100, tabs = [tab], documentId = 'doc-a', text = 'copper key', hook = null, queryHook = null;
  const calls = [], provider = createMockProvider(scripts);
  const api = { tabs: { async query() { if (queryHook) await queryHook(); return tabs; } }, scripting: { async executeScript(req) {
    calls.push(req); if (hook) await hook(req);
    if (req.target.documentIds && !req.target.documentIds.includes(documentId)) throw Error('document unavailable');
    return [{ frameId: 0, documentId, result: req.func === identifyFixture ? true : text }];
  } } };
  const fixture = createIntegratedFixture({ api, browserId: 'b', workerId: 'w', provider, now: () => time });
  return { fixture, provider, calls, time: v => { time = v; }, tabs: v => { tabs = v; }, doc: v => { documentId = v; },
    text: v => { text = v; }, hook: v => { hook = v; }, queryHook: v => { queryHook = v; } };
}
const reads = f => f.calls.filter(c => c.func === readFixture);
async function join(f) { assert.equal((await f.fixture.prepare()).ok, true); const r = await f.fixture.confirm(); assert.equal(r.ok, true, r.reason); return r.observation; }

test('no content read or provider open without explicit identify and confirm', async () => {
  const f = setup(); assert.equal((await f.fixture.confirm()).ok, false); assert.equal((await f.fixture.run('x')).ok, false);
  assert.equal(f.calls.length, 0); assert.equal((await f.fixture.prepare()).ok, true);
  assert.equal(reads(f).length, 0); assert.equal((await f.fixture.run('x')).ok, false); assert.equal(f.provider.stats().opened, 0);
});
test('real inspection contract supplies immutable document-attributed observation to mock provider', async () => {
  const f = setup([script('fixture response', { expectedRequest: { prompt: 'what is here?', observation } })]);
  const observed = await join(f); assert.deepEqual(observed, observation); assert.deepEqual(f.fixture.snapshot().observation, observation);
  assert.ok(Object.isFrozen(observed) && Object.isFrozen(observed.source) && Object.isFrozen(observed.source.scope));
  assert.equal(reads(f).length, 1); assert.deepEqual(reads(f)[0].target, { tabId: 2, documentIds: ['doc-a'] });
  assert.equal(f.provider.stats().opened, 0); const r = await f.fixture.run('what is here?');
  assert.equal(r.ok, true); assert.equal(r.text, 'fixture response'); assert.equal(r.observationSessionId, 1); assert.equal(reads(f).length, 1);
});
test('provider request mismatch fails instead of silently ignoring observation', async () => {
  const f = setup([script('unexpected', { expectedRequest: { prompt: 'different', observation } })]);
  await join(f); assert.equal((await f.fixture.run('actual')).reason, 'invalid_fixture_or_stream');
});
test('cannot repeat confirmation or silently re-invite', async () => {
  const f = setup(); await join(f); assert.equal((await f.fixture.confirm()).ok, false);
  assert.equal((await f.fixture.prepare()).reason, 'leave_required'); assert.equal(reads(f).length, 1);
});
test('exact URL and active non-incognito tab required', async () => {
  for (const patch of [{ url: FIXTURE+'?x=1' }, { incognito: true }, { active: false }, { status: 'loading' }]) {
    const f = setup(); f.tabs([{...tab,...patch}]); assert.equal((await f.fixture.prepare()).ok, false); assert.equal(f.calls.length,0);
  }
});
test('same URL replacement before confirmation refuses content read', async () => {
  const f = setup(); await f.fixture.prepare(); f.doc('doc-b'); assert.equal((await f.fixture.confirm()).ok,false);
  assert.equal(reads(f).length,0); assert.equal(f.fixture.snapshot().stage,'absent');
});
test('tab switch during identification cannot be silently rebound', async () => {
  const f = setup(); f.hook(()=>f.tabs([{...tab,id:3}])); assert.equal((await f.fixture.prepare()).ok,false); assert.equal(reads(f).length,0);
});
test('confirmation expires without content acquisition', async () => {
  const f = setup(); await f.fixture.prepare(); f.time(30100); assert.equal((await f.fixture.confirm()).ok,false); assert.equal(reads(f).length,0);
});
test('revocation in flight prevents observation release', async () => {
  const f = setup(); await f.fixture.prepare(); f.hook(req=>{if(req.func===readFixture)f.fixture.revoke();});
  const r = await f.fixture.confirm(); assert.equal(r.ok,false); assert.equal(r.observation,undefined); assert.equal(f.fixture.snapshot().observation,null);
});
test('observation expiry and clock regression clear retained context before new turn', async () => {
  for(const t of [300100,99,NaN]){const f=setup();await join(f);f.time(t);assert.equal((await f.fixture.run('x')).ok,false);assert.equal(f.fixture.snapshot().observation,null);assert.equal(f.provider.stats().opened,0);}
});
test('browser document revalidated before opening provider', async () => {
  const f = setup(); await join(f); f.doc('doc-b'); assert.equal((await f.fixture.run('x')).reason,'presence_revoked'); assert.equal(f.provider.stats().opened,0);assert.equal(f.fixture.snapshot().observation,null);
});
test('late noncooperative turn cannot release old observation or alter reinvited session', async () => {
  const f=setup([script('old',{pauseAt:0,ignoreAbort:true}),script('new')]);const oldObservation=await join(f);
  const old=f.fixture.run('old');await flush();assert.equal(f.provider.stats().opened,1);f.fixture.revoke();assert.equal(f.fixture.snapshot().observation,null);
  f.text('new key');const fresh=await join(f);assert.equal(fresh.sessionId,2);assert.equal(oldObservation.generation,fresh.generation);
  assert.equal((await f.fixture.run('new')).text,'new');f.provider.release(0);assert.equal((await old).reason,'presence_revoked');assert.equal(f.fixture.snapshot().observation.text,'new key');
});
test('navigation missed by event forwarding still rejects final response at revalidation', async () => {
  const f=setup([script('old',{pauseAt:0,ignoreAbort:true})]);await join(f);const running=f.fixture.run('x');await flush();f.doc('doc-b');f.provider.release(0);
  const r=await running;assert.equal(r.ok,false);assert.equal(r.text,undefined);assert.equal(f.fixture.snapshot().stage,'absent');
});
test('revocation at final metadata probe suppresses otherwise completed turn', async () => {
  const f=setup([script('old',{pauseAt:0})]);await join(f);const running=f.fixture.run('x');await flush();f.hook(()=>f.fixture.revoke());f.provider.release(0);
  assert.equal((await running).ok,false);assert.equal(f.fixture.snapshot().stage,'absent');
});
test('concurrent run rejected and no partial output exposed', async () => {
  const f=setup([script('partial',{pauseAt:1})]);await join(f);const a=f.fixture.run('x');await flush();assert.equal((await f.fixture.run('y')).reason,'busy');assert.equal(f.fixture.snapshot().text,undefined);
  f.provider.release(0);assert.equal((await a).ok,true);
});
test('mock write proposal cannot escalate or touch the browser', async () => {
  const raw=JSON.stringify({id:'op',name:'write_fixture',target:'fixture-a',text:'change'});
  const f=setup([{events:[event('tool',raw),end]}]);await join(f);assert.equal(f.fixture.participate,undefined);assert.equal((await f.fixture.run('write')).reason,'operation_denied');assert.equal(reads(f).length,1);
});
test('mock read proposal yields synthetic receipt only, not a second observation', async () => {
  const raw=JSON.stringify({id:'op',name:'read_fixture',target:'fixture-a',text:''});
  const f=setup([{events:[event('tool',raw),end]}]);await join(f);const r=await f.fixture.run('read');assert.equal(r.receipt.result,'SYNTHETIC_DISPATCH_ACCEPTED_NO_AUTHORITY');assert.equal(reads(f).length,1);
});
