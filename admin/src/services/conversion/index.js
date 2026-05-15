// @ts-check
/**
 * conversion/index.js — handler registry + disk-path resolver.
 *
 * The worker dispatches each job to a handler keyed by `job.type`. New
 * pipelines (Phase 5b ffmpeg, Phase 5c PDF/code/archive) plug in here:
 * import their handler, drop it in the `handlers` map.
 *
 * Each handler is `async (ctx) => { conversions, mediaPatch }` where:
 *   ctx.row              — the parent media row
 *   ctx.diskPath         — absolute path to the original
 *   ctx.urlBase          — public URL prefix for the asset's directory
 *   ctx.diskDir          — absolute on-disk directory
 *   ctx.enqueueFollowupJob — optional callback for follow-up work
 *
 * `conversions` is merged into `media.conversions_json`; `mediaPatch`
 * can patch width/height/duration/mime_type on the media row.
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

import { processImage } from './image.js';
import { classifyMime } from '../../utils/mediaTypes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Placeholder handler for animated GIFs. Phase 5b will replace this with
 * an ffmpeg-driven MP4 + WebM transcode. For now we just no-op so the
 * `processing` flag clears and the original GIF stays servable.
 *
 * @returns {Promise<{ conversions: Record<string, string>, mediaPatch: Record<string, any> }>}
 */
async function gifPlaceholderHandler() {
  // Intentionally a no-op. The row is preserved at status='ready' once
  // this returns and the WebP/AVIF transcode catches up in Phase 5b.
  return { conversions: {}, mediaPatch: {} };
}

/**
 * Placeholder factory for handlers we haven't implemented yet. Phase 5b/c
 * will swap these out. We deliberately throw so a misrouted job (e.g.
 * an image upload that someone enqueued as 'video') is loud rather than
 * silently appearing successful.
 *
 * @param {string} kind
 */
function notImplemented(kind) {
  return async function notImplementedHandler() {
    throw new Error(`Conversion handler not yet implemented: ${kind}`);
  };
}

/**
 * Handler registry. Keys mirror the `type` column in `conversion_jobs`.
 *
 * @type {Record<string, (ctx: any) => Promise<{ conversions: Record<string, string>, mediaPatch: Record<string, any> } | void>>}
 */
export const handlers = {
  image: processImage,
  gif: gifPlaceholderHandler,
  // Phase 5b — replace these with the ffmpeg-backed transcoders.
  video: notImplemented('video'),
  audio: notImplemented('audio'),
  // Phase 5c — PDF text-extraction, code highlighting, archive listing.
  pdf: notImplemented('pdf'),
  code: notImplemented('code'),
  archive: notImplemented('archive'),
};

/**
 * Take a job row + DB handle, find the media row, and compute the
 * disk/url paths the handler needs. Returns null if the media row was
 * deleted between enqueue and run (the worker treats that as a hard
 * fail, but it's NOT something we want to retry).
 *
 * @param {Record<string, any>} job
 * @param {import('better-sqlite3').Database} db
 */
export function resolveDiskContext(job, db) {
  const row = db.prepare('SELECT * FROM media WHERE id = ?').get(job.media_id);
  if (!row) return null;
  const siteDir = process.env.SITE_DIR || join(__dirname, '..', '..', '..', '..', 'site');
  const staticDir = join(siteDir, 'static');
  const type = classifyMime(row.mime_type);
  const category = type === 'image' ? 'images' : 'files';
  const yyyymm = derivePathFromUploadedAt(row.uploaded_at);
  const diskDir = join(staticDir, category, yyyymm);
  const diskPath = join(diskDir, row.filename);
  const urlBase = `/${category}/${yyyymm}`;
  if (!existsSync(diskPath)) return null;
  return { row, diskPath, diskDir, urlBase };
}

/**
 * @param {number} uploadedAt
 */
function derivePathFromUploadedAt(uploadedAt) {
  const d = new Date(uploadedAt || Date.now());
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Barrel re-exports for callers that prefer a one-stop import.
export {
  enqueueJob,
  claimNext,
  markDone,
  markFailed,
  retryJob,
  latestJobForMedia,
  debugStats,
} from './queue.js';
export { startWorker, stopWorker, drainOnce, bindShutdownSignals } from './worker.js';
