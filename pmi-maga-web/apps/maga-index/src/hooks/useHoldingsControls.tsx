import React, { useEffect, useMemo, useState } from 'react';

export type HoldingsSortKey = 'title' | 'directLink' | 'website' | 'volume' | 'yesPercent';
export type HoldingsSortDirection = 'asc' | 'desc';

export interface HoldingsSortable {
    // Holding title used for search and text sorting.
    title: string;
    // Relationship marker (e.g., direct/indirect) used for numeric sorting.
    directLink?: number | null;
    // Exchange/source name used for text sorting.
    website?: string | null;
    // Trading volume used for numeric sorting.
    volume?: number | null;
    // Yes probability/score used for numeric sorting.
    yesPercent?: number | null;
}

interface UseHoldingsControlsOptions {
    // Breakpoint (px): below this width default view becomes grid.
    defaultViewBreakpoint?: number;
    // Initial sort column; empty string means "no default sort".
    defaultSortKey?: HoldingsSortKey | '';
    // Initial sort direction when defaultSortKey is set.
    defaultSortDir?: HoldingsSortDirection;
}

// Shared holdings UI state/actions returned by useHoldingsControls.
export interface UseHoldingsControlsResult<T> {
    // Current selected sort key; empty string means "Sort by" placeholder state.
    sortKey: HoldingsSortKey | '';
    // Setter for sortKey.
    setSortKey: React.Dispatch<React.SetStateAction<HoldingsSortKey | ''>>;
    // Current sort direction.
    sortDir: HoldingsSortDirection;
    // Setter for sortDir.
    setSortDir: React.Dispatch<React.SetStateAction<HoldingsSortDirection>>;
    // Current search keyword for holdings filtering.
    holdingsFilter: string;
    // Setter for holdingsFilter.
    setHoldingsFilter: React.Dispatch<React.SetStateAction<string>>;
    // Current UI mode for holdings rendering.
    holdingsView: 'grid' | 'list';
    // Setter for holdingsView.
    setHoldingsView: React.Dispatch<React.SetStateAction<'grid' | 'list'>>;
    // Convenience handler for table-header style sort toggling.
    handleSort: (key: HoldingsSortKey) => void;
    // Highlighter that wraps matched filter text with styled span.
    highlightMatch: (text: string) => React.ReactNode;
    // Filtered + sorted result list consumed by UI.
    sortedItems: T[];
}

export function useHoldingsControls<T>(
    items: T[],
    getSortable: (item: T) => HoldingsSortable,
    options: UseHoldingsControlsOptions = {},
): UseHoldingsControlsResult<T> {
    const {
        defaultViewBreakpoint = 660,
        defaultSortKey = '',
        defaultSortDir = 'desc',
    } = options;

    const [sortKey, setSortKey] = useState<HoldingsSortKey | ''>(defaultSortKey);
    const [sortDir, setSortDir] = useState<HoldingsSortDirection>(defaultSortDir);
    const [holdingsFilter, setHoldingsFilter] = useState('');
    const [holdingsView, setHoldingsView] = useState<'grid' | 'list'>('list');

    useEffect(() => {
        const updateViewByWidth = () => {
            setHoldingsView(window.innerWidth < defaultViewBreakpoint ? 'grid' : 'list');
        };

        updateViewByWidth();
        window.addEventListener('resize', updateViewByWidth);
        return () => window.removeEventListener('resize', updateViewByWidth);
    }, [defaultViewBreakpoint]);

    const handleSort = (key: HoldingsSortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'title' || key === 'website' ? 'asc' : 'desc');
        }
    };

    const highlightMatch = (text: string): React.ReactNode => {
        if (!holdingsFilter.trim()) return text;
        let regex: RegExp;
        try {
            regex = new RegExp(`(${holdingsFilter})`, 'gi');
        } catch {
            const escaped = holdingsFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(`(${escaped})`, 'gi');
        }
        const parts = text.split(regex);
        if (parts.length === 1) return text;
        return parts.map((part, i) =>
            regex.test(part)
                ? <span key={i} className="bg-[#FEF6EE] text-[#B93815] rounded px-0.5">{part}</span>
                : part,
        );
    };

    const sortedItems = useMemo(() => {
        const filtered = [...items].filter((item) => {
            const sortable = getSortable(item);
            if (!holdingsFilter.trim()) return true;
            try {
                return new RegExp(holdingsFilter, 'i').test(sortable.title);
            } catch {
                return sortable.title.toLowerCase().includes(holdingsFilter.toLowerCase());
            }
        });

        if (!sortKey) return filtered;

        return filtered.sort((a, b) => {
            const dir = sortDir === 'asc' ? 1 : -1;
            const sa = getSortable(a);
            const sb = getSortable(b);
            if (sortKey === 'title' || sortKey === 'website') {
                return dir * (sa[sortKey] ?? '').trim().localeCompare((sb[sortKey] ?? '').trim(), undefined, { sensitivity: 'base', numeric: true });
            }
            if (sortKey === 'directLink') {
                return dir * ((sa.directLink ?? 0) - (sb.directLink ?? 0));
            }
            if (sortKey === 'volume') {
                return dir * ((sa.volume ?? 0) - (sb.volume ?? 0));
            }
            return dir * ((sa.yesPercent ?? 0) - (sb.yesPercent ?? 0));
        });
    }, [items, getSortable, holdingsFilter, sortKey, sortDir]);

    return {
        sortKey,
        setSortKey,
        sortDir,
        setSortDir,
        holdingsFilter,
        setHoldingsFilter,
        holdingsView,
        setHoldingsView,
        handleSort,
        highlightMatch,
        sortedItems,
    };
}
