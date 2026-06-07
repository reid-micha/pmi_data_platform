import { fetchMagaState, fetchMagaStateTrends, fetchMagaStateHoldings, fetchMagaStates, type MagaGroup } from '@micah/api';
import type { MagaChamberType } from '@micah/api';
import type { ComponentContract } from '@micah/types';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHoldingsControls, type UseHoldingsControlsResult } from './useHoldingsControls';
import { normalizeMagaHoldings } from '../utils/contractYesPercent';

export interface UseMagaQuestionDataResult {
    question: MagaGroup | null;
    loading: boolean;
    notFound: boolean;
    holdingsLoading: boolean;
    trendData: any[];
    holdingsControls: UseHoldingsControlsResult<ComponentContract>;
}

export function useMagaQuestionData(
    questionId: string | undefined,
    stateIdParam: string | undefined,
): UseMagaQuestionDataResult {
    const navigate = useNavigate();

    const [question, setQuestion] = useState<MagaGroup | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [holdingsContracts, setHoldingsContracts] = useState<ComponentContract[]>([]);
    const [holdingsLoading, setHoldingsLoading] = useState(true);

    // Fetch state detail to get groups (questions)
    useEffect(() => {
        if (!questionId) { navigate('/'); return; }
        setLoading(true);

        const fetchQuestionData = async () => {
            try {
                let stateId = stateIdParam;

                // If stateId is not provided, we need to find it by searching all states
                if (!stateId) {
                    try {
                        const states = await fetchMagaStates('state');

                        // Search for the question/group in all states
                        for (const state of states) {
                            try {
                                const stateDetail = await fetchMagaState(state.id, 'state');
                                const foundGroup = (stateDetail.groups ?? []).find((group: any) => {
                                    const questionSlug = group.baseQuestion
                                        .toLowerCase()
                                        .replace(/\s+/g, '-')
                                        .replace(/[^\w-]/g, '');
                                    return group.id === questionId || questionSlug === questionId;
                                });

                                if (foundGroup) {
                                    stateId = state.id;
                                    const fullGroup = {
                                        ...foundGroup,
                                        stateId: state.id,
                                        chamber: foundGroup.chamber as MagaChamberType,
                                        stateAbbr: foundGroup.stateAbbr || '',
                                        baseQuestion: foundGroup.baseQuestion || '',
                                        sourceNames: foundGroup.sourceNames || [],
                                    } as MagaGroup;
                                    setQuestion(fullGroup);
                                    setTrendData([]);
                                    return;
                                }
                            } catch (err) {
                                // continue to next state
                            }
                        }
                        setNotFound(true);
                        return;
                    } catch (err) {
                        console.error('Failed to search for question in all states:', err);
                        setNotFound(true);
                        return;
                    }
                }

                // If we have stateId, fetch that state's data
                const stateResult = await fetchMagaState(stateId, 'state');

                // Find the question/group that matches the questionId
                const foundQuestion = (stateResult.groups ?? []).find((group: any) => {
                    const questionSlug = group.baseQuestion
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^\w-]/g, '');
                    return group.id === questionId || questionSlug === questionId;
                });

                if (foundQuestion) {
                    const chamber = foundQuestion.chamber as MagaChamberType;
                    const district = chamber === 'house' ? foundQuestion.district ?? undefined : undefined;
                    const trendsResult = await fetchMagaStateTrends(stateId, chamber, 14, district);
                    const fullQuestion = {
                        ...foundQuestion,
                        stateId,
                        chamber,
                        stateAbbr: foundQuestion.stateAbbr || '',
                        baseQuestion: foundQuestion.baseQuestion || '',
                        sourceNames: foundQuestion.sourceNames || [],
                    } as MagaGroup;
                    setQuestion(fullQuestion);
                    setTrendData(trendsResult ?? []);
                } else {
                    setNotFound(true);
                }
            } catch (err) {
                const status = (err as any)?.status ?? (err as any)?.response?.status;
                if (status === 404) {
                    setNotFound(true);
                } else {
                    console.error(`Failed to fetch question data:`, err);
                    setNotFound(true);
                }
            }
        };

        fetchQuestionData().finally(() => setLoading(false));
    }, [questionId, stateIdParam, navigate]);

    // Fetch holdings for the question
    useEffect(() => {
        if (!question) return;

        setHoldingsLoading(true);

        // Get stateId from the question
        const stateId = question.stateId;
        const chamber: MagaChamberType = (question.chamber as MagaChamberType) || 'state';
        const districtId = question.district != null ? String(question.district) : undefined;

        fetchMagaStateHoldings(stateId, chamber, districtId)
            .then(data => setHoldingsContracts(normalizeMagaHoldings(data.contracts ?? [])))
            .catch(err => {
                console.warn('Holdings not available:', err);
                setHoldingsContracts([]);
            })
            .finally(() => setHoldingsLoading(false));
    }, [question]);

    const holdingsControls = useHoldingsControls<ComponentContract>(holdingsContracts, (contract) => ({
        title: contract.title,
        directLink: contract.directLink,
        website: contract.website,
        volume: contract.volume,
        yesPercent: contract.yesPercent,
    }));

    return { question, loading, notFound, holdingsLoading, trendData, holdingsControls };
}



