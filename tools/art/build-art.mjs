/**
 * Regenerates every sprite sheet from source.
 *
 *   npm run art
 *
 * Each generator is a standalone Python module under tools/art/ that writes
 * PNGs into public/assets/sprites/. They are run in dependency order --
 * palette.py and pixel.py are imported by all of them, so cwd is pinned to
 * tools/art/ and that directory is put on PYTHONPATH.
 *
 * The final step re-opens every PNG and asserts its dimensions against the
 * table in verify.py, which mirrors src/assets/manifest.ts. A sheet whose size
 * drifts from the manifest is a load-time crash in the game, so it fails the
 * build here instead.
 */

import { spawnSync } from 'node:child_process';
// console and process are imported rather than taken from globals so this file
// lints under the project's browser-oriented global set.
import console from 'node:console';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ART_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(ART_DIR, '..', '..');

/** Generators, in the order they run. Later modules never depend on earlier
 *  output, but a stable order keeps the console log diffable between runs. */
const GENERATORS = [
  'gen_characters.py',
  'gen_projectiles.py',
  'gen_birds.py',
  'gen_objects.py',
  'gen_environment.py',
  'gen_ui.py',
  'gen_font.py',
];

/** Python on Windows is usually `python`; most other places ship `python3`. */
function findPython() {
  for (const candidate of ['python', 'python3']) {
    const probe = spawnSync(candidate, ['-c', 'import PIL, numpy'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function run(python, script) {
  const scriptPath = join(ART_DIR, script);
  if (!existsSync(scriptPath)) {
    throw new Error(`missing generator: ${script}`);
  }
  const result = spawnSync(python, [script], {
    cwd: ART_DIR,
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: ART_DIR, PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${script} exited with code ${result.status}`);
  }
}

function main() {
  const python = findPython();
  if (!python) {
    console.error('Art build needs Python 3 with Pillow and numpy available on PATH.');
    console.error('Install them with:  python -m pip install pillow numpy');
    process.exit(1);
  }

  console.log(`Building sprites into ${join(REPO_ROOT, 'public', 'assets', 'sprites')}`);
  const started = Date.now();
  for (const script of GENERATORS) {
    run(python, script);
  }
  run(python, 'verify.py');
  console.log(`Art build complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

try {
  main();
} catch (err) {
  console.error(`Art build failed: ${err.message}`);
  process.exit(1);
}
