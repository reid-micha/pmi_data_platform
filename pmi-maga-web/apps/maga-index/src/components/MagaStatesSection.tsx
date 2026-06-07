import { fetchMagaIndex } from '@micah/api';
import type { CountryInRegion, MagaState } from '@micah/types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sortByPmiIndex, type PmiIndexSortMode } from '../utils/pmiIndexSort';
import CountryCard from './cards/CountryCard';
import CountryCardSkeleton from './cards/CountryCardSkeleton';

interface MagaStatesSectionProps {
    pmiSortMode: PmiIndexSortMode;
}

export default function MagaStatesSection({ pmiSortMode }: MagaStatesSectionProps): React.ReactElement {
    const [states, setStates] = useState<MagaState[]>([]);
    const [topSourceNames, setTopSourceNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (fetchedRef.current) return;
        fetchedRef.current = true;
        fetchMagaIndex('state')
            .then((data) => {
                setStates(data.states ?? []);
                setTopSourceNames(data.sourceNames ?? []);
            })
            .catch((err: Error) => console.error('Failed to fetch MAGA index states:', err))
            .finally(() => setLoading(false));
    }, []);

    const sortedStates = useMemo(() => sortByPmiIndex(states, pmiSortMode), [states, pmiSortMode]);

    return (
        <div className="px-6 pb-6 lg:px-12 lg:pb-12 relative">
            <div className="grid grid-cols-12 gap-6">
                {loading
                    ? Array.from({ length: 4 }).map((_, i) => <CountryCardSkeleton key={i} />)
                    : sortedStates.map((state) => (
                            <CountryCard
                            key={state.id}
                            country={{ ...state, sourceNames: state.sourceNames ?? topSourceNames } as unknown as CountryInRegion}
                            isState={true}
                        />
                    ))
                }
            </div>
        </div>
    );
}
