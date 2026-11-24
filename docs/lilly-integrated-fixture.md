# LillyBrowser 0.1d-II — integrated fixture perception and mock conversation

Baseline: owner physical witness checkpoint
`8342e7832783587f6949b2f2536c2af5e6945380`.

Source integration only. The two independently loadable extension directories,
their permissions, the fixed fixture and the presence controller are unchanged.
No live browser execution, transport, inference, credentials, storage or actions.

## Composition

The trusted caller creates an integrated fixture adapter using the existing
inspection module, mock conversation and branded fixture provider. Identify
pins a complete non-incognito active tab/window and performs the existing
metadata-only top-frame probe. The wrapper constrains all underlying inspector
queries to the pinned tab/window. Confirm creates an observe-only presence
grant and consumes the original 30-second one-shot inspection confirmation.
The existing exact-document read and post-read checks are retained. A separate
metadata verification checks the current top-frame identity and exact fixture
URL before admitting the observation.

The immutable observation record contains type, local session sequence,
presence generation, source URL and scope (browser/worker incarnation,
window, tab, document, frame, origin), acquiredAt, validUntil and text.
acquiredAt is the local monotonic acceptance time after checks, not an exact
DOM extraction timestamp. validUntil is the presence deadline, not evidence
that the paragraph remains unchanged. This is a historical snapshot rather
than continuously refreshed perception. The sequence and generation are
local, not durable/global IDs; no persistence or cross-runtime import.

A grant lasts at most five minutes from confirmation. Each explicitly
requested conversation turn verifies the active document before opening
the branded mock provider and before returning the completed result.
The provider receives {prompt, observation} as a separate structured
request. An optional fixture expectation compares exact JSON content at
the provider boundary, proving the record reached it; the mock still emits
predetermined events rather than reasoning about the text. The actual
request is not persisted by the provider.

The integration exposes no participate transition or real effect adapter.
Read proposals produce only existing synthetic receipts; no second content
read. Writes are denied. One captured observation and one active turn per
session. A new invitation requires explicit revoke. Partial provider output
is not exposed through the integrated snapshot.

## Revocation and race behavior

The trusted future UI must synchronously forward browser lifecycle and
context-loss events to revoke, including disposal. The current source
composition is not yet wired into a popup or side panel. Revocation
clears retained context, ends presence and signals cancellation. An old
session cannot invalidate or release a new session's observation.
Before/after metadata probes provide additional checks if an event was
missed, but cannot establish continuous document identity or rule out
away-and-back changes between probes. Cached snapshot is only event- and
clock-invalidated. No real effect authorization follows from these checks.

During review a discriminating test scheduled revocation as a microtask
between the final async verify resolution and the run caller continuation.
The initial implementation reproduced the defect (success after revoke).
A synchronous live check immediately after awaited verification closed
the release race; the same test now passes. This does not prove atomicity
with browser operations, nor retract a read or text already returned.

## Verification

Local Node v22.16.0 run against byte-identical copies of the pinned existing
modules, with the new changes applied:

    node --test test/lilly-mock-conversation.mjs test/lilly-integrated-fixture.mjs

32 passed, 0 failed: 14 unchanged conversation tests plus 18 new integration
tests. The original conversation test blob matched
a217620e7d051cec911fab690993c04b515594d6.
The 37 other historical foundation/presence/inspection tests were not
rerun in this slice; their files and underlying implementation are unchanged.
Full suite inventory is 69 tests; do not describe this as a new full-suite run.

Exact tested changed blobs:
- mock-provider.mjs: 03b0672ef27fb45d19741a96f352f5a772746d35
- mock-conversation.mjs: dc4624be8f3b673cbaf1347345c3dd00364385de
- integrated-fixture.mjs: b544a4cd37d143f1d2c67fca58b8868a243b9ed4
- lilly-integrated-fixture.mjs: 13d9337926e2b9ffa4979a4ef4c4af5d0b771ff9

The tests use mocked Chrome APIs with the existing inspector and real
presence/orchestration logic. They cover provenance and request transfer,
same-URL replacement, tab change, expiry, revocation during acquisition,
late output after re-invitation, final revalidation, post-await release race,
request mismatch, and absence of write authority.

## Next gate

Prepare a separately loadable integrated development side panel with
explicit activeTab owner invocation, the same fixed fixture and mocked
provider, no standing host permissions or production endpoints. Forward
lifecycle events, wire trusted gestures and display the observation and
its provenance separately from fixture-generated conversational text.
Re-run all 69 source tests and obtain a separate physical witness for that
packaged composition. Do not reuse the earlier popup witness as evidence
of live integrated side-panel behavior.

Verdict: INTEGRATED_FIXTURE_SOURCE_QUALIFIED_TARGETED_TESTS_ONLY.
