() => {
    const results = [];
    const section = document.getElementById('MarketSelectorSection');
    if (!section) return results;

    // --- Helpers ---
    function walkLeaves(el) {
        const leaves = [];
        const _walk = (node) => {
            if (node.children && node.children.length === 0
                && node.innerText && node.innerText.trim()) {
                leaves.push(node.innerText.trim());
            }
            if (node.children) {
                for (const ch of node.children) _walk(ch);
            }
        };
        _walk(el);
        return leaves;
    }

    function parseProbability(text) {
        // Edge cases: "<1%" → 1, ">99%" → 99
        if (text === '<1%' || text === '<1¢') return 1;
        if (text === '>99%' || text === '>99¢') return 99;
        let m = text.match(/^(\d{1,3})%$/);
        if (m) return parseInt(m[1], 10);
        m = text.match(/^(\d{1,3})¢$/);
        if (m) return parseInt(m[1], 10);
        m = text.match(/^\$0\.(\d{2})$/);
        if (m) return parseInt(m[1], 10);
        return null;
    }

    // --- Find probability elements within the section ---
    const sectionEls = section.querySelectorAll('*');
    const probElements = [];
    for (const el of sectionEls) {
        if (el.children.length > 0) continue;
        const text = (el.innerText || '').trim();
        if (parseProbability(text) !== null) {
            probElements.push(el);
        }
    }

    // --- Extract rows from probability elements ---
    const processedRows = new Set();
    for (const probEl of probElements) {
        // Walk up to find the row container (stays within section)
        let row = probEl;
        for (let i = 0; i < 8; i++) {
            if (!row.parentElement || row.parentElement === section) break;
            row = row.parentElement;
            const rect = row.getBoundingClientRect();
            if (rect.width > 200 && rect.height > 20 && rect.height < 200) break;
        }

        if (processedRows.has(row)) continue;
        processedRows.add(row);

        const leaves = walkLeaves(row);
        if (leaves.length < 2) continue;

        let name = '';
        let probability = null;

        for (const leaf of leaves) {
            const p = parseProbability(leaf);
            if (p !== null && probability === null) {
                probability = p;
                continue;
            }
            if (leaf.length >= 2
                && !leaf.match(/^[\d%¢$.,\s]+$/)
                && !/^(Yes|No|Buy|Sell)$/i.test(leaf)
                && leaf.length > name.length) {
                name = leaf;
            }
        }

        if (!name) {
            name = leaves.find(l =>
                l.length >= 2
                && !l.match(/^[\d%¢$.,\s]+$/)
                && !/^(Yes|No|Buy|Sell)$/i.test(l)
            ) || '';
        }

        if (name && probability !== null) {
            results.push({ name, probability });
        }
    }

    // --- Fallback: binary Yes/No event (single outcome, no Details rows) ---
    if (results.length === 0) {
        const h1 = document.querySelector('h1');
        if (h1) {
            const leaves = walkLeaves(h1.parentElement || h1);
            let probability = null;
            for (const leaf of leaves) {
                const p = parseProbability(leaf);
                if (p !== null && probability === null) {
                    probability = p;
                    break;
                }
            }
            const title = h1.innerText.trim();
            if (title && probability !== null) {
                results.push({ name: title, probability });
            }
        }
    }

    return results;
}
