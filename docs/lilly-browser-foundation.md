# LillyBrowser 0.1a — isolated development foundation

Upstream baseline: WebBrain 49.2.0, `430846d6f06615191cfa3f08646a5c4118dc13ec`.
License: GPL-3.0-or-later; retain upstream attribution and LICENSE.

## Scope

`src/lilly-dev/` is a separate unpacked Chrome MV3 extension, not a renamed or
modified build of the inherited agent. Its only permission is `sidePanel`.
The toolbar opens a passive panel. It does not grant access to the active
tab, initiate inference, read or persist context, or authorize actions.
There is no provider, content script, network transport, scheduler,
memory writer or upstream agent import. Network connections are disallowed
by the extension-page CSP. Do not treat this as a security assessment of
the inherited WebBrain extension.

## Local qualification

From the repository root, with Node.js installed:

```sh
node --test test/lilly-dev-foundation.mjs
```

Use a disposable Chrome profile (Chrome 116+), not a profile containing
authenticated browsing sessions. In chrome://extensions enable Developer
mode, choose Load unpacked, and select src/lilly-dev (not src/chrome).
Click the toolbar icon and confirm the panel opens and reports
"Not connected". Check the extension permission inventory, service worker
console, and network logs. Close/reopen the panel, restart Chrome, and
confirm no page access, storage, or network activity. Remove the test
extension after verification. No model endpoint or credential is needed.

The Node tests are static checks and a mocked Chrome action event, not
physical Chrome qualification. Browser acceptance remains pending until
observed. The existing WebBrain extension and main branch are untouched.

## Next: 0.1b

Build a pure, independently tested presence state machine. Session scope
must bind a browser instance, tab, top-level document identity, normalized
origin, explicit mode, expiry, and revocation generation. Opening a panel
is not an invitation. Join must be an explicit user gesture; Leave
invalidates outstanding operations. Navigation, tab replacement, worker
restart, and unknown frame identity fail closed. Model output cannot
create or expand authority. Initially use synthetic document fixtures.

Only after independent state-machine qualification introduce a narrow
real browser adapter, then a mock inference provider. Preserve the
upstream interaction engine, but do not import it until all activation and
dispatch paths relevant to the selected tool set are inventoried and
guarded. No arbitrary JavaScript, cloud fallback, persistent memory,
background tasks, authenticated browsing or live model inference in 0.1a.

## Status

Source-only development foundation. Not installed, merged, released or
qualified for real browser actions. Public repository: no private host
configuration, personal data, credentials or session artifacts.
