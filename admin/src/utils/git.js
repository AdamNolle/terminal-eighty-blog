import simpleGit from 'simple-git';
import { join } from 'path';

// Get repo path based on environment
const getGitInstance = () => {
    const siteDir = process.env.SITE_DIR || join(process.cwd(), '..', 'site');
    const repoPath = join(siteDir, '..');
    const git = simpleGit(repoPath);
    return git;
};

export async function publishChanges() {
    const git = getGitInstance();
    try {
        console.log('Publishing changes...');
        // Configure author if needed (optional, git might already be configured)
        // await git.addConfig('user.name', 'Terminal Eighty CMS');
        // await git.addConfig('user.email', 'cms@terminaleighty.com');
        
        // Add all changes
        await git.add('.');
        
        // Check if there's anything to commit
        const status = await git.status();
        if (status.isClean()) {
            return { success: true, message: 'Nothing to commit. Site is up to date.' };
        }
        
        // Commit
        const commitMsg = `Update blog content: ${new Date().toISOString()}`;
        await git.commit(commitMsg);
        
        // Push
        await git.push('origin', 'main');
        
        return { success: true, message: 'Changes pushed successfully. Site is building.' };
    } catch (err) {
        console.error('Git publish error:', err);
        throw new Error(`Failed to publish: ${err.message}`);
    }
}

export async function getGitStatus() {
    const git = getGitInstance();
    try {
        const status = await git.status();
        const lastCommit = await git.log({ maxCount: 1 });
        return {
            clean: status.isClean(),
            modified: status.modified,
            created: status.created,
            deleted: status.deleted,
            lastCommit: lastCommit.latest ? {
                hash: lastCommit.latest.hash,
                date: lastCommit.latest.date,
                message: lastCommit.latest.message
            } : null
        };
    } catch (err) {
        return { error: err.message };
    }
}
