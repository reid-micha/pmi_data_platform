() => {
    const tablists = document.querySelectorAll('[role="tablist"]');
    if (tablists.length === 0) return { categories: [], hasSubcategories: false, subcategories: [] };

    const mainTablist = tablists[0];
    const tabs = mainTablist.querySelectorAll('[role="tab"]');
    const categories = [];

    for (const tab of tabs) {
        const text = (tab.innerText || '').trim().split('\n')[0].trim();
        if (!text || text.length > 50 || text.length < 2) continue;
        const isSelected = tab.getAttribute('aria-selected') === 'true';
        categories.push({ text, isSelected });
    }

    const hasSubcategories = tablists.length > 1;
    const subcategories = [];

    if (hasSubcategories) {
        const subTablist = tablists[1];
        const subTabs = subTablist.querySelectorAll('[role="tab"]');
        for (const tab of subTabs) {
            const text = (tab.innerText || '').trim().split('\n')[0].trim();
            if (!text || text.length > 50 || text.length < 2) continue;
            const isSelected = tab.getAttribute('aria-selected') === 'true';
            subcategories.push({ text, isSelected });
        }
    }

    return { categories, hasSubcategories, subcategories };
}
