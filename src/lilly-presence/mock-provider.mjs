// Fixture-only provider. No real model, network, fallback or credential path.
const providers = new WeakSet();
export const isMockProvider = value => providers.has(value);
export function createMockProvider(scripts) {
  if (!Array.isArray(scripts) || scripts.length > 16) throw new TypeError("invalid fixtures");
  const entries = scripts.map(({ events, pauseAt = -1, ignoreAbort = false }) => {
    if (!Array.isArray(events) || events.length > 128 || !events.every(e => typeof e === "string" && e.length <= 16384) ||
        !Number.isInteger(pauseAt) || pauseAt < -1 || pauseAt >= events.length || typeof ignoreAbort !== "boolean") throw new TypeError("invalid script");
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    return { events: [...events], pauseAt, ignoreAbort, gate, release };
  });
  let opened = 0, aborted = 0, emitted = 0;
  const provider = Object.freeze({
    open(signal) {
      const entry = entries[opened++];
      if (!entry) throw new Error("fixture exhausted");
      let cursor = 0, closed = false;
      const onAbort = () => { aborted++; if (!entry.ignoreAbort) entry.release(); };
      signal.addEventListener("abort", onAbort, { once: true });
      return Object.freeze({
        async next() {
          if (closed || (signal.aborted && !entry.ignoreAbort)) return { done: true };
          if (cursor === entry.pauseAt) await entry.gate;
          if (closed || (signal.aborted && !entry.ignoreAbort) || cursor >= entry.events.length) return { done: true };
          emitted++;
          return { done: false, value: entry.events[cursor++] };
        },
        close() { closed = true; signal.removeEventListener("abort", onAbort); entry.release(); },
      });
    },
    release(index) { entries[index]?.release(); },
    stats() { return Object.freeze({ opened, aborted, emitted }); },
  });
  providers.add(provider);
  return provider;
}
