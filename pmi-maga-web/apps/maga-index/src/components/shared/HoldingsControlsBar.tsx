import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HoldingsSortDirection, HoldingsSortKey } from '../../hooks/useHoldingsControls';
import HoldingsSearchInput from './HoldingsSearchInput';

interface HoldingsControlsBarProps {
    sortKey: HoldingsSortKey | '';
    sortDir: HoldingsSortDirection;
    onSortChange: (key: HoldingsSortKey, dir: HoldingsSortDirection) => void;
    holdingsFilter: string;
    onHoldingsFilterChange: (value: string) => void;
    holdingsView: 'grid' | 'list';
    onHoldingsViewChange: (view: 'grid' | 'list') => void;
    includeRelationship?: boolean;
    defaultSortLabel?: string;
}

export default function HoldingsControlsBar({
    sortKey,
    sortDir,
    onSortChange,
    holdingsFilter,
    onHoldingsFilterChange,
    holdingsView,
    onHoldingsViewChange,
    includeRelationship = true,
    defaultSortLabel = 'Sort',
}: HoldingsControlsBarProps): React.ReactElement {
    const [mobileSortOpen, setMobileSortOpen] = useState(false);
    const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
    const sortDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
                setSortDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const applySortChoice = (key: HoldingsSortKey, dir: HoldingsSortDirection) => {
        onSortChange(key, dir);
        setSortDropdownOpen(false);
        setMobileSortOpen(false);
    };

    const getSortLabel = (): string => {
        if (!sortKey) return defaultSortLabel;
        if (sortKey === 'volume') return sortDir === 'desc' ? 'Volume: Highest' : 'Volume: Lowest';
        if (sortKey === 'yesPercent') return sortDir === 'desc' ? 'Probability: Highest' : 'Probability: Lowest';
        if (sortKey === 'directLink') return sortDir === 'desc' ? 'Relationship: Direct' : 'Relationship: Indirect';
        if (sortKey === 'website') return sortDir === 'asc' ? 'Exchange: A - Z' : 'Exchange: Z - A';
        return sortDir === 'asc' ? 'PMI Holdings: A - Z' : 'PMI Holdings: Z - A';
    };

    return (
        <div className="flex flex-row flex-nowrap items-center gap-2 sm:gap-3 w-full min-w-0 lg:flex-1 lg:justify-end">
            <div className="min-w-0 flex-1 lg:flex-initial lg:shrink-0">
                <HoldingsSearchInput value={holdingsFilter} onChange={onHoldingsFilterChange} />
            </div>
            <div ref={sortDropdownRef} className="hidden lg:flex items-center gap-2.5 shrink-0 min-w-[200px] max-w-[280px]">
                <button
                    type="button"
                    onClick={() => setSortDropdownOpen((prev) => !prev)}
                    className="h-10 w-full min-w-0 rounded-lg border border-[#A4ABAE] py-2 pl-10 pr-3 shadow-sm bg-transparent text-text-placeholder text-sm font-normal text-left relative cursor-pointer"
                >
                    <img src="/images/caret-down-placeholder.svg" alt="" className="absolute left-3 top-1/2 -translate-y-1/2" />
                    <span className="block truncate">{getSortLabel()}</span>
                    {sortDropdownOpen && (
                        <div className="absolute top-full right-0 mt-1 w-full rounded-md bg-bg-secondary border border-black/10 shadow-lg z-20 p-1.5 flex flex-col gap-1 min-w-[248px]">
                            <button type="button" onClick={() => applySortChoice('title', 'asc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                PMI Holdings: A - Z
                            </button>
                            <button type="button" onClick={() => applySortChoice('title', 'desc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                PMI Holdings: Z - A
                            </button>
                            {includeRelationship && (
                                <>
                                    <button type="button" onClick={() => applySortChoice('directLink', 'desc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                        Relationship: Direct
                                    </button>
                                    <button type="button" onClick={() => applySortChoice('directLink', 'asc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                        Relationship: Indirect
                                    </button>
                                </>
                            )}
                            <button type="button" onClick={() => applySortChoice('website', 'asc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                Exchange: A - Z
                            </button>
                            <button type="button" onClick={() => applySortChoice('website', 'desc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                Exchange: Z - A
                            </button>
                            <button type="button" onClick={() => applySortChoice('volume', 'desc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                Volume: Highest
                            </button>
                            <button type="button" onClick={() => applySortChoice('volume', 'asc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                Volume: Lowest
                            </button>
                            <button type="button" onClick={() => applySortChoice('yesPercent', 'desc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                Probability: Highest
                            </button>
                            <button type="button" onClick={() => applySortChoice('yesPercent', 'asc')} className="text-left text-sm font-semibold px-2.5 py-2 rounded hover:bg-[#414969] hover:text-white transition-colors cursor-pointer">
                                Probability: Lowest
                            </button>
                        </div>
                    )}
                </button>
            </div>
            <button
                type="button"
                onClick={() => setMobileSortOpen(true)}
                className="lg:hidden size-11 flex items-center justify-center shrink-0 p-0 border-0 bg-transparent cursor-pointer"
                aria-label="Open sort options"
            >
                <img src="/images/filter.svg" alt="" className="size-11 object-contain" aria-hidden />
            </button>
            <div className="flex items-center rounded-lg border border-[#5D6B98] overflow-hidden shrink-0">
                <button
                    type="button"
                    onClick={() => onHoldingsViewChange('list')}
                    className={`py-2.5 px-3 w-11 h-10 flex items-center justify-center cursor-pointer transition-colors ${holdingsView === 'list' ? 'bg-[#414969]' : 'bg-transparent'}`}
                >
                    <svg width="17" height="14" viewBox="0 0 17 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.8333 6.66683L5.83325 6.66683M15.8333 1.66683L5.83325 1.66683M15.8333 11.6668L5.83325 11.6668M2.49992 6.66683C2.49992 7.12707 2.12682 7.50016 1.66659 7.50016C1.20635 7.50016 0.833252 7.12707 0.833252 6.66683C0.833252 6.20659 1.20635 5.8335 1.66659 5.8335C2.12682 5.8335 2.49992 6.20659 2.49992 6.66683ZM2.49992 1.66683C2.49992 2.12707 2.12682 2.50016 1.66659 2.50016C1.20635 2.50016 0.833252 2.12707 0.833252 1.66683C0.833252 1.20659 1.20635 0.833496 1.66659 0.833496C2.12682 0.833496 2.49992 1.20659 2.49992 1.66683ZM2.49992 11.6668C2.49992 12.1271 2.12682 12.5002 1.66659 12.5002C1.20635 12.5002 0.833252 12.1271 0.833252 11.6668C0.833252 11.2066 1.20635 10.8335 1.66659 10.8335C2.12682 10.8335 2.49992 11.2066 2.49992 11.6668Z" stroke={holdingsView === 'list' ? '#ffffff' : '#4A5578'} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button
                    type="button"
                    onClick={() => onHoldingsViewChange('grid')}
                    className={`py-2.5 px-3 w-11 h-10 flex items-center justify-center cursor-pointer transition-colors border-l border-[#5D6B98] ${holdingsView === 'grid' ? 'bg-[#414969]' : 'bg-transparent'}`}
                >
                    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.33325 0.833496H2.16659C1.69987 0.833496 1.46652 0.833496 1.28826 0.924324C1.13146 1.00422 1.00397 1.1317 0.92408 1.2885C0.833252 1.46676 0.833252 1.70012 0.833252 2.16683V5.3335C0.833252 5.80021 0.833252 6.03356 0.92408 6.21182C1.00397 6.36862 1.13146 6.49611 1.28826 6.576C1.46652 6.66683 1.69987 6.66683 2.16659 6.66683H5.33325C5.79996 6.66683 6.03332 6.66683 6.21158 6.576C6.36838 6.49611 6.49586 6.36862 6.57576 6.21182C6.66659 6.03356 6.66659 5.80021 6.66659 5.3335V2.16683C6.66659 1.70012 6.66659 1.46676 6.57576 1.2885C6.49586 1.1317 6.36838 1.00422 6.21158 0.924324C6.03332 0.833496 5.79996 0.833496 5.33325 0.833496Z" stroke={holdingsView === 'grid' ? '#ffffff' : '#4A5578'} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14.4999 0.833496H11.3333C10.8665 0.833496 10.6332 0.833496 10.4549 0.924324C10.2981 1.00422 10.1706 1.1317 10.0907 1.2885C9.99992 1.46676 9.99992 1.70012 9.99992 2.16683V5.3335C9.99992 5.80021 9.99992 6.03356 10.0907 6.21182C10.1706 6.36862 10.2981 6.49611 10.4549 6.576C10.6332 6.66683 10.8665 6.66683 11.3333 6.66683H14.4999C14.9666 6.66683 15.2 6.66683 15.3782 6.576C15.535 6.49611 15.6625 6.36862 15.7424 6.21182C15.8333 6.03356 15.8333 5.80021 15.8333 5.3335V2.16683C15.8333 1.70012 15.8333 1.46676 15.7424 1.2885C15.6625 1.1317 15.535 1.00422 15.3782 0.924324C15.2 0.833496 14.9666 0.833496 14.4999 0.833496Z" stroke={holdingsView === 'grid' ? '#ffffff' : '#4A5578'} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14.4999 10.0002H11.3333C10.8665 10.0002 10.6332 10.0002 10.4549 10.091C10.2981 10.1709 10.1706 10.2984 10.0907 10.4552C9.99992 10.6334 9.99992 10.8668 9.99992 11.3335V14.5002C9.99992 14.9669 9.99992 15.2002 10.0907 15.3785C10.1706 15.5353 10.2981 15.6628 10.4549 15.7427C10.6332 15.8335 10.8665 15.8335 11.3333 15.8335H14.4999C14.9666 15.8335 15.2 15.8335 15.3782 15.7427C15.535 15.6628 15.6625 15.5353 15.7424 15.3785C15.8333 15.2002 15.8333 14.9669 15.8333 14.5002V11.3335C15.8333 10.8668 15.8333 10.6334 15.7424 10.4552C15.6625 10.2984 15.535 10.1709 15.3782 10.091C15.2 10.0002 14.9666 10.0002 14.4999 10.0002Z" stroke={holdingsView === 'grid' ? '#ffffff' : '#4A5578'} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5.33325 10.0002H2.16659C1.69987 10.0002 1.46652 10.0002 1.28826 10.091C1.13146 10.1709 1.00397 10.2984 0.92408 10.4552C0.833252 10.6334 0.833252 10.8668 0.833252 11.3335V14.5002C0.833252 14.9669 0.833252 15.2002 0.92408 15.3785C1.00397 15.5353 1.13146 15.6628 1.28826 15.7427C1.46652 15.8335 1.69987 15.8335 2.16659 15.8335H5.33325C5.79996 15.8335 6.03332 15.8335 6.21158 15.7427C6.36838 15.6628 6.49586 15.5353 6.57576 15.3785C6.66659 15.2002 6.66659 14.9669 6.66659 14.5002V11.3335C6.66659 10.8668 6.66659 10.6334 6.57576 10.4552C6.49586 10.2984 6.36838 10.1709 6.21158 10.091C6.03332 10.0002 5.79996 10.0002 5.33325 10.0002Z" stroke={holdingsView === 'grid' ? '#ffffff' : '#4A5578'} strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>

            {mobileSortOpen &&
                createPortal(
                    <div className="fixed inset-0 z-50 lg:hidden">
                        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSortOpen(false)} aria-hidden />
                        <div className="absolute bottom-0 left-0 right-0 bg-bg-secondary rounded-t-2xl p-5 flex flex-col gap-1 shadow-xl">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-semibold text-text-primary">Sort By</h3>
                                <button type="button" onClick={() => setMobileSortOpen(false)} aria-label="Close">
                                    <img src="/images/close-btn.svg" alt="" className="w-4 h-4" />
                                </button>
                            </div>
                            <button type="button" onClick={() => applySortChoice('title', 'asc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'title' && sortDir === 'asc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                PMI Holdings: A - Z
                            </button>
                            <button type="button" onClick={() => applySortChoice('title', 'desc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'title' && sortDir === 'desc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                PMI Holdings: Z - A
                            </button>
                            {includeRelationship && (
                                <>
                                    <button type="button" onClick={() => applySortChoice('directLink', 'desc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'directLink' && sortDir === 'desc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                        Relationship: Direct
                                    </button>
                                    <button type="button" onClick={() => applySortChoice('directLink', 'asc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'directLink' && sortDir === 'asc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                        Relationship: Indirect
                                    </button>
                                </>
                            )}
                            <button type="button" onClick={() => applySortChoice('website', 'asc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'website' && sortDir === 'asc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                Exchange: A - Z
                            </button>
                            <button type="button" onClick={() => applySortChoice('website', 'desc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'website' && sortDir === 'desc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                Exchange: Z - A
                            </button>
                            <button type="button" onClick={() => applySortChoice('volume', 'desc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'volume' && sortDir === 'desc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                Volume: Highest
                            </button>
                            <button type="button" onClick={() => applySortChoice('volume', 'asc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'volume' && sortDir === 'asc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                Volume: Lowest
                            </button>
                            <button type="button" onClick={() => applySortChoice('yesPercent', 'desc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'yesPercent' && sortDir === 'desc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                Probability: Highest
                            </button>
                            <button type="button" onClick={() => applySortChoice('yesPercent', 'asc')} className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${sortKey === 'yesPercent' && sortDir === 'asc' ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white text-text-primary'}`}>
                                Probability: Lowest
                            </button>
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}
