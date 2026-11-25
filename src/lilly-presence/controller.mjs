// Synthetic presence policy only. No browser, transport, storage or effect adapters.
// Both interfaces belong to trusted extension code; never expose them to a page/model.
const label = (v) => typeof v === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const index = (v) => Number.isSafeInteger(v) && v >= 0;
const fields = ["browserId", "workerId", "windowId", "tabId", "documentId", "frameId", "origin"];
const opFields = ["id", "kind", "target", "payloadDigest"];
const equal = (a, b, keys) => a !== null && b !== null && keys.every(k => a[k] === b[k]);
const deny = (reason) => Object.freeze({ ok: false, reason });

function recordOf(raw, keys) {
  if (!raw || typeof raw !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return null;
  if (Reflect.ownKeys(raw).length !== keys.length) return null;
  const entries = [];
  for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(raw, k);
    if (!d || !("value" in d)) return null;
    entries.push([k, d.value]);
  }
  return Object.fromEntries(entries);
}

function scopeOf(raw) {
  const s = recordOf(raw, fields);
  if (!s) return null;
  if (![s.browserId, s.workerId, s.documentId].every(label) ||
      !index(s.windowId) || !index(s.tabId) || s.frameId !== 0 ||
      typeof s.origin !== "string" || s.origin.length > 2048) return null;
  try {
    const url = new URL(s.origin);
    if (!["https:", "http:"].includes(url.protocol) || url.origin !== s.origin) return null;
  } catch { return null; }
  return Object.freeze(s);
}

function operationOf(raw) {
  const o = recordOf(raw, opFields);
  if (!o) return null;
  if (!label(o.id) || !["observe", "interact"].includes(o.kind) || !label(o.target) ||
      typeof o.payloadDigest !== "string" || !/^[0-9a-f]{64}$/.test(o.payloadDigest)) return null;
  return Object.freeze(o);
}

export function createPresenceController({ browserId, workerId, now, maxTtlMs = 300_000 }) {
  if (!label(browserId) || !label(workerId) || typeof now !== "function" ||
      !Number.isSafeInteger(maxTtlMs) || maxTtlMs <= 0) throw new TypeError("invalid trusted configuration");
  let generation = 0, grant = null, reason = "not_invited", lastNow = -1;
  const leases = new Set();
  const pending = new Map(), reservedIds = new Set();
  const clear = () => { leases.clear(); pending.clear(); reservedIds.clear(); };
  function revoke(why) {
    if (grant !== null) { generation++; clear(); grant = null; }
    reason = why;
  }
  function tick() {
    let t;
    try { t = now(); } catch { t = NaN; }
    if (!Number.isFinite(t) || t < 0 || t > Number.MAX_SAFE_INTEGER || t < lastNow) {
      revoke("clock_invalid"); return null;
    }
    lastNow = t;
    if (grant && t >= grant.expiresAt) revoke("expired");
    return t;
  }
  function readScope(raw) {
    let s;
    try { s = scopeOf(raw); } catch { return null; }
    return s && s.browserId === browserId && s.workerId === workerId ? s : null;
  }
  function live(raw) {
    if (tick() === null || !grant) return false;
    if (!equal(grant.scope, readScope(raw), fields)) { revoke("context_changed"); return false; }
    return true;
  }
  function status() {
    tick();
    return Object.freeze({ mode: grant?.mode ?? "absent", generation, reason,
      scope: grant?.scope ?? null, expiresAt: grant?.expiresAt ?? null });
  }
  function changeMode(raw, mode) {
    if (!live(raw)) return deny(reason);
    if (grant.mode === mode) return deny("already_in_mode");
    generation++; clear(); grant = Object.freeze({ ...grant, mode }); reason = "mode_changed";
    return status();
  }
  const owner = Object.freeze({
    invite(raw, ttlMs) {
      const t = tick();
      if (t === null) return deny(reason);
      if (grant) return deny("already_invited");
      const scope = readScope(raw);
      if (!scope) return deny("invalid_context");
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > maxTtlMs ||
          t + ttlMs > Number.MAX_SAFE_INTEGER || t + ttlMs <= t) return deny("invalid_expiry");
      generation++; clear(); grant = Object.freeze({ scope, mode: "observe", expiresAt: t + ttlMs });
      reason = "invited"; return status();
    },
    participate: (raw) => changeMode(raw, "participate"),
    observe: (raw) => changeMode(raw, "observe"),
    leave() { revoke("left"); return status(); },
    contextChanged(raw) { live(raw); return status(); },
    status,
  });
  function allows(o) { return o.kind === "observe" || grant.mode === "participate"; }
  function readOperation(raw) { try { return operationOf(raw); } catch { return null; } }
  const guard = Object.freeze({
    // Capture before starting a synthetic turn; never acquire a new lease for delayed output.
    begin(raw) {
      if (!live(raw)) return deny(reason);
      if (leases.size >= 8) return deny("turn_budget_exhausted");
      const lease = Object.freeze({}); leases.add(lease); return Object.freeze({ ok: true, lease });
    },
    end(lease) {
      if (!leases.delete(lease)) return false;
      for (const [ticket, entry] of pending) if (entry.lease === lease) pending.delete(ticket);
      return true;
    },
    prepare(lease, rawOperation, rawContext) {
      if (!live(rawContext)) return deny(reason);
      if (!leases.has(lease)) return deny("stale_turn");
      const o = readOperation(rawOperation);
      if (!o || !allows(o)) return deny("operation_denied");
      if (reservedIds.has(o.id)) return deny("duplicate_operation");
      if (reservedIds.size >= 256 || pending.size >= 64) return deny("operation_budget_exhausted");
      const ticket = Object.freeze({}); pending.set(ticket, { lease, operation: o }); reservedIds.add(o.id);
      return Object.freeze({ ok: true, ticket });
    },
    // One-use synthetic dispatch decision. Not a browser action or execution receipt.
    consume(ticket, rawOperation, rawContext) {
      if (!live(rawContext)) return deny(reason);
      const entry = pending.get(ticket);
      if (!entry) return deny("stale_or_spent_ticket");
      pending.delete(ticket); // Burn on any attempted use, including mismatch.
      const actual = readOperation(rawOperation);
      if (!leases.has(entry.lease) || !equal(entry.operation, actual, opFields) || !allows(actual)) return deny("operation_mismatch");
      return Object.freeze({ ok: true, result: "SYNTHETIC_DISPATCH_ACCEPTED_NO_AUTHORITY", generation });
    },
  });
  return Object.freeze({ owner, guard });
}
