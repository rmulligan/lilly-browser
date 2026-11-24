import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
const root = new URL("../src/lilly-dev/", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const manifest = JSON.parse(await read("manifest.json"));

test("isolated extension exposes only side-panel permission", async () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "LillyBrowser (Development)");
  assert.deepEqual(manifest.permissions, ["sidePanel"]);
  for (const key of ["host_permissions", "optional_host_permissions",
    "optional_permissions", "content_scripts", "chrome_url_overrides",
    "externally_connectable", "web_accessible_resources", "options_page",
    "commands", "mime_types_handler"]) assert.ok(!(key in manifest), key);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'(?:;|$)/);
  assert.equal(manifest.side_panel.default_path, "panel.html");
  assert.deepEqual((await readdir(root)).sort(), [
    "background.js", "manifest.json", "panel.css", "panel.html"
  ]);
});

test("panel remains passive and explicitly disconnected", async () => {
  const html = await read("panel.html");
  assert.match(html, /Not connected/);
  assert.match(html, /Opening this panel does not invite Lilly/);
  assert.doesNotMatch(html, /<(script|iframe|form|object|embed|img)\b/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(await read("panel.css"), /@import|url\s*\(/i);
});

test("toolbar click opens only the requested window's panel", async () => {
  let click;
  const opened = [];
  const oldChrome = globalThis.chrome;
  globalThis.chrome = {
    action: { onClicked: { addListener(fn) { click = fn; } } },
    sidePanel: { async open(options) { opened.push(options); } }
  };
  try {
    await import(new URL("background.js", root));
    assert.equal(typeof click, "function");
    assert.deepEqual(opened, []);
    click({ windowId: -1 });
    click({ windowId: "2" });
    click({});
    assert.deepEqual(opened, []);
    click({ windowId: 7, id: 42, url: "https://example.invalid/private" });
    assert.deepEqual(opened, [{ windowId: 7 }]);
  } finally {
    if (oldChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = oldChrome;
  }
});
