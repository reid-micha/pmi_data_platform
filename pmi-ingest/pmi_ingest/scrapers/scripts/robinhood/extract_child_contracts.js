() => {
    const results = [];
    const seen = new Set();

    // Find all elements that look like price labels (e.g., "93¢", "7¢")
    // Robinhood uses the ¢ (cent sign) for outcome prices.
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
        // Only look at leaf-ish text nodes
        if (el.children.length > 2) continue;
        const text = (el.innerText || '').trim();

        // Match price pattern: digits followed by ¢
        const priceMatch = text.match(/^(\d{1,3})¢$/);
        if (!priceMatch) continue;

        const price = parseInt(priceMatch[1], 10);
        if (isNaN(price) || price < 1 || price > 99) continue;

        // Walk up to find the sibling/parent that contains the outcome name.
        // Typical structure:
        //   <div>  ← row container
        //     <div> "Outcome Name"
        //     <div>
        //       <span> "93¢"
        let container = el.parentElement;
        // Walk up a few levels to find a container that has other text children
        for (let i = 0; i < 4 && container; i++) {
            const childTexts = [];
            for (const ch of container.children) {
                const t = (ch.innerText || '').trim();
                if (t && t !== text) childTexts.push(t);
            }
            if (childTexts.length > 0) {
                // Found the row container; first non-price child text is the name
                let name = childTexts[0];
                // Clean up: sometimes name includes extra subtext
                // Take only the first line
                name = name.split('\n')[0].trim();

                // Skip breadcrumb / navigation items
                if (name.toLowerCase() === 'prediction markets') continue;
                if (name.toLowerCase() === 'yes' || name.toLowerCase() === 'no') {
                    // For binary yes/no events, keep them
                }

                const key = name + '|' + price;
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push({ name: name, price: price });
                }
                break;
            }
            container = container.parentElement;
        }
    }

    return results;
}
