import React from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import type { HoldingItem } from '../types/holdings';
import { contractYesPercent } from '../utils/contractYesPercent';

interface HoldingsGridViewProps {
    holdingsLoading: boolean;
    sortedContracts: HoldingItem[];
    holdingsFilter: string;
    highlightMatch: (text: string) => React.ReactNode;
    getPMIcon: (website: string) => string | null;
}

export default function HoldingsGridView({
    holdingsLoading,
    sortedContracts,
    holdingsFilter,
    highlightMatch,
    getPMIcon,
}: HoldingsGridViewProps): React.ReactElement {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7 w-full">
            {holdingsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonTheme key={i} baseColor="#C3C3C3" highlightColor="#ffffff80">
                        <div className="rounded-2xl bg-[#EFF1F5] p-5">
                            <div className="flex gap-4 items-start">
                                <Skeleton width={44} height={44} borderRadius={999} />
                                <div className="flex flex-col gap-2 flex-1">
                                    <Skeleton width="90%" height={16} />
                                    <Skeleton width="60%" height={16} />
                                    <div className="flex items-center justify-between">
                                        <Skeleton width={80} height={16} />
                                        <Skeleton width={60} height={32} borderRadius={8} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </SkeletonTheme>
                ))
            ) : sortedContracts.length > 0 ? (
                sortedContracts.map((contract, idx) => {
                    const icon = getPMIcon(contract.website);
                    const yesPct = contractYesPercent(contract);
                    return (
                        <div key={idx} className="rounded-2xl bg-[#EFF1F5] p-5">
                            <div className="flex gap-4 items-stretch justify-between h-full">
                                <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 bg-white flex items-center justify-center">
                                    {icon ? (
                                        <img src={icon} alt={contract.website} className="w-full h-full object-contain" />
                                    ) : (
                                        <span className="text-xs font-bold text-text-tertiary uppercase">{(contract.website ?? '?')[0]}</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2 flex-1 justify-between min-w-0">
                                    {contract.url ? (
                                        <a href={contract.url} target="_blank" rel="noopener noreferrer" className="text-base text-text-primary underline">
                                            {highlightMatch(contract.title)}
                                        </a>
                                    ) : (
                                        <span className="text-base text-text-primary">{highlightMatch(contract.title)}</span>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-1">
                                            <p className="text-sm leading-5">Volume:</p>
                                            <b className="text-sm font-semibold leading-5">
                                                {contract.volume != null
                                                    ? '$' + contract.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })
                                                    : '—'}
                                            </b>
                                        </span>
                                        <div className="py-2.5 px-3 rounded-lg bg-[#DCDFEA] flex items-center gap-1 flex-shrink-0">
                                            <p className="text-sm leading-5">Yes:</p>
                                            <b className="text-sm font-bold leading-5">
                                                {yesPct != null
                                                    ? Number(yesPct).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
                                                    : '—'}
                                            </b>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="col-span-full py-8 text-center text-text-tertiary">
                    {holdingsFilter.trim() ? 'No matching contracts' : 'No PMI holdings available'}
                </div>
            )}
        </div>
    );
}
