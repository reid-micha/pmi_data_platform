() => {
    const span = document.querySelector('span[data-testid="event-percent-chance"]');
    if (!span) return { probability: null };
    const text = (span.innerText || '').trim();

    // Edge cases
    if (text.includes('<1')) return { probability: 1 };
    if (text.includes('>99')) return { probability: 99 };

    // Match "93%", "93 %", etc.
    const m = text.match(/(\d{1,3})\s*%/);
    if (m) return { probability: parseInt(m[1], 10) };

    // Match cent format "93¢"
    const cm = text.match(/(\d{1,3})\s*¢/);
    if (cm) return { probability: parseInt(cm[1], 10) };

    return { probability: null };
}
