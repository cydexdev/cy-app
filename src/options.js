import path from 'node:path';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import validateName from 'validate-npm-package-name';
import chalk from 'chalk';
import { DIVIDER } from './banner.js';
import {
  ALL_COMPONENTS,
  CORE_COMPONENTS,
  EXTRA_COMPONENTS,
  PRESETS,
  PRESET_GUIDE,
} from './presets.js';

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

export function parseCli() {
  const program = new Command();

  program
    .name('cy-app')
    .description('Scaffold a fresh Next.js + shadcn project in one command')
    .argument('[project-name]', 'folder to create, or "." for the current folder')
    .option('--pm <manager>', 'package manager (npm | pnpm | yarn | bun)', 'npm')
    .option('--preset <name>', `preset (${PRESETS.join(' | ')} | custom)`, undefined)
    .option('--database <provider>', 'database provider (none | supabase)', undefined)
    .option('--animations', 'add Motion + GSAP animation libraries')
    .option('--no-theme', 'skip the mode toggle (theme itself comes from the template)')
    .option('--shadcn-preset <code>', 'shadcn design preset code (from ui.shadcn.com/create)', 'bJiC')
    .option('--no-git', 'skip git init')
    .option('--yes', 'skip all prompts and use defaults')
    .version('0.1.0')
    .parse();

  return { program, opts: program.opts(), argName: program.args[0] };
}

// ---------------------------------------------------------------------------
// Guided prompts — numbered steps with arrow-key navigation.
// ---------------------------------------------------------------------------

function createStepper() {
  let step = 0;
  return (message) => {
    step += 1;
    console.log(chalk.dim(DIVIDER));
    return `Step ${step} — ${message}`;
  };
}

async function askProjectName(step, fallback) {
  if (fallback) return fallback;

  const name = await p.text({
    message: step('Project name?'),
    placeholder: 'my-app',
    validate: (value) => {
      if (!value) return 'Project name is required';
      if (!validateName(value).validForNewPackages) {
        return 'Please enter a valid folder name';
      }
    },
  });
  if (p.isCancel(name)) process.exit(0);
  return name;
}

async function askPackageManager(step) {
  const pm = await p.select({
    message: step('Which package manager?'),
    options: [
      { value: 'bun', label: 'bun', hint: 'fastest' },
      { value: 'pnpm', label: 'pnpm', hint: 'fast, disk-efficient' },
      { value: 'npm', label: 'npm', hint: 'default' },
      { value: 'yarn', label: 'yarn', hint: 'classic' },
    ],
    initialValue: 'bun',
  });
  if (p.isCancel(pm)) process.exit(0);
  return pm;
}

async function askPreset(step) {
  // Explain the presets first, then ask — so the choice is always informed.
  p.note(PRESET_GUIDE, 'Presets');

  const preset = await p.select({
    message: step('Which preset?'),
    options: [
      { value: 'minimal', label: 'Minimal', hint: 'Next.js + shadcn only' },
      { value: 'standard', label: 'Standard', hint: 'All components + Motion (recommended)' },
      { value: 'full', label: 'Full', hint: 'absolutely everything' },
      { value: 'custom', label: 'Custom', hint: 'I want to pick everything' },
    ],
    initialValue: 'standard',
  });
  if (p.isCancel(preset)) process.exit(0);
  return preset;
}

async function askCustomOptions(step, defaultShadcnPreset) {
  const shadcnPreset = await p.text({
    message: step('shadcn preset code? (recommended: bJiC — your default)'),
    initialValue: defaultShadcnPreset,
    validate: (value) => {
      if (!value) return 'Preset code is required';
    },
  });
  if (p.isCancel(shadcnPreset)) process.exit(0);

  const database = await p.select({
    message: step('Database provider?'),
    options: [
      { value: 'none', label: 'None', hint: 'no database' },
      { value: 'supabase', label: 'Supabase', hint: 'client + server helpers included' },
    ],
    initialValue: 'none',
  });
  if (p.isCancel(database)) process.exit(0);

  const animations = await p.multiselect({
    message: step('Animation libraries? (space to toggle, enter to confirm)'),
    options: [
      { value: 'motion', label: 'Motion', hint: 'declarative React animations' },
      { value: 'gsap', label: 'GSAP', hint: 'timeline-grade animation power' },
    ],
    initialValues: [],
    required: false,
  });
  if (p.isCancel(animations)) process.exit(0);

  const components = await p.multiselect({
    message: step('shadcn components? (press A for all, space to toggle)'),
    options: [
      { value: ALL_COMPONENTS, label: 'All components', hint: 'entire shadcn registry' },
      ...[...CORE_COMPONENTS, ...EXTRA_COMPONENTS].map((name) => ({
        value: name,
        label: name,
      })),
    ],
    initialValues: [],
    required: false,
  });
  if (p.isCancel(components)) process.exit(0);

  const git = await p.confirm({
    message: step('Initialize a git repository?'),
    initialValue: true,
  });
  if (p.isCancel(git)) process.exit(0);

  const theme = await p.confirm({
    message: step('Add dark-mode theme? (next-themes + toggle, layout wired)'),
    initialValue: true,
  });
  if (p.isCancel(theme)) process.exit(0);

  return {
    shadcnPreset,
    database,
    animations,
    // "All components" wins over any individual picks.
    components: components.includes(ALL_COMPONENTS) ? [ALL_COMPONENTS] : components,
    git,
    theme,
  };
}

// ---------------------------------------------------------------------------
// Resolve the final config from flags + prompts
// ---------------------------------------------------------------------------

const PRESET_DEFAULTS = {
  minimal: {
    database: 'none',
    animations: [],
    components: [...CORE_COMPONENTS],
  },
  standard: {
    database: 'none',
    animations: ['motion'],
    components: [ALL_COMPONENTS],
  },
  full: {
    database: 'supabase',
    animations: ['motion', 'gsap'],
    components: [ALL_COMPONENTS],
  },
};

export async function resolveConfig() {
  const { program, opts, argName } = parseCli();
  const explicit = (name) => program.getOptionValueSource(name) === 'cli';
  const step = createStepper();

  printIntro();

  const projectName = opts.yes
    ? mustHaveName(argName)
    : await askProjectName(step, argName);

  const targetDir = path.resolve(process.cwd(), projectName);

  const pm =
    opts.yes || explicit('pm') ? normalizePm(opts.pm) : await askPackageManager(step);

  // Preset: explicit flag wins; otherwise prompt (with guide) unless --yes.
  let preset = opts.preset;
  if (preset && ![...PRESETS, 'custom'].includes(preset)) {
    p.cancel(`Unknown preset "${preset}". Choose one of: ${[...PRESETS, 'custom'].join(', ')}`);
    process.exit(1);
  }
  if (!preset) {
    preset = opts.yes ? 'standard' : await askPreset(step);
  }

  // Start from the preset, then let explicit flags override it.
  const base =
    preset === 'custom'
      ? { database: 'none', animations: [], components: [...CORE_COMPONENTS] }
      : { ...PRESET_DEFAULTS[preset] };

  let { database, animations, components } = base;
  let git = opts.git;
  let shadcnPreset = opts.shadcnPreset;
  let theme = opts.theme;

  if (preset === 'custom' && !opts.yes) {
    const custom = await askCustomOptions(step, opts.shadcnPreset);
    shadcnPreset = custom.shadcnPreset;
    theme = custom.theme;
    database = custom.database;
    animations = custom.animations;
    components = custom.components;
    git = custom.git;
  }

  if (explicit('database')) {
    database = normalizeDatabase(opts.database);
  }
  if (opts.animations) {
    animations = ['motion', 'gsap'];
  }

  p.note(
    [
      `Project:    ${projectName}`,
      `Preset:     ${preset}`,
      `PM:         ${pm}`,
      `shadcn:     ${describeComponents(components)} (preset ${shadcnPreset})`,
      `Theme:      ${theme ? 'mode toggle included' : 'off'}`,
      `Database:   ${database}`,
      `Animations: ${animations.length ? animations.join(' + ') : 'none'}`,
      `Git:        ${git ? 'yes' : 'no'}`,
    ].join('\n'),
    'Summary — here is what will be installed'
  );

  return { projectName, targetDir, pm, preset, database, animations, components, shadcnPreset, theme, git };
}

function printIntro() {
  console.log(`${chalk.cyan('■')} ${chalk.bold('Guided setup')}`);
  console.log(chalk.dim('  Answer a few questions'));
}

function describeComponents(components) {
  if (components.includes(ALL_COMPONENTS)) return 'entire registry';
  if (components.length === 0) return 'base only';
  return `${components.length} components`;
}

function mustHaveName(argName) {
  if (!argName) {
    p.cancel('Project name is required: npx cy-app my-app');
    process.exit(1);
  }
  return argName;
}

function normalizePm(pm) {
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(pm)) {
    p.cancel(`Unknown package manager "${pm}". Choose one of: npm, pnpm, yarn, bun`);
    process.exit(1);
  }
  return pm;
}

function normalizeDatabase(db) {
  if (!['none', 'supabase'].includes(db)) {
    p.cancel(`Unknown database "${db}". Choose one of: none, supabase`);
    process.exit(1);
  }
  return db;
}
