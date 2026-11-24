import test from "node:test";
import assert from "node:assert/strict";
import { createPresenceController } from "../src/lilly-presence/controller.mjs";
const ctx = Object.freeze({ browserId: "browser-a", workerId: "worker-a", windowId: 1,
  tabId: 2, documentId: "document-a", frameId: 0, origin: "https://example.test" });
const op = (id = "op-1", kind = "observe") => ({ id, kind, target: "fixture-a", payloadDigest: "a".repeat(64) });
function fixture() {
  let t = 100;
  const { owner, guard } = createPresenceController({ browserId: ctx.browserId, workerId: ctx.workerId, now: () => t });
  return { owner, guard, setTime: value => { t = value; } };
}
function joined() { const f = fixture(); assert.equal(f.owner.invite(ctx, 1000).mode, "observe"); return f; }
function prepared(f, operation = op()) {
  const turn = f.guard.begin(ctx); assert.equal(turn.ok, true);
  const p = f.guard.prepare(turn.lease, operation, ctx); assert.equal(p.ok, true);
  return { ...p, lease: turn.lease };
}

test("initially absent; opening/reading status does not grant anything", () => {
  const { owner, guard } = fixture(); assert.equal(owner.status().mode, "absent");
  assert.equal(guard.begin(ctx).ok, false); assert.equal(guard.prepare({}, op(), ctx).ok, false);
  assert.equal(guard.consume({}, op(), ctx).ok, false);
  assert.equal(guard.invite, undefined); assert.equal(guard.participate, undefined);
});
test("explicit invitation is observe-only; participate requires owner transition", () => {
  const f = joined(), turn = f.guard.begin(ctx);
  assert.equal(f.guard.prepare(turn.lease, op("write", "interact"), ctx).reason, "operation_denied");
  assert.equal(f.owner.invite(ctx, 1000).reason, "already_invited");
  const before = f.owner.status(); const after = f.owner.participate(ctx);
  assert.equal(after.mode, "participate"); assert.equal(after.generation, before.generation + 1);
  assert.equal(after.expiresAt, before.expiresAt);
  assert.equal(f.guard.prepare(turn.lease, op(), ctx).reason, "stale_turn");
  const action = op("write", "interact"), p = prepared(f, action);
  assert.equal(f.guard.consume(p.ticket, action, ctx).result, "SYNTHETIC_DISPATCH_ACCEPTED_NO_AUTHORITY");
});
test("observe downgrade revokes all outstanding participation tickets", () => {
  const f = joined(); f.owner.participate(ctx);
  const action = op("write", "interact"), p = prepared(f, action);
  assert.equal(f.owner.observe(ctx).mode, "observe");
  assert.equal(f.guard.consume(p.ticket, action, ctx).ok, false);
  assert.equal(f.guard.prepare(p.lease, action, ctx).ok, false);
});
test("leave then re-invite cannot resurrect a delayed turn or ticket", () => {
  const f = joined(), p = prepared(f); const before = f.owner.status().generation;
  assert.equal(f.owner.leave().mode, "absent"); assert.equal(f.owner.leave().generation, before + 1);
  f.owner.invite(ctx, 1000);
  assert.equal(f.guard.prepare(p.lease, op("late"), ctx).reason, "stale_turn");
  assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, false);
});
test("scope mismatch at dispatch revokes rather than transfers presence", () => {
  for (const patch of [{ browserId: "b" }, { workerId: "w" }, { windowId: 3 }, { tabId: 4 },
    { documentId: "document-b" }, { frameId: 1 }, { origin: "https://other.test" }, { documentId: undefined }]) {
    const f = joined(), p = prepared(f);
    assert.equal(f.guard.consume(p.ticket, op(), { ...ctx, ...patch }).ok, false, JSON.stringify(patch));
    assert.equal(f.owner.status().mode, "absent"); assert.equal(f.guard.begin(ctx).ok, false);
  }
});
test("observed navigation away and back never restores an old invitation", () => {
  const f = joined(), p = prepared(f);
  f.owner.contextChanged({ ...ctx, documentId: "document-b" }); f.owner.contextChanged(ctx);
  assert.equal(f.owner.status().mode, "absent"); assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, false);
});
test("new controller cannot import prior leases or tickets, even with same IDs", () => {
  const old = joined(), p = prepared(old), fresh = joined();
  assert.equal(fresh.guard.prepare(p.lease, op(), ctx).ok, false);
  assert.equal(fresh.guard.consume(p.ticket, op(), ctx).ok, false);
});
test("expiry at exact deadline revokes even during outstanding turns", () => {
  const f = joined(), p = prepared(f); f.setTime(1099); assert.equal(f.owner.status().mode, "observe");
  f.setTime(1100); assert.equal(f.guard.consume(p.ticket, op(), ctx).reason, "expired");
  assert.equal(f.owner.status().mode, "absent"); assert.equal(f.guard.prepare(p.lease, op(), ctx).ok, false);
});
test("clock rollback or invalid clock revokes", () => {
  for (const value of [99, NaN, Infinity, -1]) {
    const f = joined(), p = prepared(f); f.setTime(value);
    assert.equal(f.guard.consume(p.ticket, op(), ctx).reason, "clock_invalid");
    assert.equal(f.owner.status().mode, "absent");
  }
});
test("invalid context or duration cannot create presence", () => {
  for (const patch of [{ tabId: -1 }, { tabId: "2" }, { frameId: null }, { documentId: "" },
    { origin: "file://" }, { origin: "null" }, { origin: "https://example.test/path" },
    { origin: "https://user@example.test" }, { origin: "https://EXAMPLE.test" }]) {
    const f = fixture(); assert.equal(f.owner.invite({ ...ctx, ...patch }, 1000).ok, false);
    assert.equal(f.owner.status().mode, "absent");
  }
  for (const ttl of [0, -1, Infinity, NaN, 1.5, 300001, "1000"]) {
    assert.equal(fixture().owner.invite(ctx, ttl).ok, false);
  }
});
test("forged/copied leases and tickets fail by identity", () => {
  const f = joined(), p = prepared(f);
  assert.equal(f.guard.prepare({ ...p.lease }, op("fake"), ctx).ok, false);
  assert.equal(f.guard.consume({ ...p.ticket }, op(), ctx).ok, false);
  assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, true);
});
test("one-use dispatch; duplicate operation ID never retries within generation", () => {
  const f = joined(), p = prepared(f);
  assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, true);
  assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, false);
  assert.equal(f.guard.prepare(p.lease, op(), ctx).reason, "duplicate_operation");
});
test("mismatched operation burns ticket; payload and target are bound", () => {
  for (const patch of [{ id: "different" }, { kind: "interact" }, { target: "other" }, { payloadDigest: "b".repeat(64) }]) {
    const f = joined(), p = prepared(f);
    assert.equal(f.guard.consume(p.ticket, { ...op(), ...patch }, ctx).reason, "operation_mismatch");
    assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, false);
    assert.equal(f.guard.prepare(p.lease, op(), ctx).reason, "duplicate_operation");
  }
});
test("unknown operations and malformed descriptors fail closed", () => {
  const f = joined(), turn = f.guard.begin(ctx);
  for (const action of [null, {}, op("x", "submit"), { ...op(), payloadDigest: "abc" }, { ...op(), target: "a b" }]) {
    assert.equal(f.guard.prepare(turn.lease, action, ctx).ok, false);
  }
});
test("input and returned scope cannot mutate a grant", () => {
  const f = fixture(), input = { ...ctx }; const state = f.owner.invite(input, 1000);
  input.tabId = 99; assert.throws(() => { state.scope.tabId = 99; }, TypeError);
  assert.equal(f.owner.status().scope.tabId, ctx.tabId);
  const action = op(), p = prepared(f, action); action.target = "changed";
  assert.equal(f.guard.consume(p.ticket, op(), ctx).ok, true);
});
test("pending and per-generation operation limits bound retained state", () => {
  const f = joined(), turn = f.guard.begin(ctx), outstanding = [];
  for (let i = 0; i < 64; i++) { const a = op(`op-${i}`); const p = f.guard.prepare(turn.lease, a, ctx); assert.equal(p.ok, true); outstanding.push([p.ticket, a]); }
  assert.equal(f.guard.prepare(turn.lease, op("over"), ctx).reason, "operation_budget_exhausted");
  for (const [ticket, a] of outstanding) assert.equal(f.guard.consume(ticket, a, ctx).ok, true);
  for (let i = 64; i < 256; i++) { const a = op(`op-${i}`), p = f.guard.prepare(turn.lease, a, ctx); assert.equal(p.ok, true); assert.equal(f.guard.consume(p.ticket, a, ctx).ok, true); }
  assert.equal(f.guard.prepare(turn.lease, op("over"), ctx).reason, "operation_budget_exhausted");
});
test("ending a turn invalidates its tickets without affecting other turns", () => {
  const f = joined(), first = prepared(f), secondOp = op("second"), second = prepared(f, secondOp);
  assert.equal(f.guard.end(first.lease), true); assert.equal(f.guard.end(first.lease), false);
  assert.equal(f.guard.prepare(first.lease, op("late"), ctx).ok, false);
  assert.equal(f.guard.consume(first.ticket, op(), ctx).ok, false);
  assert.equal(f.guard.prepare(second.lease, op(), ctx).reason, "duplicate_operation");
  assert.equal(f.guard.consume(second.ticket, secondOp, ctx).ok, true);
});
test("concurrent turns are bounded and completed turns free capacity", () => {
  const f = joined(), turns = Array.from({ length: 8 }, () => f.guard.begin(ctx));
  assert.ok(turns.every(t => t.ok)); assert.equal(f.guard.begin(ctx).reason, "turn_budget_exhausted");
  f.guard.end(turns[0].lease); assert.equal(f.guard.begin(ctx).ok, true);
});
test("strict records reject extras, inherited fields and accessors without invoking getters", () => {
  const f = fixture(); assert.equal(f.owner.invite({ ...ctx, extra: true }, 1000).ok, false);
  assert.equal(f.owner.invite(Object.create(ctx), 1000).ok, false);
  f.owner.invite(ctx, 1000); const turn = f.guard.begin(ctx);
  let called = false; const action = { ...op(), get target() { called = true; return "fixture-a"; } };
  assert.equal(f.guard.prepare(turn.lease, action, ctx).ok, false); assert.equal(called, false);
  assert.equal(f.guard.prepare(turn.lease, { ...op(), extra: "unbound" }, ctx).ok, false);
});
