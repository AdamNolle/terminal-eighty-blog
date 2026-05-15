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
    include: ['site/test/**/*.{test,spec}.js'],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'test/playwright/**',
      'admin/test/**',
      'Blog/**',
      'site/public/**',
      'site/test/setup.js',
    ],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['site/static/js/**/*.js'],
      exclude: ['site/static/js/**/*.test.js'],
    },
  },
});
