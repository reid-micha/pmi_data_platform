import { fetchMagaIndex, fetchMagaLastUpdated, fetchMagaStates } from '@micah/api';
import type { MagaViewType } from '@micah/api';
import type { MagaIndexData, MagaState } from '@micah/types';
import { useEffect, useState } from 'react';

export function useMagaIndexData(magaView: MagaViewType) {
    const [world, setWorld] = useState<MagaIndexData | null>(null);
    const [loading, setLoading] = useState(true);
    const [stateData, setStateData] = useState<Record<string, MagaState>>({});
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const buildStateMap = (states: MagaState[]) => {
            const map: Record<string, MagaState> = {};
            states.forEach((state: MagaState) => {
                const key = state.name.toLowerCase();
                if (!(key in map)) {
                    map[key] = state;
                }
            });
            return map;
        };

        Promise.all([
            fetchMagaIndex(magaView),
            fetchMagaStates(magaView === 'all' ? 'state' : magaView),
            fetchMagaLastUpdated(),
        ])
            .then(([indexData, states, lastUpdated]) => {
                setWorld(indexData);
                setStateData(buildStateMap(states));
                setLastUpdatedAt(lastUpdated.generatedAt);
            })
            .catch((err: Error) => console.error('Failed to fetch world data:', err))
            .finally(() => setLoading(false));
    }, [magaView]);

    return { world, loading, stateData, lastUpdatedAt };
}

