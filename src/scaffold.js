import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import * as p from '@clack/prompts';
import { fileURLToPath } from 'node:url';
import { ALL_COMPONENTS } from './presets.js';

const CLI_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = path.join(CLI_ROOT, 'template');

// ---------------------------------------------------------------------------
// Step 1 — create-next-app (always @latest, so the template never goes stale)
// ---------------------------------------------------------------------------

export async function scaffoldNextJs(config, spinner) {
  spinner.start('Creating Next.js app (latest)...');

  // "." scaffolds into the current folder instead of creating a subfolder.
  const target = config.projectName === '.' ? '.' : config.projectName;

  await execa(
    'npx',
    [
      'create-next-app@latest',
      target,
      '--ts',
      '--tailwind',
      '--eslint',
      '--app',
      '--import-alias',
      '@/*',
      `--use-${config.pm}`,
    ],
    { stdio: 'inherit' }
  );

  spinner.stop('Next.js app created');
}

// ---------------------------------------------------------------------------
// Step 2 — shadcn (always @latest, non-interactive defaults)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step 2 — shadcn (always @latest, official preset flow):
//   bunx --bun shadcn@latest init --preset <code> --template next
// The runner matches the package manager (bunx --bun / pnpm dlx / npx).
// ---------------------------------------------------------------------------

function shadcnRunner(pm) {
  switch (pm) {
    case 'bun':
      return { cmd: 'bunx', prefix: ['--bun', 'shadcn@latest'] };
    case 'pnpm':
      return { cmd: 'pnpm', prefix: ['dlx', 'shadcn@latest'] };
    default:
      // npm and yarn — npx works everywhere.
      return { cmd: 'npx', prefix: ['shadcn@latest'] };
  }
}

async function addComponentsBulk(runner, targetDir, components) {
  await execa(runner.cmd, [...runner.prefix, 'add', '-y', '-o', ...components], {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

async function addComponentsOneByOne(runner, targetDir, components) {
  const failed = [];
  for (const name of components) {
    try {
      await execa(runner.cmd, [...runner.prefix, 'add', '-y', '-o', name], {
        cwd: targetDir,
        stdio: 'pipe',
      });
    } catch {
      failed.push(name);
    }
  }
  return failed;
}

export async function setupShadcn(config, spinner) {
  const runner = shadcnRunner(config.pm);
  spinner.start(`Setting up shadcn (preset ${config.shadcnPreset})...`);

  await execa(
    runner.cmd,
    [...runner.prefix, 'init', '-y', '--template', 'next', '--preset', config.shadcnPreset],
    {
      cwd: config.targetDir,
      stdio: 'inherit',
    }
  );

  const { components } = config;

  if (components.includes(ALL_COMPONENTS)) {
    // `--all` resolves against the live registry, so this is always
    // literally every shadcn component — no hardcoded list to maintain.
    await execa(runner.cmd, [...runner.prefix, 'add', '-y', '-o', '--all'], {
      cwd: config.targetDir,
      stdio: 'inherit',
    });
    spinner.stop('shadcn ready (entire registry)');
    return;
  }

  if (components.length > 0) {
    try {
      await addComponentsBulk(runner, config.targetDir, components);
    } catch {
      // One bad component name must never sink the whole setup —
      // retry individually and report what was skipped.
      spinner.message('Bulk install failed — retrying components one by one...');
      const failed = await addComponentsOneByOne(runner, config.targetDir, components);
      if (failed.length > 0) {
        p.log.warn(`Skipped components (not in registry): ${failed.join(', ')}`);
      }
    }
    spinner.stop(`shadcn ready (${components.length} requested)`);
  } else {
    spinner.stop('shadcn ready (base only)');
  }
}

// ---------------------------------------------------------------------------
// Step 3 — copy our own template files over the fresh project
// ---------------------------------------------------------------------------

export async function applyTemplate(config, spinner) {
  if (!(await fs.pathExists(TEMPLATE_DIR))) return;

  spinner.start('Applying template files...');

  const entries = await fs.readdir(TEMPLATE_DIR);
  if (entries.length === 0) return;
  await fs.copy(TEMPLATE_DIR, config.targetDir, { overwrite: true });

  spinner.stop('Template files applied');
}

// ---------------------------------------------------------------------------
// Step 4 — optional git init
// ---------------------------------------------------------------------------

export async function initGit(config) {
  if (!config.git) return;

  try {
    await execa('git', ['init'], { cwd: config.targetDir });
  } catch {
    // git is not installed — silently continue without it
  }
}
