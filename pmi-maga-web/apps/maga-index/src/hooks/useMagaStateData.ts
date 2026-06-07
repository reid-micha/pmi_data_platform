import { fetchMagaState, fetchMagaStateHoldings, fetchMagaStateTrends } from '@micah/api';
import type { MagaChamberType, MagaViewType } from '@micah/api';
import type { ComponentContract, MagaStateDetail } from '@micah/types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHoldingsControls, type UseHoldingsControlsResult } from './useHoldingsControls';
import { normalizeMagaHoldings } from '../utils/contractYesPercent';

export interface UseMagaStateDataResult {
    state: MagaStateDetail | null;
    loading: boolean;
    notFound: boolean;
    holdingsLoading: boolean;
    holdingsControls: UseHoldingsControlsResult<ComponentContract>;
}

export function useMagaStateData(
    stateId: string | undefined,
    activeView: MagaViewType,
): UseMagaStateDataResult {
    const navigate = useNavigate();

    const [state, setState] = useState<MagaStateDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [holdingsContracts, setHoldingsContracts] = useState<ComponentContract[]>([]);
    const [holdingsLoading, setHoldingsLoading] = useState(true);

    // Fetch state detail + trends
    useEffect(() => {
        if (!stateId) { navigate('/'); return; }
        setLoading(true);

        Promise.allSettled([
            fetchMagaState(stateId, activeView),
            fetchMagaStateTrends(stateId, activeView, 14),
        ]).then(([stateResult, trendsResult]) => {
            if (stateResult.status === 'fulfilled') {
                const stateData = stateResult.value;
                stateData.trendData = trendsResult.status === 'fulfilled' ? trendsResult.value : [];
                setState(stateData);
            } else {
                const err = stateResult.reason;
                const status = err?.status ?? err?.response?.status;
                if (status === 404) {
                    setNotFound(true);
                } else {
                    console.error(`Failed to fetch state "${stateId}":`, err);
                    setState({
                        id: stateId,
                        name: stateId,
                        pmiScore: null,
                        activeContractsCount: 0,
                        holdingsCount: 0,
                        componentExchanges: 0,
                        sourceNames: [],
                        groups: [],
                        trendData: [],
                    } as unknown as MagaStateDetail);
                }
            }
        }).finally(() => setLoading(false));
    }, [stateId, activeView, navigate]);

    // Fetch holdings
    useEffect(() => {
        if (!stateId) return;
        setHoldingsLoading(true);
        const chamber: MagaChamberType | undefined =
            activeView === 'state' || activeView === 'all'
                ? undefined
                : (activeView as MagaChamberType);
        fetchMagaStateHoldings(stateId, chamber)
            .then(data => setHoldingsContracts(normalizeMagaHoldings(data.contracts ?? [])))
            .catch(err => { console.warn('Holdings not available:', err); setHoldingsContracts([]); })
            .finally(() => setHoldingsLoading(false));
    }, [stateId, activeView]);

    const holdingsControls = useHoldingsControls<ComponentContract>(holdingsContracts, (contract) => ({
        title: contract.title,
        directLink: contract.directLink,
        website: contract.website,
        volume: contract.volume,
        yesPercent: contract.yesPercent,
    }));

    return { state, loading, notFound, holdingsLoading, holdingsControls };
}

