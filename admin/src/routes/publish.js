// @ts-check
/**
 * publish.js — Git publish trigger.
 *
 * Phase 6: before committing, refreshes `site/data/media.json` so the
 * Hugo `attachment` shortcode can resolve media ids from the data tree.
 * The write is best-effort — a serialisation failure logs a warning but
 * doesn't block the publish (a stale `media.json` is still a valid
 * state, attachments just won't pick up the latest uploads).
 */

import { Router } from 'express';
import { publishChanges, getGitStatus } from '../utils/git.js';
import { writeMediaData } from '../services/publish-media-data.js';

const router = Router();

// Trigger publish (commit + push)
router.post('/', async (req, res) => {
  try {
    // Phase 6: refresh the media data file before staging. Failures are
    // logged but never block the publish — the data file is a cache
    // layer over the DB, and a stale write is preferable to a missed
    // commit of the user's actual content.
    try {
      const stats = writeMediaData();
      console.log(
        `[publish] media.json: ${stats.count} entries (${stats.skipped} skipped, ${stats.total} total)`,
      );
    } catch (err) {
      console.warn('[publish] media.json refresh failed (continuing):', err.message);
    }
    const result = await publishChanges();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get publish status (uncommitted changes, etc.)
router.get('/status', async (req, res) => {
  try {
    const status = await getGitStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
