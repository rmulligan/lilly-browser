# LillyBrowser 0.1b — presence lifecycle (synthetic only)

Baseline: 0.1a `46755c94da3b7e4ed1d42ff4caa5b8b1851afacf`.
The independently loadable `src/lilly-dev/` extension remains unchanged.
The new pure controller lives outside that extension, in
`src/lilly-presence/controller.mjs`. No browser or model integration is enabled.

## Trust and lifecycle

One controller instance owns ephemeral grants. A trusted extension-owned
owner interface accepts explicit gestures; a separate guard interface is
reserved for trusted orchestration and dispatch code. Neither interface,
nor any lease or ticket, may be handed to a page or model. The synthetic
controller does not itself authenticate the caller or a browser user gesture.

A grant begins absent. Invite enters observe mode, with a finite expiry;
only the owner can enter participate mode or downgrade to observe.
Changing modes clears all turn leases and tickets, preserves the original
expiry, and advances the generation. Leave revokes the grant; a newly
created controller is absent regardless of prior state. A changed or unknown
context revokes presence rather than transferring it. No persistence,
automatic renewal, detached work, or scheduled wakeups.

The trusted scope is an exact record of browser instance, worker incarnation,
window, tab, top-level document, frame (0 only), and canonical HTTP(S)
origin. Each guarded operation receives a fresh trusted scope. The adapter
must observe navigation and activation changes even when a page later returns
to its previous identity. This slice cannot prove event delivery, browser
document identity, or the actual freshness of a supplied snapshot.

## Guard flow

1. A trusted orchestrator calls begin before starting a turn and retains the
   opaque in-process lease. It must not reacquire a new lease on behalf of
   stale output. Capture is not authority creation.
2. Prepare checks the lease, mode, scope, expiry and strict operation
   descriptor (ID, kind, target, lowercase SHA-256-shaped payload digest).
   Observe permits only observe; participate permits observe/interact in
   this synthetic model. A ticket reserves an ID for the current generation.
3. Consume rechecks scope, expiry, live turn, ticket identity, exact
   descriptor and mode. A recognized ticket is burned on any attempted
   consumption, including a mismatch. It returns
   SYNTHETIC_DISPATCH_ACCEPTED_NO_AUTHORITY, not a browser effect or receipt.
4. End the turn in a finally path; this invalidates its pending tickets and
   lease. Revocation clears all outstanding state.

Default maximum invitation duration is five minutes, with a trusted
monotonic clock injected by the caller. Expiry is enforced on policy calls,
not a background timer. Invalid or regressed clock readings revoke.
Synthetic budgets: eight simultaneous turns, 64 pending tickets, 256
reserved operation IDs per generation. Budget exhaustion refuses new work.

## Evidence and limits

Run from repository root:

    node --test test/lilly-dev-foundation.mjs test/lilly-presence.mjs

Observed local run with Node v22.16.0: 22 passed, 0 failed (3 foundation,
19 lifecycle tests). No browser, credentials, network or model required.
The lifecycle suite covers absent-state denial, explicit escalation and
downgrade, context mismatch, leave/reinvite, worker replacement, expiry,
clock rollback, malformed records, token identity, duplicate/mismatched
dispatch, completed turns, and bounded state.

This is not a security sandbox. All inputs must be inert records constructed
by trusted adapters, not arbitrary JavaScript objects/proxies from a page.
The digest is a bound label in this slice; a later trusted adapter must
compute it from the canonical actual payload and bind the actual target.
The grant does not authorize arbitrary browser actions. Operation ID
deduplication is ephemeral and generation-scoped, not durable effect
idempotency. An uncertain external effect must not be replayed merely by
assigning a different ID or creating a new invitation.

Actual Chrome installation remains unqualified. No actual page visibility,
trusted gesture routing, frame/document provenance, provider transport,
browser dispatch, or post-dispatch cancellation has been verified.
The synchronous consume check is not an atomic transaction with a browser
effect. A real adapter must revalidate directly at its final dispatch
boundary, avoid intervening awaits and handle navigation/dispatch races
and uncertain outcomes. No source in this slice calls browser APIs.

## Next: 0.1c

Create a mock-only provider adapter and a trusted turn orchestration harness
that retains the originating lease, cancels on leave, discards stale
responses and refuses any cloud fallback or upstream WebBrain provider
activation. Validate streaming, tool-call parsing and mock cancellation
without real credentials or inference. Browser integration follows separately.
