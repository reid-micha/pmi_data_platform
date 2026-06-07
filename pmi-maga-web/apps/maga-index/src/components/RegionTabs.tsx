import { fetchRegionHoldings } from '@micah/api';
import type { ComponentContract, CountryInRegion } from '@micah/types';
import React, { useEffect, useRef, useState } from 'react';
import {
    useHoldingsControls,
    type UseHoldingsControlsResult,
} from '../hooks/useHoldingsControls';
import { getPMIcon } from '../utils/getPMIcon';
import CountryCard from './cards/CountryCard';
import CountryCardSkeleton from './cards/CountryCardSkeleton';
import HoldingsGridView from './HoldingsGridView';
import HoldingsListView from './HoldingsListView';
import HoldingsControlsBar from './shared/HoldingsControlsBar';

type RegionTabType = 'countries' | 'holdings';

interface RegionTabsProps {
    countries: CountryInRegion[];
    loading?: boolean;
    regionSlug: string;
}

export default function RegionTabs({ countries, loading = false, regionSlug }: RegionTabsProps): React.ReactElement {
    const [activeTab, setActiveTab] = useState<RegionTabType>('countries');
    const [holdingsContracts, setHoldingsContracts] = useState<ComponentContract[]>([]);
    const [holdingsLoading, setHoldingsLoading] = useState(true);

    const holdingsControls: UseHoldingsControlsResult<ComponentContract> = useHoldingsControls<ComponentContract>(
        holdingsContracts,
        (contract) => ({
            title: contract.title,
            directLink: contract.directLink,
            website: contract.website,
            volume: contract.volume,
            yesPercent: contract.yesPercent,
        }),
    );

    const {
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
        sortedItems: sortedContracts,
    } = holdingsControls;

    const sortedCountries = [...countries].sort((a, b) => (b.pmiScore ?? -1) - (a.pmiScore ?? -1));

    const fetchedRef = useRef(false);
    useEffect(() => {
        if (!regionSlug || fetchedRef.current) return;
        fetchedRef.current = true;
        setHoldingsLoading(true);
        fetchRegionHoldings(regionSlug)
            .then((data) => setHoldingsContracts(data.contracts))
            .catch((err) => console.error('Failed to fetch region holdings:', err))
            .finally(() => setHoldingsLoading(false));
    }, [regionSlug]);

    return (
        <div className="flex flex-col gap-6 items-start">
            {/* Header */}
            <div className="flex flex-col gap-0.5 lg:gap-3">
                <h3 className="text-lg lg:text-3xl text-text-primary leading-8 font-semibold">Prediction Market Indexes</h3>
                <p className="text-sm lg:text-lg leading-5 lg:leading-7 text-text-tertiary w-full lg:w-[90%]">
                    PMIs aggregate &amp; structure related prediction market contracts into one index. PMIs are powered by more data, resulting in stronger predictive power. Micah PMIs&apos; account for many variables, such as volume and relevancy.
                </p>
            </div>

            {/* Tab buttons + search */}
            <div className="flex flex-col lg:flex-row lg:flex-nowrap items-start lg:items-center gap-2 lg:gap-4 justify-between w-full">
                <div className="flex items-center justify-between w-full lg:w-auto lg:shrink-0">
                    <div className="border border-border-primary rounded-lg inline-flex justify-center items-center overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setActiveTab('countries')}
                            className={`text-xs lg:text-sm p-2 lg:py-2.5 font-semibold lg:px-4 border-r border-border-primary cursor-pointer transition-colors ${activeTab === 'countries' ? 'bg-[#414969] text-white' : 'text-dark-primary hover:bg-[#414969] bg-[#F1F2F5] hover:text-white'
                            }`}
                        >
                            By Country
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('holdings')}
                            className={`text-xs lg:text-sm p-2 lg:py-2.5 font-semibold lg:px-4 cursor-pointer transition-colors ${activeTab === 'holdings' ? 'bg-[#414969] text-white' : 'text-dark-primary hover:bg-[#414969] bg-[#F1F2F5] hover:text-white'
                            }`}
                        >
                            By PMI Holdings
                        </button>
                    </div>
                </div>
                {activeTab === 'holdings' && (
                    <HoldingsControlsBar
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSortChange={(nextKey, nextDir) => {
                            setSortKey(nextKey);
                            setSortDir(nextDir);
                        }}
                        holdingsFilter={holdingsFilter}
                        onHoldingsFilterChange={setHoldingsFilter}
                        holdingsView={holdingsView}
                        onHoldingsViewChange={setHoldingsView}
                        includeRelationship={false}
                        defaultSortLabel="Sort"
                    />
                )}
            </div>

            {/* Tab content — By Country */}
            {activeTab === 'countries' && (
                <div className="grid grid-cols-12 gap-6 w-full">
                    {loading
                        ? Array.from({ length: 4 }).map((_, i) => <CountryCardSkeleton key={i} />)
                        : sortedCountries.map((country) => (
                            <CountryCard key={country.id} country={country as CountryInRegion} />
                        ))
                    }
                </div>
            )}

            {/* Tab content — By PMI Holdings */}
            {activeTab === 'holdings' && (
                <>
                    {holdingsView === 'list' && (
                        <HoldingsListView
                            holdingsLoading={holdingsLoading}
                            sortedContracts={sortedContracts}
                            holdingsFilter={holdingsFilter}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            highlightMatch={highlightMatch}
                            getPMIcon={getPMIcon}
                        />
                    )}
                    {holdingsView === 'grid' && (
                        <HoldingsGridView
                            holdingsLoading={holdingsLoading}
                            sortedContracts={sortedContracts}
                            holdingsFilter={holdingsFilter}
                            highlightMatch={highlightMatch}
                            getPMIcon={getPMIcon}
                        />
                    )}
                </>
            )}
        </div>
    );
}
