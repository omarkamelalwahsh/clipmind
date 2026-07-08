/**
 * runShadowRender.js
 * ------------------------------------------------------------------------
 * Shadow Pipeline runner (Node service). Takes a PromptCut Groq v2 contract,
 * translates it to a HyperFrames composition via translateJsonToHyperFrames,
 * writes it to ./hyper-preview/index.html, and renders it with the HyperFrames
 * CLI — all OUT OF BAND of the live Remotion preview, which is never touched.
 *
 * Usage:
 *   node frontend/utils/runShadowRender.js <payload.json> [--output shadow_output.mp4]
 *   cat payload.json | node frontend/utils/runShadowRender.js -   [--output out.mp4]
 *
 * Programmatic:
 *   import { runShadowRender } from "./runShadowRender.js";
 *   const { htmlPath, outputPath, stdout } = await runShadowRender(contract);
 *
 * Notes:
 *   - Uses child_process.exec (promisified) exactly as specified.
 *   - Pins the CLI to hyperframes@0.7.42 to match hyper-preview/package.json,
 *     so the shadow render can never drift from the initialized template.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { translateJsonToHyperFrames } from './translateJsonToHyperFrames.js';

const execAsync = promisify(exec);

// Resolve ./hyper-preview relative to THIS file, not the process cwd, so the
// runner works no matter where it is invoked from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HYPER_PREVIEW_DIR = path.resolve(__dirname, '../../hyper-preview');
const HYPERFRAMES_VERSION = '0.7.42';

/**
 * Translate a contract, write index.html, and render to MP4.
 *
 * @param {object|string} contract      v2 payload (object or JSON string).
 * @param {object} [options]
 * @param {string} [options.output="shadow_output.mp4"]  Output filename/path,
 *        resolved relative to the hyper-preview dir when not absolute.
 * @param {string} [options.previewDir=HYPER_PREVIEW_DIR]  Target project dir.
 * @param {boolean} [options.render=true]  Set false to only write the HTML.
 * @param {(chunk: string) => void} [options.onLog]  Live log sink.
 * @returns {Promise<{htmlPath: string, outputPath: string, stdout: string, stderr: string}>}
 */
export async function runShadowRender(contract, options = {}) {
  const {
    output = 'shadow_output.mp4',
    previewDir = HYPER_PREVIEW_DIR,
    render = true,
    onLog = () => {},
  } = options;

  // 1. Translate the Groq payload -> deterministic HyperFrames HTML.
  const html = translateJsonToHyperFrames(contract, {
    title: 'PromptCut Shadow Render',
  });

  // 2. Write it into the initialized HyperFrames template.
  const htmlPath = path.join(previewDir, 'index.html');
  await writeFile(htmlPath, html, 'utf8');
  onLog(`[shadow] wrote composition -> ${htmlPath} (${html.length} bytes)`);

  const outputPath = path.isAbsolute(output) ? output : path.join(previewDir, output);

  if (!render) {
    return { htmlPath, outputPath, stdout: '', stderr: '' };
  }

  // 3. Trigger the HyperFrames CLI render from inside the preview folder.
  //    Quote the output path so spaces in the resolved path are safe.
  const command =
    `npx --yes hyperframes@${HYPERFRAMES_VERSION} render --output "${outputPath}"`;
  onLog(`[shadow] rendering: ${command}  (cwd=${previewDir})`);

  const child = execAsync(command, {
    cwd: previewDir,
    maxBuffer: 64 * 1024 * 1024, // renders are chatty; avoid ENOBUFS
    windowsHide: true,
  });

  // Stream live CLI output through the log sink instead of only at completion.
  child.child.stdout?.on('data', (d) => onLog(String(d).trimEnd()));
  child.child.stderr?.on('data', (d) => onLog(String(d).trimEnd()));

  const { stdout, stderr } = await child;
  onLog(`[shadow] render complete -> ${outputPath}`);

  return { htmlPath, outputPath, stdout, stderr };
}

/* ------------------------------- CLI wrapper ------------------------------ */

/** Read a JSON contract from a file path, or from stdin when arg is "-". */
async function loadContract(source) {
  if (source === '-' || source === undefined) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) throw new Error('No JSON received on stdin.');
    return JSON.parse(raw);
  }
  const raw = await readFile(path.resolve(process.cwd(), source), 'utf8');
  return JSON.parse(raw);
}

/** Minimal flag parser: positional payload + optional --output <path>. */
function parseArgs(argv) {
  const args = { payload: undefined, output: 'shadow_output.mp4' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output' || a === '-o') {
      args.output = argv[++i];
    } else if (a.startsWith('--output=')) {
      args.output = a.slice('--output='.length);
    } else if (!a.startsWith('-') || a === '-') {
      args.payload = a;
    }
  }
  return args;
}

// Run as a script only when invoked directly (not when imported).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { payload, output } = parseArgs(process.argv.slice(2));
  loadContract(payload)
    .then((contract) => runShadowRender(contract, { output, onLog: (m) => console.log(m) }))
    .then(({ outputPath }) => {
      console.log(`\n✔ Shadow render finished: ${outputPath}`);
    })
    .catch((err) => {
      console.error(`\n[x] Shadow render failed: ${err.message}`);
      process.exitCode = 1;
    });
}

export default runShadowRender;
