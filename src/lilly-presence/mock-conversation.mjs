import { createPresenceController } from "./controller.mjs";
import { isMockProvider } from "./mock-provider.mjs";

const failure = reason => Object.freeze({ ok: false, reason });
const label = v => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
function canonical(raw, keys) {
  const x = JSON.parse(raw);
  if (!x || typeof x !== "object" || Array.isArray(x) || Object.keys(x).length !== keys.length ||
      keys.some(k => !Object.hasOwn(x, k)) || JSON.stringify(Object.fromEntries(keys.map(k => [k, x[k]]))) !== raw) throw new Error("invalid record");
  return x;
}
function proposal(raw) {
  const x = canonical(raw, ["id", "name", "target", "text"]);
  if (!label(x.id) || x.target !== "fixture-a" || typeof x.text !== "string" || x.text.length > 2048 ||
      !["read_fixture", "write_fixture"].includes(x.name) || (x.name === "read_fixture" && x.text !== "")) throw new Error("invalid proposal");
  return x;
}
async function descriptor(x) {
  const bytes = new TextEncoder().encode(JSON.stringify([x.name, x.target, x.text]));
  const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Object.freeze({ id: x.id, kind: x.name === "read_fixture" ? "observe" : "interact", target: x.target,
    payloadDigest: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("") });
}

// All callers and context snapshots are trusted synthetic test harnesses.
// A model/page must never get this interface, the guard, or the provider controls.
export function createMockConversation({ presenceConfig, readContext, provider }) {
  if (!isMockProvider(provider) || typeof readContext !== "function") throw new TypeError("mock fixtures only");
  const { owner, guard } = createPresenceController(presenceConfig);
  let active = null;
  function context() { try { return readContext(); } catch { return null; } }
  function invalidate(turn, reason) {
    if (active !== turn) return;
    active = null; turn.reason = reason; turn.text = ""; turn.tool = "";
    guard.end(turn.lease); turn.abort.abort();
  }
  function synchronize() {
    const state = owner.contextChanged(context());
    if (active && (state.mode === "absent" || state.generation !== active.generation)) invalidate(active, "presence_revoked");
    return state;
  }
  function transition(fn) {
    synchronize(); const result = fn(); const state = owner.status();
    if (active && (state.mode === "absent" || state.generation !== active.generation)) invalidate(active, "presence_revoked");
    return result;
  }
  function live(turn) {
    if (active !== turn) return null;
    const state = synchronize();
    return active === turn ? state : null;
  }
  const cancelled = turn => failure(turn.reason ?? "stale_turn");
  // Optional observation is trusted harness data, never an authority grant.
  async function run(prompt, observation = null) {
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 8192) return failure("invalid_prompt");
    const state = synchronize();
    if (active) return failure("turn_busy");
    const begin = guard.begin(state.scope);
    if (!begin.ok) return failure(begin.reason);
    const turn = { generation: state.generation, lease: begin.lease, abort: new AbortController(), text: "", tool: "", reason: null };
    active = turn;
    let stream, terminal = false, count = 0;
    try {
      stream = provider.open(turn.abort.signal, Object.freeze({ prompt, observation }));
      while (true) {
        const chunk = await stream.next();
        if (!live(turn)) return cancelled(turn);
        if (chunk.done) break;
        if (terminal || ++count > 128) return failure("invalid_stream");
        const event = canonical(chunk.value, ["type", "value"]);
        if (typeof event.value !== "string") return failure("invalid_stream");
        if (event.type === "text") {
          if (turn.tool || turn.text.length + event.value.length > 8192) return failure("invalid_stream");
          turn.text += event.value;
        } else if (event.type === "tool") {
          if (!event.value || turn.tool.length + event.value.length > 8192) return failure("invalid_stream");
          turn.tool += event.value;
        } else if (event.type === "end" && event.value === "") terminal = true;
        else return failure("invalid_stream");
      }
      if (!terminal) return failure("incomplete_stream");
      let receipt = null;
      if (turn.tool) {
        const operation = await descriptor(proposal(turn.tool));
        const current = live(turn);
        if (!current) return cancelled(turn);
        const prepared = guard.prepare(turn.lease, operation, current.scope);
        if (!prepared.ok) return failure(prepared.reason);
        const dispatchState = live(turn);
        if (!dispatchState) return cancelled(turn);
        receipt = guard.consume(prepared.ticket, operation, dispatchState.scope);
        if (!receipt.ok) return failure(receipt.reason);
      }
      if (!live(turn)) return cancelled(turn);
      return Object.freeze({ ok: true, result: "SYNTHETIC_TURN_COMPLETE_NO_AUTHORITY", text: turn.text, receipt });
    } catch { return active === turn ? failure("invalid_fixture_or_stream") : cancelled(turn); }
    finally {
      stream?.close(); guard.end(turn.lease); turn.text = ""; turn.tool = "";
      if (active === turn) active = null;
    }
  }
  return Object.freeze({
    invite: ttl => transition(() => owner.invite(context(), ttl)),
    participate: () => transition(() => owner.participate(context())),
    observe: () => transition(() => owner.observe(context())),
    leave: () => transition(() => owner.leave()),
    contextChanged: synchronize,
    cancel() { if (active) invalidate(active, "turn_cancelled"); },
    snapshot() { const presence = synchronize(); return Object.freeze({ presence, streaming: active !== null, text: active?.text ?? "" }); },
    run,
  });
}
