// @ts-check
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
        pretendToBeVisual: true,
      },
    },
    globals: false,
    setupFiles: ['site/test/setup.js'],
    include: [
      'site/test/**/*.{test,spec}.js',
      // Phase 2: admin frontend Vitest tests. The node:test runner
      // under admin/test/auth.test.js stays the place for integration
      // tests that talk to SQLite; admin frontend modules use the
      // `*.vitest.test.js` suffix to keep the boundary explicit.
      'admin/test/**/*.vitest.{test,spec}.js',
    ],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'test/playwright/**',
      // node:test runner handles this one (admin/package.json scripts).
      'admin/test/auth.test.js',
      'Blog/**',
      'site/public/**',
      'site/test/setup.js',
    ],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['site/static/js/**/*.js', 'admin/public/js/**/*.js'],
      exclude: ['site/static/js/**/*.test.js'],
    },
  },
});
