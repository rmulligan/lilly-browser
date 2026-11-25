import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegratedTextFixture } from '../src/lilly-presence/integrated-text-fixture.mjs';
import { FIXTURE, identifyFixture, readFixture } from '../src/lilly-inspect-dev/inspection.mjs';
import { TEXT_PROTOCOL } from '../src/lilly-presence/local-text-turn.mjs';
const flush = () => new Promise(r => setImmediate(r));
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tab = {id:2,windowId:1,active:true,status:'complete',url:FIXTURE,incognito:false};
const line = (r,kind,value='') => JSON.stringify([TEXT_PROTOCOL,r.requestId,r.modelId,r.observation.sessionId,r.observation.generation,kind,value])+'\n';
function harness() {
  let t=100, tabs=[tab], doc='doc-a', hook=null, queryHook=null, pull=null, closeHook=null;
  const calls=[], requests=[], signals=[];
  const api={tabs:{async query(){if(queryHook)await queryHook();return tabs;}},scripting:{async executeScript(req){calls.push(req);if(hook)await hook(req);if(req.target.documentIds&&!req.target.documentIds.includes(doc))throw Error('wrong doc');return [{frameId:0,documentId:doc,result:req.func===identifyFixture?true:'A small copper key rests beside a blue notebook.'}];}}};
  const transport={open(r,s){requests.push(r);signals.push(s);let sent=false;return {async next(){if(pull)return pull(r);if(sent)return {done:true};sent=true;return {done:false,value:new TextEncoder().encode(line(r,'text','Copper key, blue notebook.')+line(r,'end'))};},close(){return closeHook?.();}};}};
  const runtime=createIntegratedTextFixture({api,transport,modelId:'fixture/model',browserId:'b',workerId:'w',now:()=>t});
  return {runtime,calls,requests,signals,doc:v=>{doc=v;},tabs:v=>{tabs=v;},time:v=>{t=v;},hook:v=>{hook=v;},queryHook:v=>{queryHook=v;},pull:v=>{pull=v;},closeHook:v=>{closeHook=v;}};
}
async function observe(h) {const p=await h.runtime.prepare();assert.equal(p.ok,true,p.reason);const c=await h.runtime.confirm();assert.equal(c.ok,true,c.reason);return c.observation;}
test('no request without explicit observed fixture; snapshot provenance and exact document read',async()=>{
  const h=harness();assert.equal((await h.runtime.run('hi')).ok,false);await h.runtime.prepare();assert.equal((await h.runtime.run('hi')).ok,false);assert.equal(h.requests.length,0);const r=await h.runtime.confirm();assert.equal(r.ok,true,r.reason);const o=r.observation;assert.equal(o.source.scope.documentId,'doc-a');assert.equal(o.type,'fixture_text_v1');assert.ok(Object.isFrozen(o));const reads=h.calls.filter(x=>x.func===readFixture);assert.equal(reads.length,1);assert.deepEqual(reads[0].target,{tabId:2,documentIds:['doc-a']});const result=await h.runtime.run('what do you see?');assert.equal(result.ok,true,result.reason);assert.equal(result.text,'Copper key, blue notebook.');assert.equal(result.provenance.sessionId,o.sessionId);assert.equal(result.provenance.source.documentId,'doc-a');assert.equal(h.requests[0].observation.text,o.text);assert.equal(h.calls.filter(x=>x.func===readFixture).length,1);assert.ok(h.calls.every(x=>[identifyFixture,readFixture].includes(x.func)));
});
test('nonfixture, changed doc/tab or expired snapshot denies before opening transport',async()=>{
  for(const change of [h=>h.doc('doc-b'),h=>h.tabs([{...tab,id:3}]),h=>h.tabs([{...tab,url:FIXTURE+'?x=1'}]),h=>h.time(300100),h=>h.time(99)]){const h=harness();await observe(h);change(h);assert.equal((await h.runtime.run('hi')).ok,false);assert.equal(h.requests.length,0);assert.equal(h.runtime.snapshot().stage,'absent');}
});
test('no capture after identification expiry or document replacement',async()=>{
  for(const change of [h=>h.time(30100),h=>h.doc('doc-b')]){const h=harness();assert.equal((await h.runtime.prepare()).ok,true);change(h);assert.equal((await h.runtime.confirm()).ok,false);assert.equal(h.calls.filter(x=>x.func===readFixture).length,0);assert.equal(h.requests.length,0);}
});
test('leave during preflight prevents transport dispatch',async()=>{
  const h=harness();await observe(h);h.hook(()=>h.runtime.revoke());assert.equal((await h.runtime.run('hi')).ok,false);assert.equal(h.requests.length,0);
});
test('postflight replacement suppresses completed text even when transport completed',async()=>{
  const h=harness();await observe(h);h.closeHook(()=>h.doc('doc-b'));const r=await h.runtime.run('hi');assert.equal(r.ok,false);assert.equal(r.text,undefined);assert.equal(h.requests.length,1);assert.equal(h.runtime.snapshot().stage,'absent');
});
test('revocation during final browser probe suppresses text',async()=>{
  const h=harness();await observe(h);h.closeHook(()=>h.hook(()=>h.runtime.revoke()));const r=await h.runtime.run('hi');assert.equal(r.ok,false);assert.equal(r.text,undefined);assert.equal(h.runtime.snapshot().stage,'absent');
});
test('noncooperative cancelled transport occupies shared slot across leave and reinvite',async()=>{
  const h=harness();const firstObservation=await observe(h);const pending=defer();h.pull(()=>pending.promise);const first=h.runtime.run('hi');await flush();assert.equal(h.requests.length,1);h.runtime.revoke();assert.equal((await first).ok,false);assert.equal(h.signals[0].aborted,true);const secondObservation=await observe(h);assert.notEqual(secondObservation.sessionId,firstObservation.sessionId);assert.equal((await h.runtime.run('new')).reason,'busy');assert.equal(h.requests.length,1);pending.resolve({done:true});await flush();h.pull(null);assert.equal((await h.runtime.run('new')).ok,true);assert.equal(h.requests.length,2);assert.equal(h.requests[1].observation.sessionId,secondObservation.sessionId);
});
test('close failure poisons shared runtime even after re-invite',async()=>{
  const h=harness();await observe(h);h.closeHook(()=>Promise.reject(Error('close')));assert.equal((await h.runtime.run('hi')).reason,'transport_close_failed');h.runtime.revoke();await observe(h);assert.equal((await h.runtime.run('new')).reason,'transport_unqualified');assert.equal(h.requests.length,1);
});
test('concurrent preflight is denied; no second request',async()=>{
  const h=harness();await observe(h);const p=defer();h.queryHook(()=>p.promise);const first=h.runtime.run('hi');assert.equal((await h.runtime.run('hi again')).reason,'busy');p.resolve();assert.equal((await first).ok,true);assert.equal(h.requests.length,1);
});
test('cancel during preflight or postflight never opens a new request or releases completed text',async()=>{
  const a=harness();await observe(a);a.hook(()=>a.runtime.cancel());assert.equal((await a.runtime.run('hi')).reason,'turn_cancelled');assert.equal(a.requests.length,0);assert.equal(a.runtime.snapshot().stage,'observing');
  const b=harness();await observe(b);b.closeHook(()=>b.hook(()=>b.runtime.cancel()));const r=await b.runtime.run('hi');assert.equal(r.reason,'turn_cancelled');assert.equal(r.text,undefined);assert.equal(b.requests.length,1);assert.equal(b.runtime.snapshot().stage,'observing');
});
