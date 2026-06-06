() => {
    const scripts = document.querySelectorAll("script");
    for (const script of scripts) {
        const text = script.textContent || "";
        const idx = text.indexOf("initialEvents");
        if (idx < 0) continue;

        const gIdx = text.indexOf("initialEventKindGroups");
        const searchStart = gIdx >= 0 ? gIdx : idx;

        let braceStart = -1;
        for (let i = searchStart; i >= 0; i--) {
            if (text[i] === '{') { braceStart = i; break; }
        }
        if (braceStart < 0) continue;

        let depth = 0, jsonEnd = braceStart;
        for (let i = braceStart; i < text.length; i++) {
            const ch = text[i];
            if (ch === '\\' && i + 1 < text.length) { i++; continue; }
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth === 0) { jsonEnd = i + 1; break; } }
        }

        let s = text.slice(braceStart, jsonEnd);
        s = s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        s = s.replace(/"\$undefined"/g, 'null');
        try {
            const obj = JSON.parse(s);
            if ("initialEvents" in obj) return obj;
        } catch(e) {
            return { error: e.message, preview: s.slice(0, 300) };
        }
    }
    return null;
}
