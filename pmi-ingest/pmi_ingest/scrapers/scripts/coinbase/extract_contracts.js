() => {
    const results = [];
    const seen = new Set();

    // --- shared helpers ---
    function walkLeaves(el) {
        const leaves = [];
        const _walk = (node) => {
            if (node.children.length === 0 && node.innerText && node.innerText.trim()) {
                leaves.push(node.innerText.trim());
            }
            for (const ch of node.children) _walk(ch);
        };
        _walk(el);
        return leaves;
    }

    function parseCard(leaves, href) {
        let title = '';
        let probability = null;
        let volume = null;

        for (const leaf of leaves) {
            // Edge cases: "<1%" → 1, ">99%" → 99
            if (probability === null && (leaf === '<1%' || leaf === '<1¢')) {
                probability = 1;
                continue;
            }
            if (probability === null && (leaf === '>99%' || leaf === '>99¢')) {
                probability = 99;
                continue;
            }

            // Probability patterns: "93%", "7%"
            const pctMatch = leaf.match(/^(\d{1,3})%$/);
            if (pctMatch && probability === null) {
                probability = parseInt(pctMatch[1], 10);
                continue;
            }

            // Probability pattern: "93¢", "7¢"
            const centMatch = leaf.match(/^(\d{1,3})¢$/);
            if (centMatch && probability === null) {
                probability = parseInt(centMatch[1], 10);
                continue;
            }

            // Probability pattern: "$0.93"
            const dollarMatch = leaf.match(/^\$0\.(\d{2})$/);
            if (dollarMatch && probability === null) {
                probability = parseInt(dollarMatch[1], 10);
                continue;
            }

            // Volume patterns: "$1.2M Vol", "1,234 Vol", "$109.28M vol. (24h)", etc.
            const volRe = /^\$?([\d,.]+)\s*([MmKkBb])?\s*(?:vol\.?\s*(?:\(24h\))?|Vol|Volume)?$/i;
            const volMatch = leaf.match(volRe);
            if (volMatch && volume === null) {
                let num = parseFloat(volMatch[1].replace(/,/g, ''));
                const suffix = (volMatch[2] || '').toUpperCase();
                if (suffix === 'K') num *= 1000;
                else if (suffix === 'M') num *= 1000000;
                else if (suffix === 'B') num *= 1000000000;
                if (num > 100) {  // likely volume, not a price
                    volume = Math.round(num);
                }
                continue;
            }

            // Title: longest non-numeric leaf text
            if (leaf.length >= 5 && !leaf.match(/^[\d%¢$.,\s]+$/) && leaf.length > title.length) {
                title = leaf;
            }
        }

        // Fallback: first non-trivial leaf as title
        if (!title || title.length < 5) {
            title = leaves.find(l => l.length >= 5 && !l.match(/^[\d%¢$.,\s]+$/)) || '';
        }

        if (title) {
            results.push({ href, title, probability, volume });
        }
    }

    // --- Strategy 1: link-based cards (US) ---
    const links = document.querySelectorAll('a[href*="/predictions/"]');
    for (const link of links) {
        const href = link.getAttribute('href') || '';
        const segments = href.replace(/^\//, '').split('/').filter(Boolean);
        if (segments.length < 3) continue;

        const rect = link.getBoundingClientRect();
        if (rect.height < 40 || rect.width < 100) continue;
        if (rect.bottom < -2000) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        const leaves = walkLeaves(link);
        if (leaves.length < 1) continue;
        parseCard(leaves, href);
    }

    // --- Strategy 2: div-based cards (restricted region fallback) ---
    // Cards are <div> with cursor:pointer inside a grid container,
    // containing an <h3> title element.
    if (results.length === 0) {
        const h3s = document.querySelectorAll('h3');
        for (const h3 of h3s) {
            // Walk up to find the card container (div with cursor:pointer)
            let card = h3.closest('div[style*="cursor:pointer"], div[style*="cursor: pointer"]');
            if (!card) {
                // Also try parent divs with card-like dimensions
                let el = h3.parentElement;
                for (let i = 0; i < 6 && el; i++) {
                    const rect = el.getBoundingClientRect();
                    if (rect.height > 150 && rect.height < 400
                        && rect.width > 250 && rect.width < 800
                        && el.tagName === 'DIV') {
                        card = el;
                        break;
                    }
                    el = el.parentElement;
                }
            }
            if (!card) continue;

            const rect = card.getBoundingClientRect();
            if (rect.height < 100 || rect.width < 200) continue;
            if (rect.bottom < -2000) continue;

            // De-duplicate by title text
            const titleText = h3.innerText.trim();
            if (!titleText || titleText.length < 5) continue;
            if (seen.has(titleText)) continue;
            seen.add(titleText);

            // Try to find a link inside or around the card
            let href = '';
            // 1. Look for <a> with /predictions/ inside the card
            const innerLink = card.querySelector('a[href*="/predictions/"]');
            if (innerLink) {
                href = innerLink.getAttribute('href') || '';
            }
            // 2. Check if the card itself is wrapped in an <a>
            if (!href) {
                const parentLink = card.closest('a[href*="/predictions/"]');
                if (parentLink) {
                    href = parentLink.getAttribute('href') || '';
                }
            }
            // 3. Walk up to find a nearby <a> sibling or ancestor
            if (!href) {
                let walker = card.parentElement;
                for (let i = 0; i < 4 && walker; i++) {
                    const aTag = walker.querySelector('a[href*="/predictions/"]');
                    if (aTag) {
                        href = aTag.getAttribute('href') || '';
                        break;
                    }
                    walker = walker.parentElement;
                }
            }

            const leaves = walkLeaves(card);
            if (leaves.length < 1) continue;
            parseCard(leaves, href);
        }
    }

    return results;
}
