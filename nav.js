// Mobile: each page's left nav starts folded behind a menu button
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('nav.top-nav').forEach(function (nav) {
        var list = nav.querySelector('ul');
        if (!list) return;
        if (!list.id) list.id = 'top-nav-list';

        var toggle = document.createElement('button');
        toggle.className = 'nav-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Menu');
        toggle.setAttribute('aria-controls', list.id);
        toggle.innerHTML = '<span></span><span></span><span></span>';
        nav.insertBefore(toggle, nav.firstChild);

        function setOpen(open) {
            nav.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
        setOpen(false);

        toggle.addEventListener('click', function () {
            setOpen(!nav.classList.contains('is-open'));
        });
        list.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () { setOpen(false); });
        });
        document.addEventListener('click', function (e) {
            if (!nav.contains(e.target)) setOpen(false);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') setOpen(false);
        });
    });
});
