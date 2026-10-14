import chalk from 'chalk';

/**
 * cy-app ASCII banner — custom ANSI Shadow artwork, baked in.
 * Rendered as a solid single-color fill.
 */
const ART_LINES = [
  '  ██████╗██╗   ██╗         ██████╗  ██████╗  ██████╗',
  '██╔═════╝██║   ██║       ██╔═══██║  ██╔═══██╗██╔═══██╗',
  '██║      ██║   ██║       ██║   ██║  ██║   ██║██║   ██║',
  '╚═██████╗╚═██████║       ╚═████████╗██████╔═╝██████╔═╝',
  '  ╚═════╝  ╚═══██║         ╚═══════╝██╔═══╝  ██╔═══╝',
  '           ████╔═╝                  ██║      ██║',
  '           ╚═══╝                    ╚═╝      ╚═╝',
];

// Solid fill color — white. Change this hex to restyle the banner.
const FILL = '#ffffff';

// Thin divider matching the prompt boxes.
export const DIVIDER = '─'.repeat(12);

export function showBanner() {
  for (const line of ART_LINES) {
    console.log(chalk.bold.hex(FILL)(line));
  }
  console.log(chalk.dim(DIVIDER));
  console.log();
}
