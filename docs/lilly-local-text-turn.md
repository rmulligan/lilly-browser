# 0.1f — bounded local text turn (source only)

Base: 3025935b76406835c59f356d3f8480925ca0a8d7. This independent branch adds a transport-neutral runtime and tests; no loadable extension, mock provider, participation adapter or existing permission changes.

## Contract

Trusted caller supplies a synchronous readObservation callback returning the exact immutable, currently authorized fixture_text_v1 snapshot or null, a fixed model ID, and a private injected transport. Caller must forward revocation/context events synchronously and separately revalidate actual browser identity before request and before release; this source slice has not yet been composed with the browser adapter. Only exact loopback observation fixture accepted. Whitelisted request includes random request ID, protocol, prompt, model ID, session/generation, historical acquisition/expiry, source URL/document ID/top frame and captured text; no browser ID, worker ID, arbitrary DOM, cookies or credentials. This is not a memory write.

Transport open(request, AbortSignal) synchronously returns private pull stream with async next() and close(), safe during an outstanding pull. No HTTP/SSE client is supplied. A future qualified normalizer emits canonical UTF-8 JSON array lines:

    ["lilly_text_v1", requestId, modelId, sessionId, generation, "text", "response fragment"]
    ["lilly_text_v1", requestId, modelId, sessionId, generation, "end", ""]

Error frames are rejected without exposing provider detail. No tool messages accepted. Exactly one end, clean EOF, complete UTF-8, exact identity echo; no partial response release. Request/response identity is a transport claim, not model attestation. Limits: 8192 UTF-16 units each prompt/response, 512 captured units, 65536 wire bytes, 256 chunks, 128 frames, 32768 frame units, 30s or earlier snapshot expiration. Deadline is a provisional conservative development choice, not measured model latency.

Cancellation or revocation promptly resolves the caller with denial, discards buffered text and signals abort/close; a noncooperative outstanding pull or close keeps the local single-flight slot occupied until both settle. A rejected open or close poisons the runtime. No automatic retry or fallback. This is not host-wide GPU arbitration, process termination proof, or memory zeroization; an injected transport must actually enforce its side of the contract. Revocation burns exact snapshot identity. Caller must not republish stale observations under new identities.

## Evidence

Node 22.16.0: 14/14 new tests, 8/8 participation tests, combined 22/22; prior 92 tests not rerun here (114 inventory). Fragmentation test initially exceeded the deliberate 256-chunk bound; changed test chunk size to two bytes without widening limits. Source blob b3bffc2a3caa4914596bd491ffca6bede15835cb; test blob f5cdefa5abb48733fb4e181cb188071b724f0c30; exact GitHub readback matched. No live inference, host service inspection, credentials, network transport, extension install or production state change in this work.

## Existing host evidence and compatibility gap

Owner-provided First Wake Component Convergence report dated 2026-11-23 identifies the Swift inference service on 8888, personal gateway on 18888, canonical gateway on 10601 (reported inactive/faulted), separate authority issuer, attestor and model fence. Historical authorization-testing records describe a bearer-protected personal gateway and canonical dispatch-time admission. These are historical reports, not a current live measurement or proof of browser-compatible access. Do not point the extension directly at any of these ports or reuse the personal engineering credential.

Next: read-only inspect exact installed gateway/broker source and effective runtime contract without reading secrets or invoking endpoints; choose narrow admitted text-only transport, qualify normalizer and real browser composition, and explicitly authorize any installation, credentials, network permissions and live inference separately. No changes to First Wake admission and no GPU contention.
