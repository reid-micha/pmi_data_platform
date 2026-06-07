import { filterAndSortByQueryScore, maxScoreText } from '@micah/shared';
import type { CountryInRegion, MagaSearchCatalogGroup, MagaSearchCatalogState } from '@micah/types';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import CountryCard from '../components/cards/CountryCard';
import CountryCardSkeleton from '../components/cards/CountryCardSkeleton';
import MagaGroupSearchCard from '../components/cards/MagaGroupSearchCard';
import Layout from '../components/Layout';
import { useMagaSearchCatalog } from '../hooks/useMagaSearchCatalog';

function catalogStateToCountry(state: MagaSearchCatalogState): CountryInRegion {
    return {
        id: state.id,
        name: state.name,
        pmiScore: state.pmiScore,
        activeContractsCount: state.activeContractsCount,
        sourceNames: state.sourceNames,
    };
}

function SearchResult(): React.ReactElement {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const { states, groups, loading } = useMagaSearchCatalog();

    const normalizedQuery = query.toLowerCase().trim();

    const filteredStates = filterAndSortByQueryScore(states, (state) =>
        maxScoreText([state.name, state.id], normalizedQuery),
    );

    const filteredGroups = filterAndSortByQueryScore(groups, (group) =>
        maxScoreText([group.baseQuestion, group.stateAbbr, group.stateId, group.chamber], normalizedQuery),
    );

    const totalResults = filteredStates.length + filteredGroups.length;

    return (
        <Layout>
            <div className="p-12 flex flex-col gap-10">
                <div className="flex flex-col gap-3">
                    <p className="text-base text-text-tertiary">
                        {loading
                            ? 'Loading results...'
                            : totalResults === 0
                              ? 'No results found.'
                              : `Showing ${totalResults} results for`}
                    </p>
                    <h1 className="text-3xl font-bold text-text-primary">
                        {query ? query : 'All Results'}
                    </h1>
                </div>

                {(loading || totalResults > 0) && (
                    <div className="flex flex-col gap-10">
                        {(loading || filteredStates.length > 0) && (
                            <section className="flex flex-col gap-6">
                                {!loading && (
                                    <h2 className="text-xl font-semibold text-text-primary instrument">States</h2>
                                )}
                                <div className="grid grid-cols-12 gap-6">
                                    {loading
                                        ? Array.from({ length: 3 }).map((_, i) => (
                                              <CountryCardSkeleton key={`state-skel-${i}`} />
                                          ))
                                        : filteredStates.map((state) => (
                                              <CountryCard
                                                  key={state.id}
                                                  country={catalogStateToCountry(state)}
                                                  isState
                                              />
                                          ))}
                                </div>
                            </section>
                        )}

                        {(loading || filteredGroups.length > 0) && (
                            <section className="flex flex-col gap-6">
                                {!loading && (
                                    <h2 className="text-xl font-semibold text-text-primary instrument">Questions</h2>
                                )}
                                <div className="grid grid-cols-12 gap-6">
                                    {loading
                                        ? Array.from({ length: 4 }).map((_, i) => (
                                              <div
                                                  key={`group-skel-${i}`}
                                                  className="col-span-12 h-32 rounded-md bg-bg-dark-primary border border-border-tertiary animate-pulse"
                                              />
                                          ))
                                        : filteredGroups.map((group: MagaSearchCatalogGroup) => (
                                              <MagaGroupSearchCard key={group.id} group={group} />
                                          ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}

                {!loading && totalResults === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <img src="/images/search.svg" alt="No results" className="w-12 h-12 opacity-30" />
                        <p className="text-text-tertiary text-lg">
                            No results found for{' '}
                            <span className="text-text-primary font-medium">&quot;{query}&quot;</span>
                        </p>
                    </div>
                )}
            </div>
        </Layout>
    );
}

export default SearchResult;
