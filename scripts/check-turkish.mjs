// One-off audit: fail if any Turkish character sneaks into our files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pattern = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]/; // Turkish chars via ranges (c-cedilla..u-umlaut + uppercase), no literals
const SKIP_DIRS = new Set(['node_modules', '.git', '.next']);
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.ts', '.tsx', '.example']);

let hits = 0;

function scanFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (pattern.test(line)) {
      hits += 1;
      console.log(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
    }
  });
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      scanFile(path.join(dir, entry.name));
    }
  }
}

for (const dir of ['src', 'bin', 'template', 'scripts']) {
  walk(path.join(root, dir));
}
for (const file of ['README.md', 'package.json', '.gitignore']) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) scanFile(full);
}

console.log(hits === 0 ? 'CLEAN — no Turkish characters found.' : `${hits} Turkish hit(s) found.`);
process.exit(hits === 0 ? 0 : 1);
