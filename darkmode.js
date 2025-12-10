// Apply dark mode ASAP before paint (default to bright if no saved preference)
(function preApplyDarkMode() {
    try {
        // One-time migration: reset default to bright the first time after this update
        const versionKey = 'darkModeVersion';
        const currentVersion = '2';
        const savedPreference = localStorage.getItem('darkMode');
        if (localStorage.getItem(versionKey) !== currentVersion) {
            localStorage.setItem('darkMode', 'false');
            localStorage.setItem(versionKey, currentVersion);
        }

        const effectivePref = localStorage.getItem('darkMode');
        const shouldUseDark = effectivePref === null ? false : effectivePref === 'true';
        if (shouldUseDark) {
            document.documentElement.classList.add('dark-mode');
            // If body already exists, ensure it matches
            if (document.body) document.body.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
            if (document.body) document.body.classList.remove('dark-mode');
        }
    } catch (e) {
        // fail silent; avoid blocking render
    }
})();

// Dark Mode Toggle Functionality
class DarkMode {
    constructor() {
        const savedPreference = localStorage.getItem('darkMode');
        this.isDarkMode = savedPreference === null ? false : savedPreference === 'true';
        this.init();
    }

    init() {
        // Apply dark mode on page load
        this.applyDarkMode();
        
        // Add event listener to toggle button
        const toggleButton = document.getElementById('darkModeToggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => this.toggle());
        }
    }

    toggle() {
        this.isDarkMode = !this.isDarkMode;
        localStorage.setItem('darkMode', this.isDarkMode);
        this.applyDarkMode();
    }

    applyDarkMode() {
        const body = document.body;
        const root = document.documentElement;
        const toggleButton = document.getElementById('darkModeToggle');
        
        if (this.isDarkMode) {
            body.classList.add('dark-mode');
            root.classList.add('dark-mode');
            if (toggleButton) {
                toggleButton.innerHTML = '<i class="fas fa-sun"></i>';
            }
        } else {
            body.classList.remove('dark-mode');
            root.classList.remove('dark-mode');
            if (toggleButton) {
                toggleButton.innerHTML = '<i class="fas fa-moon"></i>';
            }
        }
    }
}

// Initialize dark mode when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DarkMode();
});

