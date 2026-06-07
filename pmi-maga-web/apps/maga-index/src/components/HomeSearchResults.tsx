import type { MagaViewType } from '@micah/api';
import React, { useMemo } from 'react';
import { sortByPmiIndex, type PmiIndexSortMode } from '../utils/pmiIndexSort';
import { useMagaSearchCatalog } from '../hooks/useMagaSearchCatalog';
import CountryCard from './cards/CountryCard';
import CountryCardSkeleton from './cards/CountryCardSkeleton';
import MagaGroupSearchCard from './cards/MagaGroupSearchCard';

interface HomeSearchResultsProps {
    query: string;
    scope: MagaViewType;
    pmiSortMode: PmiIndexSortMode;
}

export default function HomeSearchResults({
    query,
    scope,
    pmiSortMode,
}: HomeSearchResultsProps): React.ReactElement {
    const { states, groups, loading } = useMagaSearchCatalog({ q: query, scope });

    const sortedStates = useMemo(
        () => sortByPmiIndex(states, pmiSortMode),
        [states, pmiSortMode],
    );
    const sortedGroups = useMemo(
        () => sortByPmiIndex(groups, pmiSortMode),
        [groups, pmiSortMode],
    );

    return (
        <div className="px-6 pb-6 lg:px-12 lg:pb-12 border-dashed-spaced relative">
            <div className="grid grid-cols-12 gap-6">
                {loading
                    ? Array.from({ length: 4 }).map((_, i) => <CountryCardSkeleton key={`search-skel-${i}`} />)
                    : (
                        <>
                            {sortedStates.map((state) => (
                                <CountryCard
                                    key={`search-state-${state.id}`}
                                    country={state}
                                    isState
                                />
                            ))}
                            {sortedGroups.map((group) => (
                                <MagaGroupSearchCard key={`search-group-${group.id}`} group={group} />
                            ))}
                        </>
                    )}
            </div>
        </div>
    );
}
