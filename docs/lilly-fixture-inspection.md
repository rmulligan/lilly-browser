# LillyBrowser 0.1d — invited fixture inspection

Baseline: 0.1c `349c18ac5b2e766c40597b02093f2ce05d9eb58d`.

This is a separately loadable Chrome MV3 prototype, not the production
LillyBrowser. The inert 0.1a shell and pure 0.1b/0.1c modules remain
unchanged. The inspection controller is independent and does not yet
connect to the conversation or presence controller.

## Narrow browser boundary

Only activeTab and scripting permissions; no standing host permissions,
content scripts, background service worker, storage, network transport,
model access, browser writes, arbitrary selectors or page messages.
Chrome activeTab is a browser-granted temporary host permission when the
extension is invoked, not itself a Lilly invitation. The extension cannot
promise to revoke Chrome's permission on Leave; it discards its own
ephemeral confirmation and has no background execution paths.

Two explicit trusted popup clicks (isTrusted and userActivation.isActive):
1. Identify fixture: check one complete, non-incognito active tab at the
   exact URL http://127.0.0.1:8765/lilly-fixture.html; perform only a boolean
   top-frame URL probe. Record browser-returned documentId, tab/window and
   monotonic start time. Show URL and document identity before confirmation.
2. Confirm one read: consume the confirmation immediately; recheck tab,
   expiry, epoch, and documentId. Use scripting.executeScript with documentIds
   (not frame fallback), ISOLATED world and a fixed serialized function.
   Inside the document, check top frame and exact URL again. Read only the
   single text node of the fixed paragraph lilly-public-fixture, at most
   512 UTF-16 code units. Reject malformed structures and results.
   Recheck document and tab after reading. Return only text and a
   LOCAL_FIXTURE_OBSERVED_NO_ACTION_AUTHORITY marker.

Conservatively invalidate on observed tab activation, update, removal,
replacement, attachment/detachment, window focus changes, pagehide and
Leave. The popup discards late results by epoch, renders with textContent,
and has no persistent state. A 30-second one-shot confirmation and a
single in-flight operation are provisional development bounds.

The fixture URL and marker are not authentication of a localhost service.
Do not use this with private/authenticated browsing, or expose any real
content at the fixture URL. A browser read already dispatched cannot be
undone by revocation; the controller discards the result after revocation
but cannot prove the injected function did not run. Event delivery, focus,
document lifecycle (including back-forward cache), Chrome CSP enforcement,
and gesture semantics require a physical browser test. Mocked APIs are
not evidence of atomic browser dispatch or absence of browser-level races.

## Reproduction

From repository root:
    node --test test/lilly-dev-foundation.mjs test/lilly-presence.mjs test/lilly-mock-conversation.mjs test/lilly-inspection.mjs

Observed Node v22.16.0: 51 passed, 0 failed (36 existing, 15 new).
The new tests exercise mocked Chrome APIs, serialized injected functions
in synthetic VM contexts and static popup/manifest checks. No actual
browser API execution, inference, credentials or production service.

## Physical browser witness (pending)

Use an isolated disposable Chrome profile, with no authenticated sessions.
Confirm port 8765 is free; serve only the public fixture folder:

    python3 -m http.server 8765 --bind 127.0.0.1 --directory test/fixtures/lilly-inspection

Load unpacked src/lilly-inspect-dev in chrome://extensions. Open
http://127.0.0.1:8765/lilly-fixture.html and click the toolbar icon.
Identify fixture, inspect the displayed URL and document ID, then confirm
one read. Expected text: A small copper key rests beside a blue notebook.
No other page text should appear. Confirm the read cannot repeat without
identifying again. Verify Leave, expiry, popup close, reload at the same URL,
tab switch and a nonfixture URL deny or clear the result. Inspect extension
permissions and network logs; no external traffic or model request.
Remove the extension and stop the fixture server after testing.
Do not bypass browser administrator policy. Prior available headless
browser testing was administratively blocked; live acceptance remains open.

## Next

Qualify the physical witness before expanding beyond the fixture. Then
connect the read-only adapter to the existing presence controller with
trusted context snapshots and a narrow observation schema, and verify
end-to-end revocation. No live inference, page interaction, persistent
memory or general WebBrain activation until their separate gates.
