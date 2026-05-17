# Terminal Eighty Blog Architecture

[![Quality](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/quality.yml/badge.svg)](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/quality.yml)
[![E2E + a11y](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/e2e.yml/badge.svg)](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/e2e.yml)
[![Lighthouse](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/lighthouse.yml)
[![Deploy](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/deploy.yml/badge.svg)](https://github.com/AdamNolle/terminal-eighty-blog/actions/workflows/deploy.yml)

Welcome to **Terminal Eighty**, a high-performance, $0/month, self-hosted blog stack designed for Raspberry Pi. It replaces bloated, database-heavy platforms (like Ghost or WordPress) with a hyper-fast static site generator and a lightweight Node.js admin panel.

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development, the quality pipeline, and branch-protection setup.

## Quickstart (local dev)

A fresh clone runs the entire stack — Hugo, the admin CMS, Remark42, Umami,
and Postgres — on a laptop in one command.

```bash
git clone https://github.com/AdamNolle/terminal-eighty-blog
cd terminal-eighty-blog
npm install
cp docker/.env.dev.example docker/.env.dev
npm run db:seed       # creates admin user (admin / password) and 5 sample media rows
npm run dev:all       # docker (Remark42 + Umami + Postgres) + hugo + admin in parallel
```

Open:

- Public site: <http://localhost:1313>
- Admin: <http://localhost:3000> (log in: `admin` / `password`)
- Comments (Remark42): <http://localhost:8081> (admin user: `admin`)
- Analytics (Umami): <http://localhost:3001> (configure on first visit)

Operational scripts:

- `npm run dev:check` — ping every service, print a status table, non-zero on any failure
- `npm run db:reset` — wipe the local DB and dev uploads, then re-seed (prompts unless `--yes`)
- `npm run dev:stop` — shut down the Docker services

WebAuthn uses `rpID=localhost` in dev, so passkeys work without HTTPS on
every browser. Register one from **Settings → Security** after first login.

## The Stack

- **Site Generator**: Hugo (compiles Markdown into ultra-fast static HTML)
- **CMS Admin**: Custom Node.js/Express Dashboard with WebAuthn (Passkeys)
- **Analytics**: Umami (Self-hosted privacy-friendly analytics via PostgreSQL)
- **Comments**: Remark42 (Self-hosted privacy-focused commenting engine)
- **Reverse Proxy**: Caddy (Automatic HTTPS and routing)
- **Tunneling**: Cloudflare Tunnel (Exposes your Pi to the internet securely without port-forwarding)

## How It Works

1. You access the **Admin CMS** (`admin.yourdomain.com`) from your phone or laptop using Touch ID / Face ID.
2. You write a post using the WYSIWYG editor and hit `Save`. The post is saved as a `.md` file on the Raspberry Pi.
3. You click `[PUBLISH SITE]`. The CMS commits the markdown files to GitHub.
4. GitHub Actions automatically compiles the Hugo site and deploys it to GitHub Pages for free, global CDN hosting.
5. Visitors view your ultra-fast site while Umami and Remark42 handle analytics and comments via the Cloudflare Tunnel.

## Setup Instructions

### 1. Prerequisites

- A Raspberry Pi (or any Linux server)
- A Cloudflare account with a Domain name
- A GitHub account and a Personal Access Token (PAT)

### 2. Cloudflare Zero Trust

1. Create a Cloudflare Tunnel in Zero Trust.
2. Add Public Hostnames pointing to `http://caddy:80` for:
   - `admin.yourdomain.com`
   - `comments.yourdomain.com`
   - `analytics.yourdomain.com`

### 3. Pi Bootstrap

SSH into your fresh Raspberry Pi OS Lite and run:

```bash
wget https://raw.githubusercontent.com/YourUser/terminal-eighty-blog/main/scripts/bootstrap.sh
chmod +x bootstrap.sh
./bootstrap.sh
```

Follow the prompts to enter your GitHub PAT and Cloudflare Token. The script will install Docker, configure your environment secrets, and boot the entire stack!

### 4. Admin Setup

1. Go to `admin.yourdomain.com`
2. Create your first admin account.
3. Once logged in, click "Register Passkey" to bind your device (Face ID / Touch ID) for instant passwordless logins.

## Backups

The `bootstrap.sh` script automatically sets up daily automated backups of your SQLite Auth DB, PostgreSQL analytics, and Remark42 comments. These are encrypted using `age` and pushed to a private `terminal-eighty-backups` repository.

Enjoy your blazingly fast, fully-owned piece of the internet!
