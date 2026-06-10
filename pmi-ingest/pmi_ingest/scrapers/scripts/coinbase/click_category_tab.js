(categoryName) => {
    const tablists = document.querySelectorAll('[role="tablist"]');
    if (tablists.length === 0) return false;

    const tabs = tablists[0].querySelectorAll('[role="tab"]');
    for (const tab of tabs) {
        const text = (tab.innerText || '').trim().split('\n')[0].trim();
        if (text === categoryName) {
            tab.click();
            return true;
        }
    }
    return false;
}
