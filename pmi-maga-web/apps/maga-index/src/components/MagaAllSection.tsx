import { fetchMagaGroups, fetchMagaStates } from '@micah/api';
import type { MagaChamberType, MagaGroup } from '@micah/api';
import type { CountryInRegion, MagaState } from '@micah/types';
import React, { useEffect, useMemo, useState } from 'react';
import { comparePmiIndexSort, type PmiIndexSortMode } from '../utils/pmiIndexSort';
import { Link } from 'react-router-dom';
import CountryCard from './cards/CountryCard';
import CountryCardSkeleton from './cards/CountryCardSkeleton';
import QuestionCardSkeleton from './cards/QuestionCardSkeleton';
import { getPMIcon } from '../utils/getPMIcon';
import { getPmiColor } from '../utils/pmiColor';
import ShareButton from './shared/ShareButton';

const INTERLEAVE_ORDER: MagaChamberType[] = ['state', 'governor', 'senate', 'house'];

const groupCardClass ='p-3 lg:p-6 gap-4 lg:gap-10 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20 cursor-pointer relative';

type MagaAllItem =
    | { kind: 'state'; data: MagaState }
    | { kind: 'group'; data: MagaGroup };

function isDarkScore(score: number | null): boolean {
    return score != null && (score <= 20 || score > 70);
}

interface MagaAllSectionProps {
    pmiSortMode: PmiIndexSortMode;
}

export default function MagaAllSection({ pmiSortMode }: MagaAllSectionProps): React.ReactElement {
    const [items, setItems] = useState<MagaAllItem[]>([]);
    const [topSourceNames, setTopSourceNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        Promise.all(
            INTERLEAVE_ORDER.map((chamber) =>
                chamber === 'state' ? fetchMagaStates('state') : fetchMagaGroups(chamber),
            ),
        )
            .then((results) => {
                const flat: MagaAllItem[] = [];
                results.forEach((rows, i) => {
                    const chamber = INTERLEAVE_ORDER[i];
                    if (chamber === 'state') {
                        (rows as MagaState[]).forEach((s) => flat.push({ kind: 'state', data: s }));
                    } else {
                        (rows as MagaGroup[]).forEach((g) => flat.push({ kind: 'group', data: g }));
                    }
                });
                setItems(flat);
                const names = new Set<string>();
                (results[0] as MagaState[]).forEach((s) => (s.sourceNames ?? []).forEach((n) => names.add(n)));
                setTopSourceNames([...names]);
            })
            .catch((err: Error) => console.error('Failed to fetch MAGA all section:', err))
            .finally(() => setLoading(false));
    }, []);

    const displayedItems = useMemo(
        () =>
            [...items].sort((a, b) =>
                comparePmiIndexSort(
                    { pmiScore: a.data.pmiScore ?? null },
                    { pmiScore: b.data.pmiScore ?? null },
                    pmiSortMode,
                ),
            ),
        [items, pmiSortMode],
    );

    const skeletonCount = 4;

    return (
        <div className="px-6 pb-6 lg:px-12 lg:pb-12 lg:border-dashed-spaced relative">
            <div className="grid grid-cols-12 gap-6">
                {loading
                    ? Array.from({ length: skeletonCount }).map((_, i) =>
                          i % 2 === 0 ? <CountryCardSkeleton key={i} /> : <QuestionCardSkeleton key={i} />,
                      )
                    : displayedItems.map((item) =>
                          item.kind === 'state' ? (
                              <CountryCard
                                  key={`state-${item.data.id}`}
                                  country={
                                      {
                                          ...item.data,
                                          sourceNames: item.data.sourceNames ?? topSourceNames,
                                      } as unknown as CountryInRegion
                                  }
                                  isState
                              />
                          ) : (
                              <MagaAllGroupCard key={`group-${item.data.id}`} group={item.data} />
                          ),
                      )}
            </div>
            <img src="/images/border-plus.svg" alt="" className="lg:block hidden absolute -left-[7px] -bottom-2 z-10" />
            <img src="/images/border-plus.svg" alt="" className="lg:block hidden absolute -right-[7px] -bottom-2 z-10" />
        </div>
    );
}

function MagaAllGroupCard({ group }: { group: MagaGroup }): React.ReactElement {
    const labelColor = isDarkScore(group.pmiScore) ? '#fff' : '#333';

    return (
        <Link to={`/question/${group.id}?gid=${group.id}&stateId=${group.stateId}`} className={groupCardClass}>
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 pb-3 lg:pb-0 lg:border-0 border-b border-gray-200">
                <div className="flex items-start lg:items-center gap-5 lg:gap-10 relative">
                    <div
                        className="max-w-20 w-full lg:max-w-[110px] h-20 lg:h-[117px] flex flex-col items-center justify-center rounded-lg p-4 text-center gap-1 z-100"
                        style={{ backgroundColor: getPmiColor(group.pmiScore) }}
                    >
                        <h4 className="text-xl lg:text-3xl font-bold" style={{ color: labelColor }}>
                            {group.pmiScore != null ? `${group.pmiScore.toFixed(1)}%` : '—'}
                        </h4>
                        <p className="text-xs lg:text-base font-semibold leading-5" style={{ color: labelColor }}>
                            PMI Probability
                        </p>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex flex-col items-start gap-4">
                            <h4 className="text-sm lg:text-xl font-semibold text-text-primary">{group.baseQuestion}</h4>
                            <div className="flex items-center gap-1">
                                <span className="py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary whitespace-nowrap capitalize">
                                    {group.chamber}
                                </span>
                                <span className="py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary whitespace-nowrap capitalize">
                                    {group.stateAbbr}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="col-span-12 lg:col-span-4">
                <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-between lg:justify-start gap-4">
                    <ShareButton url={`${window.location.origin}/state/${group.stateId}`} />
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-1">
                        <div className="flex items-center">
                            {(group.sourceNames ?? []).slice(0, 4).map((source) => (
                                <img
                                    key={source}
                                    src={getPMIcon(source) ?? undefined}
                                    className="-mx-0.5 lg:-mx-1 w-7 h-7 lg:w-auto lg:h-auto object-contain mb-1"
                                    alt={source}
                                />
                            ))}
                            <img className="hidden lg:block mx-2" alt="" src="/images/arrow-right.svg" />
                            {(group.sourceNames ?? []).length > 4 && (
                                <span className="rounded-full border border-border-primary w-7 h-7 lg:w-10 lg:h-10 text-[10px] leading-3 flex items-center justify-center bg-bg-secondary">
                                    +{group.sourceNames!.length - 4}
                                </span>
                            )}
                        </div>
                        <p className="text-base text-text-tertiary font-semibold">
                            {group.activeContractsCount} contract{group.activeContractsCount !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
            </div>
            <div className="lg:block hidden absolute left-0 top-0 bottom-0 h-full">
                <svg width="75" height="100%" viewBox="0 0 75 165" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: getPmiColor(group.pmiScore) }}>
                    <g opacity="0.2">
                        <circle cx="2.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="2.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="9.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="16.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="23.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="30.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="37.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="44.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="51.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="58.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="65.5" cy="163.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="2.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="9.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="16.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="23.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="30.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="37.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="44.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="51.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="58.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="65.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="72.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="79.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="86.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="93.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="100.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="107.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="114.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="121.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="128.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="135.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="142.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="149.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="156.5" r="2.5" fill="currentColor"/>
                        <circle cx="72.5" cy="163.5" r="2.5" fill="currentColor"/>
                    </g>
                </svg>
            </div>
        </Link>
    );
}
