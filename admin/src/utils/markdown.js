// @ts-check
/**
 * markdown.js — server-side Markdown / ProseMirror JSON helpers.
 *
 * The Phase 3 admin frontend (admin/public/js/editor.entry.js) bundles
 * TipTap + a custom prosemirror-markdown parser/serializer. We mirror
 * that contract on the server so Node code (e.g., future preview
 * rendering, search-index build, save-time validation) can round-trip
 * Markdown through the same TipTap-shaped document tree without having
 * to spin up a browser-only TipTap editor.
 *
 * The schema declared here is intentionally a minimal copy of what
 * StarterKit + extension-link + extension-task-list produce — node
 * names match (camelCase: `bulletList`, `codeBlock`, `hardBreak`,
 * `horizontalRule`, plus `taskList`/`taskItem`), and the mark names
 * match TipTap's (`bold`, `italic`, `code`, `link`). DOM
 * serialization is intentionally simple; this module is for parsing,
 * not rendering.
 *
 * Round-trip rules (mirrored from the bundle):
 *   - ATX headings, never Setext
 *   - bullet lists use "-"
 *   - ordered lists default `start: 1`
 *   - fenced code blocks (```), never indented
 *   - inline links, never reference-style
 *   - hardBreak serialises as a bare "\n"
 *
 * Used by:
 *   - admin/test/editor.vitest.test.js (round-trip fixture test)
 *   - Phase 3c+ server-side preview rendering (not yet wired)
 */
import { Schema } from 'prosemirror-model';
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';

/**
 * Minimal TipTap-shaped ProseMirror schema. Only nodes/marks that
 * survive Markdown round-trip are declared.
 */
export const tipTapSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    horizontalRule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    codeBlock: {
      content: 'text*',
      group: 'block',
      code: true,
      defining: true,
      marks: '',
      attrs: { language: { default: null } },
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full',
          getAttrs: (node) => ({
            language: node.getAttribute('data-language') || null,
          }),
        },
      ],
      toDOM: (node) => [
        'pre',
        node.attrs.language ? { 'data-language': node.attrs.language } : {},
        ['code', 0],
      ],
    },
    bulletList: {
      content: 'listItem+',
      group: 'block',
      attrs: { tight: { default: false } },
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    orderedList: {
      content: 'listItem+',
      group: 'block',
      attrs: { start: { default: 1 }, tight: { default: false } },
      parseDOM: [
        {
          tag: 'ol',
          getAttrs: (dom) => ({
            start: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) || 1 : 1,
          }),
        },
      ],
      toDOM: (node) => ['ol', node.attrs.start === 1 ? {} : { start: node.attrs.start }, 0],
    },
    listItem: {
      content: 'block+',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: () => ['li', 0],
    },
    taskList: {
      content: 'taskItem+',
      group: 'block',
      parseDOM: [{ tag: 'ul[data-type="taskList"]' }],
      toDOM: () => ['ul', { 'data-type': 'taskList' }, 0],
    },
    taskItem: {
      content: 'paragraph block*',
      defining: true,
      attrs: { checked: { default: false } },
      parseDOM: [
        {
          tag: 'li[data-type="taskItem"]',
          getAttrs: (dom) => ({ checked: dom.getAttribute('data-checked') === 'true' }),
        },
      ],
      toDOM: (node) => [
        'li',
        { 'data-type': 'taskItem', 'data-checked': node.attrs.checked ? 'true' : 'false' },
        0,
      ],
    },
    text: { group: 'inline' },
    image: {
      inline: true,
      group: 'inline',
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
      draggable: true,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom) => ({
            src: dom.getAttribute('src'),
            title: dom.getAttribute('title'),
            alt: dom.getAttribute('alt'),
          }),
        },
      ],
      toDOM: (node) => ['img', node.attrs],
    },
    hardBreak: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
  },
  marks: {
    bold: {
      parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
      toDOM: () => ['strong'],
    },
    italic: {
      parseDOM: [{ tag: 'em' }, { tag: 'i' }],
      toDOM: () => ['em'],
    },
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom) => ({
            href: dom.getAttribute('href'),
            title: dom.getAttribute('title'),
          }),
        },
      ],
      toDOM: (node) => ['a', node.attrs],
    },
    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM: () => ['code'],
    },
  },
});

const tokenizer = MarkdownIt('commonmark', { html: false });

function listIsTight(tokens, i) {
  while (++i < tokens.length) {
    // eslint-disable-next-line security/detect-object-injection -- `i` is bounded by tokens.length above.
    const tok = tokens[i];
    if (tok.type !== 'list_item_open') return tok.hidden;
  }
  return false;
}

/** markdown-it token → TipTap-shaped node/mark spec. */
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

export const markdownParser = new MarkdownParser(tipTapSchema, tokenizer, tokenSpec);

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

export const markdownSerializer = new MarkdownSerializer(
  {
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
      state.write(state.repeat('#', node.attrs.level) + ' ');
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write('---');
      state.closeBlock(node);
    },
    bulletList(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    orderedList(state, node) {
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
      state.renderList(node, '  ', () => '');
    },
    taskItem(state, node) {
      state.write(`- ${node.attrs.checked ? '[x]' : '[ ]'} `);
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
          state.write('\n');
          return;
        }
      }
    },
    text(state, node) {
      // `inAutolink` is an internal serializer flag — the public types
      // omit it but the field is documented as @internal. Cast through
      // any to silence TS's strict type check.
      state.text(node.text, !(/** @type {any} */ (state).inAutolink));
    },
  },
  {
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open() {
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
  },
  { hardBreakNodeName: 'hardBreak' },
);

/**
 * Parse a Markdown string into a ProseMirror document (TipTap-shaped).
 * @param {string} markdown
 * @returns {import('prosemirror-model').Node}
 */
export function parseMarkdown(markdown) {
  return markdownParser.parse(markdown || '');
}

/**
 * Serialize a ProseMirror document back to Markdown.
 * @param {import('prosemirror-model').Node} doc
 * @returns {string}
 */
export function serializeMarkdown(doc) {
  return markdownSerializer.serialize(doc);
}

/**
 * Convenience: round-trip a Markdown string through parse → serialize.
 * Useful for tests asserting fixed-point stability.
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeMarkdown(markdown) {
  return serializeMarkdown(parseMarkdown(markdown));
}
