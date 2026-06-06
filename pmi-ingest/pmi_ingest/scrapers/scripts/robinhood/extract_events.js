() => {
    const cards = document.querySelectorAll('a[href*="/events/"]');
    const seen = new Set();
    const results = [];

    for (const card of cards) {
        const href = card.getAttribute('href') || '';
        const rect = card.getBoundingClientRect();

        // Skip small elements (hero outcome buttons are ~48px tall)
        // Real event cards are 120-200px tall
        if (rect.height < 80) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        // Walk all leaf text nodes to build structured data.
        // Event card DOM structure (confirmed via inspection):
        //   <a href="/prediction-markets/{category}/events/{slug}/">
        //     <div>                           ← main container
        //       <div>                         ← top row
        //         <div> "Jan 20"              ← date
        //         <div>
        //           <span> "109.28M"          ← volume abbreviated
        //           <span> "109,276,708"      ← volume exact
        //       <div> "Title text"            ← event title
        //       <div>                         ← outcome row
        //         <div>
        //           <div> "Kevin Warsh"       ← outcome name
        //           <span>
        //             <span> "93"             ← percentage number
        //             <span> "%"              ← percent sign
        //       <div> "+ 22 contracts"        ← sub-contract count
        const leaves = [];
        const walk = (el) => {
            if (el.children.length === 0 && el.innerText && el.innerText.trim()) {
                leaves.push(el.innerText.trim());
            }
            for (const ch of el.children) walk(ch);
        };
        walk(card);

        // Parse the leaf texts by known structure positions:
        //   [0] date, [1] volume_short, [2] volume_exact,
        //   [3] title, [4] outcome_name, [5] pct_number, [6] "%",
        //   [7] "+ N contracts"
        if (leaves.length < 6) continue;

        const title = leaves[3] || '';
        if (!title || title.length < 5) continue;

        const pctStr = leaves[5] || '';
        const pct = parseInt(pctStr, 10);

        // Volume: use the exact number (leaves[2]), strip commas
        const volumeStr = (leaves[2] || '').replace(/,/g, '');
        const volume = parseInt(volumeStr, 10);

        results.push({
            href: href,
            title: title,
            outcomeName: leaves[4] || '',
            probability: isNaN(pct) ? null : pct,
            volume: isNaN(volume) ? null : volume,
        });
    }
    return results;
}
