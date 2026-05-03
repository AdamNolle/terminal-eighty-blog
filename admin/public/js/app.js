// Dashboard App Logic

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Format bytes
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// Format uptime
function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    if (d > 0) return `${d}d ${h}h`;
    return `${h}h ${m}m`;
}

// Load Posts
async function loadPosts() {
    try {
        const res = await fetch('/api/posts');
        const posts = await res.json();
        
        document.getElementById('post-count').textContent = `Total: ${posts.length}`;
        
        const list = document.getElementById('post-list-el');
        list.innerHTML = '';
        
        posts.forEach(post => {
            const li = document.createElement('li');
            li.className = 'post-item';
            
            const date = new Date(post.date).toISOString().split('T')[0];
            
            li.innerHTML = `
                <div>
                    <a href="/editor.html?file=${post.filename}" class="post-item-title">${post.title}</a>
                    ${post.draft ? '<span class="tag-draft">DRAFT</span>' : ''}
                </div>
                <div class="post-item-meta">${date}</div>
            `;
            list.appendChild(li);
        });
    } catch (err) {
        console.error('Failed to load posts', err);
    }
}

// Load Health Stats
async function loadHealth() {
    try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json();
        
        // Uptime
        document.getElementById('health-uptime').textContent = `UP: ${formatUptime(data.system.uptime)}`;
        
        // CPU
        const cpu = data.system.cpu.usagePercent;
        document.getElementById('gauge-val-cpu').textContent = `${cpu}%`;
        const cpuBar = document.getElementById('gauge-bar-cpu');
        cpuBar.style.width = `${cpu}%`;
        cpuBar.className = `gauge-bar ${cpu > 80 ? 'high' : ''}`;
        
        // RAM
        const ram = data.system.memory.usagePercent;
        document.getElementById('gauge-val-ram').textContent = `${ram}%`;
        const ramBar = document.getElementById('gauge-bar-ram');
        ramBar.style.width = `${ram}%`;
        ramBar.className = `gauge-bar ${ram > 85 ? 'high' : ''}`;
        
        // Disk
        if (data.disk) {
            const disk = data.disk.usagePercent;
            document.getElementById('gauge-val-disk').textContent = `${disk}%`;
            const diskBar = document.getElementById('gauge-bar-disk');
            diskBar.style.width = `${disk}%`;
            diskBar.className = `gauge-bar ${disk > 90 ? 'high' : ''}`;
        }
        
        // Temp
        const temp = data.temperature.temp;
        document.getElementById('gauge-val-temp').textContent = `${temp}°C`;
        const tempStatus = document.getElementById('gauge-status-temp');
        if (data.temperature.status === 'critical') tempStatus.innerHTML = '🔴 CRITICAL';
        else if (data.temperature.status === 'warning') tempStatus.innerHTML = '🟡 WARN';
        else tempStatus.innerHTML = '🟢 OK';
        
        // Docker
        if (data.docker && data.docker.length > 0) {
            const dockerList = document.getElementById('docker-list-el');
            dockerList.innerHTML = '';
            data.docker.forEach(c => {
                const statusColor = c.healthy ? 'status-ok' : 'status-err';
                const statusIcon = c.healthy ? '🟢' : '🔴';
                
                const div = document.createElement('div');
                div.className = 'docker-item';
                div.innerHTML = `
                    <span><span class="${statusColor}">${statusIcon}</span> ${c.name}</span>
                    <span style="opacity: 0.7">${c.status}</span>
                `;
                dockerList.appendChild(div);
            });
        }
        
        // Backup
        if (data.backup) {
            const lines = data.backup.log.split('\n');
            const lastLine = lines[lines.length - 1] || 'No recent backup';
            document.getElementById('backup-status-el').textContent = lastLine;
        }

    } catch (err) {
        console.error('Failed to load health', err);
    }
}

// Publish logic
document.getElementById('btn-publish')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-publish');
    const origText = btn.textContent;
    btn.textContent = '[PUBLISHING...]';
    btn.disabled = true;
    
    try {
        const res = await fetch('/api/publish', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            showToast('Changes pushed to GitHub. Site is building.');
        } else {
            showToast('Error: ' + data.error);
        }
    } catch (err) {
        showToast('Network error publishing');
    } finally {
        btn.textContent = origText;
        btn.disabled = false;
    }
});

// Init
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    loadPosts();
    loadHealth();
    // Poll health every 5 seconds
    setInterval(loadHealth, 5000);
}
