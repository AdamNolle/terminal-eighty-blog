import { Router } from 'express';
import { getSystemStats, getTemperature, getDiskUsage, getDockerStats, getBackupStatus } from '../utils/system.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { SITE_DIR } from '../../server.js';

const router = Router();

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
