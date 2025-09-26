// Dark Mode Toggle Functionality
class DarkMode {
    constructor() {
        this.isDarkMode = localStorage.getItem('darkMode') === 'true';
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
        const toggleButton = document.getElementById('darkModeToggle');
        
        if (this.isDarkMode) {
            body.classList.add('dark-mode');
            if (toggleButton) {
                toggleButton.innerHTML = '<i class="fas fa-sun"></i>';
            }
        } else {
            body.classList.remove('dark-mode');
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

// Also initialize if DOM is already loaded (for pages that load this script after DOM is ready)
if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
} else {
    // DOM is already loaded
    new DarkMode();
}
