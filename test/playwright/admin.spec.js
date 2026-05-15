// @ts-check
/**
 * Admin shell smoke tests — placeholder.
 *
 * Phase 2 redesigns the admin frontend (login.html, dashboard, editor).
 * Until that lands, hitting http://localhost:3000 requires a running
 * Express server with a configured DB. We skip these tests at the suite
 * level rather than racing infrastructure that doesn't exist yet.
 *
 * TODO(phase-2): Once the admin shell is redesigned, replace `test.skip`
 * with real tests:
 *   - login.html renders without console errors
 *   - dashboard loads /api/posts and renders rows
 *   - editor loads a post and serializes frontmatter on save
 */

import { test } from '@playwright/test';

test.skip('admin login renders (Phase 2 placeholder)', () => {});
test.skip('admin dashboard lists posts (Phase 2 placeholder)', () => {});
test.skip('admin editor loads and saves a post (Phase 2 placeholder)', () => {});
