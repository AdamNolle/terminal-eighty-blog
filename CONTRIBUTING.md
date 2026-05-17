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

You need Node 20 LTS or newer, Hugo extended ≥ 0.161, and Docker (for the
full-stack mode below). macOS, Linux, and WSL are all supported.

### Quickstart (full stack)

The Phase 5d scripts boot Hugo + admin + Remark42 + Umami + Postgres in one
command. Use this when you want to exercise the complete authoring loop.

```bash
npm install
cd admin && npm install && cd ..
cp docker/.env.dev.example docker/.env.dev
npm run db:seed          # admin user "admin" / "password" + 5 media fixtures
npm run dev:all          # Docker + hugo + admin in parallel, colored logs
```

| Script               | What it does                                                           |
| -------------------- | ---------------------------------------------------------------------- |
| `npm run dev:all`    | `run-p` over `dev:docker`, `dev:hugo`, `dev:admin` (the full stack)    |
| `npm run dev:docker` | Foreground `docker compose up` against `docker/docker-compose.dev.yml` |
| `npm run dev:hugo`   | `hugo server --buildDrafts --buildFuture` on port `1313`               |
| `npm run dev:admin`  | `node --watch server.js` in `admin/` on port `3000`                    |
| `npm run dev:check`  | Ping every service, print status table, exit non-zero on any failure   |
| `npm run db:seed`    | Idempotent — creates admin user + media fixtures                       |
| `npm run db:reset`   | Wipe dev DB + dev uploads, re-seed (prompts; pass `--yes` to skip)     |
| `npm run dev:stop`   | `docker compose down`                                                  |

Service ports (deliberately offset from prod so both compose files could
coexist on one host):

| Service   | Dev URL                 | Notes                                                 |
| --------- | ----------------------- | ----------------------------------------------------- |
| Hugo      | <http://localhost:1313> | Drafts + future posts visible                         |
| Admin CMS | <http://localhost:3000> | `admin` / `password` after `npm run db:seed`          |
| Remark42  | <http://localhost:8081> | Admin auth: user `admin`, password `admin`            |
| Umami     | <http://localhost:3001> | Admin/admin on first visit; will prompt to change pwd |
| Postgres  | `localhost:5433`        | Database `umami`, user `umami`                        |

### Passkeys in local dev

WebAuthn's `rpID` is set to `localhost` in dev, so passkeys work on every
modern browser without HTTPS. After logging in with the seeded password,
hit **Settings → Security → Register Passkey** to bind Touch ID / Windows
Hello to the dev admin user. The credential is stored in
`admin/data/auth-dev.db` and lost the next time you run `npm run db:reset`.

### Testing the conversion pipeline

Drop any file into the media library (`/media` in the admin) — the
conversion worker picks it up immediately and writes derived variants into
`site/static/images/<id>/` (images) or `site/static/files/<id>/` (video,
audio, PDF, archives). Watch the admin terminal — every job logs with the
`[conversion-worker]` prefix. If a job hangs, delete its row from the
`conversion_jobs` table:

```bash
sqlite3 admin/data/auth-dev.db \
  "DELETE FROM conversion_jobs WHERE status IN ('running', 'pending');"
```

The worker reads its claim cursor on the next tick, so deletes take effect
without restarting the admin.

### Testing oEmbed (Phase 6 sneak peek)

Paste a YouTube / Vimeo / Bluesky URL into the editor on a line by itself.
The TipTap embed extension (lands in Phase 6 — Phase 5d ships the
plumbing) calls the admin's `/api/embed?url=…` endpoint, which proxies to
the source oEmbed provider with a 5-second timeout.

### Light-loop alternative (no Docker)

If you only need the admin + Hugo (no comments/analytics), the legacy
two-terminal flow still works:

```bash
npm run dev:site         # hugo server on http://127.0.0.1:1414
npm run dev:admin        # admin CMS on http://localhost:3000
```

### Checks before pushing

```bash
npm run lint             # parallel: ESLint, Stylelint, Prettier, markdownlint, htmlhint, tsc
npm test                 # Vitest (site + dev scripts) + node --test (admin)
npm run build            # production Hugo build into site/public/
npm run fix              # auto-fixable: prettier --write + eslint --fix + stylelint --fix
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

## Editor shortcuts

The admin post editor (`/editor`) is a dual-mode TipTap + CodeMirror surface.
All of the shortcuts below are bound through TipTap's keymap (in WYSIWYG
mode) and CodeMirror's keymap (in Source mode). `Mod` means `Cmd` on
macOS / iPadOS and `Ctrl` everywhere else.

### Inline marks

| Shortcut      | Action                      |
| ------------- | --------------------------- |
| `Mod+B`       | Bold                        |
| `Mod+I`       | Italic                      |
| `Mod+Shift+U` | Underline                   |
| `Mod+Shift+X` | Strikethrough               |
| `Mod+E`       | Inline code                 |
| `Mod+K`       | Insert / edit link (dialog) |

### Block type

| Shortcut      | Action     |
| ------------- | ---------- |
| `Mod+Alt+1`   | Heading 1  |
| `Mod+Alt+2`   | Heading 2  |
| `Mod+Alt+3`   | Heading 3  |
| `Mod+Alt+0`   | Paragraph  |
| `Mod+Shift+B` | Blockquote |

### Lists

| Shortcut      | Action                   |
| ------------- | ------------------------ |
| `Mod+Shift+8` | Bullet list              |
| `Mod+Shift+7` | Ordered list             |
| `Mod+Shift+9` | Task list                |
| `Tab`         | Indent (sink list item)  |
| `Shift+Tab`   | Outdent (lift list item) |

### Insert

| Shortcut      | Action                         |
| ------------- | ------------------------------ |
| `Mod+Shift+H` | Horizontal rule                |
| `/`           | Open slash menu (block picker) |

The slash menu, opened by typing `/` inside the editor, offers headings
H1–H3, bullet/ordered/task lists, blockquote, code block, divider, table
(real 3×3 insert), inline + block math, info / tip / warn / danger
callouts, footnotes, and placeholder rows for image / file / embed
(Phases 4 / 6 / 7 wire each one). Navigate with `ArrowUp` / `ArrowDown`,
insert with `Enter`, dismiss with `Escape`.

### Editor block types

Beyond CommonMark, the Phase 3c editor authors five extended constructs.
Each round-trips through the same Markdown source the public site reads,
so what you type in the admin is what gets committed to the repo.

| Block              | Markdown source                                         | Notes                                                                                    |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Table              | `\| Col \| Col \|\n\| --- \| --- \|\n\| 1 \| 2 \|`      | GFM tables; first row is the header. Toolbar group shows in-context.                     |
| Inline math        | `$x^2$`                                                 | Single-line LaTeX. Rendered by KaTeX (CDN, lazy-loaded SRI-pinned).                      |
| Block math         | `$$\n\\sum_{i=0}^n i\n$$`                               | Display equation, centered.                                                              |
| Callout (info)     | `:::info\n…\n:::`                                       | Also `:::tip`, `:::warn`, `:::danger`. Public site renders `<aside.callout>`.            |
| Footnote           | `text[^id]\n\n[^id]: definition`                        | Auto-numbered; stable id round-trip.                                                     |
| Code with language | <code>\`\`\`js</code><br>`code…`<br><code>\`\`\`</code> | Pick from 13 grammars: js, ts, py, go, rust, html, css, json, bash, md, yaml, sql, diff. |

Click rendered math to open an inline edit textarea — blur (or `Cmd+Enter`)
commits, `Escape` cancels. Tables expose a context-aware toolbar group
(insert/delete row/col, delete table, toggle header) only when the cursor
is inside a table cell. Code blocks expose a language picker `<select>`
only when the cursor is inside a fenced block.

### History + actions

| Shortcut      | Action                   |
| ------------- | ------------------------ |
| `Mod+Z`       | Undo                     |
| `Mod+Shift+Z` | Redo                     |
| `Mod+S`       | Save the post            |
| `Mod+Enter`   | Save and trigger publish |

`Mod+S` and `Mod+Enter` are intercepted by the editor's keymap and
dispatched as `editor-save` / `editor-publish` custom events on
`#editor-root`. `admin/public/js/editor.js` listens for both and routes
them through its existing `savePost()` / `publishSite()` flow.

### Find & replace (Phase 3d)

| Shortcut      | Action                                  |
| ------------- | --------------------------------------- |
| `Mod+F`       | Open the in-editor find / replace modal |
| `Enter`       | Jump to the next match                  |
| `Shift+Enter` | Jump to the previous match              |
| `Alt+Enter`   | Replace the current match               |
| `Esc`         | Close the modal, clear highlights       |

The modal is pinned to the top-right of the editor pane (not the
browser's native find bar). Options live as inline checkboxes:

- **Aa** — case-sensitive
- **W** — whole word (regex `\b…\b`)
- **.\*** — interpret the query as a regular expression

The modal works in both **Rich** and **Markdown** modes — WYSIWYG uses
a ProseMirror decoration plugin to highlight matches in place, while
the Markdown source mode delegates to `@codemirror/search`'s
`findNext` / `replaceNext` / `replaceAll` commands.

Focus is trapped inside the modal; `Esc` returns focus to whatever was
focused before the modal opened (typically the editor surface).

### Block reorder (drag-handle)

Hover any top-level block (heading, paragraph, blockquote, code block,
table, image) to surface a `⋮⋮` grab handle in the left margin. Drag
the handle to drop the block at a new position — a blue line indicates
the drop target while dragging; the dragged block fades during the
gesture.

Keyboard alternative:

| Shortcut              | Action                                                     |
| --------------------- | ---------------------------------------------------------- |
| `Alt+Shift+ArrowUp`   | Move the top-level block containing the cursor up one slot |
| `Alt+Shift+ArrowDown` | Move the top-level block containing the cursor down        |

### TOC + SEO panels

Two toggleable right-side panels live between the editor pane and the
frontmatter sidebar. Their open/closed state persists to
`localStorage` per browser.

- **Table of contents** — auto-generated from every H1–H6 in the doc,
  indented by level. Click a heading to jump there + move the
  selection. The heading containing the cursor gets
  `aria-current="location"` and is visually highlighted.
- **SEO preview** — Google SERP-shaped snippet showing the rendered
  title, site URL with slug, and meta description (falls back to the
  first 160 chars of the post body when the meta description is
  empty). Two progress bars warn when the title exceeds 60 chars or the
  description exceeds 160 chars.

Topbar buttons (`≡` for TOC, `⌕` for SEO) toggle each panel. The aux
column is removed from the grid entirely when both panels are closed,
giving the editor the full main width.

### Status bar + autosave indicator

The editor pane has a fixed status bar at the bottom showing
`<words> · <chars> · <reading-time>`. Reading time uses the industry-
standard 250 wpm. Metrics update via `requestAnimationFrame` on every
input event so large pastes don't thrash the UI.

The autosave indicator (right side of the status bar) has four states:

| State    | Visual                       | Behaviour                                            |
| -------- | ---------------------------- | ---------------------------------------------------- |
| `idle`   | Muted grey pip               | No pending changes; this is the resting state        |
| `dirty`  | Warning-coloured pip         | Unsaved edits, autosave countdown running            |
| `saving` | Pulsing accent pip           | Save in flight                                       |
| `saved`  | Accent pip, soft background  | Last save succeeded — fades back to `idle` after 2 s |
| `error`  | Danger pip, clickable button | Last save failed — click or `Enter`/`Space` to retry |

The pip wraps the existing autosave write logic in `editor.js`. Custom
events fire on `#editor-root` so future Phase-4+ features (offline
queueing, federation hooks) can subscribe without monkey-patching:

| Event              | Detail         |
| ------------------ | -------------- |
| `autosave-dirty`   | (none)         |
| `autosave-start`   | (none)         |
| `autosave-success` | `{ filename }` |
| `autosave-error`   | `{ message }`  |

### Mode toggle

The editor toolbar's rightmost group toggles between **Rich** (WYSIWYG)
and **Markdown** (Source / CodeMirror) modes. Markdown round-trips
through the same parser/serializer pair the server uses, so switching
modes is a fixed point after the first normalisation pass.

## Known quirks

- **macOS dev + better-sqlite3**: the prebuilt binary in `admin/node_modules/`
  may have an ABI mismatch with Node 26. Admin tests detect this and skip with
  a descriptive reason — CI on Linux + Node 20 runs them for real. To fix
  locally: `cd admin && npm rebuild better-sqlite3`. (Phase 2 will bump the
  dependency to a Node-26-compatible version.)
- **Vitest + Node 26**: Node's experimental top-level `localStorage` shadows
  jsdom's. `site/test/setup.js` polyfills it.

## Phase 5e — CMS authoring extras

### Scheduled publishing

Add `publish_at: "2026-07-04T12:00:00Z"` to a draft's front-matter and
keep `draft: true`. A Pi cron (every 5 min) invokes
`scripts/promote-scheduled.sh`, which calls `node
admin/src/services/scheduler.js` to flip every past-due draft to
`draft: false` and commits + pushes the change. Hugo's next build picks
them up. The editor sidebar's **Schedule** panel surfaces this — a
"Scheduled" badge appears whenever a draft has a future `publish_at`.

To install the cron on the Pi (one-time):

```bash
*/5 * * * * /opt/terminal-eighty/scripts/promote-scheduled.sh \
    >> /var/log/terminal-eighty-scheduler.log 2>&1
```

The `--dry-run` flag prints what would change without writing.

### Draft preview links

`POST /api/posts/<filename>/preview` returns a 7-day signed HMAC-SHA256
JWT URL of the shape `https://terminaleighty.com/drafts/<slug>/?token=…`.
The secret is `SITE_SECRET` (falls back to `SESSION_SECRET`).

**Verification choice (deliberate for Phase 5e):** the JWT is issued by
the admin; verification is **expected to happen at the reverse-proxy
layer** (Caddy/Cloudflare Worker) using the same shared secret. Phase
5e ships the issuer only — the proxy work is a Phase 11+ follow-up
when drafts move behind the CDN edge. Until then, a draft URL anyone
gets is functionally a bearer token; treat the link itself as the
credential.

### Per-post custom CSS / JS — trust model

Front-matter fields `custom_css` and `custom_js` are rendered verbatim
into the page (`safeCSS` / `safeJS`).

**Trust model:** only authenticated admin users can write these fields
— `server.js` requires a valid session on `PUT /api/posts/*`. The
sanitization choice (none on write, `safeCSS`/`safeJS` pass-through on
render) is intentional: an admin who can write JS to the site already
controls the site, and stripping CSS/JS at write time would block
legitimate uses (per-post stylesheets, embed widgets). Compromise the
admin account and the attacker can already publish a malicious post —
custom CSS/JS doesn't expand the blast radius.

If you ever delegate write access to a less-trusted contributor,
either remove the fields from the UI or wrap them in a DOMPurify pass
before persistence.

### Shortcodes documentation

`admin/#/shortcodes` reads every file in `site/layouts/shortcodes/*.html`
and extracts the first Hugo comment block as documentation. The
convention is:

- Anything before a `---` separator → `doc`
- Anything after → `usage`

Keep these comments at the top of new shortcode templates so they show
up in the admin reference automatically.

### Activity log

Every CMS mutation writes a row to the `activity_log` SQLite table
(see `admin/src/db/migrations/004_activity_log.sql`). Writes are
fire-and-forget via `services/activity.js`, so a DB hiccup never
blocks a save. The dashboard widget surfaces the 10 most recent
entries; the dedicated `/admin/#/activity` page shows the latest 50
with optional `?action=...` and `?since=...` filters.

### Backup status

`scripts/backup.sh` writes a `~/.terminal-eighty/.last_backup`
timestamp on success. The dashboard reads it via `getBackupStatus` and
colour-codes the line:

- ok (≤24h)
- warn (24–36h)
- stale (>36h, shown in `--danger`)

Override the marker directory with `TE_STATE_DIR` if your Pi keeps
state outside `$HOME`.

### Redirects

Site-wide forwards live in `site/data/redirects.json`. The admin's
**Redirects** page wraps `GET/POST/PUT/DELETE /api/redirects`.
At build time, `scripts/dev/build-redirects.mjs` emits one static
HTML page per entry under `site/static/<from>/index.html` with a
meta-refresh + JS fallback + canonical link. `npm run build` and
`npm run build:check` invoke it automatically.

For **per-post** redirects (e.g. the post moved slug), prefer Hugo's
built-in `aliases:` front-matter field — those are auto-emitted by
Hugo and stay alongside the post.
