() => {
    const results = [];
    const buttons = document.querySelectorAll('button');
    const seen = new Set();

    for (const btn of buttons) {
        const text = (btn.innerText || '').trim().split('\n')[0].trim();
        if (!text || text.length > 30 || text.length < 2) continue;

        const rect = btn.getBoundingClientRect();
        // Category buttons sit in a nav row roughly y=80-250, h=30-80
        if (rect.top < 80 || rect.top > 250) continue;
        if (rect.height < 30 || rect.height > 80) continue;
        if (seen.has(text)) continue;
        seen.add(text);

        const hasSvg = btn.querySelector('svg') !== null;
        results.push({ text: text, hasSvg: hasSvg });
    }
    return results;
}
