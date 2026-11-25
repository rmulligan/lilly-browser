# LillyBrowser 0.1e-I — fixed fixture participation adapter

Baseline: `79c2b631d933872f724069e464b0ec84343ec6bf`, integrated fixture panel 0.1.5.
Verdict: FIXTURE_PARTICIPATION_SOURCE_QUALIFIED_PHYSICAL_WITNESS_PENDING.

This is a separate source-only slice, not included in the existing extension
build allowlist. Existing integrated panel, permissions, controller, provider,
fixture and package builder remain unchanged.

## Fixed operation

The synthetic page is test/fixtures/lilly-participation/lilly-participation.html.
Exact URL: http://127.0.0.1:8765/lilly-participation.html.
The existing observation fixture server directory does not serve this new
page; a future dedicated witness will arrange the fixture server explicitly.

The only action changes the single text node of a unique P element with
id lilly-review-state from "Not reviewed" to "Reviewed". No dynamic
selector, arbitrary text, click, form, navigation, external URL, script
argument, real model or network transport is provided. The serialized
action validates top frame, exact URL, unique matching element, node type,
shape and initial text before writing. A second call on the changed node
reports not_applied. This is not proof of arbitrary-page safety.

## Authority contract

Trusted UI must explicitly identify/invite, prepare participation, show the
exact immutable preview, then confirm that same preview object. Identity
probe reads metadata only. Identification pins tab, window and Chrome
document ID; observe invitation expires no later than the original
30-second identification budget (monotonic clock). Preparing escalates
through the existing owner participate transition, binds the canonical
fixed payload SHA-256 and exact scope to a one-use guard ticket.
No actual effect during identification or preparation.

Confirmation requires object identity (not a copied preview), repeats
document and active-tab checks, consumes the ticket, and performs a final
synchronous live presence check before exact-document isolated injection.
Synthetic guard receipt is not a physical effect receipt. The adapter
admits at most one dispatch attempt per runtime instance, even if the
browser throws or the fixed precondition is not satisfied. No automatic
retry, fallback or broader selector. In-flight work prevents another
identification until settled.

The response distinguishes pre-dispatch denial, reported not_applied,
reported applied (FIXTURE_DOM_EFFECT_REPORTED), and unknown_do_not_retry.
Post-dispatch revocation, context mismatch or error returns unknown because
the effect may have occurred already. A revoke cannot retract a dispatched
operation; the browser may execute an already queued operation after the
final check. Document binding does not make navigation/focus and effects
atomic. Reported applied is the serialized function's result plus metadata
revalidation, not independent subsequent content readback or durable
exactly-once evidence. A reload/new runtime resets the local attempt budget;
the DOM precondition is not a durable cross-runtime idempotency mechanism.

The source interface is for trusted extension code only. No real gesture
authentication, lifecycle forwarding, remote viewer custody, or UI is
included here. These must be qualified before physical use. The mock
conversation provider is intentionally not connected to this adapter.

## Evidence

Node v22.16.0, actual local targeted run:
    node --test test/lilly-fixture-participation.mjs
12 passed, 0 failed, 0 skipped.

The controller was extracted from the previous verified 0.1.5 package
(SHA-256 51810bb1b22089bdeae60ecbc8d7ec781ab51971295d144f07230390ba7904cd).
Its Git blob 8787131396ef50f7cb72a6c1bcb8c5fda1f2aeb7 matched the remote
baseline. Tests use mocked Chrome APIs and separate VM execution of the
serialized DOM action on synthetic node objects, not an actual browser.

Exact new local and published Git blobs:
- fixture-participation.mjs: 0c7b21d0476cf8875aef43f238bf9339c6e74d8f
- lilly-fixture-participation.mjs: 3c90e77e900a156d8fa74a7bce7ee828e63bff7a
- lilly-participation.html: 91e92b54623e3276af266ec760a39c576105ae9c

The previously passing 80 tests were not rerun for this additive slice.
Full test inventory is now 92; do not claim a new 92-test full run.

## Next

First obtain physical owner witness for the unchanged 0.1.5 integrated
observation panel on the KasmVNC host. Separately package a fixture-only
participation UI with trusted gestures, explicit preview, event forwarding,
terminal unknown outcome handling and a new browser witness. Keep the
current observation build intact. Do not add arbitrary browsing, forms,
navigation, model execution or production access. The next full suite
should run all 92 existing tests plus any new packaging/UI regressions.
