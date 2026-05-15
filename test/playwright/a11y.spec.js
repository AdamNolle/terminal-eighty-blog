// @ts-check
/**
 * axe-core accessibility audit for the public site.
 *
 * Gate: zero serious/critical violations. Moderate/minor are reported
 * but don't fail the build (we want signal without churn on hue tweaks).
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/about/', '/bye-bye-dji/'];

for (const route of PAGES) {
  test(`a11y: ${route} has no serious/critical violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    if (blocking.length) {
      // Detailed report for the CI log
      console.error(`Accessibility violations on ${route}:`);
      for (const v of blocking) {
        console.error(`  [${v.impact}] ${v.id}: ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.error(`    target: ${node.target.join(' ')}`);
        }
      }
    }

    expect(blocking, `${route} should have no serious/critical a11y violations`).toEqual([]);
  });
}
