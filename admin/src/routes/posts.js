import { Router } from 'express';
import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'fs';
import path, { join } from 'path';
import { parsePost, serializePost } from '../utils/frontmatter.js';

const SITE_DIR = process.env.SITE_DIR || join(process.cwd(), '..', 'site');
const router = Router();
const postsDir = join(SITE_DIR, 'content', 'posts');

// Utility to get all posts
function getAllPosts() {
  try {
    const files = readdirSync(postsDir).filter((f) => f.endsWith('.md'));
    const posts = files.map((file) => {
      const content = readFileSync(join(postsDir, file), 'utf-8');
      const { data } = parsePost(content);
      const stats = statSync(join(postsDir, file));

      return {
        filename: file,
        title: data.title || 'Untitled',
        slug: data.slug || file.replace('.md', ''),
        date: data.date || stats.mtime.toISOString(),
        draft: data.draft === true,
        tags: data.tags || [],
      };
    });

    // Sort by date descending
    return posts.sort(
      (a, b) =>
        new Date(/** @type {string} */ (b.date)).getTime() -
        new Date(/** @type {string} */ (a.date)).getTime(),
    );
  } catch (err) {
    console.error('Error reading posts directory:', err);
    return [];
  }
}

// GET all posts
router.get('/', (req, res) => {
  res.json(getAllPosts());
});

// GET single post
router.get('/:filename', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const fileContent = readFileSync(join(postsDir, safeFilename), 'utf-8');
    const { data, content } = parsePost(fileContent);
    res.json({ data, content });
  } catch (_err) {
    res.status(404).json({ error: 'Post not found' });
  }
});

// CREATE post
router.post('/', (req, res) => {
  try {
    const { data, content } = req.body;
    if (!data || !data.title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const rawSlug =
      data.slug ||
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    const slug = path.basename(rawSlug);
    const filename = `${slug}.md`;

    // Check if exists
    try {
      statSync(join(postsDir, filename));
      return res.status(400).json({ error: 'A post with this slug already exists' });
    } catch {
      /* Doesn't exist, good */
    }

    data.slug = slug;
    if (!data.date) data.date = new Date().toISOString();

    const fileContent = serializePost(data, content || '');
    writeFileSync(join(postsDir, filename), fileContent);

    res.json({ success: true, filename, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// UPDATE post
router.put('/:filename', (req, res) => {
  try {
    const { data, content } = req.body;
    const oldFilename = path.basename(req.params.filename);
    const rawSlug = data.slug || oldFilename.replace('.md', '');
    const slug = path.basename(rawSlug);
    const newFilename = `${slug}.md`;

    const fileContent = serializePost(data, content || '');

    // Write new content
    writeFileSync(join(postsDir, newFilename), fileContent);

    // Delete old file if name changed
    if (oldFilename !== newFilename) {
      unlinkSync(join(postsDir, oldFilename));
    }

    res.json({ success: true, filename: newFilename, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE post
router.delete('/:filename', (req, res) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    unlinkSync(join(postsDir, safeFilename));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

export default router;
