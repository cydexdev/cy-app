import fs from 'fs-extra';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import { showBanner } from './banner.js';
import { resolveConfig } from './options.js';
import { scaffoldNextJs, setupShadcn, applyTemplate, initGit } from './scaffold.js';
import { setupSupabase, setupAnimations } from './addons.js';

// ---------------------------------------------------------------------------
// create-cy-app — orchestrates the whole scaffolding flow.
// Each step lives in its own module so this file stays readable.
// ---------------------------------------------------------------------------

export async function run() {
  showBanner();

  const config = await resolveConfig();
  await abortIfTargetNotEmpty(config);

  const spinner = p.spinner();

  try {
    await scaffoldNextJs(config, spinner);

    if (config.shadcn) {
      await setupShadcn(config, spinner);
    }

    await applyTemplate(config, spinner);

    if (config.animations.length > 0) {
      await setupAnimations(config, spinner);
    }

    if (config.database === 'supabase') {
      await setupSupabase(config, spinner);
    }

    await initGit(config);

    printOutro(config);
  } catch (error) {
    spinner.stop('Something went wrong');
    throw error;
  }
}

async function abortIfTargetNotEmpty(config) {
  if (!(await fs.pathExists(config.targetDir))) return;

  const files = await fs.readdir(config.targetDir);
  if (files.length > 0) {
    p.cancel(`Folder is not empty: ${config.targetDir} — pick an empty folder name.`);
    process.exit(1);
  }
}

function printOutro(config) {
  const devCommand = config.pm === 'npm' ? 'npm run dev' : `${config.pm} dev`;

  console.log(`${chalk.green('■')} ${chalk.bold('Done! Your project is ready.')}`);
  console.log('');
  if (config.projectName !== '.') {
    console.log(`  cd ${config.projectName}`);
  }
  console.log(`  ${devCommand}`);

  if (config.database === 'supabase') {
    console.log('');
    console.log('  Supabase: copy .env.example to .env.local and add your keys.');
  }
  console.log('');
}
