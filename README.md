# Terminal Eighty Blog Architecture

Welcome to **Terminal Eighty**, a high-performance, $0/month, self-hosted blog stack designed for Raspberry Pi. It replaces bloated, database-heavy platforms (like Ghost or WordPress) with a hyper-fast static site generator and a lightweight Node.js admin panel.

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
