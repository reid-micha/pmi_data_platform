import React, { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSearchBarSuggestions } from './getSearchBarSuggestions';
import SearchBarMoreResultsHint from './SearchBarMoreResultsHint';
import { getVisibleSearchSuggestions } from './searchSuggestions';

/**
 * HTML5 `<datalist>`: Browser-native dropdown suggestions (appearance varies by browser/OS).
 * Semantically used for inputs where users can choose from fixed options, but may also enter free text.
 */
function SearchBarDatalist(): React.ReactElement {
    const listId = useId();
    const [query, setQuery] = useState('');
    const navigate = useNavigate();
    const allSuggestions = getSearchBarSuggestions();
    const { visibleSuggestions, totalMatched } = getVisibleSearchSuggestions({
        allSuggestions,
        query,
    });
    const hiddenCount = totalMatched - visibleSuggestions.length;
    const datalistValues = query.trim() ? visibleSuggestions : allSuggestions;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (query.trim()) {
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }
        }
    };

    return (
        <form className="relative flex w-full min-w-0" onSubmit={(e) => e.preventDefault()}>
            <input
                type="text"
                list={listId}
                placeholder="Search (datalist)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                className="h-12 w-full min-w-0 rounded-lg border border-[#A4ABAE] py-2.5 px-11 shadow-sm focus:outline-none placeholder:text-text-placeholder text-text-placeholder"
            />
            <datalist id={listId}>
                {datalistValues.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>
            <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                <img src="/images/search.svg" alt="" />
            </div>
            <SearchBarMoreResultsHint
                hiddenCount={hiddenCount}
                className="absolute left-0 right-0 top-full z-40 mt-1 w-full rounded-lg border border-black/10 shadow-sm"
            />
        </form>
    );
}

export default SearchBarDatalist;
