import { copyFile, mkdir, mkdtemp, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['src/lilly-panel-dev/background.mjs', 'src/lilly-panel-dev/panel.html', 'src/lilly-panel-dev/panel.css',
  'src/lilly-panel-dev/panel.mjs', 'src/lilly-panel-dev/session-ui.mjs', 'src/lilly-inspect-dev/inspection.mjs',
  'src/lilly-presence/controller.mjs', 'src/lilly-presence/mock-provider.mjs', 'src/lilly-presence/mock-conversation.mjs',
  'src/lilly-presence/integrated-fixture.mjs'];
export const inventory = Object.freeze(['manifest.json', ...files]);
export async function build(destination) {
  const out = destination === undefined ? await mkdtemp(join(tmpdir(), 'lilly-panel-dev-')) : resolve(destination);
  if (destination !== undefined) await mkdir(out); // refuse existing destination, never overwrite or remove
  for (const path of inventory) {
    const source = join(root, path === 'manifest.json' ? 'src/lilly-panel-dev/manifest.json' : path);
    if (!(await lstat(source)).isFile()) throw new Error('not a regular source file: ' + path);
    const target = join(out, path); await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target, constants.COPYFILE_EXCL);
  }
  return out;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('usage: node tools/build-lilly-panel.mjs [new-output-directory]');
  console.log(await build(process.argv[2]));
}
