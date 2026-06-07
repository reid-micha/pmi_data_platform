import React from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Link, useParams, useSearchParams, useLocation } from 'react-router-dom';
import HoldingsGridView from '../components/HoldingsGridView';
import HoldingsListView from '../components/HoldingsListView';
import Layout from '../components/Layout';
import PMICardChart from '../components/PMI-score-chart';
import HoldingsControlsBar from '../components/shared/HoldingsControlsBar';
import PmiInfoTooltip from '../components/shared/PmiInfoTooltip';
import { useMagaQuestionData } from '../hooks/useMagaQuestionData';
import { getPMIcon } from '../utils/getPMIcon';
import { getPmiColor } from '../utils/pmiColor';

function MagaQuestionDetail(): React.ReactElement | null {
    const { questionId } = useParams<{ questionId: string }>();
    const [searchParams] = useSearchParams();
    const location = useLocation();

    // Extract stateId from the previous location state or derive from questionId
    const stateIdFromParams = searchParams.get('stateId');

    // Try to get stateId from location state if available
    const stateFromLocation = (location.state as any)?.stateId;
    const stateId = stateIdFromParams || stateFromLocation;

    const { question, loading, notFound, holdingsLoading, trendData, holdingsControls } = useMagaQuestionData(questionId, stateId);

    const { sortKey, setSortKey, sortDir, setSortDir, holdingsFilter, setHoldingsFilter, holdingsView, setHoldingsView, handleSort, highlightMatch, sortedItems: sortedContracts } = holdingsControls;

    if (notFound) {
        return <Layout><div className="py-16 px-12 text-text-secondary">Question not found.</div></Layout>;
    }

    const chartData = (trendData ?? []).map(p => ({ month: p.date, value: p.value }));

    return (
        <Layout>
            <div className="p-6 lg:py-16 lg:px-12 border-dashed-spaced relative">
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 mb-5 lg:mb-11">
                    {loading ? (
                        <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
                            <Skeleton width={60} height={14} /><Skeleton width={8} height={14} /><Skeleton width={120} height={14} />
                        </SkeletonTheme>
                    ) : (
                        <>
                            <Link to="/"><img src="/images/home.svg" alt="Home" className="block lg:hidden w-4 h-auto"/></Link>
                            <Link to="/" className="hidden lg:block text-sm text-utility-gray font-semibold">MAGA Index</Link>
                            <img src="/images/angle-right.svg" alt="Arrow Right" />
                            <span className="text-sm text-utility-gray font-semibold truncate">{question?.baseQuestion}</span>
                        </>
                    )}
                </div>

                {/* Title */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-3">
                    <h1 className="text-text-primary instrument font-semibold text-xl lg:text-3xl">
                        {loading ? <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80"><Skeleton width="50%" height={32} /></SkeletonTheme> : `${question?.baseQuestion}`}
                    </h1>
                </div>

                <p className="text-sm lg:text-xl text-text-tertiary leading-5 lg:leading-7 font-normal w-full lg:w-[90%] mb-5 lg:mb-0">
                    {loading ? (
                        <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
                            <Skeleton width="90%" height={14} /><Skeleton width="70%" height={14} style={{ marginTop: 6 }} />
                        </SkeletonTheme>
                    ) : `An aggregated, data-driven estimate of market-implied probabilities across this political outcome, derived from active prediction market contracts and exchange signals.`}
                </p>

                <div className="grid grid-cols-12 gap-5 lg:gap-11 justify-between items-start mt-5 lg:mt-11">
                    {/* Left — stats */}
                    <div className="col-span-12 lg:col-span-3">
                        <div className="grid grid-cols-12 gap-4 mt-5 lg:mt-0 w-full lg:max-w-[367px]">
                            <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
                                <div className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl items-start justify-center" style={{ backgroundColor: getPmiColor(question?.pmiScore ?? null) }}>
                                    <h4 className="text-xl lg:text-3xl font-bold text-dark-primary" style={{ color: (question?.pmiScore ?? 0) <= 20 || (question?.pmiScore ?? 0) > 80 ? '#fff' : '#333' }}>
                                        {loading ? <Skeleton width={80} height={36} baseColor="#9DA1A3" highlightColor="#fff80" /> : (question?.pmiScore != null ? Number(question.pmiScore).toFixed(1) : 'N/A')}
                                    </h4>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xs lg:text-base text-dark-primary font-medium" style={{ color: (question?.pmiScore ?? 0) <= 20 || (question?.pmiScore ?? 0) > 80 ? '#fff' : '#333' }}>PMI Score</p>
                                        <PmiInfoTooltip type="pmiScore" />
                                    </div>
                                </div>
                                <div className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                                        {loading ? <Skeleton width={80} height={36} /> : (question?.activeContractsCount?.toLocaleString() ?? '—')}
                                    </h4>
                                    <p className="text-xs lg:text-base text-text-tertiary font-medium">Contracts</p>
                                </div>
                                <div className="col-span-6 lg:col-span-12 flex flex-col text-start lg:text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                                            {loading ? <Skeleton width={40} height={36} /> : (question?.sourceNames.length ?? '—')}
                                        </h4>
                                        {(question?.sourceNames ?? []).length > 0 && (
                                            <div className="flex items-center">
                                                {(question?.sourceNames ?? []).slice(0, 4).map((source: string) => {
                                                    const icon = getPMIcon(source);
                                                    if (!icon) return null;
                                                    return <img key={source} src={icon} className="-mx-0.5 lg:-mx-1 w-4 h-4 lg:w-7.5 lg:h-7.5 object-contain" alt={source} />;
                                                })}
                                                {(question?.sourceNames ?? []).length > 4 && (
                                                    <span className="rounded-full border border-border-primary w-4 h-4 lg:w-7.5 lg:h-7.5 text-[6px] lg:text-[10px] leading-3 flex items-center justify-center bg-bg-secondary">
                                                        +{(question?.sourceNames ?? []).length - 4}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-xs lg:text-base text-text-tertiary font-medium">Prediction Market Exchanges</p>
                                </div>
                                <div className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary">
                                    <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                                        {loading ? <Skeleton width={60} height={36} /> : (holdingsControls.sortedItems.length?.toLocaleString() ?? '—')}
                                    </h4>
                                    <div className="flex items-center gap-1">
                                        <p className="text-xs lg:text-base text-dark-primary font-medium">PMI Holdings</p>
                                        <PmiInfoTooltip type="pmiHoldings" />
                                    </div>
                                </div>
                            </SkeletonTheme>
                        </div>
                    </div>

                    {/* Right — chart */}
                    <div className="col-span-12 lg:col-span-9 flex flex-col gap-6 items-start">
                        {chartData.length > 0 ? (
                            <PMICardChart type="question" data={chartData} loading={false} pmiScore={question?.pmiScore ?? null} />
                        ) : (
                            <div className="relative w-full">
                                <img src="/images/line-bar-chart-placeholder.svg" alt="Line Chart" className="w-full"/>
                                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                    <img src="/images/chart-circles-bg.svg" className="w-full h-full object-cover" alt="Ripples"/>
                                    <div className="flex flex-col items-center absolute top-[57%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full">
                                        <div className="w-12 h-12 rounded-md bg-[#F9F9FB] border border-[#5D6B98] flex items-center justify-center">
                                            <img src="/images/line-chart-up-icon.svg" className="w-6 h-6 object-contain" alt="Line Chart Icon"/>
                                        </div>
                                        <h4 className="text-base font-semibold mt-4">No data available</h4>
                                        <p className="text-sm">Data will appear once activity is recorded.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -left-[7px] -bottom-2 z-10" />
                <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -right-[7px] -bottom-2 z-10" />
            </div>

            {/* PMI Holdings */}
            <div className="flex flex-col gap-6 p-6 lg:px-12 border-dashed-spaced relative">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2 lg:gap-0 justify-between">
                    <div className="flex items-center gap-4 flex-wrap">
                        <h3 className="text-xl font-semibold text-text-primary">PMI Holdings</h3>
                    </div>
                    <HoldingsControlsBar
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSortChange={(nextKey, nextDir) => { setSortKey(nextKey); setSortDir(nextDir); }}
                        holdingsFilter={holdingsFilter}
                        onHoldingsFilterChange={setHoldingsFilter}
                        holdingsView={holdingsView}
                        onHoldingsViewChange={setHoldingsView}
                        includeRelationship={true}
                    />
                </div>
                {holdingsView === 'list' && (
                    <HoldingsListView holdingsLoading={holdingsLoading} sortedContracts={sortedContracts} holdingsFilter={holdingsFilter} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} highlightMatch={highlightMatch} getPMIcon={getPMIcon} showRelationship={true} />
                )}
                {holdingsView === 'grid' && (
                    <HoldingsGridView holdingsLoading={holdingsLoading} sortedContracts={sortedContracts} holdingsFilter={holdingsFilter} highlightMatch={highlightMatch} getPMIcon={getPMIcon} />
                )}
                <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -left-[7px] -bottom-2 z-10" />
                <img src="/images/border-plus.svg" alt="Border Plus" className="absolute -right-[7px] -bottom-2 z-10" />
            </div>
        </Layout>
    );
}

export default MagaQuestionDetail;



