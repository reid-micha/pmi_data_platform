export type SearchScoredItem<T> = { item: T; score: number };

/** 3 = exact, 2 = prefix, 1 = word prefix, 0 = contains, -1 = no match */
export function scoreText(text: string, query: string): number {
  if (!query) return 1;
  const normalized = text.toLowerCase();
  if (normalized === query) return 3;
  if (normalized.startsWith(query)) return 2;
  if (normalized.split(/\s+/).some((word) => word.startsWith(query))) return 1;
  if (normalized.includes(query)) return 0;
  return -1;
}

export function filterAndSortByQueryScore<T>(
  items: T[],
  getScore: (item: T) => number,
): T[] {
  return items
    .map<SearchScoredItem<T>>((item) => ({ item, score: getScore(item) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export function maxScoreText(texts: string[], query: string): number {
  if (texts.length === 0) return -1;
  return Math.max(...texts.map((t) => scoreText(t, query)));
}
