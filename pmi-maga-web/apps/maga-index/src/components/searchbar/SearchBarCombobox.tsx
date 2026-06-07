import React, { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSearchBarSuggestions } from './getSearchBarSuggestions';
import SearchBarMoreResultsHint from './SearchBarMoreResultsHint';
import { getVisibleSearchSuggestions } from './searchSuggestions';

/**
 * An input combobox with custom dropdown and keyboard/mouse selection, styled similar to the existing SearchBar component.
 */
function SearchBarCombobox(): React.ReactElement {
    const listboxId = useId();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const rootRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const allSuggestions = getSearchBarSuggestions();

    const { visibleSuggestions: filtered, totalMatched } = getVisibleSearchSuggestions({
        allSuggestions,
        query,
    });
    const hiddenCount = totalMatched - filtered.length;

    useEffect(() => {
        const onDocMouseDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setHighlighted(-1);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, []);

    const goSearch = (text: string) => {
        text = text.trim();
        if (text) return;
        setQuery(text);
        setOpen(false);
        setHighlighted(-1);
        navigate(`/search?q=${encodeURIComponent(text)}`);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlighted >= 0 && filtered[highlighted]) {
                goSearch(filtered[highlighted]);
            } else if (query.trim()) {
                goSearch(query);
            }
            return;
        }
        if (e.key === 'Escape') {
            setOpen(false);
            setHighlighted(-1);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open && filtered.length > 0) setOpen(true);
            setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((i) => Math.max(i - 1, 0));
        }
    };

    return (
        <div ref={rootRef} className="relative w-full min-w-0">
            <div className="relative flex w-full items-center">
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    placeholder="Search (combobox)"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                        setHighlighted(-1);
                    }}
                    onFocus={() => {
                        if (filtered.length > 0) setOpen(true);
                    }}
                    onKeyDown={onKeyDown}
                    className="h-12 w-full min-w-0 rounded-lg border border-[#A4ABAE] py-2.5 pl-11 pr-11 shadow-sm focus:outline-none placeholder:text-text-placeholder text-text-placeholder"
                />
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
                    <img src="/images/search.svg" alt="" />
                </div>
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Toggle suggestions"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        setOpen((o) => !o);
                        setHighlighted(-1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary hover:bg-border-tertiary/20 cursor-pointer"
                >
                    <img src="/images/caret-down-placeholder.svg" alt="" className="h-3 w-3" />
                </button>
            </div>
            <div
                className={`absolute top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-bg-dark-primary shadow-sm ${
                    open && filtered.length > 0 ? 'block' : 'hidden'
                }`}
            >
                <ul id={listboxId} role="listbox" className="max-h-64 overflow-auto p-1">
                    {filtered.map((s, idx) => (
                        <li key={s} role="presentation">
                            <button
                                type="button"
                                role="option"
                                aria-selected={idx === highlighted}
                                onMouseDown={() => goSearch(s)}
                                onMouseEnter={() => setHighlighted(idx)}
                                className={`w-full cursor-pointer rounded p-2 text-left text-base font-medium transition-colors ${
                                    idx === highlighted ? 'bg-border-tertiary/30' : 'hover:bg-border-tertiary/20'
                                }`}
                            >
                                {s}
                            </button>
                        </li>
                    ))}
                </ul>
                <SearchBarMoreResultsHint hiddenCount={hiddenCount} className="mt-0.5 rounded-b-[inherit]" />
            </div>
        </div>
    );
}

export default SearchBarCombobox;
