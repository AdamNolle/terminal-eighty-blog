// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('terminal-eighty-theme');
    if (savedTheme === 'light') {
        document.documentElement.classList.add('light-theme');
    }
    updateThemeButtons();
    
    // Bind toggle buttons if they exist
    const themeBtns = document.querySelectorAll('#btn-theme');
    themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.documentElement.classList.toggle('light-theme');
            const isLight = document.documentElement.classList.contains('light-theme');
            localStorage.setItem('terminal-eighty-theme', isLight ? 'light' : 'dark');
            updateThemeButtons();
        });
    });
}

function updateThemeButtons() {
    const isLight = document.documentElement.classList.contains('light-theme');
    const themeBtns = document.querySelectorAll('#btn-theme');
    themeBtns.forEach(btn => {
        btn.textContent = isLight ? '[LIGHT]' : '[DARK]';
    });
}

// Run immediately
initTheme();
