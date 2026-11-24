# LillyBrowser 0.1d-III — integrated fixture side panel

Baseline: `896f640917f81c1733c1a479cab880f82cdc00b9`. Source/package qualification only.
Prior loadable shell and inspection popup remain unchanged.

## Build and package

Node 22, no dependencies or network:

    node --test test/lilly-*.mjs
    node tools/build-lilly-panel.mjs

The build prints a fresh directory containing a root manifest.json. Load that
directory in Chrome, NOT the source directory src/lilly-panel-dev. An optional
new output directory argument is supported; an existing destination is refused.
The 11-file allowlist copies exact source bytes, preserves relative module
paths and includes no upstream WebBrain assets, test code, private data or
configuration.

Manifest: LillyBrowser (Integrated Fixture), version 0.1.5, Chrome >=116.
Permissions: sidePanel, activeTab, scripting. Incognito not allowed.
No standing host permissions, content scripts, storage, credential/provider
transport, externally connectable messaging or actual action adapter.
The only worker event opens the requested non-incognito window's panel on
toolbar invocation. It does not inspect or grant Lilly presence. Chrome's
activeTab permission is distinct from the application's invitation.

## Interaction contract

Open the exact public fixture page and explicitly click the integrated
extension's toolbar icon to acquire temporary activeTab access. The side panel
opens absent. Identify performs a metadata-only probe; Confirm observation
performs the single exact-document read with the existing inspection contract.
The confirmation window is at most 30 seconds from the UI's identify action;
the resulting historical snapshot is valid for at most five minutes from
confirmation. No automatic page refresh or capture. The panel displays text
and provenance separately from mock conversational output.

Send mock message invokes the existing integrated runtime. The provider is
limited to 16 deterministic scripts per panel incarnation, then fails closed.
It does not reason about the prompt or observed content; the response is
explicitly labeled fixed mock text. No partial output or real action is exposed.
The observation is still passed in the structured provider request.

Leave, tab activation/update/removal/replacement/attachment/detachment,
window focus changes, hidden document and pagehide invalidate the session,
clear visible text/provenance/draft/reply, and signal cancellation. This
deliberately revokes even on unrelated tab update events. UI epoch checks
discard old completions after revocation, even after another invitation.
One-shot UI timers clear at the confirmation/observation deadlines; no polling
or periodic browser reads. Timers are not the authority gate and may be delayed
by the browser. A hidden document detected at completion is also cleared
even if the visibility event was missed. Pagehide disposes the panel instance.

Browser/worker labels in the panel are fresh random local incarnation labels,
not independently attested browser or worker identity. No durable memory.

## Source evidence

Node v22.16.0: **80 passed, 0 failed, 0 skipped**, all six test files,
including the previously qualified 69 tests and 11 new packaging/UI tests.
Local tested files were byte-matched to the repository blobs, including the
unchanged foundation and inspection static-check inputs. New tests use mocked
Chrome APIs and DOM objects, with the real inspection/presence/mock modules.
The build test checks exact inventory, copied bytes, import closure, manifest,
overwrite refusal and restricted API patterns. UI tests check trusted click
gating, text-only output, two-step read, separation of observation and response,
clear/expiry, all registered lifecycle event callbacks, disposal and late
completions. Static checks are not proof of physical CSP enforcement.

An auxiliary ZIP was generated in the reviewer environment from the same
build command, with the 11 package files in lilly-panel-dev-0.1.5/.
ZIP SHA-256:
`51810bb1b22089bdeae60ecbc8d7ec781ab51971295d144f07230390ba7904cd`.
CRC and all archived file bytes verified. The archive is delivered separately,
not committed to the repository.

## Physical Chrome witness — pending

Use the previously established disposable profile and synthetic fixture server.
If stopped, from repo root (port 8765 must be free):

    python3 -m http.server 8765 --bind 127.0.0.1 --directory test/fixtures/lilly-inspection

Load the built directory containing manifest.json using chrome://extensions,
Developer mode, Load unpacked. Temporarily disable the earlier prototypes if
their similar toolbar icons cause confusion. In the address bar manually enter:

    http://127.0.0.1:8765/lilly-fixture.html

No query or fragment. Click the Integrated Fixture toolbar icon, not just the
side panel selector. Confirm it opens absent. Click Identify fixture, then
Confirm observation within 30 seconds. Expected observation:
A small copper key rests beside a blue notebook.
The second paragraph is not displayed. Source includes exact URL, Chrome
document ID, local session and generation. Send a mock message. Expected reply:
The captured observation is available in this mock turn. This fixed response is
not model reasoning.

Negative checks:
- Leave clears context, provenance, draft and reply; send disabled.
- Identify again and wait >30 seconds: confirmation disabled.
- Confirm again, wait >5 minutes: context clears (timer can be delayed).
- Reload, tab switch, focus loss, or hide/close the panel: context clears.
  Returning to the fixture requires explicit invocation/identification.
- On a nonfixture page, invoke the toolbar and try identification: denied.
- No unexpected network requests or model connections. If Chrome denies
  injection, record the exact status/extension error; do not widen permissions.

Do not interpret the previous popup witness as proof of this packaged side
panel's physical behavior. No real inference, arbitrary page access, browser
writes, storage or production activation authorized. Next: physical witness,
then a bounded fixture-only participation adapter and local provider
compatibility planning under separate gates.

Verdict: INTEGRATED_PANEL_PACKAGE_SOURCE_QUALIFIED_PHYSICAL_WITNESS_PENDING.
