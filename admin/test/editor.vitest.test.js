// @ts-nocheck
/**
 * Vitest unit + integration tests for the Phase 3a editor.
 *
 * Two surfaces under test:
 *
 *   1. admin/src/utils/markdown.js — pure Node parser/serializer pair
 *      that mirrors the TipTap-shaped schema. Used by the server and
 *      by the round-trip fixture test.
 *
 *   2. admin/public/js/editor.entry.js — bundled into editor.bundle.js
 *      for production, but importable directly here because Vitest's
 *      Vite resolver walks up to admin/node_modules for bare specifiers.
 *      We mount it inside jsdom with the same Range polyfills TipTap
 *      needs to survive contentEditable in a non-browser environment.
 *
 * Round-trip rules under test:
 *   - parse(markdown) → ProseMirror doc (TipTap-shaped)
 *   - serialize(doc)  → Markdown
 *   - For a representative blog post, the second round-trip is a
 *     fixed point: serialize(parse(serialize(parse(s)))) === serialize(parse(s))
 *     (perfect byte-equality with the source isn't always achievable —
 *     CommonMark normalises bullet markers, blank lines, etc. — but
 *     stability across repeated round-trips is the contract.)
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

import { parseMarkdown, serializeMarkdown, normalizeMarkdown } from '../src/utils/markdown.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── jsdom shims for ProseMirror ─────────────────────────────────
//
// ProseMirror's view layer calls `Range#getBoundingClientRect()` and
// related layout APIs that jsdom either doesn't implement or returns
// zeros for. The Editor still works for our tests as long as those
// calls don't throw, so we install minimal stubs.
function installProseMirrorPolyfills() {
  if (typeof window === 'undefined') return;
  const NOOP_RECT = () => ({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {
      return this;
    },
  });
  if (!window.Range.prototype.getBoundingClientRect) {
    window.Range.prototype.getBoundingClientRect = NOOP_RECT;
  }
  if (!window.Range.prototype.getClientRects) {
    window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null });
  }
  if (!window.Element.prototype.scrollIntoView) {
    window.Element.prototype.scrollIntoView = () => {};
  }
  // CodeMirror reads these on the document for selection geometry.
  if (!document.createRange) {
    document.createRange = () => new window.Range();
  }
}

// Lazy-import the entry — we only want to pay the TipTap/CodeMirror
// load cost if a test actually mounts the editor.
let mountEditor;
async function loadEntry() {
  if (mountEditor) return mountEditor;
  const mod = await import('../public/js/editor.entry.js');
  mountEditor = mod.mount;
  return mountEditor;
}

// ─── Markdown round-trip (no DOM needed) ─────────────────────────

describe('markdown serializer/parser', () => {
  it('parses "# Hello\\n\\nWorld" into a heading + paragraph', () => {
    const doc = parseMarkdown('# Hello\n\nWorld');
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe('heading');
    expect(doc.child(0).attrs.level).toBe(1);
    expect(doc.child(0).textContent).toBe('Hello');
    expect(doc.child(1).type.name).toBe('paragraph');
    expect(doc.child(1).textContent).toBe('World');
  });

  it('serializes a heading + paragraph back to ATX-style Markdown', () => {
    const md = '# Hello\n\nWorld';
    const out = normalizeMarkdown(md);
    // Trailing newline differences are normalised by the serializer.
    expect(out.replace(/\s+$/, '')).toBe(md);
  });

  it('renders bullet lists with "-" (not "*" or "+")', () => {
    const out = normalizeMarkdown('- one\n- two\n- three\n');
    expect(out.startsWith('- one')).toBe(true);
    expect(out).not.toMatch(/^\* /m);
    expect(out).not.toMatch(/^\+ /m);
  });

  it('default ordered list starts at 1', () => {
    const doc = parseMarkdown('1. first\n2. second\n');
    const ol = doc.child(0);
    expect(ol.type.name).toBe('orderedList');
    expect(ol.attrs.start).toBe(1);
  });

  it('round-trips a representative blog post to a stable fixed point', () => {
    const post = readFileSync(
      join(__dirname, '..', '..', 'site', 'content', 'posts', 'bye-bye-dji.md'),
      'utf-8',
    );
    // Strip YAML front-matter; we only care about the Markdown body.
    const body = post.replace(/^---\n[\s\S]*?\n---\n/, '');
    const once = serializeMarkdown(parseMarkdown(body));
    const twice = serializeMarkdown(parseMarkdown(once));
    // First pass may normalise whitespace, bullet markers, or split
    // marks that span links (e.g., *italic [link]* → *italic* [link]);
    // the second pass must be byte-equal to the first — that's the
    // fixed-point contract this test protects.
    expect(twice).toBe(once);
    // And the first pass must preserve the meaningful content:
    // image, link URLs, prose. We're flexible on exact mark layout
    // because CommonMark normalises overlapping marks.
    expect(once).toContain('![DJI Phantom 3](/images/2025/12/image-17.png)');
    expect(once).toContain('theverge.com/news/849460/fcc-foreign-drone-ban-dji');
    expect(once).toContain('YouTube videos');
    // No trailing whitespace junk:
    expect(once.split('\n').every((l) => !/[ \t]+$/.test(l))).toBe(true);
  });
});

// ─── TipTap façade integration (jsdom) ───────────────────────────

describe('TEEditor.mount() façade', () => {
  let mount;
  let rootEl;
  let instance;

  beforeAll(async () => {
    installProseMirrorPolyfills();
    mount = await loadEntry();
  });

  beforeEach(() => {
    document.body.innerHTML = '<div id="r"></div>';
    rootEl = document.getElementById('r');
  });

  afterEach(() => {
    if (instance && typeof instance.destroy === 'function') {
      try {
        instance.destroy();
      } catch (_) {
        /* ignore teardown errors */
      }
    }
    instance = null;
    document.body.innerHTML = '';
  });

  it('mounts with initial Markdown and exposes value/mode getters', () => {
    instance = mount(rootEl, '# Hello\n\nWorld');
    expect(typeof instance.value).toBe('string');
    expect(instance.value).toContain('# Hello');
    expect(instance.value).toContain('World');
    expect(instance.getMode()).toBe('wysiwyg');
    // TipTap doc reflects the same structure.
    const doc = instance._tiptap.state.doc;
    expect(doc.child(0).type.name).toBe('heading');
    expect(doc.child(0).attrs.level).toBe(1);
    expect(doc.child(1).type.name).toBe('paragraph');
  });

  it('fires an input event when value is set programmatically', () => {
    instance = mount(rootEl, '');
    let fired = 0;
    instance.addEventListener('input', () => {
      fired += 1;
    });
    instance.value = '# New title';
    expect(fired).toBeGreaterThan(0);
    expect(instance.value).toContain('# New title');
  });

  it('selectionStart updates when set, and is reflected by selectionEnd default', () => {
    instance = mount(rootEl, 'hello world');
    // Default is end-of-document.
    const len = instance.value.length;
    expect(instance.selectionStart).toBe(len);
    expect(instance.selectionEnd).toBe(len);

    instance.setMode('source');
    instance.selectionStart = 3;
    instance.selectionEnd = 6;
    expect(instance.selectionStart).toBe(3);
    expect(instance.selectionEnd).toBe(6);
  });

  it('mode toggle round-trips through Source and back without drift', () => {
    const initial = '# Hello\n\nThis is **bold** and *italic*.\n\n- one\n- two\n';
    instance = mount(rootEl, initial);
    const before = instance.value;
    expect(instance.getMode()).toBe('wysiwyg');

    instance.setMode('source');
    expect(instance.getMode()).toBe('source');
    const mid = instance.value;
    // Source view should expose the same Markdown the WYSIWYG mode held.
    expect(mid).toBe(before);

    instance.setMode('wysiwyg');
    expect(instance.getMode()).toBe('wysiwyg');
    const after = instance.value;
    // Round-trip is a fixed point — the second hop equals the first.
    expect(after).toBe(before);
  });

  it('keeps a hidden textarea#editor-fallback inside the root for legacy consumers', () => {
    instance = mount(rootEl, 'hello');
    const ta = rootEl.querySelector('textarea#editor-fallback');
    expect(ta).not.toBeNull();
    expect(ta.value).toBe(instance.value);
    expect(ta.hidden).toBe(true);
    expect(ta.getAttribute('aria-hidden')).toBe('true');
  });

  it('typing into the TipTap doc updates the façade Markdown', () => {
    instance = mount(rootEl, '');
    let inputCount = 0;
    instance.addEventListener('input', () => {
      inputCount += 1;
    });
    // Drive TipTap programmatically — equivalent to the user typing.
    instance._tiptap.commands.setContent('# Programmatic\n\nbody');
    expect(instance.value).toContain('# Programmatic');
    expect(instance.value).toContain('body');
    expect(inputCount).toBeGreaterThan(0);
  });
});
