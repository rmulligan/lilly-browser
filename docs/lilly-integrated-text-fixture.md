# 0.1f-II — document-bound text turn composition

Base: 002ad288a6803f6e1ffaca2532ff6b6006730a14. Existing installed extensions and 0.1f text runtime unchanged.

## Owner host evidence (2026-11-24 Pacific)

Owner reported Node full regression at the base: 114 passed, 0 failed/skipped, duration 129.027134 ms, package built into /home/ryan/Projects/lilly-browser-builds/lilly-participation-0.1.6-3025935.

Owner then supplied the real Chrome participation preview: exact loopback URL, document 6EABF13EE5B0903426CA669FF0CC4E9C, action mark_reviewed, target lilly-review-state, Not reviewed -> Reviewed, digest ec4a0aca6dd57128a6afcfcb01898e0eea9dedaea58bcfe05af56dcf65ae4132. After confirmation owner supplied the visible fixture with Reviewed and unchanged outside paragraph. Positive effect witnessed by owner; not independent host measurement. Terminal receipt/disabled controls and negative physical lifecycle cases remain unverified. No actual model ran.

## Composition

New createIntegratedTextFixture reuses createInspection and createPresenceController directly, without calling the mock conversation/provider. It owns the one-shot immutable fixture snapshot; validates active tab/window/document before opening a transport and after the result; checks presence again synchronously after awaits. Exact document read only, no mutation. A single text runtime spans all invitations so leave/reinvite cannot bypass a still draining turn or poisoned transport. Cancellation is tracked across browser preflight and postflight, not merely while the underlying text runtime is active. Explicit event forwarding remains required; snapshot is historical, not continuous perception.

Trusted injected transport only. No HTTP/native messaging, UI package, extension permission changes, live inference or production actions. Browser API awaits are not independently time bounded in this slice; 30s deadline covers text runtime, not browser verification. Single-flight applies within this runtime, not across extension incarnations or host processes. Provider claim is not model attestation.

## Evidence

Node 22.16.0: 10 new composition tests, 14 unchanged text-runtime tests, 8 unchanged participation-panel tests = 32/32 passing. Prior host 114/114 report above; expected updated full inventory 124, not executed in full here. New source blob 5096158658f43bfadf4630a338a606ee2fd72a80, test blob 103f81691c054fb43d225f4ba35b0a81ba441928; exact remote readback matched. Inspector, controller and local text-runtime dependency blobs matched. No changes to previously qualified packages.

## Next genuine dependency

Inspect current host service identities, loopback listeners and actual installed gateway/broker source contract, without reading secret values or calling inference. Historical 2026-11-23 convergence report shows Swift backend 8888, personal engineering gateway 18888, and canonical gateway 10601 inactive/faulted. Do not repurpose those ports, bypass fence or permit checks, expose credential to browser or infer current service status. Select the narrowest explicit browser-to-host transport after source review (native messaging is one candidate, not a selected implementation). Qualify exact host admission and cancellation/resource cleanup, then integrate UI and request owner authorization for installation and one real fixture turn. Real-page observation remains separate.
