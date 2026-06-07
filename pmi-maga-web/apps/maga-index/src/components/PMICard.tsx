import type { AnchorQuestion, Country, CountryInRegion, Region } from '@micah/types';
import React from 'react';
import { matchesFilter } from '../utils/searchFilter';
import CountryCard from './cards/CountryCard';
import QuestionCard from './cards/QuestionCard';
import RegionCard from './cards/RegionCard';

interface PMICardProps {
    regions?: Region[];
    countries?: (Country | CountryInRegion)[];
    questions?: AnchorQuestion[];
    loading?: boolean;
    activeTab?: 'regions' | 'countries' | 'all';
    filter?: string;
}

export default function PMICard({ regions = [], countries = [], questions = [], loading = false, activeTab = 'regions', filter = '' }: PMICardProps): React.ReactElement {
    if (loading) {
        return (
            <div className="grid grid-cols-12 gap-6">
                {Array.from({ length: 6 }).map((_, i) =>
                    activeTab === 'countries'
                        ? <CountryCard key={i} country={null} loading={true} />
                        : <RegionCard key={i} region={null} loading={true} />
                )}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-12 gap-6">
            {buildInterleavedPmiAndQuestionCards(
                regions.filter((r) => r != null && matchesFilter(r.name ?? '', filter)),
                countries.filter((c) => c != null && matchesFilter(c.name ?? '', filter)),
                questions.filter((q) => q != null && matchesFilter(q.baseQuestion ?? '', filter)),
            )}
        </div>
    );
}

function comparePmiScoreDesc(a: { pmiScore?: number | null }, b: { pmiScore?: number | null }): number {
    return (b.pmiScore ?? -1) - (a.pmiScore ?? -1);
}

function compareAggregateProbabilityDesc(a: { aggregateProbability?: number | null }, b: { aggregateProbability?: number | null }): number {
    return (b.aggregateProbability ?? -1) - (a.aggregateProbability ?? -1);
}

function buildInterleavedPmiAndQuestionCards(
    regions: Region[],
    countries: (Country | CountryInRegion)[],
    questions: AnchorQuestion[],
): React.ReactElement[] {
    const sortedRegions = [...regions].sort(comparePmiScoreDesc);
    const sortedCountries = [...countries].sort(comparePmiScoreDesc);
    const sortedQuestions = [...questions].sort(compareAggregateProbabilityDesc);
    const maxLen = Math.max(sortedRegions.length, sortedCountries.length, sortedQuestions.length);
    const interleaved: React.ReactElement[] = [];
    for (let i = 0; i < maxLen; i += 1) {
        if (i < sortedRegions.length) {
            const region = sortedRegions[i];
            interleaved.push(<RegionCard key={`region-${region.id}`} region={region} />);
        }
        if (i < sortedCountries.length) {
            const country = sortedCountries[i];
            interleaved.push(<CountryCard key={`country-${country.id}`} country={country} />);
        }
        if (i < sortedQuestions.length) {
            const q = sortedQuestions[i];
            interleaved.push(<QuestionCard key={`question-${q.peerGroupId}`} question={q} />);
        }
    }
    return interleaved;
}

