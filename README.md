# cy-app

Scaffold a production-ready **Next.js + shadcn** project in one command — always latest, never stale.

```bash
npx cy-app my-app
```

[![npm version](https://img.shields.io/npm/v/cy-app)](https://www.npmjs.com/package/cy-app)
[![license: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Why cy-app?

Starting a new Next.js project the "right" way takes 30+ minutes every time: `create-next-app`, shadcn init, picking components, wiring Supabase (browser + server + proxy), adding animation libraries, env files, git. And static starters go stale within weeks.

cy-app is different:

- **Always latest** — it runs shadcn's official template (`init --template next`) at `@latest` on every run. There is no frozen template to rot.
- **Presets, not decisions** — pick Minimal, Standard, Full, or go Custom. Sensible defaults, zero config.
- **Real integrations, not stubs** — Supabase ships with browser, server, proxy, and admin clients. Animations ship with Motion, GSAP, and shared helpers.
- **Guided when you want it, silent when you don't** — arrow-key interactive setup, or one-line `--yes` for CI.

## Quick start

```bash
npx cy-app my-app
cd my-app
npm run dev
```

Or scaffold into the current (empty) folder:

```bash
mkdir my-app && cd my-app
npx cy-app .
```

Works with every runner: `npx`, `bunx`, `pnpm dlx`, `yarn dlx`.

## Usage

**Interactive (recommended first time)** — explains the presets, then asks step by step:

```bash
npx cy-app my-app
```

**Non-interactive** — for CI or when you know what you want:

```bash
npx cy-app my-app --yes                        # standard preset
npx cy-app my-app --yes --preset minimal       # Next.js + shadcn only
npx cy-app my-app --yes --preset full          # absolutely everything
npx cy-app my-app --yes --pm bun --no-git      # bun + no git init
```

**Shortcuts** — any flag overrides the preset:

```bash
npx cy-app my-app --database supabase   # add Supabase to any preset
npx cy-app my-app --animations          # add Motion + GSAP to any preset
npx cy-app my-app --shadcn-preset a1Dg5eFl  # use your own shadcn design preset
```

## Flags

| Flag | Default | Description |
| ---- | ------- | ----------- |
| `--pm <manager>` | `npm` | Package manager: `bun` \| `pnpm` \| `npm` \| `yarn` |
| `--preset <name>` | prompted | `minimal` \| `standard` \| `full` \| `custom` |
| `--shadcn-preset <code>` | `bJiC` | shadcn design preset code (see below) |
| `--database <provider>` | preset | `none` \| `supabase` |
| `--animations` | off | Add Motion + GSAP |
| `--no-theme` | — | Skip the mode toggle |
| `--no-git` | — | Skip `git init` |
| `--yes` | — | Skip all prompts (uses `standard`) |

## Presets

| Preset | Contents |
| ------ | -------- |
| `minimal` | Next.js (TypeScript, Tailwind v4, ESLint, App Router, no `src/`) + 5 core shadcn components (`button`, `card`, `input`, `dialog`, `sonner`) + dark-mode theme |
| `standard` | Everything in Minimal, but **all** shadcn components (via registry `--all`) + Motion + dark-mode theme, no database |
| `full` | Everything in Standard + Supabase (client + server + proxy + admin) + GSAP |
| `custom` | You pick everything: shadcn preset code, database, animation libraries, individual components (with an "All" shortcut), git |

## How it works

1. **Scaffold** — `shadcn init -y --template next --preset <code>` (official flow) creates the Next.js app (TypeScript, Tailwind v4, ESLint, App Router, `@/*` alias, no `src/`) and applies the design preset: theme provider with hotkey, wired layout, dark CSS, fonts. Run through the matching runner (`bunx --bun` / `pnpm dlx` / `npx`), which also picks the package manager.
2. **Components** — installs your picks, or `--all` for the entire live registry. shadcn's `add` rewrites `app/page.tsx` into a demo behind the scenes, so the official starter page is snapshotted first and restored afterwards. If a bulk install fails, it retries one by one and reports skips instead of sinking the setup.
3. **Template** — files in `template/` are copied over the fresh project (currently `.env.example`).
4. **Theme** — writes `components/mode-toggle.tsx` (Sun/Moon button). Skip with `--no-theme`.
5. **Animations** — installs `motion@latest` / `gsap@latest` and writes `lib/animations.ts` with shared `fadeUp` variants, a `gsap` re-export, and a `prefersReducedMotion()` helper.
6. **Database** — installs `@supabase/ssr` + `@supabase/supabase-js` and writes the full client set (see below), then appends keys to `.env.example`.
7. **git init** (unless `--no-git`).

## shadcn preset codes

A preset packs an entire shadcn design system (colors, theme, fonts, radius, icon library) into a short code. cy-app defaults to `bJiC`.

To use your own: design it at [ui.shadcn.com/create](https://ui.shadcn.com/create), copy the code, and pass it:

```bash
npx cy-app my-app --shadcn-preset YOUR_CODE
```

## Dark-mode theme

The template ships dark-mode CSS variables (`.dark` selector in `globals.css`) plus a wired `ThemeProvider` (system-aware, class attribute) with a `D`-key hotkey. cy-app adds the missing piece:

- `components/mode-toggle.tsx` — Sun/Moon toggle button (hydration-safe, no extra component deps)

Drop `<ModeToggle />` anywhere (e.g. the navbar) and it just works. Disable with `--no-theme`.

## Supabase integration

Generated projects get a complete, docs-current setup (`@supabase/ssr` cookie-based auth):

| File | Purpose |
| ---- | ------- |
| `lib/supabase/client.ts` | Browser client for Client Components |
| `lib/supabase/server.ts` | Server client for Server Components, Actions, Route Handlers |
| `lib/supabase/proxy.ts` | `updateSession()` — refreshes the Auth session on every request via verified `getClaims()` |
| `proxy.ts` | Next.js 16 Proxy entrypoint with static-asset matcher |
| `lib/supabase/admin.ts` | Server-only admin client (bypasses RLS — never import in the browser) |

Environment (`.env.example` → copy to `.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key   # server-only, no NEXT_PUBLIC prefix
```

If the keys are missing, the Proxy silently skips session refresh so the app still runs — auth activates automatically once keys are added.

## Generated project structure

```text
my-app/
├── app/                 # App Router (page, layout, globals.css)
├── components/ui/       # shadcn components
├── hooks/               # e.g. use-mobile
├── lib/
│   ├── animations.ts    # Motion and/or GSAP helpers (with --animations)
│   ├── supabase/        # client, server, proxy, admin (with --database supabase)
│   └── utils.ts         # shadcn cn() helper
├── proxy.ts             # Supabase session refresh (with --database supabase)
├── components.json      # shadcn config
└── .env.example         # copy to .env.local and fill in
```

## Customization

Fork it and make it yours:

- `src/presets.js` — preset contents and component lists.
- `template/` — any file placed here is copied over every new project.
- `src/addons.js` — follow the Supabase example to add new providers.
- `src/options.js` — questions, flags, and the guided flow.

## Requirements

- Node.js >= 18
- One of: npm, pnpm, yarn, or bun

## Local development

```bash
npm install
node ./bin/cli.js test-app --yes --no-git   # scaffold a test project
node scripts/check-turkish.mjs               # repo must stay English-only
```

## License

MIT
