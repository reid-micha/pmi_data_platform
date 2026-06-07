import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PMI_INDEX_SORT_OPTIONS, type PmiIndexSortMode } from '../../utils/pmiIndexSort';

interface PmiIndexSortSelectProps {
    value: PmiIndexSortMode;
    onChange: (mode: PmiIndexSortMode) => void;
}

export default function PmiIndexSortSelect({ value, onChange }: PmiIndexSortSelectProps): React.ReactElement {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    const currentLabel = PMI_INDEX_SORT_OPTIONS.find((o) => o.value === value)?.label ?? 'Sort';

    const apply = (mode: PmiIndexSortMode) => {
        onChange(mode);
        setDropdownOpen(false);
        setMobileOpen(false);
    };

    return (
        <div className="flex flex-row flex-nowrap items-center gap-2 shrink-0">
            <div ref={dropdownRef} className="hidden lg:block relative shrink-0 min-w-[220px] max-w-[280px]">
                <button
                    type="button"
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    className="h-10 w-full min-w-0 rounded-lg border border-[#A4ABAE] py-2 pl-10 pr-3 shadow-sm bg-transparent text-text-placeholder text-sm font-normal text-left relative cursor-pointer"
                >
                    <img src="/images/caret-down-placeholder.svg" alt="" className="absolute left-3 top-1/2 -translate-y-1/2" />
                    <span className="block truncate">{currentLabel}</span>
                </button>
                {dropdownOpen && (
                    <div className="absolute top-full right-0 mt-1 w-full rounded-md bg-bg-secondary border border-black/10 shadow-lg z-[200] p-1.5 flex flex-col gap-1 min-w-[248px]">
                        {PMI_INDEX_SORT_OPTIONS.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => apply(opt.value)}
                                className={`text-left text-sm font-semibold px-2.5 py-2 rounded transition-colors cursor-pointer ${
                                    value === opt.value ? 'bg-[#414969] text-white' : 'hover:bg-[#414969] hover:text-white'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden size-11 flex items-center justify-center shrink-0 p-0 border-0 bg-transparent cursor-pointer"
                aria-label="Open sort options"
            >
                <img src="/images/filter.svg" alt="" className="size-11 object-contain" aria-hidden />
            </button>
            {mobileOpen &&
                createPortal(
                    <div className="fixed inset-0 z-[200] lg:hidden">
                        <div className="absolute inset-0 bg-black/50 z-0" onClick={() => setMobileOpen(false)} aria-hidden />
                        <div className="absolute bottom-0 left-0 right-0 z-10 bg-bg-secondary rounded-t-2xl p-5 flex flex-col gap-1 shadow-xl max-h-[70vh] overflow-y-auto">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-semibold text-text-primary">Sort By</h3>
                                <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close">
                                    <img src="/images/close-btn.svg" alt="" className="w-4 h-4" />
                                </button>
                            </div>
                            {PMI_INDEX_SORT_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => apply(opt.value)}
                                    className={`text-left text-sm font-semibold px-3 py-3 rounded-lg transition-colors ${
                                        value === opt.value
                                            ? 'bg-[#414969] text-white'
                                            : 'hover:bg-[#414969] hover:text-white text-text-primary'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>,
                    document.body,
                )}
        </div>
    );
}
