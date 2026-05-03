import { Router } from 'express';
import { publishChanges, getGitStatus } from '../utils/git.js';

const router = Router();

// Trigger publish (commit + push)
router.post('/', async (req, res) => {
    try {
        const result = await publishChanges();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get publish status (uncommitted changes, etc.)
router.get('/status', async (req, res) => {
    try {
        const status = await getGitStatus();
        res.json(status);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
