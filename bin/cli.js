#!/usr/bin/env node
import { run } from '../src/index.js';

// Block-style glyph enforcement.
//
// The prompt engine (@clack/prompts) draws ◆ ◇ ● ○ internally and offers no
// theming API, so we swap them 1:1 for ■ / □ at the stdout layer. Every swap
// keeps the same character width, so interactive redraws and cursor math stay
// intact. Frames and boxes intentionally keep their thin lines — only the
// markers are squared. Only this process's own output is affected — child
// CLIs (shadcn, create-next-app) write straight to the terminal and keep
// their own style.
const GLYPH_SWAP = { '◆': '■', '◇': '■', '●': '■', '○': '□' };
const GLYPH_PATTERN = /[◆◇●○]/g;

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...args) => {
  if (typeof chunk === 'string') {
    chunk = chunk.replace(GLYPH_PATTERN, (glyph) => GLYPH_SWAP[glyph]);
  }
  return originalStdoutWrite(chunk, ...args);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
