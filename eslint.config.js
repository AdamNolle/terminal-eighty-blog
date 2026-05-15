// @ts-check
/**
 * ESLint 9 flat config for Terminal Eighty.
 *
 * Three lint surfaces:
 *   - admin/**\/*.js           Node 20 + ES modules ("type": "module" in admin)
 *   - site/static/js/*.js     Browser, IIFE-wrapped
 *   - migrate/**\/*.js         Node 20 CLI tooling
 *
 * Test files get vitest/node-test globals so describe/it/expect resolve.
 */

import js from '@eslint/js';
import promise from 'eslint-plugin-promise';
import security from 'eslint-plugin-security';
import n from 'eslint-plugin-n';
import jsdoc from 'eslint-plugin-jsdoc';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always'],
  'no-implicit-coercion': 'error',
  'security/detect-object-injection': 'warn',
};

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      '**/node_modules/**',
      'site/public/**',
      'site/resources/**',
      'admin/data/**',
      // admin/public/ lints below as a browser-IIFE block (Phase 2).
      'Blog/**',
      '.planning/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.lighthouseci/**',
      'docker/**',
    ],
  },

  // Base recommended
  js.configs.recommended,
  promise.configs['flat/recommended'],
  jsdoc.configs['flat/recommended'],

  // Admin service worker — separate globals from browser frontend.
  {
    files: ['admin/public/sw.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
    rules: {
      ...sharedRules,
      'promise/catch-or-return': 'off',
      'promise/always-return': 'off',
      'promise/no-nesting': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Admin browser frontend (Phase 2 — plain script IIFEs)
  {
    files: ['admin/public/js/**/*.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // CDN-loaded library; auth.js guards against `undefined`.
        SimpleWebAuthnBrowser: 'readonly',
        // common.js publishes to window.TE; other modules consume it.
        TE: 'readonly',
      },
    },
    rules: {
      ...sharedRules,
      // The /* global TE */ comment at the top of each module is the
      // canonical way to declare consumption. No further config needed.
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Admin (Node, ESM)
  {
    files: ['admin/**/*.js'],
    ignores: ['admin/public/**'],
    plugins: { security, n },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'n/no-missing-import': 'off', // Node ESM + bare specifiers
      'n/no-unpublished-import': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Site browser JS
  {
    files: ['site/static/js/**/*.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      ...sharedRules,
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Migrate CLI
  {
    files: ['migrate/**/*.js'],
    plugins: { security, n },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'n/no-missing-import': 'off',
      'n/no-unpublished-import': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Root-level JS configs (eslint.config.js, vitest.config.js, playwright.config.js)
  {
    files: ['*.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Tests — Vitest (site + admin frontend) + their setup helpers
  {
    files: ['site/test/**/*.js', 'admin/test/**/*.vitest.{test,spec}.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...sharedRules,
      'security/detect-object-injection': 'off',
      'promise/param-names': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Tests — Node built-in test runner (admin backend)
  {
    files: ['admin/test/**/*.test.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'security/detect-object-injection': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },

  // Playwright tests
  {
    files: ['test/playwright/**/*.spec.js'],
    plugins: { security },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'security/detect-object-injection': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/tag-lines': 'off',
    },
  },
];
