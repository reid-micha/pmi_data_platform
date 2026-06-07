import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSearchBarSuggestions } from './getSearchBarSuggestions';
import SearchBarMoreResultsHint from './SearchBarMoreResultsHint';
import { getVisibleSearchSuggestions } from './searchSuggestions';

function SearchBar(): React.ReactElement {
    const [isFocused, setIsFocused] = useState(false);
    const [query, setQuery] = useState('');
    const navigate = useNavigate();
    const allSuggestions = getSearchBarSuggestions();

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (query.trim()) {
                setIsFocused(false);
                navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }
        }
    };

    const handleSuggestionClick = (suggestion: string) => {
        setQuery(suggestion);
        setIsFocused(false);
        navigate(`/search?q=${encodeURIComponent(suggestion)}`);
    };

    const { visibleSuggestions, totalMatched } = getVisibleSearchSuggestions({
        allSuggestions,
        query,
    });

    const hiddenCount = totalMatched - visibleSuggestions.length;

    return (
        <form action="#" className="relative flex w-full min-w-0 lg:w-auto" onSubmit={(e) => e.preventDefault()}>
            <input
                type="text"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-10 lg:h-12 w-full min-w-0 lg:w-[348px] rounded-lg border border-[#A4ABAE] py-2.5 px-8 lg:px-11 shadow-sm focus:outline-none placeholder:text-text-placeholder text-sm lg:text-text-placeholder"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            />
            <div className="absolute left-2 lg:left-4 top-1/2 -translate-y-1/2">
                <img src="/images/search.svg" alt="Search" className="w-4 lg:w-auto"/>
            </div>
            <div
                className={`rounded-lg border border-black/10 shadow-sm absolute top-full mt-1 w-full bg-bg-dark-primary flex flex-col items-stretch p-1 transition-all duration-200 ease-in-out origin-top z-50 ${
                    isFocused && totalMatched > 0
                        ? 'opacity-100 scale-y-100 pointer-events-auto'
                        : 'opacity-0 scale-y-95 pointer-events-none'
                }`}
            >
                {visibleSuggestions.map((suggestion) => (
                    <button
                        key={suggestion}
                        type="button"
                        onMouseDown={() => handleSuggestionClick(suggestion)}
                        className="p-2 text-base font-medium cursor-pointer w-full text-left hover:bg-border-tertiary/20 rounded transition-colors duration-150"
                    >
                        {suggestion}
                    </button>
                ))}
                <SearchBarMoreResultsHint hiddenCount={hiddenCount} className="mt-0.5" />
            </div>
        </form>
    )
}
export default SearchBar
