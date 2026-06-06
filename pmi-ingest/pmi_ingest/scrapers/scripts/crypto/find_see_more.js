() => {
    const results = [];
    document.querySelectorAll("a").forEach(el => {
        const href = el.getAttribute("href") || "";
        if (href.includes("cursor=")) {
            results.push(href);
        }
    });
    return results;
}
