import React from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortOptionValue = `${string}:${SortDirection}`;

interface SortSelectOption {
    value: SortOptionValue;
    label: string;
}

interface SortSelectProps {
    value: string;
    placeholder?: string;
    options: SortSelectOption[];
    onChange: (value: SortOptionValue) => void;
    className?: string;
}

export default function SortSelect({
    value,
    placeholder = 'Sort by',
    options,
    onChange,
    className = 'h-10 rounded-lg border border-[#A4ABAE] bg-white px-3 text-sm text-text-primary focus:outline-none',
}: SortSelectProps): React.ReactElement {
    return (
        <select
            value={value}
            onChange={(e) => {
                if (!e.target.value) return;
                onChange(e.target.value as SortOptionValue);
            }}
            className={className}
        >
            <option value="" disabled>{placeholder}</option>
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
