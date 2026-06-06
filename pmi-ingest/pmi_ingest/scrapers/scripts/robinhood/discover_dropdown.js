() => {
    const buttons = document.querySelectorAll('button');

    // Phase 1: collect candidate nav-bar buttons (broad y-range)
    const candidates = [];
    for (const btn of buttons) {
        const text = (btn.innerText || '').trim().split('\n')[0].trim();
        if (!text || text.length > 30) continue;
        const rect = btn.getBoundingClientRect();
        if (rect.top < 80 || rect.top > 250) continue;
        if (rect.height < 30 || rect.height > 80) continue;
        candidates.push({ text, top: Math.round(rect.top) });
    }

    // Phase 2: find the dominant top value (nav bar row)
    // Group by top (±5px tolerance) and pick the largest cluster.
    const groups = new Map();
    for (const c of candidates) {
        const key = Math.round(c.top / 10) * 10;   // bucket to nearest 10px
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
    }
    let navTop = 0;
    let maxSize = 0;
    for (const [key, members] of groups) {
        if (members.length > maxSize) {
            maxSize = members.length;
            navTop = key;
        }
    }

    // Only buttons within ±10px of the dominant row are true nav buttons
    const topLevel = new Set();
    for (const c of candidates) {
        if (Math.abs(c.top - navTop) <= 10) topLevel.add(c.text);
    }

    // Phase 3: collect dropdown items below the nav bar
    const results = [];
    for (const btn of buttons) {
        const text = (btn.innerText || '').trim().split('\n')[0].trim();
        if (!text || text.length > 40 || text.length < 2) continue;
        if (topLevel.has(text)) continue;

        const rect = btn.getBoundingClientRect();
        // Dropdown items start just below the nav bar and can extend far down
        if (rect.top < navTop + 30 || rect.top > 1000) continue;
        if (rect.width < 40 || rect.height < 25) continue;

        results.push({ text: text, top: Math.round(rect.top) });
    }
    results.sort((a, b) => a.top - b.top);
    return results;
}
