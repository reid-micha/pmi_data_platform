import { fetchMagaGroups, fetchMagaQuestions } from '@micah/api';
import type { MagaChamberType, MagaGroup } from '@micah/api';
import type { MagaQuestion, TabType } from '@micah/types';
import React, { useEffect, useMemo, useState } from 'react';
import { sortByPmiIndex, type PmiIndexSortMode } from '../utils/pmiIndexSort';
import { Link } from 'react-router-dom';
import QuestionCardSkeleton from './cards/QuestionCardSkeleton';
import { getPMIcon } from '../utils/getPMIcon';
import { getPmiColor } from '../utils/pmiColor';
import { withHourlyParam } from '../utils/hourlyRouting';
import ShareButton from './shared/ShareButton';

interface MagaQuestionsSectionProps {
    hourly?: boolean;
    activeTab?: TabType;
    pmiSortMode: PmiIndexSortMode;
}

function slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

const cardClass = "gap-4 lg:gap-10 p-3 lg:p-6 gap-5 lg:gap-10 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20 cursor-pointer relative";

const TAB_TO_CHAMBER: Partial<Record<TabType, MagaChamberType>> = {
    house: 'house',
    senate: 'senate',
    governor: 'governor',
};

export default function MagaQuestionsSection({ hourly = false, activeTab, pmiSortMode }: MagaQuestionsSectionProps): React.ReactElement {
    const [questions, setQuestions] = useState<MagaQuestion[]>([]);
    const [groups, setGroups] = useState<MagaGroup[]>([]);
    const [loading, setLoading] = useState(true);

    const chamber = activeTab ? TAB_TO_CHAMBER[activeTab] : undefined;

    useEffect(() => {
        setLoading(true);
        if (chamber) {
            fetchMagaGroups(chamber)
                .then(setGroups)
                .catch((err: Error) => console.error('Failed to fetch groups:', err))
                .finally(() => setLoading(false));
        } else {
            fetchMagaQuestions()
                .then((data) => setQuestions(data ?? []))
                .catch((err: Error) => console.error('Failed to fetch MAGA questions:', err))
                .finally(() => setLoading(false));
        }
    }, [chamber]);

    const isDarkScore = (score: number | null) => score != null && (score <= 20 || score > 70);

    const sortedGroups = useMemo(() => sortByPmiIndex(groups, pmiSortMode), [groups, pmiSortMode]);

    return (
        <div className="px-6 pb-6 lg:px-12 lg:pb-12 border-dashed-spaced relative">
            <div className="grid grid-cols-12 gap-6">
                {loading
                    ? Array.from({ length: 4 }).map((_, i) => <QuestionCardSkeleton key={i} />)
                    : chamber
                        // ── Group cards (house / senate / governor) ──────────────────
                        ? sortedGroups.map((g) => {
                            const labelColor = isDarkScore(g.pmiScore) ? '#fff' : '#333';
                            return (
                                <Link
                                    key={g.id}
                                    to={`/question/${g.id}?gid=${g.id}&stateId=${g.stateId}`}
                                    className={cardClass}
                                >
                                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 lg:pb-0 lg:border-0 pb-3 border-b border-gray-200">
                                        <div className="flex flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                                            <div
                                                className="max-w-20 w-full lg:max-w-[110px] h-20 lg:h-[117px] flex flex-col items-center justify-center rounded-lg p-4 text-center gap-1 z-100"
                                                style={{ backgroundColor: getPmiColor(g.pmiScore) }}
                                            >
                                                <h4 className="text-xl lg:text-3xl font-bold" style={{ color: labelColor }}>
                                                    {g.pmiScore != null ? `${g.pmiScore.toFixed(1)}%` : '—'}
                                                </h4>
                                                <p className="text-xs lg:text-base font-semibold leading-5" style={{ color: labelColor }}>PMI Probability</p>
                                            </div>
                                            <div className="flex flex-col">
                                                <div className="flex flex-col items-start gap-4">
                                                    <h4 className="text-sm lg:text-xl font-semibold text-text-primary">
                                                        {g.baseQuestion}
                                                    </h4>
                                                    <div className="flex items-center gap-1">
                                                       <span className="py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary whitespace-nowrap capitalize">
                                                        {g.chamber}
                                                        </span>
                                                        <span className="py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary whitespace-nowrap capitalize">
                                                            {g.stateAbbr}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-12 lg:col-span-4">
                                        <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-between lg:justify-start gap-4">
                                            <ShareButton url={`${window.location.origin}/state/${g.stateId}`} />
                                            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-1">
                                                <div className="flex items-center">
                                                    {(g.sourceNames ?? []).slice(0, 4).map((source) => (
                                                        <img
                                                            key={source}
                                                            src={getPMIcon(source) ?? undefined}
                                                            className="-mx-0.5 lg:-mx-1 w-7 h-7 lg:w-auto lg:h-auto object-contain mb-1"
                                                            alt={source}
                                                        />
                                                    ))}
                                                    <img className="hidden lg:block mx-2" alt="Arrow Right" src="/images/arrow-right.svg" />
                                                    {(g.sourceNames ?? []).length > 4 && (
                                                        <span className="rounded-full border border-border-primary  w-7 h-7 lg:w-auto lg:h-auto text-[10px] leading-3 flex items-center justify-center bg-bg-secondary">
                                                            +{g.sourceNames!.length - 4}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-base text-text-tertiary font-semibold">
                                                    {g.activeContractsCount} contract{g.activeContractsCount !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lg:block hidden absolute left-0 top-0 bottom-0 h-full">
                                        <svg width="75" height="100%" viewBox="0 0 75 165" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: getPmiColor(g.pmiScore) }}>
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
                        })
                        // ── Question cards (all / states tab) ────────────────────────
                        : [...questions]
                            .sort((a, b) => (b.aggregateProbability ?? -1) - (a.aggregateProbability ?? -1))
                            .map((question) => {
                                const pct = question.aggregateProbability != null
                                    ? question.aggregateProbability.toFixed(1)
                                    : '--';
                                const slug = slugify(question.baseQuestion);
                                const sources = question.souceNames ?? [];
                                const labelColor = isDarkScore(question.aggregateProbability) ? '#fff' : '#333';

                                return (
                                    <Link
                                        key={question.peerGroupId}
                                        to={withHourlyParam(`/question/${slug}?gid=${question.peerGroupId}`, hourly)}
                                        className={cardClass}
                                    >
                                        <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                                            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                                                <div className="max-w-28 w-full lg:max-w-[110px] h-20 lg:h-[117px] flex flex-col items-center justify-center rounded-lg p-4 text-center gap-1" style={{ backgroundColor: getPmiColor(question.aggregateProbability) }}>
                                                    <h4 className="text-xl lg:text-3xl font-bold" style={{ color: labelColor }}>{pct}%</h4>
                                                    <p className="text-xs lg:text-base font-semibold leading-5" style={{ color: labelColor }}>PMI Probability</p>
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="flex items-start gap-4">
                                                        <h4 className="text-sm lg:text-xl font-semibold text-text-primary">
                                                            {question.baseQuestion}
                                                        </h4>
                                                        <span className="py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary whitespace-nowrap">
                                                            Question
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="col-span-12 lg:col-span-4">
                                            <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-between lg:justify-start gap-4">
                                                <div className="relative">
                                                    <button
                                                        className="flex items-center gap-1.5 w-9 h-9 border border-border-primary rounded-lg justify-center cursor-pointer"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            navigator.clipboard.writeText(`${window.location.origin}/question/${slug}?gid=${question.peerGroupId}`);
                                                        }}
                                                    >
                                                        <img alt="Share" src="/images/share.svg" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <div className="flex items-center">
                                                        {sources.slice(0, 4).map((source) => (
                                                            <img
                                                                key={source}
                                                                src={getPMIcon(source) ?? undefined}
                                                                className="-mx-0.5 lg:-mx-1 w-7 h-7 lg:w-auto lg:h-auto object-contain mb-1"
                                                                alt={source}
                                                            />
                                                        ))}
                                                        <img className="hidden lg:block mx-2" alt="Arrow Right" src="/images/arrow-right.svg" />
                                                        {sources.length > 4 && (
                                                            <span className="rounded-full border border-border-primary w-4 h-4 lg:w-7.5 lg:h-7.5 text-[6px] lg:text-[10px] leading-3 flex items-center justify-center bg-bg-secondary">
                                                                +{sources.length - 4}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-base text-text-tertiary font-semibold">
                                                        {question.peerCount} contract{question.peerCount !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })
                }
            </div>
            <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -left-[7px] -bottom-2 z-10" />
            <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -right-[7px] -bottom-2 z-10" />
        </div>
    );
}
