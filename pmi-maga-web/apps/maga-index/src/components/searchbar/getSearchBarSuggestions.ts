import { useMagaSearchCatalog } from '../../hooks/useMagaSearchCatalog';

/** Suggestion pool for maga-index search (states + groups from search-catalog). */
export function getSearchBarSuggestions(): string[] {
    const { suggestionLabels } = useMagaSearchCatalog();
    return suggestionLabels;
}
