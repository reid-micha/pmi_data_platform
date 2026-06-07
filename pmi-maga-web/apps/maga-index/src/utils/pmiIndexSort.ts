export type PmiIndexSortMode = 'pmi-desc' | 'pmi-asc' | 'swing';

export const PMI_INDEX_SORT_OPTIONS: { value: PmiIndexSortMode; label: string }[] = [
    { value: 'pmi-desc', label: 'PMI Score: Highest' },
    { value: 'pmi-asc', label: 'PMI Score: Lowest' },
    { value: 'swing', label: 'Swing State (Closest to 50)' },
];

export function comparePmiIndexSort<T extends { pmiScore?: number | null }>(
    a: T,
    b: T,
    mode: PmiIndexSortMode,
): number {
    const sa = a.pmiScore ?? null;
    const sb = b.pmiScore ?? null;
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    switch (mode) {
        case 'pmi-desc':
            return sb - sa;
        case 'pmi-asc':
            return sa - sb;
        case 'swing':
            return Math.abs(sa - 50) - Math.abs(sb - 50);
    }
}

export function sortByPmiIndex<T extends { pmiScore?: number | null }>(
    items: T[],
    mode: PmiIndexSortMode,
): T[] {
    return [...items].sort((a, b) => comparePmiIndexSort(a, b, mode));
}
