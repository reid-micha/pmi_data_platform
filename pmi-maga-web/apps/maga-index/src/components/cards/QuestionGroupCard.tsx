import React from 'react';
import { Link } from 'react-router-dom';
import { getPmiColor } from '../../utils/pmiColor';
import ShareButton from '../shared/ShareButton';
import 'react-loading-skeleton/dist/skeleton.css';
import CountryCardSkeleton from "@/components/cards/CountryCardSkeleton.tsx";

interface QuestionGroup {
    id: string;
    chamber: string;
    district: number | null;
    pmiScore: number | null;
    activeContractsCount?: number;
    stateAbbr?: string;
    baseQuestion?: string;
    sourceNames?: string[];
}

interface QuestionGroupCardProps {
    question: QuestionGroup | null;
    loading?: boolean;
    stateId?: string;
}

const cardClass = "relative gap-4 lg:gap-10 p-6 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20";
const badgeClass = "py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary";

export default function QuestionGroupCard({ question, loading = false, stateId }: QuestionGroupCardProps): React.ReactElement {
    if (loading || !question) {
        return <CountryCardSkeleton />
    }

    if (!question || question.pmiScore == null) return <></>;

    const chamberLabel = question.chamber?.charAt(0).toUpperCase() + question.chamber?.slice(1);

    return (
        <Link to={`/question/${question.id}?stateId=${stateId}`} className={cardClass}>
            {/* Card body */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 pb-3 lg:pb-0 border-b border-gray-200 lg:border-0">
                <div className="flex flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                    <div className="min-w-16 lg:min-w-[110px] h-16 lg:h-[117px] flex flex-col items-center justify-center rounded-lg relative z-50" style={{ backgroundColor: getPmiColor(question.pmiScore) }}>
                        <h4 className="text-xl lg:text-3xl font-bold" style={{color: (question.pmiScore ?? 0) <= 20 || (question.pmiScore ?? 0) > 80 ? '#fff' : '#333'}}>
                            {question.pmiScore != null ? Number(question.pmiScore).toFixed(1) : 'N/A'}
                        </h4>
                        <p className="text-[10px] lg:text-base font-semibold" style={{color: (question.pmiScore ?? 0) <= 20 || (question.pmiScore ?? 0) > 80 ? '#fff' : '#333'}}>PMI Score</p>
                    </div>

                    <div className="flex flex-col">
                        {/* Title + description + tags */}
                        <div className="flex items-center gap-4 mb-3 flex-wrap">
                            <h4 className="text-sm lg:text-xl font-semibold text-text-primary">{question.baseQuestion}</h4>
                            <span className={badgeClass}>{chamberLabel}</span>
                        </div>
                        <p className="hidden lg:block text-xs lg:text-base text-text-tertiary leading-4 lg:leading-6">
                            A prediction market index (PMI) tracking market-implied probabilities for {question.baseQuestion?.toLowerCase()} outcomes, aggregated from active prediction market contracts.
                        </p>
                    </div>
                </div>
            </div>

            {/* Right column - Share button and icons */}
            <div className="col-span-12 lg:col-span-4">
                <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-between lg:justify-start gap-4">
                    <ShareButton url={`${window.location.origin}/question/${question.id}?stateId=${stateId}`} />
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-1">
                        <div className="flex items-center">
                            {(question.sourceNames ?? []).slice(0, 4).map((source) => (
                                <img
                                    key={source}
                                    src={`/images/PMMarkets/${source.toLowerCase()}.svg`}
                                    className="-mx-0.5 lg:-mx-1 w-7 h-7 lg:w-auto lg:h-auto object-contain"
                                    alt={source}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                            ))}
                            {(question.sourceNames ?? []).length > 4 && (
                                <span
                                    className="rounded-full border border-border-primary w-10 h-10 text-xs leading-3 flex items-center justify-center bg-bg-secondary">
                                    +{(question.sourceNames ?? []).length - 4}
                                </span>
                            )}
                            <img src="/images/arrow-right.svg" className="hidden lg:block mx-2" alt="Arrow Right"/>
                        </div>
                        <p className="text-base text-text-tertiary font-semibold">{question.activeContractsCount ?? 0} contracts</p>
                    </div>
                </div>
            </div>
            <div className="lg:block hidden absolute left-0 top-0 bottom-0 h-full">
                <svg width="75" height="100%" viewBox="0 0 75 165" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: getPmiColor(question.pmiScore) }}>
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


