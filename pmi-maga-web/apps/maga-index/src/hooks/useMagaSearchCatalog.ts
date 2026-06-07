import { fetchMagaSearchCatalog } from '@micah/api';
import type { MagaViewType } from '@micah/api';
import type { MagaSearchCatalogGroup, MagaSearchCatalogResponse, MagaSearchCatalogState } from '@micah/types';
import { useEffect, useMemo, useState } from 'react';

interface UseMagaSearchCatalogParams {
    q?: string;
    scope?: MagaViewType;
}

const catalogCache = new Map<string, MagaSearchCatalogResponse>();
const inflightCatalog = new Map<string, Promise<MagaSearchCatalogResponse>>();

function getCatalogCacheKey(params: UseMagaSearchCatalogParams): string {
    const q = params.q?.trim() ?? '';
    const scope = params.scope ?? 'all';
    return `${scope}::${q.toLowerCase()}`;
}

function loadMagaSearchCatalog(params: UseMagaSearchCatalogParams): Promise<MagaSearchCatalogResponse> {
    const key = getCatalogCacheKey(params);
    const cached = catalogCache.get(key);
    if (cached) {
        return Promise.resolve(cached);
    }
    const inflight = inflightCatalog.get(key);
    if (inflight) {
        return inflight;
    }
    const request = fetchMagaSearchCatalog(params)
        .then((data) => {
            catalogCache.set(key, data);
            return data;
        })
        .finally(() => {
            inflightCatalog.delete(key);
        });
    inflightCatalog.set(key, request);
    return request;
}

/** Dropdown labels: state full names + group questions only (not stateAbbr — avoids AL vs Alabama duplicates). */
export function buildMagaSearchSuggestionLabels(
    states: MagaSearchCatalogState[],
    groups: MagaSearchCatalogGroup[],
): string[] {
    const labels = [
        ...states.map((s) => s.name),
        ...groups.map((g) => g.baseQuestion),
    ];
    return Array.from(new Set(labels.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function useMagaSearchCatalog(params: UseMagaSearchCatalogParams = {}) {
    const query = params.q?.trim() ?? '';
    const scope = params.scope ?? 'all';
    const cacheKey = getCatalogCacheKey(params);
    const cachedCatalog = catalogCache.get(cacheKey);
    const [states, setStates] = useState<MagaSearchCatalogState[]>(cachedCatalog?.states ?? []);
    const [groups, setGroups] = useState<MagaSearchCatalogGroup[]>(cachedCatalog?.groups ?? []);
    const [loading, setLoading] = useState(!cachedCatalog);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const existing = catalogCache.get(cacheKey);
        if (existing) {
            setStates(existing.states);
            setGroups(existing.groups);
            setLoading(false);
            return;
        }

        setLoading(true);
        loadMagaSearchCatalog({ q: query, scope })
            .then((data) => {
                setStates(data.states);
                setGroups(data.groups);
            })
            .catch((err: Error) => setError(err))
            .finally(() => setLoading(false));
    }, [cacheKey, query, scope]);

    const suggestionLabels = useMemo(
        () => buildMagaSearchSuggestionLabels(states, groups),
        [states, groups],
    );

    return { states, groups, loading, error, suggestionLabels };
}
