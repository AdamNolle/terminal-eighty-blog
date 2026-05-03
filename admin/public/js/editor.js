import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// ── Setup Parsers ──
const mdParser = new MarkdownIt({ html: true, linkify: true, breaks: true });
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.use(gfm);

const lowlight = createLowlight(common);

// ── State ──
const urlParams = new URLSearchParams(window.location.search);
const currentFile = urlParams.get('file');
let editor;
let isMarkdownMode = false;
let isDirty = false;
let saveTimeout;

// ── Elements ──
const titleInput = document.getElementById('post-title');
const slugInput = document.getElementById('post-slug');
const draftSelect = document.getElementById('post-draft');
const dateInput = document.getElementById('post-date');
const tagsInput = document.getElementById('post-tags');
const descInput = document.getElementById('post-desc');
const btnSave = document.getElementById('btn-save');
const btnPublish = document.getElementById('btn-publish');
const btnDelete = document.getElementById('btn-delete');
const saveStatus = document.getElementById('save-status');

const editorMetrics = document.getElementById('editor-metrics');
const spTitle = document.getElementById('sp-title');
const spDesc = document.getElementById('sp-desc');
const tagSuggestions = document.getElementById('tag-suggestions');

// ── Toast Utility ──
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateStatus(msg) {
    saveStatus.textContent = msg;
}

function updateMetrics() {
    let text = '';
    if (isMarkdownMode) {
        text = document.getElementById('markdown-source').value;
    } else if (editor) {
        text = editor.getText();
    }
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const mins = Math.ceil(words / 200);
    if (editorMetrics) editorMetrics.textContent = `${words} words | ${mins} min`;
}

function updateSocialPreview() {
    if (spTitle) spTitle.textContent = titleInput.value || 'Post Title';
    if (spDesc) spDesc.textContent = descInput.value || 'Description will appear here...';
}

async function loadTags() {
    try {
        const res = await fetch('/api/posts');
        const posts = await res.json();
        const allTags = new Set();
        posts.forEach(p => {
            if (p.tags) p.tags.forEach(t => allTags.add(t));
        });
        if (tagSuggestions) {
            tagSuggestions.innerHTML = '';
            allTags.forEach(tag => {
                const opt = document.createElement('option');
                opt.value = tag;
                tagSuggestions.appendChild(opt);
            });
        }
    } catch(err) { console.error('Failed to load tags'); }
}

// ── Harper WASM Integration (Grammar Checker) ──
// Harper is a Rust-based grammar checker that runs entirely in WASM
async function initHarper() {
    try {
        // Import Harper WASM bindings dynamically
        const { HarperWebSetup, Linter } = await import('https://esm.sh/harper.js@0.14.0');
        
        // Setup WASM
        await HarperWebSetup();
        const linter = new Linter();
        
        // Create TipTap Extension for Harper
        const { Extension, Plugin, PluginKey, Decoration, DecorationSet } = await import('@tiptap/core');
        
        const HarperExtension = Extension.create({
            name: 'harper',
            addProseMirrorPlugins() {
                const pluginKey = new PluginKey('harper');
                return [
                    new Plugin({
                        key: pluginKey,
                        state: {
                            init() { return DecorationSet.empty; },
                            apply(tr, oldSet) {
                                // Only run linter when document changes and not in markdown mode
                                if (!tr.docChanged || isMarkdownMode) return oldSet;
                                
                                const text = tr.doc.textContent;
                                if (!text || text.length < 5) return DecorationSet.empty;
                                
                                try {
                                    // Run Harper grammar check
                                    const lints = linter.lint(text);
                                    
                                    const decos = lints.map(lint => {
                                        // Map text offsets back to node positions
                                        // This is a simplified mapping, might need adjustment for complex nodes
                                        const from = Math.max(1, Math.min(tr.doc.nodeSize - 2, lint.span.start + 1));
                                        const to = Math.max(from + 1, Math.min(tr.doc.nodeSize - 2, lint.span.end + 1));
                                        
                                        return Decoration.inline(from, to, {
                                            class: 'harper-suggestion',
                                            title: lint.message
                                        });
                                    });
                                    
                                    return DecorationSet.create(tr.doc, decos);
                                } catch (e) {
                                    console.error('Harper linting error:', e);
                                    return oldSet;
                                }
                            }
                        },
                        props: {
                            decorations(state) {
                                return this.getState(state);
                            }
                        }
                    })
                ];
            }
        });
        
        console.log("Harper Grammar Checker loaded successfully.");
        return HarperExtension;
        
    } catch (e) {
        console.warn("Harper failed to load. Running without grammar check.", e);
        return null;
    }
}

// ── Initialize Editor ──
async function initEditor() {
    const extensions = [
        StarterKit,
        Image,
        Link.configure({ openOnClick: false }),
        Placeholder.configure({ placeholder: 'Write your post here...' }),
        CodeBlockLowlight.configure({ lowlight })
    ];
    
    // Add Harper if available
    const harperExt = await initHarper();
    if (harperExt) extensions.push(harperExt);

    editor = new Editor({
        element: document.getElementById('editor-element'),
        extensions,
        content: '',
        onUpdate: () => {
            isDirty = true;
            updateStatus('Unsaved changes');
            scheduleAutosave();
            updateMetrics();
        },
        onSelectionUpdate: updateToolbar
    });

    setupToolbar();
    setupMarkdownToggle();
    setupImageUpload();
    
    // Load existing post if file param exists
    if (currentFile) {
        await loadPost(currentFile);
        btnDelete.style.display = 'block';
    } else {
        // Set default date for new post
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dateInput.value = now.toISOString().slice(0, 16);
        updateMetrics();
        updateSocialPreview();
    }
    
    loadTags();
}

// ── Load / Save Logic ──
async function loadPost(filename) {
    try {
        const res = await fetch(`/api/posts/${filename}`);
        if (!res.ok) throw new Error('Post not found');
        const { data, content } = await res.json();

        // Populate Frontmatter
        titleInput.value = data.title || '';
        slugInput.value = data.slug || filename.replace('.md', '');
        draftSelect.value = data.draft ? 'true' : 'false';
        descInput.value = data.description || '';
        tagsInput.value = (data.tags || []).join(', ');
        
        if (data.date) {
            const d = new Date(data.date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            dateInput.value = d.toISOString().slice(0, 16);
        }

        // Parse markdown to HTML for TipTap
        const html = mdParser.render(content || '');
        editor.commands.setContent(html);
        document.getElementById('markdown-source').value = content || '';
        
        isDirty = false;
        updateStatus('');
        updateMetrics();
        updateSocialPreview();
    } catch (err) {
        showToast('Error loading post');
    }
}

async function savePost() {
    if (!titleInput.value) {
        alert('Title is required');
        return false;
    }

    const data = {
        title: titleInput.value,
        slug: slugInput.value,
        draft: draftSelect.value === 'true',
        date: new Date(dateInput.value).toISOString(),
        description: descInput.value,
        tags: tagsInput.value.split(',').map(t => t.trim()).filter(Boolean)
    };

    let content = '';
    if (isMarkdownMode) {
        content = document.getElementById('markdown-source').value;
    } else {
        // Convert TipTap HTML back to Markdown
        const html = editor.getHTML();
        content = turndown.turndown(html);
    }

    try {
        updateStatus('Saving...');
        const url = currentFile ? `/api/posts/${currentFile}` : '/api/posts';
        const method = currentFile ? 'PUT' : 'POST';
        
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, content })
        });
        
        const result = await res.json();
        if (res.ok) {
            isDirty = false;
            updateStatus('Saved');
            if (!currentFile || currentFile !== result.filename) {
                // Update URL if new or slug changed without reloading
                const newUrl = new URL(window.location);
                newUrl.searchParams.set('file', result.filename);
                window.history.replaceState({}, '', newUrl);
                btnDelete.style.display = 'block';
            }
            return true;
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        updateStatus('Save failed');
        alert('Save failed: ' + err.message);
        return false;
    }
}

// ── Toolbar & Modes ──
function setupToolbar() {
    document.querySelectorAll('#toolbar button[data-cmd]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isMarkdownMode) return;
            const cmd = btn.dataset.cmd;
            editor.chain().focus().toggleNode(cmd, {}).run() || editor.chain().focus().toggleMark(cmd).run();
        });
    });

    document.getElementById('btn-link').addEventListener('click', () => {
        if (isMarkdownMode) return;
        const url = window.prompt('URL');
        if (url) editor.chain().focus().setLink({ href: url }).run();
        else editor.chain().focus().unsetLink().run();
    });
}

function updateToolbar() {
    if (isMarkdownMode) return;
    document.querySelectorAll('#toolbar button[data-cmd]').forEach(btn => {
        const cmd = btn.dataset.cmd;
        if (editor.isActive(cmd)) btn.classList.add('is-active');
        else btn.classList.remove('is-active');
    });
}

function setupMarkdownToggle() {
    const btnToggle = document.getElementById('btn-toggle-md');
    const editorEl = document.getElementById('editor-element');
    const mdEl = document.getElementById('markdown-source');
    
    btnToggle.addEventListener('click', () => {
        isMarkdownMode = !isMarkdownMode;
        
        if (isMarkdownMode) {
            // WYSIWYG -> Markdown
            const html = editor.getHTML();
            mdEl.value = turndown.turndown(html);
            editorEl.style.display = 'none';
            mdEl.style.display = 'block';
            btnToggle.classList.add('is-active');
            btnToggle.textContent = 'WYSIWYG Source';
            // Disable toolbar buttons
            document.querySelectorAll('#toolbar button[data-cmd], #btn-link, #btn-image').forEach(b => b.disabled = true);
        } else {
            // Markdown -> WYSIWYG
            const html = mdParser.render(mdEl.value);
            editor.commands.setContent(html);
            mdEl.style.display = 'none';
            editorEl.style.display = 'flex';
            btnToggle.classList.remove('is-active');
            btnToggle.textContent = 'Markdown Source';
            // Enable toolbar
            document.querySelectorAll('#toolbar button[data-cmd], #btn-link, #btn-image').forEach(b => b.disabled = false);
        }
    });

    mdEl.addEventListener('input', () => {
        isDirty = true;
        updateStatus('Unsaved changes');
        scheduleAutosave();
        updateMetrics();
    });
}

// ── Image Uploads ──
function setupImageUpload() {
    const btnImage = document.getElementById('btn-image');
    const fileInput = document.getElementById('image-upload-input');
    const imageModal = document.getElementById('image-modal');
    const btnCloseImageModal = document.getElementById('btn-close-image-modal');
    const btnUploadNew = document.getElementById('btn-upload-new');
    const gallery = document.getElementById('image-gallery');

    // Open Modal
    btnImage.addEventListener('click', async () => {
        if (isMarkdownMode) return;
        imageModal.style.display = 'flex';
        await loadGallery();
    });

    // Close Modal
    btnCloseImageModal.addEventListener('click', () => {
        imageModal.style.display = 'none';
    });

    // Upload New from Modal
    btnUploadNew.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            imageModal.style.display = 'none';
            await uploadImage(file);
        }
        fileInput.value = '';
    });

    async function loadGallery() {
        gallery.innerHTML = 'Loading images...';
        try {
            const res = await fetch('/api/media');
            const files = await res.json();
            gallery.innerHTML = '';
            if (files.length === 0) {
                gallery.innerHTML = 'No images found.';
                return;
            }
            files.forEach(f => {
                const imgWrap = document.createElement('div');
                imgWrap.style.position = 'relative';
                imgWrap.style.height = '150px';

                const imgInner = document.createElement('div');
                imgInner.style.cursor = 'pointer';
                imgInner.style.border = '2px solid var(--ink-color)';
                imgInner.style.height = '100%';
                imgInner.style.background = `url(${f.url}) center/cover no-repeat var(--bg-color)`;
                imgInner.title = f.filename;
                
                imgInner.addEventListener('click', () => {
                    editor.chain().focus().setImage({ src: f.url }).run();
                    imageModal.style.display = 'none';
                });

                const delBtn = document.createElement('button');
                delBtn.textContent = 'X';
                delBtn.style.position = 'absolute';
                delBtn.style.top = '5px';
                delBtn.style.right = '5px';
                delBtn.style.background = 'var(--terminal-red, #ff4444)';
                delBtn.style.color = '#fff';
                delBtn.style.border = 'none';
                delBtn.style.cursor = 'pointer';
                delBtn.style.padding = '2px 6px';
                delBtn.style.fontWeight = 'bold';
                delBtn.style.borderRadius = '3px';
                
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('Delete this image permanently?')) return;
                    try {
                        const r = await fetch(`/api/media/${f.filename}`, { method: 'DELETE' });
                        if (r.ok) loadGallery();
                        else alert('Failed to delete image');
                    } catch (err) { alert('Error deleting image'); }
                });
                
                imgWrap.appendChild(imgInner);
                imgWrap.appendChild(delBtn);
                gallery.appendChild(imgWrap);
            });
        } catch (err) {
            gallery.innerHTML = 'Failed to load images.';
        }
    }

    // Drag and Drop
    const container = document.querySelector('.tiptap-container');
    container.addEventListener('dragover', e => { e.preventDefault(); container.style.borderColor = 'var(--terminal-green)'; });
    container.addEventListener('dragleave', e => { e.preventDefault(); container.style.borderColor = 'var(--ink-color)'; });
    container.addEventListener('drop', async e => {
        e.preventDefault();
        container.style.borderColor = 'var(--ink-color)';
        if (isMarkdownMode) return;
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await uploadImage(file);
        }
    });

    // Paste Image
    document.addEventListener('paste', async e => {
        if (isMarkdownMode) return;
        const file = Array.from(e.clipboardData.items)
            .find(i => i.type.startsWith('image/'))?.getAsFile();
        if (file) await uploadImage(file);
    });
}

async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        updateStatus('Uploading...');
        const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.success) {
            editor.chain().focus().setImage({ src: data.url }).run();
            updateStatus('Uploaded');
        } else {
            throw new Error(data.error);
        }
    } catch (err) {
        alert('Upload failed: ' + err.message);
        updateStatus('');
    }
}

// ── Autosave ──
function scheduleAutosave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        // Only autosave if title exists and file was previously saved
        if (titleInput.value && currentFile) {
            await savePost();
        }
    }, 10000); // Autosave 10s after typing stops
}

// ── Form Change Listeners ──
[titleInput, slugInput, draftSelect, dateInput, tagsInput, descInput].forEach(el => {
    el.addEventListener('input', () => {
        isDirty = true;
        updateStatus('Unsaved changes');
        scheduleAutosave();
        if (el === titleInput || el === descInput) updateSocialPreview();
    });
});

// ── Action Buttons ──
btnSave.addEventListener('click', savePost);

btnPublish.addEventListener('click', async () => {
    const orig = btnPublish.textContent;
    btnPublish.textContent = '[WORKING...]';
    btnPublish.disabled = true;
    
    if (await savePost()) {
        try {
            const res = await fetch('/api/publish', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('Site publishing triggered!');
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            alert('Publish failed: ' + err.message);
        }
    }
    
    btnPublish.textContent = orig;
    btnPublish.disabled = false;
});

btnDelete.addEventListener('click', async () => {
    if (!currentFile || !confirm('Are you sure you want to delete this post?')) return;
    
    try {
        const res = await fetch(`/api/posts/${currentFile}`, { method: 'DELETE' });
        if (res.ok) window.location.href = '/';
        else throw new Error('Delete failed');
    } catch (err) {
        alert(err.message);
    }
});

// Ctrl/Cmd+S shortcut
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        savePost();
    }
});

// Start
initEditor();
