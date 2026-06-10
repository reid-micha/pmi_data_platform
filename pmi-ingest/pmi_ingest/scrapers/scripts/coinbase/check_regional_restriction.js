() => {
    const box = document.querySelector('[data-testid="undefined-content-box"]');
    if (box) {
        return { restricted: true, message: (box.innerText || '').trim() };
    }
    return { restricted: false, message: '' };
}
