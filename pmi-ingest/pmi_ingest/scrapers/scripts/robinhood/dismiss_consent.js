// Remove the Usercentrics consent overlay that blocks pointer events.
// This overlay (div#usercentrics-root) intercepts all hover interactions
// on the nav bar, causing 30s timeouts during category discovery.
(() => {
    const el = document.getElementById('usercentrics-root');
    if (el) { el.remove(); return { removed: true }; }
    return { removed: false };
})()
