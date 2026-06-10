() => {
    const h1 = document.querySelector('h1');
    const h1Text = h1 ? h1.innerText.trim() : '(none)';
    const h1Rect = h1 ? h1.getBoundingClientRect() : null;

    // Check for "Details" text
    let detailsFound = false;
    let detailsY = null;
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
        if (el.children.length === 0 && (el.innerText || '').trim() === 'Details') {
            detailsFound = true;
            detailsY = Math.round(el.getBoundingClientRect().top + window.scrollY);
            break;
        }
    }

    // Check for "See ... more" buttons
    let seeMoreCount = 0;
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
        const t = (btn.innerText || '').trim();
        if (/See/i.test(t) && /more/i.test(t)) seeMoreCount++;
    }

    // Count probability elements and their x-position clusters
    const probPositions = [];
    for (const el of allEls) {
        if (el.children.length > 0) continue;
        const t = (el.innerText || '').trim();
        if (/^\d{1,3}[%¢]$/.test(t) || /^\$0\.\d{2}$/.test(t)) {
            const r = el.getBoundingClientRect();
            probPositions.push({ x: Math.round(r.left), y: Math.round(r.top + window.scrollY) });
        }
    }

    // Group by x position (cluster within 20px)
    const xClusters = {};
    for (const p of probPositions) {
        const key = Math.round(p.x / 20) * 20;
        if (!xClusters[key]) xClusters[key] = [];
        xClusters[key].push(p.y);
    }

    return {
        h1Text,
        h1Rect: h1Rect ? { left: Math.round(h1Rect.left), right: Math.round(h1Rect.right),
                            top: Math.round(h1Rect.top), width: Math.round(h1Rect.width) } : null,
        detailsFound,
        detailsY,
        seeMoreCount,
        totalProbElements: probPositions.length,
        xClusters: Object.fromEntries(
            Object.entries(xClusters).map(([k, v]) => [
                k, { count: v.length, yRange: [Math.min(...v), Math.max(...v)] }
            ])
        ),
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
    };
}
