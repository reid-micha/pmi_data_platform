import React from 'react';

/**
 * Test whether `text` matches `filter` using regex (case-insensitive).
 * Falls back to a plain includes() check when the filter is an invalid regex.
 */
export function matchesFilter(text: string, filter: string): boolean {
    if (!filter.trim()) return true;
    try {
        return new RegExp(filter, 'i').test(text);
    } catch {
        return text.toLowerCase().includes(filter.toLowerCase());
    }
}

/**
 * Return a ReactNode with matching portions of `text` highlighted.
 * Falls back gracefully for invalid regex patterns.
 */
export function highlightMatch(text: string, filter: string): React.ReactNode {
    if (!filter.trim()) return text;
    let regex: RegExp;
    try {
        regex = new RegExp(`(${filter})`, 'gi');
    } catch {
        const escaped = filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(`(${escaped})`, 'gi');
    }
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
        regex.test(part)
            ? <span key={i} className="bg-[#FEF6EE] text-[#B93815] rounded px-0.5">{part}</span>
            : part
    );
}
