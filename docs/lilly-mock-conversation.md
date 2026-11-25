# LillyBrowser 0.1c — mock conversation orchestration

Baseline: 0.1b `aef348675298581a6c2d684adfd4707b2c0f7cf5`.

Source-only, fixture-only. The Chrome development extension remains inert and
unchanged. No page access, new permission, GPU use, model invocation, network
transport, provider credentials, storage or upstream WebBrain imports.

## Contract

The trusted harness constructs a presence controller and a branded deterministic
mock provider. The provider receives no page contents or prompt: responses are
predefined fixtures, not model-generated. It cannot accept arbitrary provider
objects or route to a real endpoint. The brand is an in-process construction
check, not a security boundary against arbitrary JavaScript execution.

A turn requires an existing invitation and captures its original lease and
generation before opening the fixture stream. Only one visible active turn
is supported. Partial text is available through a snapshot while the original
presence remains live. No tool effects occur during streaming. On leave,
mode change, context loss or expiry detected at a policy boundary, the active
turn is detached, its buffers cleared, its lease ended and cancellation
signaled. Explicit cancel ends the turn without withdrawing the invitation.

A noncooperative fixture may deliberately emit one late chunk after an abort.
The original invocation then rejects it based on turn identity, independently
of cancellation. Cleanup is scoped to the old turn and cannot clear a new
turn. An intentionally paused noncooperative fixture must be released by the
test harness before its old promise settles; do not extrapolate this behavior
to production transport teardown or resource deadlines.

## Synthetic stream and proposal protocol

Each fixture event is a canonical JSON object with exact ordered keys
`type` and `value`, with string values. Types: text, tool, end.
Text precedes any fragmented tool proposal. A single end event with an empty
value followed by EOF is required. No partial or multiple proposals, unknown
types, extra keys, duplicate keys, trailing content or implicit repair.

A complete tool proposal is canonical JSON with ordered keys id, name,
target, text. The only target is fixture-a. read_fixture accepts empty
text and maps to observe; write_fixture maps to interact and requires the
participate grant. No arbitrary script, real DOM selector, external
destination or real action. Model-supplied digest values are not accepted:
the harness computes SHA-256 of UTF-8 JSON [name, target, text], then binds
the result into the existing guard operation. This digest binds synthetic
payload bytes, not actual browser effects.

After hashing, recheck the original turn and current presence, prepare a
one-use ticket, recheck presence immediately before consuming it, and
recheck before returning. Receipts are synthetic policy decisions only,
with NO_AUTHORITY markers. A completed result is returned to the trusted
caller; previously returned text cannot be retroactively erased.

## Qualification

    node --test test/lilly-dev-foundation.mjs test/lilly-presence.mjs test/lilly-mock-conversation.mjs

Observed in the isolated local Node v22.16.0 harness: 36 passed, 0 failed
(3 foundation, 19 presence, 14 orchestration).
Includes cooperative and noncooperative cancellation, late results after
reinvitations, preserving a new turn, revocation during asynchronous
SHA-256 computation, navigation, expiry, strict canonical JSON, fragmented
proposal completion, mode-specific denial, duplicate operation IDs and
fixture exhaustion without fallback. The tested 0.1b files matched their
pinned GitHub blob identities.

## Limits and next slice

Fixture bounds: 16 scripts, 128 events per script, bounded text/prompt/tool
buffers, one visible turn and one synthetic tool proposal per turn. These
are provisional development choices, not UX requirements. No actual
OpenAI-compatible SSE parser, model/tool compatibility, transport abort,
resource custody, live document identity, browser dispatch, real effect
idempotency or extension installation is qualified here. In particular,
fixture scripts are not a model API contract.

Next: 0.1d narrow invited page inspection. First inventory Chrome document
identity, frame attribution, user gestures, lifecycle events and injection
boundaries. Design and qualify a separately loadable, disposable-profile
read-only adapter against synthetic local pages. Do not connect upstream
WebBrain, live inference, authenticated pages or memory. Actual Chrome
smoke remains blocked in the available administratively restricted browser.
