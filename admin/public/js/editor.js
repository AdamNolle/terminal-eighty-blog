// @ts-check
/**
 * editor.js — minimal editor wiring for Phase 2.
 *
 * Phase 2 deliberately ships a plain <textarea id="editor-fallback">
 * inside <div id="editor-root">. Phase 3 will replace this with a
 * TipTap + CodeMirror bundle mounted onto #editor-root and remove
 * the textarea. Look for the "// Phase 3:" comment below.
 *
 * Backend (unchanged):
 *   GET    /api/posts             → list
 *   GET    /api/posts/:filename   → { data, content }
 *   POST   /api/posts             → create
 *   PUT    /api/posts/:filename   → update
 *   DELETE /api/posts/:filename
 *   POST   /api/publish
 *   GET/POST/DELETE /api/media…   (via window.TE.media)
 */
(function () {
  if (!/\/editor(\.html)?$/.test(window.location.pathname)) return;

  // ── DOM refs ──────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const titleEl = $('post-title');
  const slugEl = $('post-slug');
  const dateEl = $('post-date');
  const draftEl = $('post-draft');
  const tagsEl = $('post-tags');
  const descEl = $('post-desc');
  const bodyEl = $('editor-fallback'); // Phase 3 replaces this
  const btnSave = $('btn-save');
  const btnSave2 = $('btn-save-2');
  const btnPub = $('btn-publish');
  const btnPub2 = $('btn-publish-2');
  const btnDel = $('btn-delete');
  const savedTxt = $('ed-saved-text');
  const statusPill = $('ed-status-pill');
  const wordsTop = $('editor-words');
  const wordsFoot = $('foot-words');
  const wordsSide = $('editor-side-words');
  const readTop = $('editor-read');
  const readFoot = $('foot-read');
  const readSide = $('editor-side-read');
  const sideStatus = $('editor-side-status');
  const crumbEditor = $('crumb-editor');
  const spTitle = $('sp-title');
  const spDesc = $('sp-desc');
  const tagDataList = $('tag-suggestions');
  const fileFoot = $('foot-file');

  const urlParams = new URLSearchParams(window.location.search);
  // Accept either `?file=` (legacy) or `?slug=` (Phase 2 plan)
  let currentFile =
    urlParams.get('file') || (urlParams.get('slug') ? `${urlParams.get('slug')}.md` : null);

  let isDirty = false;
  let autosaveTimer = null;

  // Warn the user before navigating away with unsaved edits.
  window.addEventListener('beforeunload', (e) => {
    if (!isDirty) return;
    e.preventDefault();
    // Modern browsers ignore the message, but Chrome still needs this set.
    e.returnValue = '';
  });

  // ── Helpers ──────────────────────────────────────────────
  function setSaved(text) {
    if (savedTxt) savedTxt.textContent = text || '';
  }
  function updateStatusPill() {
    if (!statusPill) return;
    const isDraft = draftEl?.value === 'true';
    statusPill.textContent = isDraft ? 'DRAFT' : 'PUBLISHED';
    statusPill.classList.toggle('pub', !isDraft);
    if (sideStatus) sideStatus.textContent = isDraft ? 'Draft' : 'Published';
  }
  function updateMetrics() {
    const text = (bodyEl?.value || '').trim();
    const words = text ? text.split(/\s+/).length : 0;
    const mins = Math.max(0, Math.ceil(words / 200));
    const wText = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
    const rText = `${mins} min`;
    if (wordsTop) wordsTop.textContent = wText;
    if (wordsFoot) wordsFoot.textContent = words.toLocaleString();
    if (wordsSide) wordsSide.textContent = words.toLocaleString();
    if (readTop) readTop.textContent = rText;
    if (readFoot) readFoot.textContent = mins.toString();
    if (readSide) readSide.textContent = rText;
  }
  function updateSocialPreview() {
    if (spTitle) spTitle.textContent = (titleEl?.value || '').trim() || 'Post title';
    if (spDesc) spDesc.textContent = (descEl?.value || '').trim() || 'Description appears here…';
  }
  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  function markDirty() {
    isDirty = true;
    setSaved('Unsaved changes');
    scheduleAutosave();
  }
  function setCurrentFile(filename) {
    currentFile = filename;
    if (filename) {
      const u = new URL(window.location);
      u.searchParams.set('file', filename);
      window.history.replaceState({}, '', u);
      if (btnDel) btnDel.style.display = '';
      if (fileFoot) fileFoot.textContent = filename;
    } else {
      if (btnDel) btnDel.style.display = 'none';
      if (fileFoot) fileFoot.textContent = '';
    }
    if (crumbEditor) crumbEditor.textContent = filename || 'New post';
  }

  // ── Load tags into <datalist> for autocomplete ────────────
  async function loadTagSuggestions() {
    if (!tagDataList) return;
    try {
      const posts = await TE.fetchJSON('/api/posts');
      const set = new Set();
      (posts || []).forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
      tagDataList.innerHTML = Array.from(set)
        .sort()
        .map((t) => `<option value="${TE.escape(t)}">`)
        .join('');
    } catch (_) {
      /* non-fatal */
    }
  }

  // ── Load existing post ────────────────────────────────────
  async function loadPost(filename) {
    try {
      const { data, content } = await TE.fetchJSON(`/api/posts/${encodeURIComponent(filename)}`);
      titleEl.value = data.title || '';
      slugEl.value = data.slug || filename.replace(/\.md$/, '');
      draftEl.value = data.draft ? 'true' : 'false';
      descEl.value = data.description || '';
      tagsEl.value = (data.tags || []).join(', ');
      if (data.date) {
        const d = new Date(data.date);
        // Adjust for local TZ so the datetime-local input shows the
        // same wall-clock time the user expects.
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        dateEl.value = d.toISOString().slice(0, 16);
      }
      bodyEl.value = content || '';
      setCurrentFile(filename);
      isDirty = false;
      setSaved('Saved');
      updateMetrics();
      updateSocialPreview();
      updateStatusPill();
    } catch (err) {
      TE.toast(err.message || 'Failed to load post.', 'error');
    }
  }

  // ── Save ──────────────────────────────────────────────────
  async function savePost() {
    if (!titleEl.value.trim()) {
      TE.toast('Title is required.', 'error');
      return false;
    }
    const data = {
      title: titleEl.value.trim(),
      slug: slugEl.value.trim() || slugify(titleEl.value),
      draft: draftEl.value === 'true',
      date: dateEl.value ? new Date(dateEl.value).toISOString() : new Date().toISOString(),
      description: descEl.value.trim(),
      tags: tagsEl.value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const content = bodyEl.value || '';
    const url = currentFile ? `/api/posts/${encodeURIComponent(currentFile)}` : '/api/posts';
    const method = currentFile ? 'PUT' : 'POST';

    setSaved('Saving…');
    try {
      const result = await TE.fetchJSON(url, {
        method,
        body: JSON.stringify({ data, content }),
      });
      isDirty = false;
      setSaved('Saved');
      if (result.filename && result.filename !== currentFile) {
        setCurrentFile(result.filename);
      } else if (!currentFile && result.filename) {
        setCurrentFile(result.filename);
      }
      updateStatusPill();
      return true;
    } catch (err) {
      setSaved('Save failed');
      TE.toast(err.message || 'Save failed.', 'error');
      return false;
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      // Only autosave existing posts; never accidentally create new posts
      // from a half-typed draft.
      if (currentFile && titleEl.value.trim()) savePost();
    }, 10000);
  }

  async function publishSite() {
    if (!(await savePost())) return;
    btnPub.disabled = btnPub2.disabled = true;
    try {
      await TE.fetchJSON('/api/publish', { method: 'POST', body: '{}' });
      TE.toast('Publish triggered.');
    } catch (err) {
      TE.toast(err.message || 'Publish failed.', 'error');
    } finally {
      btnPub.disabled = btnPub2.disabled = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────
  async function deletePost() {
    if (!currentFile) return;
    if (!confirm(`Delete "${titleEl.value || currentFile}" permanently?`)) return;
    try {
      await TE.fetchJSON(`/api/posts/${encodeURIComponent(currentFile)}`, {
        method: 'DELETE',
        body: undefined,
      });
      TE.toast('Post deleted.');
      window.location.href = '/index.html';
    } catch (err) {
      TE.toast(err.message || 'Delete failed.', 'error');
    }
  }

  // ── Wire DOM ──────────────────────────────────────────────
  function boot() {
    // Title → slug auto-fill (only when slug is empty or matches the
    // previous auto-derived slug).
    let lastAutoSlug = '';
    titleEl.addEventListener('input', () => {
      const auto = slugify(titleEl.value);
      if (!slugEl.value || slugEl.value === lastAutoSlug) {
        slugEl.value = auto;
        lastAutoSlug = auto;
      }
      updateSocialPreview();
      markDirty();
    });

    // Dirty-tracking + UI updates
    [slugEl, dateEl, draftEl, tagsEl].forEach((el) => el.addEventListener('input', markDirty));
    descEl.addEventListener('input', () => {
      updateSocialPreview();
      markDirty();
    });
    bodyEl.addEventListener('input', () => {
      updateMetrics();
      markDirty();
    });
    draftEl.addEventListener('change', updateStatusPill);

    // Action buttons (both top + sidebar copies)
    [btnSave, btnSave2].forEach((b) => b && b.addEventListener('click', savePost));
    [btnPub, btnPub2].forEach((b) => b && b.addEventListener('click', publishSite));
    if (btnDel) btnDel.addEventListener('click', deletePost);

    // Keyboard: Cmd/Ctrl + S
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        savePost();
      }
    });

    // Media uploader inside the editor sidebar (Phase 4 will overhaul)
    if (window.TE && TE.media) {
      TE.media.bindUploader({
        dropzone: 'ed-dropzone',
        input: 'ed-file-input',
        recent: 'ed-recent-media',
        onInsert: ({ url }) => {
          if (!url) return;
          // Insert markdown image at cursor — fallback editor only.
          const md = `\n![](${url})\n`;
          const start = bodyEl.selectionStart || 0;
          const end = bodyEl.selectionEnd || 0;
          bodyEl.value = bodyEl.value.slice(0, start) + md + bodyEl.value.slice(end);
          bodyEl.selectionStart = bodyEl.selectionEnd = start + md.length;
          bodyEl.focus();
          updateMetrics();
          markDirty();
        },
      });
    }

    // Phase 3: TipTap mount here
    // ----------------------------
    // Replace the textarea inside #editor-root with a TipTap editor.
    // Keep these contracts intact:
    //   - bodyEl.value (string)   — replace w/ editor.getMarkdown()
    //   - bodyEl.input event      — call markDirty() + updateMetrics()
    //   - selectionStart/End      — needed for media insertion above
    // The savePost() flow already consumes a string `content`, so the
    // bundle just needs to expose a textarea-compatible facade.

    // Initial state
    if (currentFile) {
      loadPost(currentFile);
    } else {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      dateEl.value = now.toISOString().slice(0, 16);
      setCurrentFile(null);
      updateMetrics();
      updateSocialPreview();
      updateStatusPill();
      setSaved('');
    }
    loadTagSuggestions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
