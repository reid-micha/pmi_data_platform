import { fetchAnchorQuestion } from '@micah/api';
import type { AnchorQuestion } from '@micah/types';
import React, { useEffect, useState } from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import HoldingsGridView from '../components/HoldingsGridView';
import HoldingsListView from '../components/HoldingsListView';
import Layout from '../components/Layout';
import PMICardChart from '../components/PMI-score-chart';
import HoldingsControlsBar from '../components/shared/HoldingsControlsBar';
import ShareButton from '../components/shared/ShareButton';
import { useHoldingsControls } from '../hooks/useHoldingsControls';
import { useFuturePhrase } from '../hooks/useFuturePhrase';
import { addFuturePhrase } from '../utils/addFuturePhrase';
import { contractYesPercent } from '../utils/contractYesPercent';
import { getPMIcon } from '../utils/getPMIcon';

interface QuestionPeerContract {
    title: string;
    website: string;
    directLink: number;
    volume: number | null;
    yesPercent: number | null;
    url: string | null;
}

function Question(): React.ReactElement | null {
    const [searchParams] = useSearchParams();

    const navigate = useNavigate();
    const phrase = useFuturePhrase();
    const [question, setQuestion] = useState<AnchorQuestion | null>(null);
    const [loading, setLoading] = useState(true);

    const peerGroupId = searchParams.get('gid');

    useEffect(() => {
        if (!peerGroupId) {
            navigate({
                pathname: '/',
            });
            return;
        }

        const id = parseInt(peerGroupId, 10);
        if (isNaN(id)) {
            navigate({
                pathname: '/',
            });
            return;
        }

        fetchAnchorQuestion(id)
            .then(setQuestion)
            .catch(() => navigate({
                pathname: '/',
            }))
            .finally(() => setLoading(false));
    }, [peerGroupId, navigate]);

    const peerContracts: QuestionPeerContract[] = (question?.peers ?? []).map((peer) => ({
        title: peer.title,
        website: peer.source,
        directLink: peer.similarityScore > 0.85 ? 1 : 0,
        volume: peer.volume,
        yesPercent: contractYesPercent({ probability: peer.probability }),
        url: peer.url,
    }));

    const {
        sortKey,
        setSortKey,
        sortDir,
        setSortDir,
        holdingsFilter,
        setHoldingsFilter,
        holdingsView,
        setHoldingsView,
        handleSort,
        highlightMatch,
        sortedItems: sortedContracts,
    } = useHoldingsControls<QuestionPeerContract>(peerContracts, (contract) => ({
        title: contract.title,
        directLink: contract.directLink,
        website: contract.website,
        volume: contract.volume,
        yesPercent: contract.yesPercent,
    }));

    if (loading || !question) {
        return (
            <Layout>
                <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
                <div className="py-16 px-12 border-dashed-spaced relative">
                    {/* Breadcrumb */}
                    <div className="flex items-center gap-2 mb-11">
                        <Skeleton width={30} height={14} />
                        <Skeleton width={8} height={14} />
                        <Skeleton width={70} height={14} />
                        <Skeleton width={8} height={14} />
                        <Skeleton width={180} height={14} />
                    </div>
                    <div className="flex items-start justify-between">
                        <div className="w-[70%]">
                            <Skeleton width="80%" height={32} className="mb-3" />
                            <div className="flex items-center gap-2">
                                <Skeleton width={80} height={28} borderRadius={6} />
                                <Skeleton width={120} height={28} borderRadius={6} />
                            </div>
                        </div>
                        <Skeleton width={32} height={32} borderRadius={8} />
                    </div>
                    <div className="grid grid-cols-12 gap-5 lg:gap-11 justify-between items-start mt-11">
                        {/* Left stats */}
                        <div className="col-span-12 lg:col-span-3">
                            <div className="grid grid-cols-12 gap-4 mt-5 lg:mt-0 w-full lg:max-w-[367px]">
                                <div className="col-span-12 flex flex-col py-8 px-6 rounded-2xl items-start justify-center bg-[#FDEAD7] border border-[#B93815]">
                                    <Skeleton width={80} height={36} baseColor="#e8c4a0" highlightColor="#f0d0b0" />
                                    <Skeleton width={130} height={14} style={{ marginTop: 8 }} baseColor="#e8c4a0" highlightColor="#f0d0b0" />
                                </div>
                                <div className="col-span-12 flex flex-col py-8 px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <Skeleton width={40} height={36} />
                                    <Skeleton width={80} height={14} style={{ marginTop: 8 }} />
                                </div>
                                <div className="col-span-12 flex flex-col py-8 px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <Skeleton width={40} height={36} />
                                    <Skeleton width={180} height={14} style={{ marginTop: 8 }} />
                                </div>
                                <div className="col-span-12 flex flex-col py-8 px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <Skeleton width={60} height={36} />
                                    <Skeleton width={100} height={14} style={{ marginTop: 8 }} />
                                </div>
                            </div>
                        </div>
                        {/* Right chart */}
                        <div className="col-span-12 lg:col-span-9">
                            <Skeleton width="100%" height={350} borderRadius={12} />
                        </div>
                    </div>
                </div>
                </SkeletonTheme>
            </Layout>
        );
    }

    const pct = question.aggregateProbability != null
        ? (question.aggregateProbability * 100).toFixed(1)
        : '--';

    const uniqueSources = [...new Set(question.peers.map(p => p.source))];

    const chartData = (question?.trendData ?? []).map(p => ({ month: p.date, value: p.value * 100 }));

    return (
        <Layout>
                {/* Breadcrumb */}
                <div className="p-6 lg:py-16 lg:px-12 border-dashed-spaced relative">
                    <div className="flex items-center gap-2 mb-5 lg:mb-11">
                        <Link to="/" className="text-sm text-utility-gray font-semibold">World</Link>
                        <img src="/images/angle-right.svg" alt="Arrow Right" />
                        <Link to="/?tab=questions" className="text-sm text-utility-gray font-semibold">Questions</Link>
                        <img src="/images/angle-right.svg" alt="Arrow Right" />
                        <span className="text-sm text-utility-gray font-semibold truncate max-w-xs">{addFuturePhrase(question.baseQuestion, phrase)}</span>
                    </div>

                    <div className="flex items-start justify-between">
                        <div className="w-[70%]">
                            <h1 className="text-text-primary font-semibold text-xl lg:text-3xl mb-3">{addFuturePhrase(question.baseQuestion, phrase)}</h1>
                        </div>
                        <ShareButton url={window.location.href} />
                    </div>

                    <div className="grid grid-cols-12 gap-5 lg:gap-11 justify-between items-start mt-5 lg:mt-11">
                        {/* Left — stats */}
                        <div className="col-span-12 lg:col-span-3">
                            <div className="grid grid-cols-12 gap-4 mt-5 lg:mt-0 w-full lg:max-w-[367px]">
                                <div
                                    className="col-span-6 lg:col-span-12 flex flex-col p-3 lg:py-8 lg:px-6 rounded-2xl items-start justify-center bg-[#FDEAD7] border border-[#B93815]"
                                >
                                    <h4 className="text-xl lg:text-3xl font-bold text-dark-primary">{pct}%</h4>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xs lg:text-base text-dark-primary font-medium">PMI Probability</p>
                                        <div className="relative group">
                                            <img src="/images/info-circle.svg" alt="Info Icon" className="cursor-pointer"/>
                                            <div className="hidden group-hover:block p-3 bg-white rounded-lg shadow-md min-w-80 w-full absolute left-8 top-0 text-start z-50">
                                                <h6 className="text-sm font-semibold text-text-primary">PMI Probability</h6>
                                                <p className="text-sm text-border-secondary mt-1">PMI Probability is a measurement of what all related prediction market exchanges and contracts believe the probability (%) of a single-factor PMI occurring will be, generally in the form of a question. A PMI Probability is calculated by aggregating and structuring related prediction market contracts, known as a PMI's Holdings, using Micah's proprietary software and algorithms.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div
                                    className="col-span-6 lg:col-span-12 flex flex-col p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                                            {question.sourceCount}
                                        </h4>
                                        <div className="flex items-center">
                                            {uniqueSources.map((source) => {
                                                const src = getPMIcon(source);
                                                if (!src) return null;
                                                return (
                                                    <img
                                                        key={source}
                                                        src={src}
                                                        className="-mx-0.5 lg:-mx-1 w-4 h-4 lg:w-7.5 lg:h-7.5 object-contain"
                                                        alt={source}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <p className="text-xs lg:text-base text-text-tertiary font-medium">Prediction Market Exchanges</p>
                                </div>
                                <div className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">{question.peerCount}</h4>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xs lg:text-base text-dark-primary font-medium">PMI Holdings</p>
                                        <div className="relative group">
                                            <img src="/images/info-circle.svg" alt="Info Icon" className="cursor-pointer"/>
                                            <div className="hidden group-hover:block p-3 bg-white rounded-lg shadow-md min-w-80 w-full absolute left-8 top-0 text-start z-50">
                                                <h6 className="text-sm font-semibold text-text-primary">PMI Holdings</h6>
                                                <p className="text-sm text-border-secondary mt-1">PMI Holdings are the component prediction market contracts that make up a PMI. A PMI's holdings are structured using Micah's proprietary software and algorithms to create a PMI Score for multi-factor indexes, and a PMI Probability (%) for single-factor indexes.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right — chart */}
                        <div className="col-span-12 lg:col-span-9 flex flex-col gap-6 items-start">
                            <PMICardChart type="question" data={chartData} />
                        </div>
                    </div>

                    <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -left-[7px] -bottom-2 z-10"/>
                    <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -right-[7px] -bottom-2 z-10"/>
                </div>

                {/* PMI Holdings table — peer contracts */}
                <div className="flex flex-col gap-6 p-6 lg:px-12 border-dashed-spaced relative">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2 lg:gap-0 justify-between">
                        <h3 className="text-xl font-semibold text-text-primary">PMI Holdings</h3>
                        <HoldingsControlsBar
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSortChange={(nextKey, nextDir) => {
                                setSortKey(nextKey);
                                setSortDir(nextDir);
                            }}
                            holdingsFilter={holdingsFilter}
                            onHoldingsFilterChange={setHoldingsFilter}
                            holdingsView={holdingsView}
                            onHoldingsViewChange={setHoldingsView}
                            includeRelationship={true}
                        />
                    </div>
                    {holdingsView === 'list' && (
                        <HoldingsListView
                            holdingsLoading={loading}
                            sortedContracts={sortedContracts}
                            holdingsFilter={holdingsFilter}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            highlightMatch={highlightMatch}
                            getPMIcon={getPMIcon}
                            showRelationship={false}
                        />
                    )}
                    {holdingsView === 'grid' && (
                        <HoldingsGridView
                            holdingsLoading={loading}
                            sortedContracts={sortedContracts}
                            holdingsFilter={holdingsFilter}
                            highlightMatch={highlightMatch}
                            getPMIcon={getPMIcon}
                        />
                    )}

                    <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -left-[7px] -bottom-2 z-10"/>
                    <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -right-[7px] -bottom-2 z-10"/>
                </div>
        </Layout>
    );
}

export default Question;
