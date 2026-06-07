export const MAX_VISIBLE_SUGGESTIONS = 8;

/** The return shape of `getVisibleSearchSuggestions`: the visible suggestion list and the total number of matches. */
export interface VisibleSearchSuggestionsResult {
    visibleSuggestions: string[];
    totalMatched: number;
}

/** Arguments for `getVisibleSearchSuggestions`. */
export interface VisibleSearchSuggestionsInput {
    allSuggestions: string[];
    query: string;
}

function scoreSuggestion(queryLower: string, text: string): number {
    const t = text.toLowerCase();
    const q = queryLower;
    if (t === q) return 3;
    if (t.startsWith(q)) return 2;
    if (t.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    if (t.includes(q)) return 0;
    return -1;
}

/** Same matching + ordering as `SearchBar`; caps visible list at `MAX_VISIBLE_SUGGESTIONS`. */
export function getVisibleSearchSuggestions(
    params: VisibleSearchSuggestionsInput,
): VisibleSearchSuggestionsResult {
    const { allSuggestions, query: rawQuery } = params;
    if (!rawQuery.trim()) {
        return { visibleSuggestions: [], totalMatched: 0 };
    }
    const query = rawQuery.trim().toLowerCase();
    const allMatched = allSuggestions
        .map((name) => ({ name, score: scoreSuggestion(query, name) }))
        .filter(({ score: sc }) => sc >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ name }) => name);
    return {
        visibleSuggestions: allMatched.slice(0, MAX_VISIBLE_SUGGESTIONS),
        totalMatched: allMatched.length,
    };
}
