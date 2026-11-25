# 0.1e-II — participation side panel

Status: source and package build qualified, physical Chrome witness pending. The existing 0.1.5 extension and fixture server remain untouched.

## Owner witness from 0.1d-III

2026-11-24 (KasmVNC): owner supplied the exact copper-key paragraph, fixture URL, Chrome document ID, session 1 / generation 1, and historical-snapshot label. Owner subsequently reported "Looks good!" after being asked to try mock messaging and reload; individual reload, expiry and other negative checks were not separately attested. Positive observation is witnessed; full lifecycle and network qualification remains outstanding. Host setup reports Chrome 157.0.8103.78 and 11/11 package hashes matching. This record is not an independent host measurement.

## Scope

A separate version 0.1.6, Participation Fixture, not an upgrade-in-place to 0.1.5. It reuses the original toolbar background and style; only sidePanel, activeTab, scripting permissions. No standing host permissions, network, provider, persistent storage or arbitrary actions. The exact fixture URL is http://127.0.0.1:8765/lilly-participation.html. Identify, prepare, then confirm the immutable preview in three trusted UI clicks within 30 seconds. The only possible effect is changing one fixed text node from Not reviewed to Reviewed.

All browser context changes, window blur, visibility loss, leave, expiry and pagehide revoke the adapter; UI epochs discard late returns. A confirmation attempt terminally locks the panel even if the adapter denies before dispatch. Revocation during confirmation is conservatively unknown, not an assertion that no effect occurred. Terminal status survives subsequent clear/context events within that panel incarnation. Closing the panel destroys it: no durable idempotency, no automatic retry, no cross-panel lock, and no independent post-effect readback. Do not reopen to retry an uncertain result. Kasm viewer disconnection is not necessarily a Chrome event; remote custody remains unqualified.

## Build and witness

Use Node 22.16.0 and a fresh checkout of the draft PR head. Run node --test test/lilly-*.mjs, then node tools/build-lilly-participation.mjs NEW_OUTPUT_DIR. The builder refuses existing output and copies exactly eight files. Verify package bytes against source. Keep the 0.1.5 package and profile intact; use a separate disposable profile or temporarily disable 0.1.5 with the owner's approval. Install the new unpacked package via Chrome UI. For the fixture, preserve the existing 8765 service and explicitly arrange for the exact participation fixture to be served on that loopback port; do not expose the repository or change network binding. Restore previous server state after the witness.

Open exact fixture, toolbar, identify, prepare. Before confirming visually verify the page still says Not reviewed, the preview includes URL, document, target, before/after and digest. Confirm once, check Reviewed and unchanged outside paragraph, reported result and disabled controls. For negative tests use fresh explicit synthetic cases: leave, expiry, reload, tab switch, focus loss, panel close before confirmation, nonfixture URL and altered precondition. Never retry unknown outcomes; inspect manually. Owner explicitly confirms all results.

## Evidence

Node 22.16.0 targeted suite: 8 passed, 0 failed; includes simulated Chrome composition with real adapter and package inventory test. The first composition test harness assumed one event-loop flush was sufficient for WebCrypto; bounded waiting for the preview fixed the harness, not production code. Prior 92 tests not rerun in this environment; inventory now 100. Real Chrome gesture/event delivery, actual effect, Kasm viewer custody and credential handling remain unqualified. No inference, credentials or production actions authorized.
