import type { AnchorQuestion } from '@micah/types';
import React from 'react';
import { Link } from 'react-router-dom';
import { addFuturePhrase } from '../../utils/addFuturePhrase';
import QuestionCardSkeleton from './QuestionCardSkeleton';

interface QuestionCardProps {
    question?: AnchorQuestion;
    loading?: boolean;
    phrase?: string;
}

const cardClass ="p-6 gap-5 lg:gap-10 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20 cursor-pointer relative";

function slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

export default function QuestionCard({ question, loading = false, phrase = 'within the next 12 months' }: QuestionCardProps): React.ReactElement {
    if (loading || !question) {
        return <QuestionCardSkeleton />;
    }

    const pct = question.aggregateProbability != null
        ? (question.aggregateProbability * 100).toFixed(1)
        : '--';

    // Collect unique sources from peers for logo display
    const uniqueSources = [...new Set(question.peers.map(p => p.source))];
    const slug = slugify(question.baseQuestion);

    return (
        <Link to={`/question/${slug}?gid=${question.peerGroupId}`} className={cardClass}>
            {/* Card body */}
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                        <div className="max-w-28 w-full lg:max-w-[110px] h-20 lg:h-[117px] flex flex-col items-center justify-center rounded-lg relative z-50 bg-[#F7B27A] p-4 text-center gap-1">
                            <h4 className="text-xl lg:text-3xl font-bold">{pct}%</h4>
                            <p className="text-xs lg:text-base font-semibold leading-5">PMI Probability</p>
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-start gap-4">
                                <h4 className="text-sm lg:text-xl font-semibold text-text-primary">{addFuturePhrase(question.baseQuestion, phrase)}</h4>
                                <span className="py-1 px-2 text-xs font-medium border border-border-tertiary rounded-3xl bg-bg-secondary whitespace-nowrap">Question</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-span-12 lg:col-span-4">
                    <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-between lg:justify-start gap-4">
                        <div className="relative">
                            <button
                                className="flex items-center gap-1.5 w-9 h-9 border border-border-primary rounded-lg justify-center cursor-pointer">
                                <img alt="Share" src="/images/share.svg"/></button>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="flex items-center">
                                {uniqueSources.map((source) => (
                                    <img
                                        key={source}
                                        src={`/images/PMMarkets/${source.toLowerCase()}.svg`}
                                        alt={source}
                                        className="-mx-0.5 lg:-mx-1 w-7 h-7 lg:w-auto lg:h-auto object-contain mb-1"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ))}
                                <img className="hidden lg:block mx-2" alt="Arrow Right" src="/images/arrow-right.svg"/>
                            </div>
                            <p className="text-base text-text-tertiary font-semibold">{question.peerCount} Contracts</p></div>
                    </div>
                </div>
                <div className="hidden lg:block absolute left-0 top-0 bottom-0 h-full">
                    <svg width="75" height="165" viewBox="0 0 75 165" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: '#F7B27A' }}>
                        <g opacity="0.2">
                            <circle cx="2.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="2.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="9.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="16.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="23.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="30.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="37.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="44.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="51.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="58.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="65.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="2.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="9.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="16.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="23.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="30.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="37.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="44.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="51.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="58.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="65.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="72.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="79.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="86.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="93.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="100.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="107.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="114.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="121.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="128.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="135.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="142.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="149.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="156.5" r="2.5" fill="currentColor"></circle>
                            <circle cx="72.5" cy="163.5" r="2.5" fill="currentColor"></circle>
                        </g>
                    </svg>
                </div>
        </Link>
    );
}
