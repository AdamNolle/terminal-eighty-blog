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
 * Phase 3b will layer custom toolbar buttons + slash menu on top of the
 * instance; Phase 3c adds tables / math / callouts / footnotes; Phase
 * 3d adds find/replace, TOC sidebar, and autosave hooks.
 */
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TaskList, TaskItem } from '@tiptap/extension-list';
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

const tokenizer = MarkdownIt('commonmark', { html: false }).enable('table');

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
  link: {
    mark: 'link',
    getAttrs: (tok) => ({
      href: tok.attrGet('href'),
      title: tok.attrGet('title') || null,
    }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
};

/**
 * Build a MarkdownParser bound to the given TipTap schema. We can't
 * construct it eagerly (the schema only exists after `new Editor(...)`
 * builds it), so this helper takes the live schema.
 *
 * @param {import('prosemirror-model').Schema} schema
 */
function buildParser(schema) {
  return new MarkdownParser(schema, tokenizer, tokenSpec);
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
// Editor instance
// ─────────────────────────────────────────────────────────────────

function buildExtensions() {
  return [
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
  toolbar.setAttribute('aria-label', 'Editor mode');

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

  // Phase 3b will inject more buttons; reserve a flex spacer slot.
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

  // ── TipTap WYSIWYG ────────────────────────────────────────
  const extensions = buildExtensions();
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
      queueMicrotask(() => editor.commands.focus());
    }
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
    rootEl.innerHTML = '';
    rootEl.classList.remove('te-editor');
  };

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

  // Expose the underlying editors for Phase 3b/c/d hooks. Treat these
  // as semi-private: prefer the façade API where possible.
  instance._tiptap = editor;
  instance._getCM = () => cmView;
  instance._hidden = hidden;

  return instance;
}

// Default export is the namespace expected on window.TEEditor.
export default { mount };
