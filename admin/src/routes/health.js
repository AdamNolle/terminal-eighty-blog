import { Router } from 'express';
import { getSystemStats, getTemperature, getDiskUsage, getDockerStats, getBackupStatus } from '../utils/system.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

const SITE_DIR = process.env.SITE_DIR || join(process.cwd(), '..', 'site');

const router = Router();

// Secure Terminal Endpoint
router.post('/terminal', async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).json({ error: 'Command required' });
        
        // Timeout to prevent hanging commands
        const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
        
        res.json({
            output: stdout + (stderr ? '\n[STDERR]:\n' + stderr : '')
        });
    } catch (err) {
        res.json({
            output: err.stdout + '\n[ERROR]:\n' + err.stderr + '\n' + err.message
        });
    }
});

// Central health endpoint that gathers all data
router.get('/', async (req, res) => {
    try {
        const [temp, disk, docker, backup] = await Promise.all([
            getTemperature(),
            getDiskUsage(),
            getDockerStats(),
            getBackupStatus()
        ]);
        
        const system = getSystemStats();
        
        // Basic blog stats
        let blogStats = { posts: 0, drafts: 0 };
        try {
            const postsDir = join(SITE_DIR, 'content', 'posts');
            const files = readdirSync(postsDir).filter(f => f.endsWith('.md'));
            blogStats.posts = files.length;
            // Not parsing all frontmatter here for speed, just total count
        } catch (e) {}

        res.json({
            system,
            temperature: temp,
            disk,
            docker,
            backup,
            blog: blogStats
        });
    } catch (err) {
        console.error('Health API error:', err);
        res.status(500).json({ error: 'Failed to fetch health stats' });
    }
});

export default router;
