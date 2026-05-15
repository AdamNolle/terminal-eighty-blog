// @ts-check
/**
 * media.js — minimal media list + upload for the editor sidebar.
 *
 * Backend (unchanged in Phase 2):
 *   GET    /api/media           → [ { url, filename, date, size } ]
 *   POST   /api/media/upload    → { success, url, filename }   (multipart form)
 *   DELETE /api/media/:filename
 *
 * Phase 4 will overhaul this endpoint; Phase 5 adds processing status.
 * For Phase 2 we keep the surface tiny: drag-drop into the dropzone,
 * click to browse, render the 9 most recent thumbnails. We expose
 * window.TE.media so editor.js can:
 *   - upload a file and insert its URL
 *   - refresh the recents grid
 */
(function () {
  if (window.TE && window.TE.media) return;
  if (!window.TE) window.TE = {};

  const media = (window.TE.media = {});
  let recent = [];

  media.list = async function listMedia() {
    const data = await TE.fetchJSON('/api/media');
    recent = Array.isArray(data) ? data : [];
    return recent;
  };

  media.upload = async function uploadMedia(file) {
    const fd = new FormData();
    fd.append('file', file);
    // Cannot use fetchJSON helper directly — multipart needs no JSON header.
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
    });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Not authenticated');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Upload failed (${res.status})`);
    }
    return data; // { success, url, filename }
  };

  media.delete = async function deleteMedia(filename) {
    return TE.fetchJSON(`/api/media/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      body: undefined,
    });
  };

  /**
   * Wire a dropzone + recents grid + hidden <input type=file>.
   * @param {{
   *   dropzone: string | HTMLElement,
   *   input: string | HTMLInputElement,
   *   recent: string | HTMLElement,
   *   onInsert?: (file: {url?: string, filename?: string}) => void
   * }} opts
   * @returns {{refresh: () => Promise<void>}}
   */
  media.bindUploader = function bindUploader(opts) {
    const dropzone =
      typeof opts.dropzone === 'string' ? document.getElementById(opts.dropzone) : opts.dropzone;
    const input = typeof opts.input === 'string' ? document.getElementById(opts.input) : opts.input;
    const recentEl =
      typeof opts.recent === 'string' ? document.getElementById(opts.recent) : opts.recent;
    const onInsert = typeof opts.onInsert === 'function' ? opts.onInsert : () => {};

    async function refresh() {
      if (!recentEl) return;
      try {
        await media.list();
      } catch (err) {
        recentEl.innerHTML = `<div style="grid-column:1/-1;color:var(--fg-mute);font-size:11px;">${TE.escape(err.message || 'Failed to load media.')}</div>`;
        return;
      }
      const top = recent.slice(0, 9);
      if (!top.length) {
        recentEl.innerHTML = `<div style="grid-column:1/-1;color:var(--fg-mute);font-size:11px;">No uploads yet.</div>`;
        return;
      }
      recentEl.innerHTML = top
        .map((m) => {
          const ext = (m.filename || '').split('.').pop().toUpperCase();
          return `
          <button type="button" class="thumb" data-url="${TE.escape(m.url)}" data-filename="${TE.escape(m.filename)}"
                  style="background-image:url('${TE.escape(m.url)}'); border:1px solid var(--glass-border); padding:0;">
            <span class="badge" aria-hidden="true">${TE.escape(ext)}</span>
            <span class="sr-only">${TE.escape(m.filename)}</span>
          </button>`;
        })
        .join('');
      recentEl.querySelectorAll('.thumb').forEach((el) => {
        el.addEventListener('click', () => {
          const url = el.getAttribute('data-url');
          const filename = el.getAttribute('data-filename');
          onInsert({ url, filename });
        });
      });
    }

    async function handleFile(file) {
      if (!file) return;
      if (!/^image\/|^video\//.test(file.type)) {
        TE.toast('Only images and videos allowed.', 'error');
        return;
      }
      try {
        const data = await media.upload(file);
        TE.toast('Uploaded.');
        onInsert(data);
        refresh();
      } catch (err) {
        TE.toast(err.message || 'Upload failed.', 'error');
      }
    }

    if (dropzone) {
      dropzone.addEventListener('click', () => input && input.click());
      dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input && input.click();
        }
      });
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag');
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        handleFile(file);
      });
    }
    if (input) {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        handleFile(file);
        input.value = '';
      });
    }

    refresh();
    return { refresh };
  };
})();
