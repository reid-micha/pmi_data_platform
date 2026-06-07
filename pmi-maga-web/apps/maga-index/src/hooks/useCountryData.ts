import { fetchCountry, fetchCountryHoldings } from '@micah/api';
import type { ComponentContract, CountryDetail } from '@micah/types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHoldingsControls, type UseHoldingsControlsResult } from './useHoldingsControls';

export interface UseCountryDataResult {
    country: CountryDetail | null;
    loading: boolean;
    notFound: boolean;
    holdingsLoading: boolean;
    holdingsControls: UseHoldingsControlsResult<ComponentContract>;
}

export function useCountryData(countrySlug: string | undefined): UseCountryDataResult {
    const navigate = useNavigate();

    const [country, setCountry] = useState<CountryDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [holdingsContracts, setHoldingsContracts] = useState<ComponentContract[]>([]);
    const [holdingsLoading, setHoldingsLoading] = useState(true);

    useEffect(() => {
        if (!countrySlug) {
            navigate('/');
            return;
        }

        Promise.allSettled([fetchCountry(countrySlug), fetchCountryHoldings(countrySlug)])
            .then(([countryResult, holdingsResult]) => {
                if (countryResult.status === 'fulfilled') {
                    setCountry(countryResult.value);
                } else {
                    console.error(`Failed to fetch country "${countrySlug}":`, countryResult.reason);
                    setNotFound(true);
                }

                if (holdingsResult.status === 'fulfilled') {
                    setHoldingsContracts(holdingsResult.value.contracts);
                } else {
                    console.error(`Failed to fetch holdings for "${countrySlug}":`, holdingsResult.reason);
                }
            })
            .finally(() => {
                setLoading(false);
                setHoldingsLoading(false);
            });
    }, [countrySlug, navigate]);

    const holdingsControls = useHoldingsControls<ComponentContract>(holdingsContracts, (contract) => ({
        title: contract.title,
        directLink: contract.directLink,
        website: contract.website,
        volume: contract.volume,
        yesPercent: contract.yesPercent,
    }));

    return { country, loading, notFound, holdingsLoading, holdingsControls };
}

