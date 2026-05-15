// @ts-nocheck
/**
 * editor.entry.js — bundle entry for the Phase 3 admin editor.
 *
 * Bundled by `admin/scripts/build-editor.mjs` (esbuild, IIFE,
 * globalName="TEEditor") into `admin/public/js/editor.bundle.js`.
 *
 * What this exposes
 * -----------------
 *   window.TEEditor.mount(rootEl, initialMarkdown, options) → instance
 *
 * Each instance is a façade that *looks* like the textarea it replaces.
 * Consumers (editor.js, media.js) read/write `.value`, listen for
 * `input` events, and treat `.selectionStart`/`.selectionEnd` as
 * character offsets into the Markdown string — exactly as they did
 * with `<textarea id="editor-fallback">` in Phase 2.
 *
 *   instance.value                 ← current Markdown string
 *   instance.value = '...'         ← replace contents
 *   instance.selectionStart/End    ← cursor position in Markdown
 *   instance.addEventListener('input', fn)
 *   instance.setMode('wysiwyg' | 'source')
 *   instance.getMode()
 *   instance.focus()
 *   instance.destroy()
 *
 * Round-trip stability
 * --------------------
 * `parse(markdown)` and `serialize(doc)` are designed so that a second
 * round-trip is a fixed point (`serialize(parse(serialize(parse(s)))) ===
 * serialize(parse(s))`). The first round-trip may normalise whitespace
 * or bullet markers, but switching WYSIWYG ↔ Source ↔ WYSIWYG never
 * drifts further.
 *
 * Phase 3b adds: rich toolbar (marks, blocks, lists, insert, history),
 * `@tiptap/suggestion`-driven slash menu, custom keymap (Cmd+K link
 * dialog, Cmd+S → editor-save event, Cmd+Enter → editor-publish event,
 * Cmd+Shift+U underline), and an underline mark that round-trips via
 * `<u>...</u>` HTML pass-through.
 *
 * Phase 3c will layer tables / math / callouts / footnotes onto the
 * slash menu's placeholder rows; Phase 3d adds find/replace, TOC
 * sidebar, and autosave hooks.
 */
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
// StarterKit v3 ships the Underline mark out of the box; we no longer
// need to import it explicitly. The mark is wired into the schema by
// the StarterKit.configure() call below.
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Suggestion from '@tiptap/suggestion';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

// ─────────────────────────────────────────────────────────────────
// Markdown round-trip: parser/serializer keyed on TipTap node names.
// ─────────────────────────────────────────────────────────────────
//
// prosemirror-markdown ships defaults that target its own schema
// (`bullet_list`, `code_block`, `hard_break`, …). TipTap's StarterKit
// uses camelCase node names (`bulletList`, `codeBlock`, `hardBreak`,
// …) plus `taskList`/`taskItem`. We build a parser/serializer pair
// whose *output* node names match TipTap so the round-trip lands the
// document straight into the live schema with no rename pass.

// Underline is the only mark with no native CommonMark syntax; we keep
// HTML pass-through enabled so `<u>...</u>` parses into the underline
// mark and serialises back to `<u>...</u>`. All other inline HTML is
// still ignored.
const tokenizer = MarkdownIt('commonmark', { html: true }).enable('table');

/** Return whether a markdown-it list is "tight" (no blank lines between items). */
function listIsTight(tokens, i) {
  while (++i < tokens.length) {
    if (tokens[i].type !== 'list_item_open') return tokens[i].hidden;
  }
  return false;
}

/** Markdown-it token → TipTap node/mark spec. */
const tokenSpec = {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'listItem' },
  bullet_list: {
    block: 'bulletList',
    getAttrs: (_, tokens, i) => ({ tight: listIsTight(tokens, i) }),
  },
  ordered_list: {
    block: 'orderedList',
    getAttrs: (tok, tokens, i) => ({
      start: Number(tok.attrGet('start')) || 1,
      tight: listIsTight(tokens, i),
    }),
  },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
  code_block: { block: 'codeBlock', getAttrs: () => ({ language: null }), noCloseToken: true },
  fence: {
    block: 'codeBlock',
    getAttrs: (tok) => ({ language: tok.info?.trim() || null }),
    noCloseToken: true,
  },
  hr: { node: 'horizontalRule' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: tok.attrGet('src'),
      title: tok.attrGet('title') || null,
      alt: (tok.children && tok.children[0] && tok.children[0].content) || null,
    }),
  },
  hardbreak: { node: 'hardBreak' },
  em: { mark: 'italic' },
  strong: { mark: 'bold' },
  s: { mark: 'strike' },
  link: {
    mark: 'link',
    getAttrs: (tok) => ({
      href: tok.attrGet('href'),
      title: tok.attrGet('title') || null,
    }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
  // HTML pass-through for the underline mark. markdown-it emits
  // `html_inline` tokens for raw inline HTML when `html: true`. We map
  // `<u>` open/close pairs onto the underline mark; everything else
  // falls through as plain text.
  html_inline: { mark: 'underline', noCloseToken: true, getAttrs: () => ({}) },
};

/**
 * Build a MarkdownParser bound to the given TipTap schema. We can't
 * construct it eagerly (the schema only exists after `new Editor(...)`
 * builds it), so this helper takes the live schema.
 *
 * Underline pass-through: prosemirror-markdown's mapping requires
 * matching open/close tokens, but markdown-it emits the same
 * `html_inline` type for both. We post-process the token stream so
 * `<u>` becomes a synthetic `u_open` token and `</u>` becomes `u_close`,
 * then map both to the underline mark.
 *
 * @param {import('prosemirror-model').Schema} schema
 */
function buildParser(schema) {
  const hasUnderline = Boolean(schema.marks.underline);
  const spec = { ...tokenSpec };
  if (hasUnderline) {
    spec.u = { mark: 'underline' };
  } else {
    delete spec.html_inline;
    delete spec.u;
  }
  const tokenize = (text, env) => {
    const tokens = tokenizer.parse(text || '', env || {});
    // Walk inline children and remap `<u>` / `</u>` html_inline tokens
    // to a synthetic `u_open` / `u_close` pair the parser can recognise.
    function remap(children) {
      if (!children) return children;
      const out = [];
      for (let i = 0; i < children.length; i++) {
        const t = children[i];
        if (t.type === 'html_inline' && hasUnderline) {
          const m = /^<\s*(\/?)\s*u\s*>$/i.exec(t.content || '');
          if (m) {
            const open = m[1] !== '/';
            // Synthesise a token that prosemirror-markdown's parser
            // treats as a paired mark token.
            const synth = new t.constructor(open ? 'u_open' : 'u_close', 'u', open ? 1 : -1);
            synth.markup = '';
            synth.nesting = open ? 1 : -1;
            synth.level = t.level;
            out.push(synth);
            continue;
          }
        }
        out.push(t);
      }
      return out;
    }
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].children) tokens[i].children = remap(tokens[i].children);
    }
    return tokens;
  };
  // MarkdownParser's `parse()` calls `tokenizer.parse(...)`. We pass a
  // wrapper that mimics that interface so the remap happens transparently.
  const wrappedTokenizer = {
    parse: tokenize,
  };
  return new MarkdownParser(schema, wrappedTokenizer, spec);
}

// ─────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────

const nodeSerializers = {
  blockquote(state, node) {
    state.wrapBlock('> ', null, node, () => state.renderContent(node));
  },
  codeBlock(state, node) {
    const backticks = node.textContent.match(/`{3,}/gm);
    const fence = backticks ? backticks.sort().slice(-1)[0] + '`' : '```';
    state.write(fence + (node.attrs.language || '') + '\n');
    state.text(node.textContent, false);
    state.write('\n');
    state.write(fence);
    state.closeBlock(node);
  },
  heading(state, node) {
    // ATX headings only — never Setext.
    state.write(state.repeat('#', node.attrs.level) + ' ');
    state.renderInline(node, false);
    state.closeBlock(node);
  },
  horizontalRule(state, node) {
    state.write('---');
    state.closeBlock(node);
  },
  bulletList(state, node) {
    // Spec: bullets use "-" (not "*" / "+").
    state.renderList(node, '  ', () => '- ');
  },
  orderedList(state, node) {
    // Spec: default start = 1.
    const start = node.attrs.start || 1;
    const maxW = String(start + node.childCount - 1).length;
    const space = state.repeat(' ', maxW + 2);
    state.renderList(node, space, (i) => {
      const nStr = String(start + i);
      return state.repeat(' ', maxW - nStr.length) + nStr + '. ';
    });
  },
  listItem(state, node) {
    state.renderContent(node);
  },
  taskList(state, node) {
    // Each task item renders its own "- [ ]" / "- [x]" prefix; we just
    // wrap them as a tight bullet list.
    state.renderList(node, '  ', () => '');
  },
  taskItem(state, node) {
    const checked = node.attrs.checked ? '[x]' : '[ ]';
    state.write(`- ${checked} `);
    state.renderContent(node);
  },
  paragraph(state, node) {
    state.renderInline(node);
    state.closeBlock(node);
  },
  image(state, node) {
    state.write(
      '![' +
        state.esc(node.attrs.alt || '') +
        '](' +
        (node.attrs.src || '').replace(/[()]/g, '\\$&') +
        (node.attrs.title ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"' : '') +
        ')',
    );
  },
  hardBreak(state, node, parent, index) {
    for (let i = index + 1; i < parent.childCount; i++) {
      if (parent.child(i).type !== node.type) {
        // Spec: hardBreak serialises as bare `\n` (not "\\\n" or "<br>")
        // so the round-trip stays stable through CommonMark's
        // softbreak-as-text re-parse.
        state.write('\n');
        return;
      }
    }
  },
  text(state, node) {
    state.text(node.text, !state.inAutolink);
  },
};

const markSerializers = {
  italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
  bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
  // Markdown has no native underline syntax. We pass through as raw
  // HTML; markdown-it's `html: true` + the parser's `u_open`/`u_close`
  // remap pulls it back into the same mark on the next round-trip.
  underline: {
    open: '<u>',
    close: '</u>',
    mixable: true,
    expelEnclosingWhitespace: true,
  },
  link: {
    open(state, _mark) {
      state.inAutolink = false;
      return '[';
    },
    close(_state, mark) {
      const href = (mark.attrs.href || '').replace(/[()"]/g, '\\$&');
      const title = mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : '';
      return `](${href}${title})`;
    },
    mixable: false,
    expelEnclosingWhitespace: true,
  },
  code: {
    open(_state, _mark, parent, index) {
      return backticksFor(parent.child(index), -1);
    },
    close(_state, _mark, parent, index) {
      return backticksFor(parent.child(index - 1), 1);
    },
    escape: false,
  },
};

function backticksFor(node, side) {
  const ticks = /`+/g;
  let m;
  let len = 0;
  if (node.isText) while ((m = ticks.exec(node.text))) len = Math.max(len, m[0].length);
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}

const serializer = new MarkdownSerializer(nodeSerializers, markSerializers, {
  hardBreakNodeName: 'hardBreak',
});

export { buildParser, serializer };

// ─────────────────────────────────────────────────────────────────
// Link URL validation
// ─────────────────────────────────────────────────────────────────
//
// Used by both the Link button and the Cmd+K dialog. We allow:
//   - http / https / mailto / tel (with full or bare host)
//   - relative URLs (start with "/", "#", or "?")
//   - bare paths like "page.html"
// and reject `javascript:`, `data:`, `vbscript:` and anything that
// looks like a control-character URL.
const FORBIDDEN_SCHEME = /^\s*(javascript|data|vbscript)\s*:/i;
const SAFE_SCHEME = /^(https?|mailto|tel):/i;

export function isSafeLinkUrl(raw) {
  if (typeof raw !== 'string') return false;
  const url = raw.trim();
  if (!url) return false;
  if (FORBIDDEN_SCHEME.test(url)) return false;
  // Strip control chars; CommonMark forbids them in link destinations.
  // Use a char-code scan so we don't embed literal control chars in a
  // regex (eslint's no-control-regex blocks `/[\x00-\x1f]/`).
  for (let i = 0; i < url.length; i++) {
    if (url.charCodeAt(i) <= 0x1f) return false;
  }
  if (SAFE_SCHEME.test(url)) return true;
  // Relative / fragment / query / bare path.
  if (/^[/#?]/.test(url)) return true;
  // Schemeless absolute (e.g., "example.com/page") — treat as relative.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
  // Unknown scheme — deny.
  return false;
}

// ─────────────────────────────────────────────────────────────────
// Slash-menu command catalogue
// ─────────────────────────────────────────────────────────────────
//
// Each entry has a stable `id` (for aria-activedescendant), a
// human-readable `label`, a short `hint`, an optional `disabled` flag
// for Phase-future placeholders, and a `run(editor, range)` that takes
// the live editor and the range covering the `/query` to delete before
// running its chain command.
const SLASH_ITEMS = [
  {
    id: 'h1',
    label: 'Heading 1',
    hint: 'Large section heading',
    group: 'Headings',
    keywords: ['h1', 'heading', 'title', 'one'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    hint: 'Medium section heading',
    group: 'Headings',
    keywords: ['h2', 'heading', 'two'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    hint: 'Small section heading',
    group: 'Headings',
    keywords: ['h3', 'heading', 'three'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet list',
    hint: 'Unordered list with •',
    group: 'Lists',
    keywords: ['bullet', 'list', 'ul', 'unordered'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Ordered list',
    hint: 'Numbered list',
    group: 'Lists',
    keywords: ['ordered', 'list', 'ol', 'number'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'task',
    label: 'Task list',
    hint: 'Checkable to-do list',
    group: 'Lists',
    keywords: ['task', 'todo', 'check', 'list'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: 'quote',
    label: 'Blockquote',
    hint: 'Quote or callout',
    group: 'Block',
    keywords: ['quote', 'blockquote', 'callout'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'code',
    label: 'Code block',
    hint: 'Fenced source code',
    group: 'Block',
    keywords: ['code', 'fence', 'pre', 'block'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: 'hr',
    label: 'Divider',
    hint: 'Horizontal rule',
    group: 'Block',
    keywords: ['divider', 'hr', 'horizontal', 'rule', 'separator'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'Insert image (Phase 4)',
    group: 'Insert',
    keywords: ['image', 'photo', 'picture'],
    placeholder: true,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
      // Phase 4 will replace this with the media picker. For now we
      // dispatch a DOM event so editor.js can wire its existing
      // sidebar uploader as a quick stop-gap.
      try {
        editor.view.dom.dispatchEvent(new CustomEvent('te-slash-image', { bubbles: true }));
      } catch (_) {
        /* ignore */
      }
    },
  },
  {
    id: 'file',
    label: 'File attachment',
    hint: 'Upload file (Phase 6)',
    group: 'Insert',
    keywords: ['file', 'attachment', 'upload'],
    placeholder: true,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
    },
  },
  {
    id: 'embed',
    label: 'Embed',
    hint: 'Embed video / tweet (Phase 7)',
    group: 'Insert',
    keywords: ['embed', 'video', 'tweet', 'iframe'],
    placeholder: true,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
    },
  },
  {
    id: 'table',
    label: 'Table',
    hint: 'Grid of rows and columns (Phase 3c)',
    group: 'Insert',
    keywords: ['table', 'grid', 'rows', 'columns'],
    placeholder: true,
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run();
    },
  },
];

function filterSlashItems(query) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return SLASH_ITEMS.slice(0, 10);
  return SLASH_ITEMS.filter((item) => {
    const hay = (item.label + ' ' + (item.keywords || []).join(' ')).toLowerCase();
    return hay.includes(q);
  }).slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────
// Slash menu floating UI
// ─────────────────────────────────────────────────────────────────
//
// We render a plain absolutely-positioned <ul role="listbox"> against
// the document body. Selection is owned by the keyboard logic — the
// menu items are <button>s but they're never focused; the editor keeps
// focus and we use `aria-activedescendant` on the editor surface to
// announce the highlighted row to assistive tech.

function createSlashMenu() {
  const root = document.createElement('div');
  root.className = 'te-slash-menu';
  root.setAttribute('role', 'presentation');
  root.style.position = 'absolute';
  root.style.zIndex = '300';
  root.style.display = 'none';

  const list = document.createElement('ul');
  list.className = 'te-slash-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Insert block');
  list.id = 'te-slash-list-' + Math.random().toString(36).slice(2, 8);
  root.appendChild(list);

  const empty = document.createElement('div');
  empty.className = 'te-slash-empty';
  empty.textContent = 'No matching blocks';
  empty.hidden = true;
  root.appendChild(empty);

  document.body.appendChild(root);

  let items = [];
  let activeIndex = 0;
  let onSelect = () => {};

  function rowId(index) {
    return list.id + '-row-' + index;
  }

  function render(nextItems) {
    items = nextItems || [];
    list.innerHTML = '';
    if (!items.length) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }
    list.hidden = false;
    empty.hidden = true;
    let lastGroup = null;
    items.forEach((item, idx) => {
      if (item.group && item.group !== lastGroup) {
        const sep = document.createElement('li');
        sep.className = 'te-slash-group';
        sep.setAttribute('role', 'presentation');
        sep.textContent = item.group;
        list.appendChild(sep);
        lastGroup = item.group;
      }
      const li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'te-slash-item';
      if (item.placeholder) btn.classList.add('is-placeholder');
      btn.dataset.index = String(idx);
      btn.id = rowId(idx);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
      btn.tabIndex = -1;
      btn.innerHTML =
        '<span class="te-slash-label">' +
        escapeHtml(item.label) +
        '</span>' +
        '<span class="te-slash-hint">' +
        escapeHtml(item.hint || '') +
        '</span>';
      // Use mousedown so the editor doesn't lose focus before we run
      // the command (click would fire after focus is lost).
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        activeIndex = idx;
        onSelect(item);
      });
      btn.addEventListener('mousemove', () => {
        if (activeIndex !== idx) {
          activeIndex = idx;
          updateAria();
        }
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    updateAria();
  }

  function updateAria() {
    const buttons = list.querySelectorAll('.te-slash-item');
    buttons.forEach((b, i) => {
      b.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      b.classList.toggle('is-active', i === activeIndex);
    });
    const activeBtn = buttons[activeIndex];
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      try {
        activeBtn.scrollIntoView({ block: 'nearest' });
      } catch (_) {
        /* ignore */
      }
    }
  }

  function show(rect) {
    root.style.display = 'block';
    positionAt(rect);
  }

  function positionAt(rect) {
    if (!rect) return;
    const docTop = window.scrollY || window.pageYOffset || 0;
    const docLeft = window.scrollX || window.pageXOffset || 0;
    const top = (rect.bottom || rect.top || 0) + docTop + 6;
    const left = (rect.left || 0) + docLeft;
    root.style.top = top + 'px';
    root.style.left = left + 'px';
    // Clamp into viewport horizontally.
    const maxLeft = (window.innerWidth || 0) - root.offsetWidth - 8;
    if (root.offsetWidth && left + docLeft > maxLeft + docLeft) {
      root.style.left = Math.max(8 + docLeft, maxLeft + docLeft) + 'px';
    }
  }

  function hide() {
    root.style.display = 'none';
  }

  function move(delta) {
    if (!items.length) return;
    activeIndex = (activeIndex + delta + items.length) % items.length;
    updateAria();
  }

  function getActive() {
    return items[activeIndex] || null;
  }

  function getActiveDescendantId() {
    return items.length ? rowId(activeIndex) : '';
  }

  function destroy() {
    try {
      root.remove();
    } catch (_) {
      /* ignore */
    }
  }

  return {
    render,
    show,
    hide,
    move,
    positionAt,
    getActive,
    getActiveDescendantId,
    setActiveIndex(i) {
      activeIndex = Math.max(0, Math.min(items.length - 1, i | 0));
      updateAria();
    },
    setOnSelect(fn) {
      onSelect = typeof fn === 'function' ? fn : () => {};
    },
    destroy,
    listId: list.id,
    element: root,
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────
// Slash extension wiring @tiptap/suggestion
// ─────────────────────────────────────────────────────────────────

function buildSlashExtension(menu) {
  return Extension.create({
    name: 'teSlashMenu',
    addOptions() {
      return {
        suggestion: {
          char: '/',
          // Permissive: trigger anywhere (not just empty paragraphs).
          startOfLine: false,
          allowSpaces: false,
          allow({ state, range }) {
            // Don't trigger inside code blocks.
            const $from = state.doc.resolve(range.from);
            for (let d = $from.depth; d > 0; d--) {
              const node = $from.node(d);
              if (node.type.name === 'codeBlock') return false;
            }
            return true;
          },
          command: ({ editor, range, props }) => {
            if (props && typeof props.run === 'function') {
              props.run(editor, range);
            }
          },
          items: ({ query }) => filterSlashItems(query),
          render: () => {
            let currentRange = null;
            let currentEditor = null;
            return {
              onStart(props) {
                currentRange = props.range;
                currentEditor = props.editor;
                menu.render(props.items || []);
                menu.setActiveIndex(0);
                menu.setOnSelect((item) => {
                  if (!currentEditor || !currentRange) return;
                  props.command(item);
                });
                const rect = props.clientRect && props.clientRect();
                menu.show(rect);
                announce(currentEditor, menu);
              },
              onUpdate(props) {
                currentRange = props.range;
                currentEditor = props.editor;
                menu.render(props.items || []);
                menu.setActiveIndex(0);
                menu.setOnSelect((item) => {
                  if (!currentEditor || !currentRange) return;
                  props.command(item);
                });
                const rect = props.clientRect && props.clientRect();
                menu.positionAt(rect);
                announce(currentEditor, menu);
              },
              onKeyDown(props) {
                const e = props.event;
                if (!e) return false;
                if (e.key === 'ArrowDown') {
                  menu.move(1);
                  announce(currentEditor, menu);
                  return true;
                }
                if (e.key === 'ArrowUp') {
                  menu.move(-1);
                  announce(currentEditor, menu);
                  return true;
                }
                if (e.key === 'Enter') {
                  const active = menu.getActive();
                  if (active) {
                    props.command(active);
                    return true;
                  }
                }
                if (e.key === 'Escape') {
                  menu.hide();
                  return true;
                }
                return false;
              },
              onExit() {
                menu.hide();
                if (currentEditor && currentEditor.view && currentEditor.view.dom) {
                  currentEditor.view.dom.removeAttribute('aria-activedescendant');
                }
                currentRange = null;
                currentEditor = null;
              },
            };
          },
        },
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}

function announce(editor, menu) {
  if (!editor || !editor.view || !editor.view.dom) return;
  const id = menu.getActiveDescendantId();
  if (id) editor.view.dom.setAttribute('aria-activedescendant', id);
  else editor.view.dom.removeAttribute('aria-activedescendant');
  // Owner: also announce the listbox itself so screen-reader cursor
  // can locate the options.
  editor.view.dom.setAttribute('aria-controls', menu.listId);
  editor.view.dom.setAttribute('aria-expanded', 'true');
}

// ─────────────────────────────────────────────────────────────────
// Editor instance
// ─────────────────────────────────────────────────────────────────

function buildExtensions(slashExt) {
  const exts = [
    StarterKit.configure({
      // StarterKit already gives us paragraph, heading, blockquote,
      // bulletList, orderedList, listItem, codeBlock, hardBreak,
      // horizontalRule, image, bold, italic, strike, code, history,
      // dropcursor, gapcursor. We override link to keep it
      // openOnClick=false in the admin (avoids navigating away).
      link: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { rel: 'noopener noreferrer' },
    }),
    Image.configure({ inline: true, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
  if (slashExt) exts.push(slashExt);
  return exts;
}

/**
 * Mount a dual-mode editor inside `rootEl`. The returned instance is a
 * textarea-compatible façade — see file docblock.
 *
 * @param {HTMLElement} rootEl
 * @param {string} [initialMarkdown]
 * @param {{
 *   placeholder?: string,
 *   onModeChange?: (mode: 'wysiwyg' | 'source') => void,
 * }} [options]
 */
export function mount(rootEl, initialMarkdown, options) {
  if (!rootEl) throw new Error('TEEditor.mount: rootEl is required');
  const opts = options || {};
  const md0 = typeof initialMarkdown === 'string' ? initialMarkdown : '';

  // Clean the root and build our chrome.
  rootEl.innerHTML = '';
  rootEl.classList.add('te-editor');

  const toolbar = document.createElement('div');
  toolbar.className = 'te-editor-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Editor formatting');

  const modeGroup = document.createElement('div');
  modeGroup.className = 'te-editor-mode-toggle';
  modeGroup.setAttribute('role', 'group');
  modeGroup.setAttribute('aria-label', 'Editor mode');

  const btnWysiwyg = document.createElement('button');
  btnWysiwyg.type = 'button';
  btnWysiwyg.className = 'te-editor-mode-btn active';
  btnWysiwyg.dataset.mode = 'wysiwyg';
  btnWysiwyg.setAttribute('aria-pressed', 'true');
  btnWysiwyg.textContent = 'Rich';

  const btnSource = document.createElement('button');
  btnSource.type = 'button';
  btnSource.className = 'te-editor-mode-btn';
  btnSource.dataset.mode = 'source';
  btnSource.setAttribute('aria-pressed', 'false');
  btnSource.textContent = 'Markdown';

  modeGroup.appendChild(btnWysiwyg);
  modeGroup.appendChild(btnSource);
  toolbar.appendChild(modeGroup);

  // Rich toolbar — built after the editor exists so commands can bind
  // to the live instance.
  const richToolbar = document.createElement('div');
  richToolbar.className = 'te-editor-toolbar-rich';
  richToolbar.setAttribute('role', 'group');
  richToolbar.setAttribute('aria-label', 'Formatting');
  toolbar.appendChild(richToolbar);

  // Flex spacer so the mode toggle floats right.
  const toolbarSpacer = document.createElement('div');
  toolbarSpacer.className = 'te-editor-toolbar-spacer';
  toolbar.appendChild(toolbarSpacer);

  const stack = document.createElement('div');
  stack.className = 'te-editor-stack';

  const wysiwygMount = document.createElement('div');
  wysiwygMount.className = 'te-editor-wysiwyg';

  const sourceMount = document.createElement('div');
  sourceMount.className = 'te-editor-source';
  sourceMount.hidden = true;

  stack.appendChild(wysiwygMount);
  stack.appendChild(sourceMount);

  rootEl.appendChild(toolbar);
  rootEl.appendChild(stack);

  // ── Slash menu UI ─────────────────────────────────────────
  const slashMenu = createSlashMenu();
  const slashExt = buildSlashExtension(slashMenu);

  // ── Cmd+S / Cmd+Enter / Cmd+K keymap ──────────────────────
  // We expose these as custom DOM events on `rootEl` so the page-level
  // wiring (editor.js) can map them to its existing save/publish flow
  // without coupling the bundle to the page.
  const keymapExt = Extension.create({
    name: 'teKeymap',
    addKeyboardShortcuts() {
      return {
        'Mod-s': () => {
          rootEl.dispatchEvent(new CustomEvent('editor-save', { bubbles: true }));
          return true;
        },
        'Mod-Enter': () => {
          rootEl.dispatchEvent(new CustomEvent('editor-publish', { bubbles: true }));
          return true;
        },
        'Mod-k': () => {
          openLinkDialog();
          return true;
        },
        'Mod-Shift-u': () => this.editor.chain().focus().toggleUnderline().run(),
      };
    },
  });

  // ── TipTap WYSIWYG ────────────────────────────────────────
  const extensions = buildExtensions(slashExt);
  extensions.push(keymapExt);
  const editor = new Editor({
    element: wysiwygMount,
    extensions,
    content: '',
    autofocus: false,
    editable: true,
  });

  const parser = buildParser(editor.schema);

  // Setting "content" with a string treats it as HTML; for round-trip
  // safety we parse Markdown → ProseMirror doc and apply it directly.
  function applyMarkdownToEditor(md, emit) {
    let doc;
    try {
      doc = parser.parse(md || '');
    } catch (_err) {
      // Fall back to a plain paragraph if the parser throws on weird
      // input; we never want a mount() call to crash the editor.
      doc = editor.schema.node('doc', null, [editor.schema.node('paragraph', null, [])]);
    }
    const tr = editor.state.tr.replaceWith(0, editor.state.doc.content.size, doc.content);
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
    if (emit !== false) instance.dispatchEvent(new Event('input'));
  }

  function getMarkdownFromEditor() {
    return serializer.serialize(editor.state.doc);
  }

  // ── CodeMirror source view ────────────────────────────────
  let cmView = null;
  function ensureSourceView(initial) {
    if (cmView) return cmView;
    const state = EditorState.create({
      doc: initial || '',
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmMarkdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            // Source-mode edits flow through the façade so the hidden
            // textarea stays in sync. We *don't* round-trip back into
            // TipTap here — that happens on mode switch to avoid jitter
            // during typing.
            updateFromSource();
          }
        }),
        // Source-mode shortcuts mirror the rich-mode keymap so users
        // get consistent Save/Publish behaviour regardless of mode.
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              rootEl.dispatchEvent(new CustomEvent('editor-save', { bubbles: true }));
              return true;
            },
          },
          {
            key: 'Mod-Enter',
            run: () => {
              rootEl.dispatchEvent(new CustomEvent('editor-publish', { bubbles: true }));
              return true;
            },
          },
        ]),
        EditorView.theme(
          {
            '&': { height: '100%', fontSize: '14px' },
            '.cm-scroller': { fontFamily: 'var(--mono, ui-monospace, monospace)' },
            '.cm-content': { padding: '8px 0' },
          },
          { dark: document.documentElement.getAttribute('data-theme') === 'dark' },
        ),
      ],
    });
    cmView = new EditorView({ state, parent: sourceMount });
    // line numbers / active line are intentionally off per spec —
    // the source view is a prose editor, not a code editor.
    // Phase 3d will optionally re-enable these for power users.
    return cmView;
  }

  // ── Hidden façade textarea (single source of truth) ───────
  //
  // Both modes write into `hidden` so consumers can keep reading
  // `instance.value` (which proxies to `hidden.value`) regardless of
  // mode. The façade itself is an EventTarget so it dispatches the
  // 'input' event consumers already listen for.
  const hidden = document.createElement('textarea');
  hidden.id = 'editor-fallback';
  hidden.hidden = true;
  hidden.setAttribute('aria-hidden', 'true');
  hidden.tabIndex = -1;
  hidden.value = md0;
  rootEl.appendChild(hidden);

  // Keep an internal selection model so consumers (media.bindUploader)
  // can splice content at a cursor position. WYSIWYG mode reports
  // best-effort offsets via getResolvedPos; source mode uses CM6's
  // selection state.
  let selectionStart = md0.length;
  let selectionEnd = md0.length;
  let mode = 'wysiwyg';
  let suppressInput = false;

  function emitInput() {
    if (suppressInput) return;
    instance.dispatchEvent(new Event('input'));
  }

  function updateFromEditor() {
    const md = getMarkdownFromEditor();
    if (hidden.value !== md) {
      hidden.value = md;
      selectionStart = selectionEnd = md.length;
      emitInput();
    }
  }

  function updateFromSource() {
    if (!cmView) return;
    const md = cmView.state.doc.toString();
    if (hidden.value !== md) {
      hidden.value = md;
      const sel = cmView.state.selection.main;
      selectionStart = sel.from;
      selectionEnd = sel.to;
      emitInput();
    }
  }

  editor.on('update', updateFromEditor);
  editor.on('selectionUpdate', () => {
    // TipTap selections are document positions, not Markdown offsets.
    // We can't get a precise Markdown offset without re-serialising,
    // so we approximate by setting both endpoints to the *current*
    // Markdown length — meaning "insert at the end". Phase 3b's slash
    // menu and Phase 3d's find/replace will provide proper anchors.
    // For media insertion the existing UX expects cursor-at-end when
    // the rich editor doesn't have keyboard focus.
    selectionStart = selectionEnd = hidden.value.length;
    refreshToolbarState();
  });
  editor.on('transaction', () => {
    refreshToolbarState();
  });

  // ── Mode switching ────────────────────────────────────────
  function setMode(next) {
    if (next === mode) return;
    if (next === 'source') {
      // Always serialise from the live TipTap state — `hidden.value`
      // may be stale during in-flight updates.
      const md = getMarkdownFromEditor();
      suppressInput = true;
      hidden.value = md;
      suppressInput = false;
      ensureSourceView(md);
      if (cmView.state.doc.toString() !== md) {
        cmView.dispatch({
          changes: { from: 0, to: cmView.state.doc.length, insert: md },
        });
      }
      wysiwygMount.hidden = true;
      sourceMount.hidden = false;
      btnWysiwyg.classList.remove('active');
      btnSource.classList.add('active');
      btnWysiwyg.setAttribute('aria-pressed', 'false');
      btnSource.setAttribute('aria-pressed', 'true');
      mode = 'source';
      richToolbar.setAttribute('aria-disabled', 'true');
      richToolbar.classList.add('is-disabled');
      // Defer focus so the view's DOM has settled.
      queueMicrotask(() => {
        if (cmView) cmView.focus();
      });
    } else {
      const md = cmView ? cmView.state.doc.toString() : hidden.value;
      suppressInput = true;
      hidden.value = md;
      applyMarkdownToEditor(md, false);
      suppressInput = false;
      sourceMount.hidden = true;
      wysiwygMount.hidden = false;
      btnSource.classList.remove('active');
      btnWysiwyg.classList.add('active');
      btnSource.setAttribute('aria-pressed', 'false');
      btnWysiwyg.setAttribute('aria-pressed', 'true');
      mode = 'wysiwyg';
      richToolbar.removeAttribute('aria-disabled');
      richToolbar.classList.remove('is-disabled');
      queueMicrotask(() => {
        editor.commands.focus();
        refreshToolbarState();
      });
    }
    refreshToolbarState();
    if (typeof opts.onModeChange === 'function') {
      try {
        opts.onModeChange(mode);
      } catch (_) {
        /* swallow consumer errors */
      }
    }
  }

  btnWysiwyg.addEventListener('click', () => setMode('wysiwyg'));
  btnSource.addEventListener('click', () => setMode('source'));

  // ── Rich toolbar buttons ─────────────────────────────────
  //
  // Each entry produces a real <button> with aria-label, title (tooltip
  // including the shortcut), and an `update()` callback that re-reads
  // the live editor state and toggles aria-pressed / aria-disabled.
  const toolbarButtons = [];
  function tbBtn(spec) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'te-tb-btn';
    if (spec.className) btn.classList.add(spec.className);
    btn.setAttribute('aria-label', spec.label);
    btn.title = spec.shortcut ? `${spec.label} (${spec.shortcut})` : spec.label;
    if (spec.glyph) {
      const g = document.createElement('span');
      g.className = 'te-tb-glyph';
      g.setAttribute('aria-hidden', 'true');
      g.textContent = spec.glyph;
      btn.appendChild(g);
    }
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('mousedown', (e) => {
      // Prevent the editor from losing focus on click — keeps marks
      // anchored to the current selection.
      e.preventDefault();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn.getAttribute('aria-disabled') === 'true') return;
      spec.run();
      refreshToolbarState();
    });
    btn._update = () => {
      const active = Boolean(spec.active && spec.active());
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('is-active', active);
      const disabled = mode === 'source' || (spec.canRun && !spec.canRun());
      btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      if (disabled) btn.setAttribute('tabindex', '-1');
      else btn.removeAttribute('tabindex');
    };
    toolbarButtons.push(btn);
    return btn;
  }
  function tbGroup(label) {
    const g = document.createElement('div');
    g.className = 'te-tb-group';
    g.setAttribute('role', 'group');
    g.setAttribute('aria-label', label);
    return g;
  }
  function tbDivider() {
    const d = document.createElement('span');
    d.className = 'te-tb-divider';
    d.setAttribute('aria-hidden', 'true');
    return d;
  }

  const mod = isMacLike() ? '⌘' : 'Ctrl';
  const shift = '⇧';
  const alt = isMacLike() ? '⌥' : 'Alt';

  // Group: inline marks
  const gMarks = tbGroup('Inline formatting');
  gMarks.appendChild(
    tbBtn({
      label: 'Bold',
      shortcut: `${mod}+B`,
      glyph: 'B',
      className: 'te-tb-bold',
      active: () => editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run(),
    }),
  );
  gMarks.appendChild(
    tbBtn({
      label: 'Italic',
      shortcut: `${mod}+I`,
      glyph: 'I',
      className: 'te-tb-italic',
      active: () => editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run(),
    }),
  );
  gMarks.appendChild(
    tbBtn({
      label: 'Underline',
      shortcut: `${mod}+${shift}+U`,
      glyph: 'U',
      className: 'te-tb-underline',
      active: () => editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run(),
    }),
  );
  gMarks.appendChild(
    tbBtn({
      label: 'Strikethrough',
      shortcut: `${mod}+${shift}+X`,
      glyph: 'S',
      className: 'te-tb-strike',
      active: () => editor.isActive('strike'),
      run: () => editor.chain().focus().toggleStrike().run(),
    }),
  );
  gMarks.appendChild(
    tbBtn({
      label: 'Inline code',
      shortcut: `${mod}+E`,
      glyph: '</>',
      className: 'te-tb-code',
      active: () => editor.isActive('code'),
      run: () => editor.chain().focus().toggleCode().run(),
    }),
  );
  gMarks.appendChild(
    tbBtn({
      label: 'Link',
      shortcut: `${mod}+K`,
      glyph: '⇒',
      className: 'te-tb-link',
      active: () => editor.isActive('link'),
      run: () => openLinkDialog(),
    }),
  );
  richToolbar.appendChild(gMarks);
  richToolbar.appendChild(tbDivider());

  // Group: block type
  const gBlock = tbGroup('Block type');
  gBlock.appendChild(
    tbBtn({
      label: 'Heading 1',
      shortcut: `${mod}+${alt}+1`,
      glyph: 'H1',
      active: () => editor.isActive('heading', { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    }),
  );
  gBlock.appendChild(
    tbBtn({
      label: 'Heading 2',
      shortcut: `${mod}+${alt}+2`,
      glyph: 'H2',
      active: () => editor.isActive('heading', { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    }),
  );
  gBlock.appendChild(
    tbBtn({
      label: 'Heading 3',
      shortcut: `${mod}+${alt}+3`,
      glyph: 'H3',
      active: () => editor.isActive('heading', { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    }),
  );
  gBlock.appendChild(
    tbBtn({
      label: 'Paragraph',
      shortcut: `${mod}+${alt}+0`,
      glyph: '¶',
      active: () => editor.isActive('paragraph') && !editor.isActive('heading'),
      run: () => editor.chain().focus().setParagraph().run(),
    }),
  );
  gBlock.appendChild(
    tbBtn({
      label: 'Blockquote',
      shortcut: `${mod}+${shift}+B`,
      glyph: '“”',
      active: () => editor.isActive('blockquote'),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    }),
  );
  richToolbar.appendChild(gBlock);
  richToolbar.appendChild(tbDivider());

  // Group: lists
  const gLists = tbGroup('Lists');
  gLists.appendChild(
    tbBtn({
      label: 'Bullet list',
      shortcut: `${mod}+${shift}+8`,
      glyph: '•',
      active: () => editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run(),
    }),
  );
  gLists.appendChild(
    tbBtn({
      label: 'Ordered list',
      shortcut: `${mod}+${shift}+7`,
      glyph: '1.',
      active: () => editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    }),
  );
  gLists.appendChild(
    tbBtn({
      label: 'Task list',
      shortcut: `${mod}+${shift}+9`,
      glyph: '☑',
      active: () => editor.isActive('taskList'),
      run: () => editor.chain().focus().toggleTaskList().run(),
    }),
  );
  gLists.appendChild(
    tbBtn({
      label: 'Decrease indent',
      shortcut: `${shift}+Tab`,
      glyph: '⇤',
      canRun: () => editor.can().liftListItem('listItem') || editor.can().liftListItem('taskItem'),
      active: () => false,
      run: () => {
        // Try both list-item types; whichever applies will succeed.
        if (!editor.chain().focus().liftListItem('taskItem').run()) {
          editor.chain().focus().liftListItem('listItem').run();
        }
      },
    }),
  );
  gLists.appendChild(
    tbBtn({
      label: 'Increase indent',
      shortcut: 'Tab',
      glyph: '⇥',
      canRun: () => editor.can().sinkListItem('listItem') || editor.can().sinkListItem('taskItem'),
      active: () => false,
      run: () => {
        if (!editor.chain().focus().sinkListItem('taskItem').run()) {
          editor.chain().focus().sinkListItem('listItem').run();
        }
      },
    }),
  );
  richToolbar.appendChild(gLists);
  richToolbar.appendChild(tbDivider());

  // Group: insert
  const gInsert = tbGroup('Insert');
  gInsert.appendChild(
    tbBtn({
      label: 'Horizontal rule',
      shortcut: `${mod}+${shift}+H`,
      glyph: '―',
      active: () => false,
      run: () => editor.chain().focus().setHorizontalRule().run(),
    }),
  );
  gInsert.appendChild(
    tbBtn({
      label: 'Image (Phase 4 wires media)',
      shortcut: '',
      glyph: '▣',
      className: 'is-placeholder',
      active: () => false,
      run: () => {
        // Phase 4 will wire this to the media picker. For now, prompt
        // for a URL so the button isn't entirely inert.
        const url = window.prompt('Image URL');
        if (!url) return;
        if (!isSafeLinkUrl(url)) {
          alert('That URL is not allowed.');
          return;
        }
        editor.chain().focus().setImage({ src: url }).run();
      },
    }),
  );
  gInsert.appendChild(
    tbBtn({
      label: 'Embed (Phase 7 wires)',
      shortcut: '',
      glyph: '⧉',
      className: 'is-placeholder',
      active: () => false,
      canRun: () => false,
      run: () => {
        /* Phase 7 */
      },
    }),
  );
  richToolbar.appendChild(gInsert);
  richToolbar.appendChild(tbDivider());

  // Group: history
  const gHist = tbGroup('History');
  gHist.appendChild(
    tbBtn({
      label: 'Undo',
      shortcut: `${mod}+Z`,
      glyph: '↶',
      active: () => false,
      canRun: () => editor.can().undo(),
      run: () => editor.chain().focus().undo().run(),
    }),
  );
  gHist.appendChild(
    tbBtn({
      label: 'Redo',
      shortcut: `${mod}+${shift}+Z`,
      glyph: '↷',
      active: () => false,
      canRun: () => editor.can().redo(),
      run: () => editor.chain().focus().redo().run(),
    }),
  );
  richToolbar.appendChild(gHist);

  function refreshToolbarState() {
    toolbarButtons.forEach((b) => {
      try {
        b._update();
      } catch (_) {
        /* ignore */
      }
    });
  }
  refreshToolbarState();

  // ── Link dialog ───────────────────────────────────────────
  let linkDialog = null;
  let linkPrevFocus = null;
  function ensureLinkDialog() {
    if (linkDialog) return linkDialog;
    const wrap = document.createElement('div');
    wrap.className = 'te-link-dialog';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'te-link-title');
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="te-link-card">' +
      '<h3 id="te-link-title">Link</h3>' +
      '<div class="te-link-field"><label for="te-link-text">Text</label>' +
      '<input id="te-link-text" type="text" autocomplete="off" /></div>' +
      '<div class="te-link-field"><label for="te-link-url">URL</label>' +
      '<input id="te-link-url" type="text" autocomplete="off" placeholder="https://" /></div>' +
      '<p class="te-link-error" id="te-link-error" hidden></p>' +
      '<div class="te-link-foot">' +
      '<button type="button" class="te-link-cancel">Cancel</button>' +
      '<button type="button" class="te-link-remove">Remove link</button>' +
      '<button type="button" class="te-link-ok">Apply</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    linkDialog = {
      el: wrap,
      txt: wrap.querySelector('#te-link-text'),
      url: wrap.querySelector('#te-link-url'),
      err: wrap.querySelector('#te-link-error'),
      ok: wrap.querySelector('.te-link-ok'),
      cancel: wrap.querySelector('.te-link-cancel'),
      remove: wrap.querySelector('.te-link-remove'),
    };
    linkDialog.cancel.addEventListener('click', closeLinkDialog);
    linkDialog.ok.addEventListener('click', applyLinkDialog);
    linkDialog.remove.addEventListener('click', () => {
      editor.chain().focus().unsetLink().run();
      closeLinkDialog();
    });
    linkDialog.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLinkDialog();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        applyLinkDialog();
      } else if (e.key === 'Tab') {
        // Focus trap.
        const focusables = Array.from(
          linkDialog.el.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])'),
        ).filter((n) => !n.disabled && !n.hidden);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    return linkDialog;
  }
  function openLinkDialog() {
    const d = ensureLinkDialog();
    const { from, to, empty } = editor.state.selection;
    const selectedText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    const existing = editor.getAttributes('link') || {};
    d.txt.value = selectedText;
    d.url.value = existing.href || '';
    d.err.hidden = true;
    d.err.textContent = '';
    d.remove.hidden = !existing.href;
    d.el.hidden = false;
    d.el.classList.add('open');
    linkPrevFocus = document.activeElement;
    // If the selection is non-empty we hide the text field — Cmd+K with
    // a selection should only ask for a URL.
    const textRow = d.txt.closest('.te-link-field');
    if (!empty) {
      textRow.style.display = 'none';
      queueMicrotask(() => d.url.focus());
    } else {
      textRow.style.display = '';
      queueMicrotask(() => d.txt.focus());
    }
  }
  function closeLinkDialog() {
    if (!linkDialog) return;
    linkDialog.el.classList.remove('open');
    linkDialog.el.hidden = true;
    if (linkPrevFocus && typeof linkPrevFocus.focus === 'function') {
      try {
        linkPrevFocus.focus();
      } catch (_) {
        /* ignore */
      }
    }
    // Return focus to the editor surface afterwards.
    queueMicrotask(() => editor.commands.focus());
  }
  function applyLinkDialog() {
    if (!linkDialog) return;
    const url = (linkDialog.url.value || '').trim();
    const txt = (linkDialog.txt.value || '').trim();
    if (!url) {
      linkDialog.err.textContent = 'URL is required.';
      linkDialog.err.hidden = false;
      return;
    }
    if (!isSafeLinkUrl(url)) {
      linkDialog.err.textContent = 'That URL scheme is not allowed.';
      linkDialog.err.hidden = false;
      return;
    }
    const { empty } = editor.state.selection;
    if (empty) {
      const label = txt || url;
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: 'text',
            text: label,
            marks: [{ type: 'link', attrs: { href: url } }],
          },
        ])
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    closeLinkDialog();
  }

  // ── Public façade ─────────────────────────────────────────
  // An EventTarget so consumers can do `instance.addEventListener('input', …)`.
  const instance = new EventTarget();

  Object.defineProperty(instance, 'value', {
    get() {
      return hidden.value;
    },
    set(next) {
      const md = String(next === null || next === undefined ? '' : next);
      if (hidden.value === md && mode === 'wysiwyg') {
        // No-op fast path; but always sync TipTap if its serialised
        // form differs (e.g., on first hydration).
        if (getMarkdownFromEditor() === md) return;
      }
      suppressInput = true;
      hidden.value = md;
      if (mode === 'source') {
        if (cmView && cmView.state.doc.toString() !== md) {
          cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: md } });
        }
      }
      // Always update TipTap (even when not focused) so a later mode
      // switch starts from the right document.
      applyMarkdownToEditor(md, false);
      selectionStart = selectionEnd = md.length;
      suppressInput = false;
      emitInput();
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(instance, 'selectionStart', {
    get() {
      if (mode === 'source' && cmView) return cmView.state.selection.main.from;
      return selectionStart;
    },
    set(n) {
      const v = Math.max(0, Math.min(Number(n) || 0, hidden.value.length));
      selectionStart = v;
      if (mode === 'source' && cmView) {
        cmView.dispatch({ selection: { anchor: v, head: v } });
      }
    },
    configurable: true,
    enumerable: true,
  });

  Object.defineProperty(instance, 'selectionEnd', {
    get() {
      if (mode === 'source' && cmView) return cmView.state.selection.main.to;
      return selectionEnd;
    },
    set(n) {
      const v = Math.max(0, Math.min(Number(n) || 0, hidden.value.length));
      selectionEnd = v;
      if (mode === 'source' && cmView) {
        cmView.dispatch({ selection: { anchor: selectionStart, head: v } });
      }
    },
    configurable: true,
    enumerable: true,
  });

  instance.setMode = setMode;
  instance.getMode = () => mode;
  instance.focus = () => {
    if (mode === 'source' && cmView) cmView.focus();
    else editor.commands.focus();
  };
  instance.destroy = () => {
    try {
      editor.destroy();
    } catch (_) {
      /* ignore */
    }
    if (cmView) cmView.destroy();
    cmView = null;
    try {
      slashMenu.destroy();
    } catch (_) {
      /* ignore */
    }
    if (linkDialog && linkDialog.el && linkDialog.el.parentNode) {
      try {
        linkDialog.el.parentNode.removeChild(linkDialog.el);
      } catch (_) {
        /* ignore */
      }
      linkDialog = null;
    }
    rootEl.innerHTML = '';
    rootEl.classList.remove('te-editor');
  };
  // Test/external hooks for Phase 3b features.
  instance.openLinkDialog = openLinkDialog;
  instance.closeLinkDialog = closeLinkDialog;
  instance._slashMenu = slashMenu;
  instance._toolbarButtons = toolbarButtons;

  // Hook the placeholder onto the WYSIWYG when empty (Phase 3b will
  // make this a proper TipTap placeholder extension; for now we use
  // CSS :empty pseudo as a stop-gap).
  if (opts.placeholder) {
    rootEl.dataset.placeholder = opts.placeholder;
  }

  // Hydrate initial content. We do this last so all listeners are in
  // place — but with input suppressed since the caller already knows
  // what they passed in.
  suppressInput = true;
  applyMarkdownToEditor(md0, false);
  suppressInput = false;
  refreshToolbarState();

  // Expose the underlying editors for Phase 3b/c/d hooks. Treat these
  // as semi-private: prefer the façade API where possible.
  instance._tiptap = editor;
  instance._getCM = () => cmView;
  instance._hidden = hidden;

  return instance;
}

function isMacLike() {
  if (typeof navigator === 'undefined') return false;
  // navigator.platform is deprecated but still the most reliable
  // synchronous signal for keyboard symbol selection.
  const p = (navigator.platform || '') + ' ' + (navigator.userAgent || '');
  return /Mac|iPhone|iPad|iPod/i.test(p);
}

// Default export is the namespace expected on window.TEEditor.
export default { mount, isSafeLinkUrl };
