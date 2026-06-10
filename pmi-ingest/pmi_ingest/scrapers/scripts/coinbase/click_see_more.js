() => {
    const section = document.getElementById('MarketSelectorSection');
    if (!section) return { clicked: 0, found: false };

    const buttons = section.querySelectorAll('button');
    let clicked = 0;
    for (const btn of buttons) {
        const text = (btn.innerText || '').trim();
        if (/^See\b/i.test(text) && /\bmore$/i.test(text)) {
            btn.click();
            clicked++;
        }
    }
    return { clicked, found: true };
}
