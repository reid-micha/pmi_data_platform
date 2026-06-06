() => {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
        const text = (btn.innerText || '').trim().toLowerCase();
        if (text.match(/show\s+\d+\s+more/)) {
            btn.click();
            return true;
        }
    }
    return false;
}
