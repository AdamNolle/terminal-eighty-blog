const { startRegistration, startAuthentication } = SimpleWebAuthnBrowser;

// Utility for showing errors
function showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    } else {
        alert(msg);
    }
}

// Check status on load
async function checkStatus() {
    try {
        const res = await fetch('/auth/status');
        const data = await res.json();
        
        // If on login page
        if (window.location.pathname === '/login.html') {
            if (data.authenticated) {
                window.location.href = '/';
                return;
            }
            if (!data.setupComplete) {
                document.getElementById('setup-panel').style.display = 'block';
                document.getElementById('login-panel').style.display = 'none';
            } else {
                document.getElementById('setup-panel').style.display = 'none';
                document.getElementById('login-panel').style.display = 'block';
            }
        } else {
            // If on any other page and not authenticated, redirect to login
            if (!data.authenticated) {
                window.location.href = '/login.html';
            }
        }
    } catch (err) {
        console.error('Status check failed:', err);
    }
}

// Run check if we're not inside the editor (editor handles its own auth check)
if (!window.location.pathname.startsWith('/editor')) {
    checkStatus();
}

// Setup Form
const setupForm = document.getElementById('setup-form');
if (setupForm) {
    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('setup-user').value;
        const password = document.getElementById('setup-pass').value;
        
        try {
            const res = await fetch('/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                window.location.href = '/';
            } else {
                showError(data.error);
            }
        } catch (err) {
            showError('Network error');
        }
    });
}

// Password Login
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-user').value;
        const password = document.getElementById('login-pass').value;
        
        try {
            const res = await fetch('/auth/login/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            
            if (res.ok) {
                window.location.href = '/';
            } else {
                showError(data.error);
            }
        } catch (err) {
            showError('Network error');
        }
    });
}

// Passkey Login
const btnPasskeyLogin = document.getElementById('btn-passkey-login');
if (btnPasskeyLogin) {
    btnPasskeyLogin.addEventListener('click', async () => {
        try {
            // 1. Get options from server
            const optsRes = await fetch('/auth/passkey/login/start', { method: 'POST' });
            const { options, challengeId } = await optsRes.json();
            
            // 2. Pass to browser authenticator
            let authResp;
            try {
                authResp = await startAuthentication(options);
            } catch (err) {
                if (err.name === 'NotAllowedError') return; // User cancelled
                throw err;
            }
            
            // 3. Send result to server
            const verifyRes = await fetch('/auth/passkey/login/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challengeId, credential: authResp })
            });
            
            if (verifyRes.ok) {
                window.location.href = '/';
            } else {
                const error = await verifyRes.json();
                showError(error.error || 'Passkey verification failed');
            }
        } catch (err) {
            console.error(err);
            showError('Passkey login failed. Please try password.');
        }
    });
}

// Register Passkey (from Dashboard)
const btnRegisterPasskey = document.getElementById('btn-register-passkey');
if (btnRegisterPasskey) {
    btnRegisterPasskey.addEventListener('click', async () => {
        try {
            const optsRes = await fetch('/auth/passkey/register/start', { method: 'POST' });
            if (!optsRes.ok) throw new Error('Must be logged in');
            const { options, challengeId } = await optsRes.json();
            
            let authResp;
            try {
                authResp = await startRegistration(options);
            } catch (err) {
                if (err.name === 'NotAllowedError') return;
                throw err;
            }
            
            const verifyRes = await fetch('/auth/passkey/register/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challengeId, credential: authResp })
            });
            
            if (verifyRes.ok) {
                alert('Passkey registered successfully! You can now use it to login.');
            } else {
                const err = await verifyRes.json();
                alert(`Error: ${err.error}`);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to register passkey.');
        }
    });
}

// Logout
const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST' });
        window.location.href = '/login.html';
    });
}
