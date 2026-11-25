import test from "node:test";
import assert from "node:assert/strict";
import { createMockProvider } from "../src/lilly-presence/mock-provider.mjs";
import { createMockConversation } from "../src/lilly-presence/mock-conversation.mjs";
const ctx = { browserId: "b", workerId: "w", windowId: 1, tabId: 2, documentId: "doc", frameId: 0, origin: "https://example.test" };
const event = (type, value = "") => JSON.stringify({ type, value });
const end = event("end"), text = value => event("text", value);
const call = (name = "read_fixture", value = "", id = "op1") => JSON.stringify({ id, name, target: "fixture-a", text: value });
const tool = value => event("tool", value);
const script = (events, pauseAt = -1, ignoreAbort = false) => ({ events, pauseAt, ignoreAbort });
function setup(scripts) {
  let t = 100, scope = ctx;
  const provider = createMockProvider(scripts);
  const chat = createMockConversation({ presenceConfig: { browserId: "b", workerId: "w", now: () => t }, readContext: () => scope, provider });
  return { provider, chat, time: value => { t = value; }, context: value => { scope = value; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function invite(f) { assert.equal(f.chat.invite(1000).mode, "observe"); }

test("absent and invalid prompts cannot open even mock provider", async () => {
  const f = setup([script([end])]); assert.equal((await f.chat.run("hello")).ok, false);
  invite(f); for (const input of [null, "", " ", "x".repeat(8193)]) assert.equal((await f.chat.run(input)).ok, false);
  assert.equal(f.provider.stats().opened, 0);
});
test("only branded fixture provider accepted", () => {
  assert.throws(() => createMockConversation({ provider: { open() { throw Error("unexpected"); } }, readContext: () => ctx }), /mock fixtures only/);
});
test("streamed text stays turn-scoped and completes without a tool", async () => {
  const f = setup([script([text("Hello"), text(" world"), end], 1)]); invite(f);
  const running = f.chat.run("hello"); await flush(); assert.equal(f.chat.snapshot().text, "Hello");
  assert.equal((await f.chat.run("another")).reason, "turn_busy");
  f.provider.release(0); assert.deepEqual(await running, { ok: true, result: "SYNTHETIC_TURN_COMPLETE_NO_AUTHORITY", text: "Hello world", receipt: null });
  assert.equal(f.chat.snapshot().text, ""); assert.equal(f.chat.snapshot().streaming, false);
});
test("fragmented canonical proposal accepted only after end and EOF", async () => {
  const raw = call(), f = setup([script([text("Reading"), tool(raw.slice(0, 13)), tool(raw.slice(13)), end], 3)]); invite(f);
  const running = f.chat.run("read"); await flush(); assert.equal(f.chat.snapshot().text, "Reading");
  f.provider.release(0); const result = await running; assert.equal(result.ok, true); assert.equal(result.receipt.result, "SYNTHETIC_DISPATCH_ACCEPTED_NO_AUTHORITY");
});
test("write proposal denied in observe, allowed only after owner escalation", async () => {
  const f = setup([script([tool(call("write_fixture", "draft")), end]), script([tool(call("write_fixture", "draft")), end])]); invite(f);
  assert.equal((await f.chat.run("write")).reason, "operation_denied"); assert.equal(f.chat.participate().mode, "participate");
  assert.equal((await f.chat.run("write")).receipt.result, "SYNTHETIC_DISPATCH_ACCEPTED_NO_AUTHORITY");
});
test("leave cancels cooperative stream and clears partial text", async () => {
  const f = setup([script([text("partial"), text("late"), end], 1)]); invite(f);
  const running = f.chat.run("hello"); await flush(); f.chat.leave();
  assert.equal(f.chat.snapshot().text, ""); assert.equal(f.provider.stats().aborted, 1);
  assert.deepEqual(await running, { ok: false, reason: "presence_revoked" }); assert.equal(f.provider.stats().emitted, 1);
});
test("noncooperative late chunk cannot inherit later invitation or corrupt new turn", async () => {
  const f = setup([script([text("old"), tool(call()), end], 1, true), script([text("new"), end], 1)]); invite(f);
  const old = f.chat.run("old"); await flush(); f.chat.leave(); invite(f);
  const fresh = f.chat.run("new"); await flush(); assert.equal(f.chat.snapshot().text, "new");
  f.provider.release(0); assert.deepEqual(await old, { ok: false, reason: "presence_revoked" });
  assert.equal(f.provider.stats().emitted, 3); assert.equal(f.chat.snapshot().text, "new");
  f.provider.release(1); assert.equal((await fresh).text, "new");
});
test("cancel invalidates a turn without withdrawing invitation", async () => {
  const f = setup([script([text("partial"), end], 1, true), script([text("next"), end])]); invite(f);
  const old = f.chat.run("first"); await flush(); f.chat.cancel(); assert.equal(f.chat.snapshot().presence.mode, "observe");
  assert.equal((await f.chat.run("next")).text, "next"); f.provider.release(0);
  assert.deepEqual(await old, { ok: false, reason: "turn_cancelled" });
});
test("navigation, unknown context, expiry and mode changes abort before final proposal", async () => {
  for (const change of [f => { f.context({ ...ctx, documentId: "other" }); f.chat.contextChanged(); }, f => f.context(null), f => f.time(1100), f => f.chat.participate()]) {
    const f = setup([script([tool(call()), end], 1, true)]); invite(f);
    const running = f.chat.run("read"); await flush(); change(f); f.provider.release(0);
    assert.equal((await running).reason, "presence_revoked"); assert.equal(f.chat.snapshot().text, "");
  }
});
test("incomplete, extra, duplicate or invalid stream never returns a receipt", async () => {
  for (const events of [[tool(call())], [tool(call()), end, text("extra")], [end, end], [event("bad")], [tool(call()), text("extra"), end], ["not json"], [event("text", 4), end]]) {
    const f = setup([script(events)]); invite(f); const r = await f.chat.run("x"); assert.equal(r.ok, false); assert.equal(r.receipt, undefined);
  }
});
test("strict tool protocol rejects unknown, malformed, duplicate keys and unbound targets", async () => {
  for (const raw of [call("eval"), call("read_fixture", "unexpected"), call().replace("fixture-a", "fixture-b"), call().replace('"id":"op1"', '"id":"op1","id":"op1"'), call()+" ", "{}", call()+call(), call("write_fixture", "x".repeat(2049))]) {
    const f = setup([script([tool(raw), end])]); invite(f); f.chat.participate(); assert.equal((await f.chat.run("x")).ok, false);
  }
});
test("same generation cannot reuse operation ID across completed turns", async () => {
  const f = setup([script([tool(call()), end]), script([tool(call()), end])]); invite(f);
  assert.equal((await f.chat.run("first")).ok, true); assert.equal((await f.chat.run("repeat")).reason, "duplicate_operation");
});
test("bounded stream and fixture exhaustion fail closed without fallback", async () => {
  const f = setup([script([text("x".repeat(8193)), end])]); invite(f);
  assert.equal((await f.chat.run("long")).ok, false); assert.equal((await f.chat.run("exhausted")).ok, false);
  assert.equal(f.chat.snapshot().streaming, false); assert.throws(() => createMockProvider(Array(17).fill(script([end]))));
});
test("revocation while hashing canonical payload prevents dispatch", async () => {
  const f = setup([script([tool(call("write_fixture", "draft")), end])]); invite(f); f.chat.participate();
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto"), real = globalThis.crypto;
  let entered, release; const seen = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { subtle: { async digest(algorithm, bytes) {
    entered({ algorithm, bytes: new TextDecoder().decode(bytes) }); await gate;
    return real.subtle.digest(algorithm, bytes);
  } } } });
  try {
    const running = f.chat.run("write");
    assert.deepEqual(await seen, { algorithm: "SHA-256", bytes: '["write_fixture","fixture-a","draft"]' });
    f.chat.leave(); invite(f); release();
    assert.deepEqual(await running, { ok: false, reason: "presence_revoked" });
    assert.equal(f.chat.snapshot().presence.mode, "observe");
  } finally { release(); Object.defineProperty(globalThis, "crypto", original); }
});
