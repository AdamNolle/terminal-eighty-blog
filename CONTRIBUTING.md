# Contributing to Terminal Eighty

Thanks for the interest. This is a personal blog stack, but the quality bar applies
to every contribution — including future-me.

## Layout

```text
.
├── site/        Hugo static site (public-facing blog)
│   ├── assets/  CSS pipeline
│   ├── content/ Markdown posts
│   ├── layouts/ Hugo Go templates
│   └── static/  Static assets including site/static/js/app.js
├── admin/       Express CMS (runs on the Pi, never deployed to Pages)
├── migrate/     One-shot Ghost → Hugo migrator
├── scripts/     Bootstrap, backup, restore, maintenance shell scripts
├── docker/      Compose stack for the Pi
└── test/        Cross-cutting Playwright + fixtures
```

## Local development

You need Node 20 LTS or newer and Hugo extended ≥ 0.161. macOS, Linux, and
WSL are all supported.

```bash
# one-time setup
npm install
cd admin && npm install && cd ..

# everyday loops
npm run dev:site         # hugo server on http://127.0.0.1:1414
npm run dev:admin        # admin CMS on http://localhost:3000

# checks before pushing
npm run lint             # parallel: ESLint, Stylelint, Prettier, markdownlint, htmlhint, tsc
npm test                 # Vitest (site) + node --test (admin)
npm run build            # production Hugo build into site/public/

# fix what's auto-fixable
npm run fix              # runs prettier --write + eslint --fix + stylelint --fix
```

## Quality gates that block a PR

Every push (any branch) and every PR to `main` runs three workflows. A PR cannot
merge until they're all green and a `@AdamNolle` review is approved.

| Workflow         | Trigger             | Time budget | Blocks merge? |
| ---------------- | ------------------- | ----------- | ------------- |
| `quality.yml`    | push, PR to main    | < 3 min     | yes           |
| `e2e.yml`        | PR to main, nightly | < 8 min     | yes           |
| `lighthouse.yml` | PR to main          | < 4 min     | yes           |
| `deploy.yml`     | push to main        | < 2 min     | n/a (deploys) |

`quality.yml` enforces:

- ESLint zero errors (`no-unused-vars`, `eqeqeq`, `prefer-const`,
  `promise/*`, `security/*`)
- Stylelint zero errors on `site/assets/css/*.css`
- Prettier formatting on all `*.{js,css,json,md}`
- `tsc --noEmit` with `@ts-check` + JSDoc on `admin/**/*.js` and
  `site/static/js/**/*.js`
- markdownlint on every `.md` outside `Blog/`, `.planning/`, and `site/content/`
- htmlhint on `admin/public/*.html` and `site/public/**/*.html` after a build
- shellcheck on `scripts/*.sh`
- Vitest suite for `site/static/js/app.js`
- Node built-in test runner for `admin/src/routes/*.js` against a real temp-file SQLite

`e2e.yml` enforces:

- Playwright smoke for `/`, `/about/`, `/bye-bye-dji/`, `/tags/tech/`, `/index.json`, etc.
- axe-core: zero `serious` or `critical` violations on the audited pages
- Microformat surfaces and JSON-LD parse on the post page

`lighthouse.yml` enforces:

- Performance ≥ 0.95
- Accessibility = 1.0
- Best Practices = 1.0
- SEO = 1.0

## Branch protection setup (repo admin only)

This is configured manually in GitHub, once per repo:

1. Go to **Settings → Branches → Add rule** for `main`.
2. Tick **Require a pull request before merging**.
3. Tick **Require status checks to pass** and select:
   - `Quality / Lint (lint:js)`
   - `Quality / Lint (lint:css)`
   - `Quality / Lint (lint:md)`
   - `Quality / Lint (lint:prettier)`
   - `Quality / Lint (lint:types)`
   - `Quality / Lint (lint:html-admin)`
   - `Quality / Lint (lint:html-site, depends on hugo build)`
   - `Quality / Shellcheck`
   - `Quality / Test (site / Vitest)`
   - `Quality / Test (admin / node --test)`
   - `E2E + a11y / Playwright (site + a11y)`
   - `Lighthouse / Lighthouse CI`
4. Tick **Require branches to be up to date before merging**.
5. Tick **Do not allow bypassing** if you want the rule to apply to admins too.

## Pre-commit hook

Husky runs lint-staged on every commit:

- `*.js` → `eslint --fix` + `prettier --write`
- `*.css` → `stylelint --fix` + `prettier --write`
- `*.md` → `markdownlint-cli2 --fix`
- `*.{json,html}` → `prettier --write`

If a hook blocks your commit, that's a feature — fix the underlying issue and
re-stage. Don't `--no-verify`.

## Commit message style

Short, declarative, no period. Match the existing log: `Phase 1.5: lint, test, and CI scaffolding`, `Fix UI spacing issue in editor toolbar`, etc. Group related changes into a single commit.

## Adding new tests

- **Public-site JS** (`site/static/js/*.js`) → add a `*.test.js` file under
  `site/test/`. Use Vitest + jsdom. Load `app.js` via the eval pattern in
  `site/test/app.test.js` if you need to drive the IIFE.
- **Admin backend** (`admin/src/routes/*.js`) → add a `*.test.js` file under
  `admin/test/`. Use Node's built-in `test` runner, an ephemeral `AUTH_DB_PATH`,
  and a real SQLite database. **Never mock `better-sqlite3`** — integration
  tests catch real schema mismatches.
- **Cross-cutting site behavior** → add a `*.spec.js` file under
  `test/playwright/`. The Hugo dev server starts automatically.

## Adding new lint rules

- **JS** → edit `eslint.config.js`. Prefer `error` for hard rules and `warn`
  for advisory ones.
- **CSS** → edit `.stylelintrc.json`.
- **Markdown** → edit `.markdownlint.json`.

If a rule turns out noisier than useful, downgrade rather than disable globally.

## Known quirks

- **macOS dev + better-sqlite3**: the prebuilt binary in `admin/node_modules/`
  may have an ABI mismatch with Node 26. Admin tests detect this and skip with
  a descriptive reason — CI on Linux + Node 20 runs them for real. To fix
  locally: `cd admin && npm rebuild better-sqlite3`. (Phase 2 will bump the
  dependency to a Node-26-compatible version.)
- **Vitest + Node 26**: Node's experimental top-level `localStorage` shadows
  jsdom's. `site/test/setup.js` polyfills it.
