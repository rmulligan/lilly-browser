# 0.1f — local inference preparation (design only)

Goal: a real, owner-invited text response grounded in an immutable observed fixture. This is an independent source lane; do not connect a live endpoint or share GPU resources yet. No model-originated browser effects. Keep the 0.1.5 and 0.1.6 packages inert.

## Observed seams

The existing createMockConversation accepts only a branded mock provider, opens a bounded stream with (AbortSignal, frozen {prompt, observation}), validates the original presence lease for each chunk and before release, and rejects incomplete streams. Do not weaken the mock brand or repurpose synthetic tool receipts as authority. createIntegratedFixture owns the document-bound historical observation and revocation; use those semantics in a separate text-only turn orchestrator. The participation adapter is independent and must stay disconnected from provider output.

## Work sequence

1. Inspect the actual local gateway/runtime contract on Lilly's host, read-only: installed versions, endpoint/protocol, model identity, auth mechanism (names and permissions only, never secret contents), request/response schema, cancellation, limits, GPU arbitration, binding and network admission. Record unknowns; do not invent an OpenAI-compatible route or assume a model name. First Wake runtime is not a disposable test endpoint.
2. Specify a transport-independent bounded text-event contract with request ID, session/generation, original observation ID and scope, end/error/cancel, explicit model identity and provenance. Enforce text only, no tool calls or arbitrary network access; treat webpage data and model output as untrusted. Never send browser credentials, cookies or unrelated DOM. No automatic retry, provider fallback, persistent memory or capability escalation.
3. Build an isolated parser and injected fake transport, tests for split chunks, malformed frames, invalid UTF-8, over-budget responses, missing/duplicate end, wrong identity, cancellation before/during/after I/O, noncooperative late output and revocation during parsing. Bound bytes, time, concurrency and queue; release no stale response. Do not enable extension network permissions yet.
4. Review intended host admission against the existing personal and canonical runtime boundaries. Decide explicit local transport with a narrow endpoint, no browser-stored bearer secrets or widened CORS, no remote viewer trust by default. Any credential provisioning, installed service mutation, network/CSP expansion or real inference requires separately approved qualification. Avoid GPU competition with First Wake agents.
5. After source qualification and owner approval, exercise a synthetic text-only fixture in a disposable browser profile against the exact approved local endpoint; observe actual request identity, cancellation and resource release. Only after this may owner-authorized real page observation or job-search use be considered.

The immediate deliverable is a source-level compatibility packet and tests, not a running provider. No inference was executed for this design.
