import test from 'node:test';
import assert from 'node:assert/strict';
import { mountParticipation } from '../src/lilly-participation-dev/participation-ui.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  let now = 100, active = true, sequence = 0;
  const nodes = {}, timers = new Map(), calls = [];
  const signal = () => { const listeners = new Set(); return { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f), emit: () => { for (const f of listeners) f(); }, count: () => listeners.size }; };
  const eventTarget = () => { const listeners = new Map(); return { addEventListener: (k,f) => listeners.set(k,f), removeEventListener: k => listeners.delete(k), fire: (k,e={}) => listeners.get(k)?.(e) }; };
  for (const id of ['identify','prepare','confirm','leave','identity','preview','preview-section','status']) nodes[id] = { ...eventTarget(), disabled: false, hidden: true, textContent: '' };
  const document = { ...eventTarget(), hidden: false, getElementById: id => nodes[id] };
  const window = { ...eventTarget(), navigator: { userActivation: { get isActive() { return active; } } } };
  const scope = Object.freeze({documentId:'doc-a'});
  const preview = Object.freeze({url:'http://127.0.0.1:8765/lilly-participation.html',scope,action:{name:'mark_reviewed',target:'lilly-review-state',before:'Not reviewed',after:'Reviewed'},operation:{payloadDigest:'a'.repeat(64)},expiresAt:30100});
  const runtime = { async identify(){calls.push('identify');return {ok:true,scope,expiresAt:30100};}, async prepare(){calls.push('prepare');return {ok:true,preview};}, async confirm(p){calls.push('confirm');assert.equal(p,preview);return {ok:true,effect:'applied'};}, revoke(){calls.push('revoke');} };
  const api = {tabs:Object.fromEntries(['onActivated','onUpdated','onRemoved','onReplaced','onDetached','onAttached'].map(k=>[k,signal()])),windows:{onFocusChanged:signal()}};
  const ui = mountParticipation({api,document,window,runtime,now:()=>now,schedule:f=>{timers.set(++sequence,f);return sequence;},unschedule:id=>timers.delete(id)});
  return {nodes,document,window,runtime,api,ui,calls,timers,active:v=>{active=v;},expire:()=>{now=30100;for(const f of [...timers.values()])f();},click:async(id,trusted=true)=>{nodes[id].fire('click',{isTrusted:trusted});await flush();}};
}
async function prepare(h){await h.click('identify');await h.click('prepare');assert.equal(h.nodes.confirm.disabled,false);}
test('absent opening and three distinct trusted gestures; preview exact and cleared after receipt',async()=>{
  const h=harness();assert.deepEqual(h.calls,[]);await h.click('confirm');await h.click('prepare');assert.deepEqual(h.calls,[]);
  await h.click('identify',false);h.active(false);await h.click('identify');h.active(true);assert.deepEqual(h.calls,[]);
  await prepare(h);assert.match(h.nodes.preview.textContent,/Document doc-a\nAction: mark_reviewed/);assert.match(h.nodes.preview.textContent,/Before: Not reviewed\nAfter: Reviewed/);assert.match(h.nodes.preview.textContent,/SHA-256: a{64}/);assert.deepEqual(h.calls,['identify','prepare']);
  await h.click('confirm');assert.match(h.nodes.status.textContent,/Applied \(reported by fixture\)/);assert.equal(h.nodes.preview.textContent,'');assert.equal(h.nodes.confirm.disabled,true);await h.click('identify');await h.click('confirm');assert.equal(h.calls.filter(x=>x==='confirm').length,1);
});
test('all browser lifecycle events, blur, hide, leave and deadline revoke a prepared action',async()=>{
  for(const revoke of [h=>h.api.tabs.onActivated.emit(),h=>h.api.tabs.onUpdated.emit(),h=>h.api.tabs.onRemoved.emit(),h=>h.api.tabs.onReplaced.emit(),h=>h.api.tabs.onDetached.emit(),h=>h.api.tabs.onAttached.emit(),h=>h.api.windows.onFocusChanged.emit(),h=>h.window.fire('blur'),h=>{h.document.hidden=true;h.document.fire('visibilitychange');},h=>h.click('leave'),h=>h.expire()]){
    const h=harness();await prepare(h);await revoke(h);await h.click('confirm');assert.equal(h.nodes.preview.textContent,'');assert.equal(h.nodes.confirm.disabled,true);assert.equal(h.calls.includes('confirm'),false);assert.ok(h.calls.includes('revoke'));
  }
});
test('late identification cannot recreate approval after revocation',async()=>{
  const h=harness();let resolve;h.runtime.identify=()=>new Promise(r=>resolve=r);const click=h.click('identify');h.api.tabs.onUpdated.emit();resolve({ok:true,scope:{documentId:'late'},expiresAt:30100});await click;assert.equal(h.nodes.identity.textContent,'');assert.equal(h.nodes.prepare.disabled,true);
});
test('confirmation in flight followed by revocation is terminal unknown even if late success arrives',async()=>{
  const h=harness();await prepare(h);let resolve;h.runtime.confirm=()=>{h.calls.push('confirm');return new Promise(r=>resolve=r);};const click=h.click('confirm');h.api.tabs.onUpdated.emit();assert.match(h.nodes.status.textContent,/Effect unknown. Do not retry/);resolve({ok:true,effect:'applied'});await click;await h.click('leave');await h.click('identify');await h.click('confirm');assert.match(h.nodes.status.textContent,/Effect unknown/);assert.equal(h.calls.filter(x=>x==='confirm').length,1);
});
test('adapter unknown and thrown confirmation remain terminal; no retry',async()=>{
  for(const confirm of [async()=>({ok:false,effect:'unknown_do_not_retry'}),async()=>{throw Error('failed');}]){
    const h=harness();await prepare(h);h.runtime.confirm=confirm;await h.click('confirm');assert.match(h.nodes.status.textContent,/Effect unknown. Do not retry/);assert.equal(h.nodes.identify.disabled,true);
  }
});
test('explicit precondition failure does not claim success; pagehide disposes listeners',async()=>{
  const h=harness();await prepare(h);h.runtime.confirm=async()=>({ok:false,reason:'precondition_failed',effect:'not_applied'});await h.click('confirm');assert.match(h.nodes.status.textContent,/Not applied or denied: precondition_failed/);h.window.fire('pagehide');assert.equal(h.api.tabs.onActivated.count(),0);assert.equal(h.api.windows.onFocusChanged.count(),0);assert.equal(h.nodes.identify.disabled,true);
});

test('real adapter composition dispatches one document-bound mutation through UI',async()=>{
  const {createFixtureParticipation,ACTION_URL,markReviewed}=await import('../src/lilly-presence/fixture-participation.mjs');
  const h=harness(), writes=[];
  const tab={id:2,windowId:1,active:true,status:'complete',url:ACTION_URL,incognito:false};
  const runtime=createFixtureParticipation({browserId:'b',workerId:'w',now:()=>100,api:{tabs:{query:async()=>[tab]},scripting:{executeScript:async req=>{if(req.func===markReviewed){writes.push(req);return [{frameId:0,documentId:'doc-a',result:'applied'}];}return [{frameId:0,documentId:'doc-a',result:true}];}}}});
  Object.assign(h.runtime,runtime);await h.click("identify");await h.click("prepare");for(let i=0;i<1000&&h.nodes.confirm.disabled;i++)await flush();assert.equal(h.nodes.confirm.disabled,false,h.nodes.status.textContent);assert.equal(writes.length,0);await h.click('confirm');assert.equal(writes.length,1);assert.deepEqual(writes[0].target,{tabId:2,documentIds:['doc-a']});assert.match(h.nodes.status.textContent,/Applied \(reported by fixture\)/);
});
test('allowlist build contains exactly eight regular files with restricted manifest and refuses overwrite',async()=>{
  const {build,inventory}=await import('../tools/build-lilly-participation.mjs');
  const {readdir,readFile,rm}=await import('node:fs/promises');const {join}=await import('node:path');
  const out=await build();try{const files=(await readdir(out,{recursive:true,withFileTypes:true})).filter(x=>x.isFile()).map(x=>join(x.parentPath,x.name).slice(out.length+1)).sort();assert.deepEqual(files,[...inventory].sort());assert.equal(files.length,8);const manifest=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));assert.deepEqual(manifest.permissions,['sidePanel','activeTab','scripting']);assert.equal(manifest.incognito,'not_allowed');assert.equal(manifest.host_permissions,undefined);assert.match(manifest.content_security_policy.extension_pages,/connect-src 'none'/);assert.ok(files.includes(manifest.side_panel.default_path));assert.ok(files.includes(manifest.background.service_worker));await assert.rejects(build(out));}finally{await rm(out,{recursive:true,force:true});}
});
