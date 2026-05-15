/**
 * Terminal Eighty CMS — Express Server
 *
 * Admin panel for managing the blog. Runs on the Pi, accessible via Cloudflare Tunnel.
 * Provides: post CRUD, media upload, git publish, auth (passkey + password), system health.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Route modules
import authRoutes from './src/routes/auth.js';
import postsRoutes from './src/routes/posts.js';
import mediaRoutes from './src/routes/media.js';
import publishRoutes from './src/routes/publish.js';
import healthRoutes from './src/routes/health.js';
// Phase 4: tiny migration runner — applies any pending DDL in
// `src/db/migrations/` (auth tables, media table, …) before we serve
// the first request. Safe to call on every boot; already-applied
// migrations are tracked in the `schema_migrations` table.
import { runMigrations } from './src/db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SITE_DIR = process.env.SITE_DIR || join(__dirname, '..', 'site');

// Run migrations before opening the listener so a fresh install never
// races a request against partial DDL.
try {
  const { applied, skipped } = runMigrations();
  if (applied.length) {
    console.log(
      `  · migrations applied: ${applied.join(', ')} (${skipped.length} already on file)`,
    );
  }
} catch (err) {
  console.error('Fatal: migrations failed to apply:', err);
  process.exit(1);
}

// Trust proxy (behind Caddy/Cloudflare)
app.set('trust proxy', 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to allow external images/scripts for now
  }),
);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'terminal-eighty-secret'));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: { error: 'Too many auth attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Static files (admin UI)
app.use(express.static(join(__dirname, 'public')));

// Phase 4: serve uploaded originals straight off the site's static
// tree. In production these are also baked into Hugo's output by the
// publish step; the admin process serves them directly so the library
// UI works the moment a file is uploaded — no `hugo build` round-trip.
// Mounting `images` and `files` as separate roots so we never expose
// the rest of `site/static/`.
app.use(
  '/images',
  express.static(join(SITE_DIR, 'static', 'images'), {
    fallthrough: false,
    maxAge: '7d',
  }),
);
app.use(
  '/files',
  express.static(join(SITE_DIR, 'static', 'files'), {
    fallthrough: false,
    maxAge: '7d',
  }),
);

// Auth routes (rate limited)
app.use('/auth', authLimiter, authRoutes);

// Auth middleware for API routes
app.use('/api', (req, res, next) => {
  const session = req.signedCookies?.session;
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const sessionData = JSON.parse(Buffer.from(session, 'base64').toString());
    if (sessionData.expires < Date.now()) {
      res.clearCookie('session');
      return res.status(401).json({ error: 'Session expired' });
    }
    req.user = sessionData;
    next();
  } catch {
    res.clearCookie('session');
    return res.status(401).json({ error: 'Invalid session' });
  }
});

// API routes
app.use('/api/posts', postsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/publish', publishRoutes);
app.use('/api/health', healthRoutes);

// SPA fallback — serve index.html for client-side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Export SITE_DIR for use in routes
export { SITE_DIR };

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ■ Terminal Eighty CMS`);
  console.log(`  ├─ Admin: http://localhost:${PORT}`);
  console.log(`  ├─ Site:  ${SITE_DIR}`);
  console.log(`  └─ Ready.\n`);
});
