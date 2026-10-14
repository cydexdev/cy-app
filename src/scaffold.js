import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { execa } from 'execa';
import * as p from '@clack/prompts';
import { fileURLToPath } from 'node:url';
import { ALL_COMPONENTS } from './presets.js';

const CLI_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = path.join(CLI_ROOT, 'template');

// ---------------------------------------------------------------------------
// Step 1 — shadcn template scaffold (always @latest).
// One official command creates the Next.js app AND applies the design
// preset: theme-provider (with hotkey), wired layout, dark CSS, button,
// utils, fonts. The runner implies the package manager
// (npx -> npm, pnpm dlx -> pnpm, bunx --bun -> bun).
// ---------------------------------------------------------------------------

const DOT_TMP_NAME = 'cy-app-tmp';

export async function scaffoldNextJs(config, spinner) {
  const runner = shadcnRunner(config.pm);

  // shadcn decides template-vs-existing by looking for a package.json in
  // the CURRENT directory — so always scaffold in a fresh temp dir.
  // Otherwise running cy-app from inside another project would either fail
  // the framework check or, worse, write into that project.
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cy-app-'));
  try {
    if (config.projectName === '.') {
      await scaffoldIntoCurrentDir(config, spinner, runner, tmpRoot);
    } else {
      spinner.start('Scaffolding Next.js + shadcn template (latest)...');
      await execa(
        runner.cmd,
        [
          ...runner.prefix,
          'init',
          '-y',
          '--template',
          'next',
          '--preset',
          config.shadcnPreset,
          '-n',
          config.projectName,
        ],
        { cwd: tmpRoot, stdio: 'inherit' }
      );
      if (await fs.pathExists(config.targetDir)) {
        await fs.rmdir(config.targetDir);
      }
      await fs.move(path.join(tmpRoot, config.projectName), config.targetDir);
      spinner.stop('Project scaffolded');
    }
  } finally {
    await fs.remove(tmpRoot).catch(() => {});
  }
}

// "." means: scaffold into a temp subfolder, then move everything up.
// (The template always creates a subfolder, so a direct "." is impossible.)
async function scaffoldIntoCurrentDir(config, spinner, runner, tmpRoot) {
  const tmpDir = path.join(tmpRoot, DOT_TMP_NAME);

  spinner.start('Scaffolding Next.js + shadcn template (latest)...');

  await execa(
    runner.cmd,
    [
      ...runner.prefix,
      'init',
      '-y',
      '--template',
      'next',
      '--preset',
      config.shadcnPreset,
      '-n',
      DOT_TMP_NAME,
    ],
    { cwd: tmpRoot, stdio: 'inherit' }
  );

  for (const entry of await fs.readdir(tmpDir)) {
    await fs.move(path.join(tmpDir, entry), path.join(config.targetDir, entry), {
      overwrite: true,
    });
  }
  await fs.remove(tmpDir);

  // The template names package.json after -n — fix it to the folder name.
  const packageJsonPath = path.join(config.targetDir, 'package.json');
  const packageJson = await fs.readJson(packageJsonPath);
  packageJson.name = path.basename(config.targetDir);
  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

  spinner.stop('Project scaffolded');
}

// ---------------------------------------------------------------------------
// Step 2 — shadcn components (always @latest, live registry)
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

export async function addShadcnComponents(config, spinner) {
  const runner = shadcnRunner(config.pm);
  const { components } = config;

  if (components.includes(ALL_COMPONENTS)) {
    // `--all` resolves against the live registry, so this is always
    // literally every shadcn component — no hardcoded list to maintain.
    spinner.start('Adding all shadcn components...');
    await execa(runner.cmd, [...runner.prefix, 'add', '-y', '-o', '--all'], {
      cwd: config.targetDir,
      stdio: 'inherit',
    });
    spinner.stop('shadcn ready (entire registry)');
    return;
  }

  if (components.length > 0) {
    spinner.start('Adding shadcn components...');
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
// Step 4 — git. The template already inits a repo, so --no-git removes it.
// ---------------------------------------------------------------------------

export async function initGit(config) {
  const gitDir = path.join(config.targetDir, '.git');

  if (!config.git) {
    await fs.remove(gitDir);
    return;
  }

  if (await fs.pathExists(gitDir)) return;

  try {
    await execa('git', ['init'], { cwd: config.targetDir });
  } catch {
    // git is not installed — silently continue without it
  }
}
