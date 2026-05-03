import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import http from 'http';

const execAsync = promisify(exec);

// Get basic system stats (CPU, RAM, Uptime)
export function getSystemStats() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = (usedMem / totalMem) * 100;
    
    // Simple load average (1 min) as CPU proxy
    const cpus = os.cpus().length;
    const loadAvg = os.loadavg()[0];
    let cpuPercent = (loadAvg / cpus) * 100;
    if (cpuPercent > 100) cpuPercent = 100;

    return {
        cpu: {
            usagePercent: parseFloat(cpuPercent.toFixed(1)),
            loadAverage: loadAvg.toFixed(2),
            cores: cpus
        },
        memory: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usagePercent: parseFloat(memPercent.toFixed(1))
        },
        uptime: os.uptime(),
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release()
    };
}

// Get Pi Temperature
export async function getTemperature() {
    try {
        if (os.platform() !== 'linux') return { temp: 0, status: 'unknown' };
        
        // Try vcgencmd (Raspberry Pi specific)
        try {
            const { stdout } = await execAsync('vcgencmd measure_temp');
            const temp = parseFloat(stdout.replace('temp=', '').replace('\'C', ''));
            return {
                temp,
                status: temp > 80 ? 'critical' : temp > 70 ? 'warning' : 'ok',
                unit: 'C'
            };
        } catch (e) {
            // Fallback to reading thermal zone
            const { stdout } = await execAsync('cat /sys/class/thermal/thermal_zone0/temp');
            const temp = parseFloat(stdout) / 1000;
            return {
                temp: parseFloat(temp.toFixed(1)),
                status: temp > 80 ? 'critical' : temp > 70 ? 'warning' : 'ok',
                unit: 'C'
            };
        }
    } catch (err) {
        return { temp: 0, status: 'error', message: err.message };
    }
}

// Get Disk Usage
export async function getDiskUsage() {
    try {
        if (os.platform() === 'win32') return null; // Simple fallback for Windows dev
        
        const { stdout } = await execAsync('df -h /');
        const lines = stdout.split('\n');
        if (lines.length > 1) {
            const parts = lines[1].trim().split(/\s+/);
            const total = parts[1];
            const used = parts[2];
            const free = parts[3];
            const percent = parseFloat(parts[4].replace('%', ''));
            
            return { total, used, free, usagePercent: percent };
        }
        return null;
    } catch (err) {
        return { error: err.message };
    }
}

// Helper to hit Docker engine API over unix socket
function fetchDockerAPI(path) {
    return new Promise((resolve, reject) => {
        // Fallback for non-docker dev environment
        if (os.platform() === 'win32' || process.env.NODE_ENV === 'development') {
            return resolve([]);
        }
        
        const options = {
            socketPath: '/var/run/docker.sock',
            path: path,
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// Get Docker containers status
export async function getDockerStats() {
    try {
        const containers = await fetchDockerAPI('/containers/json?all=1');
        if (!Array.isArray(containers)) return [];

        return containers.map(c => {
            const name = c.Names[0].replace('/', '');
            const state = c.State;
            const status = c.Status;
            
            return {
                id: c.Id.substring(0, 12),
                name,
                state,
                status,
                healthy: state === 'running',
                image: c.Image
            };
        });
    } catch (err) {
        return { error: 'Docker socket not available or permission denied' };
    }
}

// Check last backup status via git log in backup repo
export async function getBackupStatus() {
    try {
        // Try to read status from a potential local file or git log
        // This is a placeholder that assumes a status file is written by backup.sh
        const { stdout } = await execAsync('cat /var/log/terminal-eighty-backup.log || echo "No backup run yet"');
        return { log: stdout.trim() };
    } catch (err) {
        return { status: 'unknown', message: 'Could not read backup logs' };
    }
}
