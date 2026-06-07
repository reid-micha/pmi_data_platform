import React from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import type { HoldingItem } from '../types/holdings';
import { contractYesPercent } from '../utils/contractYesPercent';

type SortKey = keyof Pick<HoldingItem, 'title' | 'directLink' | 'website' | 'volume' | 'yesPercent'>;

interface HoldingsListViewProps {
    holdingsLoading: boolean;
    sortedContracts: HoldingItem[];
    holdingsFilter: string;
    sortKey: SortKey | '';
    sortDir: 'asc' | 'desc';
    onSort: (key: SortKey) => void;
    highlightMatch: (text: string) => React.ReactNode;
    getPMIcon: (website: string) => string | null;
    showRelationship?: boolean;
}

export default function HoldingsListView({
    holdingsLoading,
    sortedContracts,
    holdingsFilter,
    sortKey,
    sortDir,
    onSort,
    highlightMatch,
    getPMIcon,
    showRelationship = false,
}: HoldingsListViewProps): React.ReactElement {
    const SortArrow = ({ column }: { column: SortKey }) => {
        if (sortKey !== column) return <img src="/images/chevron-selector-default.svg" alt="sort" className="inline ml-1 opacity-40" />;
        return (
            <img
                src="/images/chevron-selector-up.svg"
                alt="sort"
                className={`inline ml-1 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`}
            />
        );
    };

    return (
        <div className="w-full mt-2 rounded-xl border border-border-secondary overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead>
                    <tr className="border-b border-border-secondary">
                        <th className="text-left text-sm whitespace-nowrap lg:whitespace-normal text-utility-gray bg-bg-secondary font-medium px-7 py-3 cursor-pointer select-none" onClick={() => onSort('title')}>
                            PMI Holdings <SortArrow column="title" />
                        </th>
                        {showRelationship && (
                            <th className="hidden lg:table-cell text-left text-sm whitespace-nowrap lg:whitespace-normal text-utility-gray bg-bg-secondary font-medium px-7 py-3 cursor-pointer select-none w-[14%] min-w-[120px] max-w-[200px]" onClick={() => onSort('directLink')}>
                                Relationship <SortArrow column="directLink" />
                            </th>
                        )}
                        <th className="text-left text-sm whitespace-nowrap lg:whitespace-normal text-utility-gray bg-bg-secondary font-medium px-7 py-3 w-[15%] min-w-[125px] max-w-[200px] cursor-pointer select-none" onClick={() => onSort('website')}>
                            Prediction Market Exchange <SortArrow column="website" />
                        </th>
                        <th className="text-right text-sm whitespace-nowrap lg:whitespace-normal text-utility-gray bg-bg-secondary font-medium px-7 py-3 w-[14%] min-w-[120px] max-w-[200px] cursor-pointer select-none" onClick={() => onSort('volume')}>
                            Volume <SortArrow column="volume" />
                        </th>
                        <th className="text-right text-sm whitespace-nowrap lg:whitespace-normal text-utility-gray bg-bg-secondary font-medium px-7 py-3 w-[15%] min-w-[125px] max-w-[200px] cursor-pointer select-none" onClick={() => onSort('yesPercent')}>
                            Probability of Yes <SortArrow column="yesPercent" />
                        </th>
                    </tr>
                    </thead>
                    <tbody>
                    {holdingsLoading ? (
                        <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="border-b border-border-secondary last:border-b-0">
                                    <td className="px-7 py-3 whitespace-nowrap lg:whitespace-normal"><Skeleton width="80%" height={16} /></td>
                                    {showRelationship && (
                                        <td className="hidden lg:table-cell px-7 py-3 whitespace-nowrap lg:whitespace-normal"><Skeleton width={60} height={24} borderRadius={20} /></td>
                                    )}
                                    <td className="px-7 py-3 whitespace-nowrap lg:whitespace-normal">
                                        <div className="flex items-center gap-3">
                                            <Skeleton width={44} height={44} borderRadius={8} />
                                            <Skeleton width={80} height={16} />
                                        </div>
                                    </td>
                                    <td className="px-7 py-3 text-right whitespace-nowrap lg:whitespace-normal"><Skeleton width={50} height={16} /></td>
                                    <td className="px-7 py-3 text-right whitespace-nowrap lg:whitespace-normal"><Skeleton width={40} height={16} /></td>
                                </tr>
                            ))}
                        </SkeletonTheme>
                    ) : sortedContracts.length > 0 ? (
                        sortedContracts.map((contract, idx) => {
                            const yesPct = contractYesPercent(contract);
                            return (
                            <tr key={idx} className="border-b border-border-secondary last:border-b-0">
                                <td className="px-7 py-3 whitespace-nowrap lg:whitespace-normal">
                                    {contract.url ? (
                                        <a href={contract.url} target="_blank" rel="noopener noreferrer" className="text-text-primary underline">{highlightMatch(contract.title)}</a>
                                    ) : (
                                        <span className="text-text-primary">{highlightMatch(contract.title)}</span>
                                    )}
                                </td>
                                {showRelationship && (
                                    <td className="hidden lg:table-cell px-7 py-3 whitespace-nowrap lg:whitespace-normal">
                                        {/*<span className={`py-0.5 px-2 rounded-full text-sm border ${contract.directLink === 1 ? 'border-[#C2D6DF] bg-[#F2F7F9] text-[#395366]' : 'bg-[#FEF6EE] border-[#F9DBAF] text-[#B93815]'}`}>*/}
                                        {/*    {contract.directLink === 1 ? 'Direct' : contract.directLink === 0 ? 'Indirect' : '—'}*/}
                                        {/*</span>*/}
                                        <span className={`py-0.5 px-2 rounded-md text-sm border border-[#C2D6DF] bg-[#F2F7F9] text-[#363F72]`}>
                                            Direct
                                        </span>
                                    </td>
                                )}
                                <td className="px-7 py-3 whitespace-nowrap lg:whitespace-normal">
                                    <div className="flex items-center gap-3">
                                        {getPMIcon(contract.website) && (
                                            <img src={getPMIcon(contract.website)!} alt={contract.website} className="w-11 h-11 object-contain" />
                                        )}
                                        <p className="text-base text-text-tertiary capitalize">{contract.website}</p>
                                    </div>
                                </td>
                                <td className="px-7 py-3 text-right whitespace-nowrap lg:whitespace-normal">
                                    <p className="text-base text-text-primary font-medium">
                                        {contract.volume != null ? '$' + contract.volume.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                                    </p>
                                </td>
                                <td className="px-7 py-3 text-right whitespace-nowrap lg:whitespace-normal">
                                    <p className="text-base text-text-primary font-medium">
                                        {yesPct != null
                                            ? Number(yesPct).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
                                            : '—'}
                                    </p>
                                </td>
                            </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={showRelationship ? 5 : 4} className="px-7 py-6 text-center text-text-tertiary">
                                {holdingsFilter.trim() ? 'No matching contracts' : 'No PMI holdings available'}
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
