import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { ACTION_URL, ACTION, identifyActionFixture, markReviewed, createFixtureParticipation } from '../src/lilly-presence/fixture-participation.mjs';
const tab = { id: 2, windowId: 1, active: true, status: 'complete', url: ACTION_URL, incognito: false };
function harness() {
  let t = 100, tabs = [tab], doc = 'doc-a', result = 'applied', hook = null, queryHook = null;
  const calls = [];
  const api = { tabs: { async query() { if (queryHook) await queryHook(); return tabs; } }, scripting: { async executeScript(req) {
    calls.push(req); if (hook) await hook(req);
    if (req.target.documentIds && !req.target.documentIds.includes(doc)) throw Error('document unavailable');
    return [{ frameId: 0, documentId: doc, result: req.func === identifyActionFixture ? true : result }];
  } } };
  const runtime = createFixtureParticipation({ api, browserId: 'b', workerId: 'w', now: () => t });
  return { runtime, calls, time: v => { t = v; }, tabs: v => { tabs = v; }, doc: v => { doc = v; },
    result: v => { result = v; }, hook: v => { hook = v; }, queryHook: v => { queryHook = v; } };
}
const writes = f => f.calls.filter(c => c.func === markReviewed);
async function prepared(f) { assert.equal((await f.runtime.identify()).ok,true); const r=await f.runtime.prepare(); assert.equal(r.ok,true,r.reason); return r.preview; }
test('no write or probe without explicit identification, preparation and confirmation',async()=>{
  const f=harness();assert.equal((await f.runtime.prepare()).ok,false);assert.equal((await f.runtime.confirm({})).ok,false);assert.equal(f.calls.length,0);
  await f.runtime.identify();assert.equal(writes(f).length,0);assert.equal((await f.runtime.confirm({})).ok,false);
  await f.runtime.prepare();assert.equal(writes(f).length,0);
});
test('preview binds exact scope and fixed payload digest; one dispatch only',async()=>{
  const f=harness(),p=await prepared(f);assert.equal(p.url,ACTION_URL);assert.equal(p.scope.documentId,'doc-a');assert.deepEqual(p.action,ACTION);
  assert.equal(p.operation.payloadDigest,createHash('sha256').update(JSON.stringify([ACTION_URL,ACTION.name,ACTION.target,ACTION.before,ACTION.after])).digest('hex'));
  assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.scope)&&Object.isFrozen(p.action)&&Object.isFrozen(p.operation));
  const r=await f.runtime.confirm(p);assert.equal(r.result,'FIXTURE_DOM_EFFECT_REPORTED');assert.equal(r.effect,'applied');
  assert.equal(writes(f).length,1);assert.deepEqual(writes(f)[0].target,{tabId:2,documentIds:['doc-a']});assert.equal(writes(f)[0].world,'ISOLATED');
  assert.equal((await f.runtime.confirm(p)).ok,false);assert.equal((await f.runtime.identify()).reason,'dispatch_already_attempted');assert.equal(writes(f).length,1);
});
test('copied or mismatched preview burns approval',async()=>{
  const f=harness(),p=await prepared(f);assert.equal((await f.runtime.confirm({...p})).reason,'approval_mismatch');assert.equal((await f.runtime.confirm(p)).ok,false);assert.equal(writes(f).length,0);
});
test('nonfixture, incognito, incomplete or ambiguous tabs denied without injection',async()=>{
  for(const tabs of [[{...tab,url:ACTION_URL+'?x=1'}],[{...tab,incognito:true}],[{...tab,status:'loading'}],[{...tab,pendingUrl:ACTION_URL}],[tab,tab],[]]){
    const f=harness();f.tabs(tabs);assert.equal((await f.runtime.identify()).ok,false);assert.equal(f.calls.length,0);
  }
});
test('same URL replacement before prepare or confirm is refused',async()=>{
  const a=harness();await a.runtime.identify();a.doc('doc-b');assert.equal((await a.runtime.prepare()).ok,false);assert.equal(writes(a).length,0);
  const b=harness(),p=await prepared(b);b.doc('doc-b');assert.equal((await b.runtime.confirm(p)).ok,false);assert.equal(writes(b).length,0);
});
test('tab/window change, deadline and clock regression deny dispatch',async()=>{
  for(const change of [f=>f.tabs([{...tab,id:3}]),f=>f.tabs([{...tab,windowId:3}]),f=>f.time(30100),f=>f.time(99),f=>f.time(NaN)]){
    const f=harness(),p=await prepared(f);change(f);assert.equal((await f.runtime.confirm(p)).ok,false);assert.equal(writes(f).length,0);
  }
});
test('leave before or during verification refuses dispatch',async()=>{
  const a=harness(),pa=await prepared(a);a.runtime.revoke();assert.equal((await a.runtime.confirm(pa)).ok,false);assert.equal(writes(a).length,0);
  const b=harness(),pb=await prepared(b);b.hook(()=>b.runtime.revoke());assert.equal((await b.runtime.confirm(pb)).ok,false);assert.equal(writes(b).length,0);
});
test('revocation after dispatch reports unknown effect, never falsely reports nonexecution',async()=>{
  const f=harness(),p=await prepared(f);f.hook(req=>{if(req.func===markReviewed)f.runtime.revoke();});const r=await f.runtime.confirm(p);
  assert.equal(r.effect,'unknown_do_not_retry');assert.equal(writes(f).length,1);assert.equal((await f.runtime.identify()).reason,'dispatch_already_attempted');
});
test('dispatch error or document replacement is unknown, no fallback or automatic retry',async()=>{
  for(const hook of [()=>{throw Error('injection failed');},f=>f.doc('doc-b')]){const f=harness(),p=await prepared(f);f.hook(req=>{if(req.func===markReviewed)hook(f);});assert.equal((await f.runtime.confirm(p)).effect,'unknown_do_not_retry');assert.equal(writes(f).length,1);}
});
test('concurrent confirmation cannot dispatch twice',async()=>{
  const f=harness(),p=await prepared(f);const a=f.runtime.confirm(p),b=f.runtime.confirm(p);assert.equal((await b).ok,false);assert.equal((await a).ok,true);assert.equal(writes(f).length,1);
});
test('exact reported precondition failure is distinguished from unknown result',async()=>{
  for(const [value,effect] of [['not_applied','not_applied'],['unexpected','unknown_do_not_retry']]){const f=harness(),p=await prepared(f);f.result(value);assert.equal((await f.runtime.confirm(p)).effect,effect);assert.equal(writes(f).length,1);}
});
test('serialized DOM action modifies only exact fixed text node once',()=>{
  const win={};win.top=win;const text={nodeType:3,nodeValue:'Not reviewed'},p={tagName:'P',childNodes:[text],firstChild:text};const outside={nodeValue:'unchanged'};
  const run=(fn,url=ACTION_URL,nodes=[p],frame=win)=>runInNewContext('('+fn.toString()+')()',{window:frame,location:{href:url},document:{querySelectorAll(s){assert.equal(s,'#lilly-review-state');return nodes;}}});
  assert.equal(run(identifyActionFixture),true);assert.equal(run(markReviewed,ACTION_URL+'?x=1'),'not_applied');assert.equal(run(markReviewed,ACTION_URL,[p],{top:win}),'not_applied');
  for(const nodes of [[],[p,p],[{...p,tagName:'INPUT'}],[{...p,childNodes:[text,text]}]])assert.equal(run(markReviewed,ACTION_URL,nodes),'not_applied');
  assert.equal(text.nodeValue,'Not reviewed');assert.equal(run(markReviewed),'applied');assert.equal(text.nodeValue,'Reviewed');assert.equal(run(markReviewed),'not_applied');assert.equal(outside.nodeValue,'unchanged');
});
