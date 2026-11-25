import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTextTurn, TEXT_PROTOCOL, TEXT_LIMITS } from '../src/lilly-presence/local-text-turn.mjs';
const encode = s => new TextEncoder().encode(s);
const line = (r, type, value = '') => JSON.stringify([TEXT_PROTOCOL,r.requestId,r.modelId,r.observation.sessionId,r.observation.generation,type,value])+'\n';
const defer = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve=>setImmediate(resolve));
function observation(overrides={}) {
  return Object.freeze({type:'fixture_text_v1',sessionId:1,generation:2,acquiredAt:50,validUntil:10000,text:'A small copper key rests beside a blue notebook.',
    source:Object.freeze({url:'http://127.0.0.1:8765/lilly-fixture.html',scope:Object.freeze({browserId:'b',workerId:'w',windowId:1,tabId:2,documentId:'doc-a',frameId:0,origin:'http://127.0.0.1:8765'})}),...overrides});
}
function harness(make, close = ()=>{}) {
  let o=observation(), t=100, timer, opens=0, closes=0, request, signal;
  const transport={open(r,s){opens++;request=r;signal=s;const stream=make(r,s);return {next:stream.next,close(){closes++;return close();}};}};
  const runtime=createLocalTextTurn({transport,modelId:'fixture/model',readObservation:()=>o,now:()=>t,schedule:f=>{timer=f;return 1;},unschedule:()=>{timer=null;}});
  return {runtime,observation:v=>{o=v;},time:v=>{t=v;},expire:()=>timer?.(),get opens(){return opens;},get closes(){return closes;},get request(){return request;},get signal(){return signal;}};
}
function chunks(fn) { return r=>{const data=fn(r);let i=0;return {async next(){return i<data.length?{done:false,value:data[i++]}:{done:true};}};}; }
const valid = chunks(r=>[encode(line(r,'text','hello')+line(r,'end'))]);
test('no invitation, invalid snapshot or prompt never opens transport',async()=>{
  const h=harness(valid);for(const o of [null,{...observation()},observation({validUntil:100}),observation({text:'x'.repeat(513)}),observation({acquiredAt:101}),observation({sessionId:0})]){h.observation(o);assert.equal((await h.runtime.run('hi')).ok,false);}h.observation(observation());for(const p of ['', ' ', '\ud800', 'x'.repeat(8193)])assert.equal((await h.runtime.run(p)).reason,'invalid_prompt');assert.equal(h.opens,0);
});
test('fragmented UTF-8 and multiple frames yield exact text with whitelisted immutable provenance',async()=>{
  const h=harness(chunks(r=>(()=>{const bytes=encode(line(r,'text','key 🗝️')+line(r,'text','\nnotebook')+line(r,'end'));return Array.from({length:Math.ceil(bytes.length/2)},(_,i)=>bytes.slice(i*2,i*2+2));})()));
  // Two-byte chunks split UTF-8 and frame boundaries without exceeding chunk budget.
  h.observation(observation({secret:'must not travel'}));const result=await h.runtime.run('what do you see?');assert.equal(result.ok,true,result.reason);assert.equal(result.text,'key 🗝️\nnotebook');assert.equal(result.result,'TEXT_TURN_COMPLETE_NO_AUTHORITY');assert.equal(result.provenance.modelIdentity,'transport_claim_only');assert.equal(result.provenance.source.documentId,'doc-a');assert.equal(h.request.observation.secret,undefined);assert.equal(h.request.observation.source.scope,undefined);assert.ok(Object.isFrozen(h.request)&&Object.isFrozen(h.request.observation)&&Object.isFrozen(h.request.observation.source));assert.equal(h.closes,1);assert.equal(h.runtime.snapshot().busy,false);
});
test('no partial response for malformed, wrong identity, tool, error, duplicate end or missing EOF framing',async()=>{
  const bad=[r=>'{"bad":true}\n',r=>line({...r,requestId:'wrong'},'text','x'),r=>line({...r,modelId:'wrong'},'text','x'),r=>line({...r,observation:{...r.observation,generation:99}},'text','x'),r=>line(r,'tool','x'),r=>line(r,'error','internal detail'),r=>line(r,'end')+line(r,'end'),r=>line(r,'end')+'trailing',r=>line(r,'end').trimEnd(),r=>line(r,'text','partial'),r=>line(r,'text','\ud800')+line(r,'end'),r=>line(r,'end').replace('[','[ ')];
  for(const f of bad){const h=harness(chunks(r=>[encode(f(r))]));const result=await h.runtime.run('hi');assert.equal(result.ok,false);assert.equal(result.text,undefined);assert.equal(h.closes,1);}
});
test('invalid UTF-8 and truncated multibyte sequences fail closed',async()=>{
  for(const bytes of [[0xc0,0xaf],[0xf0,0x9f],[0xef,0xbb,0xbf]]){const h=harness(chunks(()=>[Uint8Array.from(bytes)]));assert.equal((await h.runtime.run('hi')).ok,false);assert.equal(h.closes,1);}
});
test('total bytes, frames, chunks, frame size and response text are bounded',async()=>{
  for(const make of [chunks(()=>[new Uint8Array(TEXT_LIMITS.bytes+1)]),chunks(r=>[encode(line(r,'text','x').repeat(129))]),chunks(()=>Array.from({length:257},()=>Uint8Array.of(65))),chunks(()=>[encode('x'.repeat(TEXT_LIMITS.frame+1))]),chunks(r=>[encode(line(r,'text','x'.repeat(8192))+line(r,'text','y')+line(r,'end'))])]){const h=harness(make);assert.equal((await h.runtime.run('hi')).ok,false);assert.equal(h.closes,1);}
});
test('one in-flight turn; cancel is prompt but noncooperative pull retains slot until settled',async()=>{
  const pending=defer();const h=harness(()=>({next:()=>pending.promise}));const first=h.runtime.run('hi');assert.equal((await h.runtime.run('another')).reason,'turn_busy');h.runtime.cancel();assert.equal((await first).reason,'turn_cancelled');assert.equal(h.signal.aborted,true);await flush();assert.equal(h.closes,1);assert.equal((await h.runtime.run('another')).reason,'turn_busy');pending.resolve({done:true});await flush();assert.equal(h.runtime.snapshot().busy,false);
});
test('deadline is bounded even if transport refuses to finish',async()=>{
  const pending=defer();const h=harness(()=>({next:()=>pending.promise}));const first=h.runtime.run('hi');h.expire();assert.equal((await first).reason,'deadline_expired');assert.equal(h.signal.aborted,true);assert.equal((await h.runtime.run('another')).reason,'turn_busy');pending.reject(Error('late'));await flush();assert.equal(h.runtime.snapshot().busy,false);
});
test('changed observation rejects late text even with identical fields; clock regression and expiry fail closed',async()=>{
  for(const change of [h=>h.observation(observation()),h=>h.observation(null),h=>h.time(99),h=>h.time(10000)]){const pending=defer();const h=harness(()=>({next:()=>pending.promise}));const first=h.runtime.run('hi');change(h);pending.resolve({done:false,value:encode(line(h.request,'text','late')+line(h.request,'end'))});const result=await first;assert.equal(result.ok,false);assert.equal(result.text,undefined);assert.equal(h.signal.aborted,true);await flush();assert.equal(h.closes,1);}
});
test('revocation during asynchronous close withholds completed response and keeps slot occupied',async()=>{
  const closing=defer();const h=harness(valid,()=>closing.promise);const first=h.runtime.run('hi');await flush();assert.equal(h.closes,1);h.runtime.revoke();assert.equal((await first).reason,'presence_revoked');assert.equal((await h.runtime.run('again')).reason,'turn_busy');closing.resolve();await flush();assert.equal(h.runtime.snapshot().busy,false);
});
test('close rejection poisons runtime; never returns completed text or retries',async()=>{
  const h=harness(valid,()=>Promise.reject(Error('close failed')));assert.equal((await h.runtime.run('hi')).reason,'transport_close_failed');assert.equal(h.runtime.snapshot().poisoned,true);assert.equal((await h.runtime.run('again')).reason,'transport_unqualified');assert.equal(h.opens,1);
});
test('provider-open error is fail closed and not retried',async()=>{
  const h=harness(()=>{throw Error('open failed');});assert.equal((await h.runtime.run('hi')).reason,'transport_open_failed');assert.equal((await h.runtime.run('hi')).reason,'transport_unqualified');assert.equal(h.opens,1);
});
test('contextChanged proactively aborts; no partially streamed text exposed in snapshot',async()=>{
  const pending=defer();let count=0;const h=harness(r=>({next:()=>++count===1?Promise.resolve({done:false,value:encode(line(r,'text','partial'))}):pending.promise}));const first=h.runtime.run('hi');await flush();assert.deepEqual(h.runtime.snapshot(),{busy:true,poisoned:false});h.observation(null);h.runtime.contextChanged();assert.equal((await first).reason,'presence_revoked');pending.resolve({done:true});await flush();assert.equal(h.runtime.snapshot().busy,false);
});
test('explicit revocation burns the exact snapshot even without an active turn',async()=>{
  const h=harness(valid);h.runtime.revoke();assert.equal((await h.runtime.run('hi')).reason,'observation_required');assert.equal(h.opens,0);h.observation(observation());assert.equal((await h.runtime.run('hi')).ok,true);
});
test('terminal frame requires clean EOF; later chunk cannot add text',async()=>{
  const h=harness(chunks(r=>[encode(line(r,'end')),encode(line(r,'text','late'))]));assert.equal((await h.runtime.run('hi')).ok,false);assert.equal(h.closes,1);
});
