const SITE_STYLES = [
    { id: 'glass', label: 'Glass' },
    { id: 'paper', label: 'Paper' }
];

function readSiteStyle() {
    try {
        return localStorage.getItem('siteStyle') === 'paper' ? 'paper' : 'glass';
    } catch (e) {
        return 'glass';
    }
}

function ensurePaperFonts() {
    if (document.getElementById('paper-fonts')) return;
    const link = document.createElement('link');
    link.id = 'paper-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';
    document.head.appendChild(link);
}

function applySiteStyle(style) {
    const paper = style === 'paper';
    document.documentElement.classList.toggle('style-paper', paper);
    if (document.body) document.body.classList.toggle('style-paper', paper);
    if (paper) ensurePaperFonts();
    document.querySelectorAll('.style-menu__item').forEach((button) => {
        const active = button.dataset.style === style;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-checked', active ? 'true' : 'false');
    });
}

// Apply theme ASAP before paint (default to bright glass)
(function preApplyTheme() {
    try {
        // One-time migration: reset default to bright the first time after this update
        const versionKey = 'darkModeVersion';
        const currentVersion = '2';
        if (localStorage.getItem(versionKey) !== currentVersion) {
            localStorage.setItem('darkMode', 'false');
            localStorage.setItem(versionKey, currentVersion);
        }

        const effectivePref = localStorage.getItem('darkMode');
        const shouldUseDark = effectivePref === null ? false : effectivePref === 'true';
        document.documentElement.classList.toggle('dark-mode', shouldUseDark);
        if (document.body) document.body.classList.toggle('dark-mode', shouldUseDark);

        // Glass is the default. Reset once so an earlier paper default does not stick.
        const styleVersionKey = 'siteStyleVersion';
        const styleVersion = '2';
        if (localStorage.getItem(styleVersionKey) !== styleVersion) {
            localStorage.setItem('siteStyle', 'glass');
            localStorage.setItem(styleVersionKey, styleVersion);
        }
        applySiteStyle(readSiteStyle());
    } catch (e) {
        // fail silent; avoid blocking render
    }
})();

// Dark mode toggle, plus a style list revealed by hovering that control
class DarkMode {
    constructor() {
        const savedPreference = localStorage.getItem('darkMode');
        this.isDarkMode = savedPreference === null ? false : savedPreference === 'true';
        this.style = readSiteStyle();
        this.init();
    }

    init() {
        this.mountStyleMenu();
        this.applyDarkMode();
        applySiteStyle(this.style);

        const toggleButton = document.getElementById('darkModeToggle');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => this.toggle());
        }
    }

    mountStyleMenu() {
        const container = document.querySelector('.dark-mode-toggle-container');
        if (!container || container.querySelector('.style-menu')) return;

        const menu = document.createElement('div');
        menu.className = 'style-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Page style');

        const label = document.createElement('p');
        label.className = 'style-menu__label';
        label.textContent = 'Style';
        menu.appendChild(label);

        SITE_STYLES.forEach((entry) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'style-menu__item';
            button.dataset.style = entry.id;
            button.setAttribute('role', 'menuitemradio');
            button.innerHTML = '<span class="style-menu__swatch" aria-hidden="true"></span><span>' + entry.label + '</span>';
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.setStyle(entry.id);
                this.dismissStyleMenu();
            });
            menu.appendChild(button);
        });

        container.appendChild(menu);

        container.addEventListener('mouseleave', () => {
            container.classList.remove('is-style-menu-closed');
        });
        const toggleButton = document.getElementById('darkModeToggle');
        if (toggleButton) {
            toggleButton.addEventListener('focus', () => {
                container.classList.remove('is-style-menu-closed');
            });
        }
    }

    dismissStyleMenu() {
        const container = document.querySelector('.dark-mode-toggle-container');
        if (!container) return;
        container.classList.add('is-style-menu-closed');
        const active = document.activeElement;
        if (active && container.contains(active)) active.blur();
    }

    setStyle(style) {
        this.style = style === 'paper' ? 'paper' : 'glass';
        try {
            localStorage.setItem('siteStyle', this.style);
        } catch (e) {
            // ignore storage failures
        }
        applySiteStyle(this.style);
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

        body.classList.toggle('dark-mode', this.isDarkMode);
        root.classList.toggle('dark-mode', this.isDarkMode);
        if (toggleButton) {
            toggleButton.innerHTML = this.isDarkMode
                ? '<i class="fas fa-sun"></i>'
                : '<i class="fas fa-moon"></i>';
            toggleButton.setAttribute('aria-label', this.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode');
        }
    }
}

// Initialize dark mode when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DarkMode();
});

