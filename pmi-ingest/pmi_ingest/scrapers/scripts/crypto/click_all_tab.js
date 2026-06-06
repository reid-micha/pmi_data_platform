() => {
    // Look for tab-like elements with text "All"
    const candidates = document.querySelectorAll(
        "a, button, [role='tab'], [data-testid]"
    );
    for (const el of candidates) {
        const text = (el.textContent || "").trim();
        if (text !== "All") continue;
        // Check if already selected
        if (el.getAttribute("aria-selected") === "true") return "already";
        if (el.dataset.active === "true") return "already";
        // Check if the element looks "active" by class
        const cls = el.className || "";
        if (cls.includes("active") || cls.includes("selected")) return "already";
        // Click it
        el.click();
        return "clicked";
    }
    return "not_found";
}
