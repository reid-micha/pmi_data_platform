import React from 'react';

interface HoldingsSearchInputProps {
    value: string;
    onChange: (value: string) => void;
    onSearch?: () => void;
    placeholder?: string;
}

export default function HoldingsSearchInput({
    value,
    onChange,
    onSearch,
    placeholder = 'Search holdings',
}: HoldingsSearchInputProps): React.ReactElement {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && onSearch) {
            e.preventDefault();
            onSearch();
        }
    };

    return (
        <div className="relative flex-1 min-w-0 lg:flex-none lg:w-[260px] lg:max-w-[260px]">
            <input
                type="text"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-10 w-full min-w-0 rounded-lg border border-[#A4ABAE] py-2 px-10 shadow-sm focus:outline-none placeholder:text-text-placeholder text-text-placeholder text-sm"
            />
            {onSearch ? (
                <button
                    type="button"
                    onClick={onSearch}
                    className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer"
                    aria-label="Search"
                >
                    <img src="/images/search.svg" alt="" className="w-4 h-4" />
                </button>
            ) : (
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <img src="/images/search.svg" alt="Search" className="w-4 h-4" />
                </div>
            )}
        </div>
    );
}
