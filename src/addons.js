import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import * as p from '@clack/prompts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Install packages with the user's package manager. */
async function installPackages(config, packages) {
  const args = config.pm === 'npm' ? ['install', ...packages] : ['add', ...packages];
  await execa(config.pm, args, { cwd: config.targetDir, stdio: 'inherit' });
}

// ---------------------------------------------------------------------------
// --database supabase
// Adds @supabase/ssr with ready-made browser + server clients.
// ---------------------------------------------------------------------------

const SUPABASE_CLIENT = `import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
`;

const SUPABASE_SERVER = `import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — the Proxy refreshes the session.
          }
        },
      },
    }
  );
}
`;

// Refreshes the Auth session on every request (Next 16 Proxy convention).
// Uses getClaims() (verified) — never trust getSession() in server code.
const SUPABASE_SESSION = `import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Supabase keys not configured yet (fresh scaffold without .env.local)?
  // Skip the session refresh so the app still runs — it activates
  // automatically once the keys are added.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers?: unknown) {
          // RequestCookies only accepts (key, value) or a single cookie
          // object — so options are spread into the object form.
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({
              name,
              value,
              ...options,
            } as { name: string; value: string })
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          // Prevent CDNs from caching authenticated responses.
          if (headers && typeof headers === 'object') {
            for (const [key, value] of Object.entries(headers)) {
              if (typeof value === 'string') supabaseResponse.headers.set(key, value);
            }
          }
        },
      },
    }
  );

  await supabase.auth.getClaims();

  return supabaseResponse;
}
`;

const SUPABASE_PROXY = `import type { NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
`;

// Server-only admin client — bypasses RLS. NEVER import in Client Components.
const SUPABASE_ADMIN = `import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient is server-only and must never run in the browser.');
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );
}
`;

const SUPABASE_ENV = `
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
# Server-only — never expose to the browser (no NEXT_PUBLIC prefix).
SUPABASE_SECRET_KEY=your-secret-key
`;

export async function setupSupabase(config, spinner) {
  spinner.start('Adding Supabase (client + server)...');

  await installPackages(config, ['@supabase/supabase-js@latest', '@supabase/ssr@latest']);

  await fs.outputFile(
    path.join(config.targetDir, 'lib', 'supabase', 'client.ts'),
    SUPABASE_CLIENT
  );
  await fs.outputFile(
    path.join(config.targetDir, 'lib', 'supabase', 'server.ts'),
    SUPABASE_SERVER
  );
  await fs.outputFile(
    path.join(config.targetDir, 'lib', 'supabase', 'proxy.ts'),
    SUPABASE_SESSION
  );
  await fs.outputFile(path.join(config.targetDir, 'proxy.ts'), SUPABASE_PROXY);
  await fs.outputFile(
    path.join(config.targetDir, 'lib', 'supabase', 'admin.ts'),
    SUPABASE_ADMIN
  );

  const envExample = path.join(config.targetDir, '.env.example');
  const current = (await fs.pathExists(envExample))
    ? await fs.readFile(envExample, 'utf8')
    : '';
  if (!current.includes('NEXT_PUBLIC_SUPABASE_URL')) {
    await fs.writeFile(envExample, `${current.trim()}\n${SUPABASE_ENV}`.trimStart());
  }

  spinner.stop('Supabase ready — fill in .env.local to use it');
}

// ---------------------------------------------------------------------------
// --animations (motion and/or gsap)
// Installs the libraries and adds a small shared helper module.
// ---------------------------------------------------------------------------

function buildAnimationsModule(animations) {
  const imports = [];
  const body = [];

  if (animations.includes('motion')) {
    imports.push(`import type { Variants } from 'motion/react';`);
    body.push(`/** Shared Motion variants — import where you need them. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};`);
  }

  if (animations.includes('gsap')) {
    imports.push(`import { gsap } from 'gsap';`);
    body.push(`export { gsap };`);
  }

  body.push(`/** Respect users who prefer reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
`);

  return [...imports, '', ...body].join('\n') + '\n';
}

export async function setupAnimations(config, spinner) {
  const { animations } = config;
  spinner.start(`Adding animations (${animations.join(' + ')})...`);

  const packages = [];
  if (animations.includes('motion')) packages.push('motion@latest');
  if (animations.includes('gsap')) packages.push('gsap@latest');
  await installPackages(config, packages);

  await fs.outputFile(
    path.join(config.targetDir, 'lib', 'animations.ts'),
    buildAnimationsModule(animations)
  );

  spinner.stop('Animation libraries ready');
}

// ---------------------------------------------------------------------------
// Dark-mode theme (official shadcn recipe):
// next-themes + ThemeProvider + ModeToggle + root layout wiring.
// ---------------------------------------------------------------------------

const THEME_PROVIDER = `"use client";

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
`;

const MODE_TOGGLE = `"use client";

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" disabled>
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
`;

const THEME_IMPORT_ANCHOR = 'import "./globals.css";';
const THEME_IMPORT_LINE = 'import { ThemeProvider } from "@/components/theme-provider";';
const THEME_WRAPPER_OPEN =
  '<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>';
const THEME_WRAPPER_CLOSE = '</ThemeProvider>';

/**
 * Patches app/layout.tsx: provider import, suppressHydrationWarning,
 * and ThemeProvider wrapping {children}. Returns true on success.
 * Anything unexpected -> false, and the caller prints manual steps.
 */
async function patchRootLayout(targetDir) {
  const layoutPath = path.join(targetDir, 'app', 'layout.tsx');
  if (!(await fs.pathExists(layoutPath))) return false;

  const original = await fs.readFile(layoutPath, 'utf8');
  if (original.includes(THEME_WRAPPER_OPEN)) return true; // already wired
  if (
    !original.includes(THEME_IMPORT_ANCHOR) ||
    !original.includes('<html') ||
    !original.includes('{children}')
  ) {
    return false;
  }

  const patched = original
    .replace(THEME_IMPORT_ANCHOR, `${THEME_IMPORT_ANCHOR}\n${THEME_IMPORT_LINE}`)
    .replace('<html', '<html suppressHydrationWarning')
    .replace('{children}', `${THEME_WRAPPER_OPEN}{children}${THEME_WRAPPER_CLOSE}`);

  if (
    !patched.includes(THEME_IMPORT_LINE) ||
    !patched.includes('suppressHydrationWarning') ||
    !patched.includes(THEME_WRAPPER_OPEN)
  ) {
    return false;
  }

  await fs.writeFile(layoutPath, patched);
  return true;
}

export async function setupTheme(config, spinner) {
  spinner.start('Adding dark-mode theme...');

  await installPackages(config, ['next-themes@latest', 'lucide-react@latest']);

  await fs.outputFile(
    path.join(config.targetDir, 'components', 'theme-provider.tsx'),
    THEME_PROVIDER
  );
  await fs.outputFile(
    path.join(config.targetDir, 'components', 'mode-toggle.tsx'),
    MODE_TOGGLE
  );

  if (await patchRootLayout(config.targetDir)) {
    spinner.stop('Dark-mode theme ready (layout wired)');
  } else {
    spinner.stop('Dark-mode theme files ready (layout needs manual wiring)');
    p.log.warn(
      'Could not patch app/layout.tsx automatically. Wrap {children} with ThemeProvider from @/components/theme-provider and add suppressHydrationWarning to <html>.'
    );
  }
}
