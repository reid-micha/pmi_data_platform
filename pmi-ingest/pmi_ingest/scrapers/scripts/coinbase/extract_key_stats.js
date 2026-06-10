() => {
    const section = document.getElementById('KeyStatsSection');
    if (!section) return { found: false, volume: null, volumeRaw: null, expiry: null };

    const allEls = section.querySelectorAll('*');

    // Helper: find a leaf element by label text (case-insensitive),
    // then walk up to its stat container and collect sibling leaf values.
    function findStatValue(labelText) {
        let labelEl = null;
        for (const el of allEls) {
            if (el.children.length > 0) continue;
            if ((el.innerText || '').trim().toUpperCase() === labelText) {
                labelEl = el;
                break;
            }
        }
        if (!labelEl) return [];

        // Walk up to the container holding both label + value
        let container = labelEl.parentElement;
        for (let i = 0; i < 4 && container && container !== section; i++) {
            if (container.children.length >= 2) break;
            container = container.parentElement;
        }
        if (!container) return [];

        // Collect leaf texts, excluding the label itself
        const values = [];
        const walk = (node) => {
            if (node.children && node.children.length === 0
                && node.innerText && node.innerText.trim()) {
                const t = node.innerText.trim();
                if (t.toUpperCase() !== labelText) values.push(t);
            }
            if (node.children) {
                for (const ch of node.children) walk(ch);
            }
        };
        walk(container);
        return values;
    }

    // --- Extract volume from "VOL (24H)" ---
    let volume = null;
    let volumeRaw = null;
    const volValues = findStatValue('VOL (24H)');
    for (const t of volValues) {
        const m = t.match(/^\$([\d,.]+)\s*([MmKkBb])?$/);
        if (m && volume === null) {
            let num = parseFloat(m[1].replace(/,/g, ''));
            const suffix = (m[2] || '').toUpperCase();
            if (suffix === 'K') num *= 1000;
            else if (suffix === 'M') num *= 1000000;
            else if (suffix === 'B') num *= 1000000000;
            volume = Math.round(num);
            volumeRaw = t;
            break;
        }
    }

    // --- Extract expiry from "EXPIRY" ---
    // Values look like: ["Jan 1, 2027", "(300 days)"]
    // We want the date string, not the "(N days)" part.
    let expiry = null;
    const expiryValues = findStatValue('EXPIRY');
    for (const t of expiryValues) {
        if (t.startsWith('(')) continue;  // skip "(300 days)"
        // Match date-like text: "Jan 1, 2027", "Mar 15, 2026", etc.
        if (/[A-Za-z]{3,}\s+\d/.test(t)) {
            expiry = t;
            break;
        }
    }

    return { found: true, volume, volumeRaw, expiry };
}
