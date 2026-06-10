() => {
    // Try <h1> first, then <h2>
    const h1 = document.querySelector('h1');
    if (h1) return { title: h1.innerText.trim() };
    const h2 = document.querySelector('h2');
    if (h2) return { title: h2.innerText.trim() };
    return { title: '' };
}
