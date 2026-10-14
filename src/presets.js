/**
 * Shared constants: presets and shadcn component lists.
 * Edit these to change what each preset installs.
 *
 * Note: the "full" preset and the "All components" prompt option do NOT use
 * these lists — they pass `--all` to the shadcn CLI, which always resolves to
 * every component in the current registry. These lists only drive the
 * interactive picker and the minimal/standard presets, so they never go stale.
 */

export const PRESETS = ['minimal', 'standard', 'full'];

/** Sentinel value meaning "install the entire shadcn registry". */
export const ALL_COMPONENTS = '__all__';

/** One-line explanations shown before the preset question. */
export const PRESET_GUIDE = [
  'minimal   — Next.js + 5 core shadcn components. Lean and fast.',
  'standard  — All shadcn components + Motion. Recommended.',
  'full      — Everything: Supabase + Motion + GSAP + ALL shadcn components.',
  'custom    — Pick every option yourself, step by step.',
].join('\n');

/** Always installed, even for the minimal preset. */
export const CORE_COMPONENTS = ['button', 'card', 'input', 'dialog', 'sonner'];

/** Offered in the custom picker on top of CORE. */
export const EXTRA_COMPONENTS = [
  'accordion',
  'avatar',
  'badge',
  'dropdown-menu',
  'form',
  'label',
  'select',
  'separator',
  'sheet',
  'skeleton',
  'table',
  'tabs',
  'textarea',
  'tooltip',
];
