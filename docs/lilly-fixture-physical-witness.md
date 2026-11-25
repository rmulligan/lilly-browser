# LillyBrowser 0.1d — owner-run physical Chrome witness

Date: 2026-11-24. Candidate reference: `6199f29e8118e80c8f3182d6f5c95fadf3dac9ce`.
Verdict: OWNER_WITNESS_PASS_FIXTURE_ONLY.

This is a record of the owner's interactive browser test, not an automated
browser test or independent execution by the reviewer. The candidate was
provided in the preceding source-qualified draft PR. Exact installed
file hashes, browser build and profile configuration were not independently
attested during the witness.

## Observations

| Check | Evidence | Outcome |
| --- | --- | --- |
| Inert 0.1a side panel on local fixture | Screenshot | Rendered, not connected |
| 0.1d inspection popup | Screenshot | Rendered |
| Fixture URL with added query parameter | Screenshot | fixture_not_active |
| Exact fixture URL identification | Screenshot | Confirmation enabled with browser document ID |
| Confirm one read | Screenshot | Read complete; invitation spent; confirm disabled |
| Permitted paragraph | Screenshot | A small copper key rests beside a blue notebook. |
| Other paragraph | Screenshot | Not present in displayed result |
| Leave / clear | Owner report and screenshot | Initial not-invited state; result cleared |
| Expiration | Owner report and screenshot | scope_changed; confirmation disabled |
| Nonfixture site | Screenshot | fixture_not_active |
| Reload after identification | Owner report | Fresh identification required |
| Tab switch and return | Owner report | Fresh identification required |
| Close/reopen after a read | Owner report | No retained observation |

The owner explicitly reported that all remaining requested checks passed.
Screenshots were reviewed in the private conversation and have not been
copied into this public repository. No private browser identifiers,
machine details or screenshot contents beyond the synthetic fixture text
and relevant status observations are published.

## Scope of qualification

This resolves the prior practical Chrome installation blocker for the
two development extensions and establishes owner-witnessed one-shot
fixture observation and the tested negative paths. The earlier
administratively blocked headless run remains part of the historical
record, not a current requirement to bypass policy.

The 51-test source regression result remains the previously observed
local result; it was not rerun as part of this documentation-only update.
The screenshots do not establish exhaustive browser event delivery,
in-flight injection atomicity, CSP/network-log enforcement, exact
installed-byte provenance, real model behavior or persistent authority.
The popup closing on focus changes can itself invalidate state; this
witness does not independently prove individual browser event handlers.
Revocation cannot retract a read already dispatched. A browser-granted
activeTab permission is not itself revoked by the extension's Leave control.

Next: source-only integration of the existing presence contract with
document-attributed fixture observations and mock conversation.
Preserve the two independently loadable prototypes and their permissions;
do not expand to arbitrary pages, actions, real inference, memory,
production services or authenticated browsing in this integration slice.
