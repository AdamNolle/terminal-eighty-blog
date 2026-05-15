import { Router } from 'express';
import multer from 'multer';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { mkdirSync, readdirSync, statSync } from 'fs';

const router = Router();
const SITE_DIR = process.env.SITE_DIR || join(process.cwd(), '..', 'site');
const imgDir = join(SITE_DIR, 'static', 'images');

// Ensure directory exists
mkdirSync(imgDir, { recursive: true });

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, imgDir);
  },
  filename: function (req, file, cb) {
    // Generate a random 8-character string for the filename
    const uniqueSuffix = randomBytes(4).toString('hex');
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '').toLowerCase();
    cb(null, `${uniqueSuffix}-${cleanName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Allow images and some videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Upload media
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Return the URL path that Hugo will use
  res.json({
    success: true,
    url: `/images/${req.file.filename}`,
    filename: req.file.filename,
  });
});

// List media
router.get('/', (req, res) => {
  try {
    const files = readdirSync(imgDir).filter((f) => !f.startsWith('.'));
    const mediaList = files
      .map((file) => {
        const stats = statSync(join(imgDir, file));
        return {
          url: `/images/${file}`,
          filename: file,
          date: stats.mtime.toISOString(),
          size: stats.size,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json(mediaList);
  } catch (err) {
    console.error('Error reading images directory:', err);
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// Delete media
router.delete('/:filename', (req, res) => {
  try {
    const { basename } = require('path');
    const { unlinkSync } = require('fs');
    const safeFilename = basename(req.params.filename);
    unlinkSync(join(imgDir, safeFilename));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
