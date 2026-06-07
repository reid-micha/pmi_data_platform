import type { MagaViewType } from '@micah/api';
import type { WorldConflictIndexProps } from '@micah/types';
import React, { useState } from 'react';
import { useMagaIndexData } from '../hooks/useMagaIndexData';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import MAGAMap from './MAGA-map';
import BottomTabs from './BottomTabs';
import PMICardChart from "./PMI-score-chart";
import ShareButton from './shared/ShareButton';
import MagaIndexStats from './shared/MagaIndexStats';
import SmallStatesPanel from './shared/SmallStatesPanel';
// import { formatLastUpdated } from '@micah/shared';

export default function WorldConflictIndex({ countries: _countries, magaView, activeTab, onTabChange }: WorldConflictIndexProps): React.ReactElement {
    const [activeView, setActiveView] = useState<'map' | 'graph'>('map');
    const { world, loading, stateData } = useMagaIndexData(magaView as MagaViewType);

    const chartData = (world?.trendData ?? []).map(p => ({ month: p.date, value: p.value }));
    // const updated = formatLastUpdated(lastUpdatedAt);

    return (
        <div className="p-4 lg:py-16 lg:px-12 border-dashed-spaced relative">
            <div className="flex flex-row items-start gap-5 lg:gap-0 lg:items-start justify-between mb-0 lg:mb-11">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-text-primary font-semibold text-xl lg:text-5xl instrument">National MAGA Index</h1>
                        <div className="hidden lg:block">
                            <ShareButton url={window.location.href} />
                        </div>
                    </div>
                    <p className="text-sm lg:text-xl text-text-tertiary leading-5 lg:leading-7 font-normal w-full lg:w-[90%]">Micah aggregates contracts from multiple prediction market exchanges to structure and power the MAGA Index—a prediction market index (PMI) tracking sentiment and probabilities around political outcomes, policy direction, and narratives associated with the MAGA movement. As more data is incorporated, the index gains stronger predictive power.</p>
                </div>
            </div>

            <BottomTabs activeTab={activeTab} onTabChange={onTabChange} />

            <div className="flex items-start lg:items-center justify-between my-4 lg:my-11">
                <div className="flex flex-col gap-2">
                    <p className="leading-7 hidden lg:flex items-start text-[10px] text-[#717B80] lg:text-dark lg:text-lg gap-2">LIVE · {loading ? <Skeleton width={80} inline baseColor="#C3C3C3" highlightColor="#fff" /> : `${Object.keys(stateData).length} STATE${Object.keys(stateData).length !== 1 ? 'S' : ''}`} · UPDATED {world?.trendData?.length ? new Date(world.trendData[world.trendData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase() : 'N/A'}
                    </p>
                    <p className="leading-7 flex lg:hidden items-center text-[10px] text-[#717B80] lg:text-dark lg:text-lg gap-2">
                        <span className="pulsing-contracts w-2 h-2 bg-[#47CD89] rounded-full block"></span> LIVE · {loading ? <Skeleton width={80} inline baseColor="#C3C3C3" highlightColor="#fff" /> : `${Object.keys(stateData).length} STATE${Object.keys(stateData).length !== 1 ? 'S' : ''}`}
                    </p>
                    <p className="lg:hidden text-[#717B80] text-[10px] lg:text-lg">UPDATED {world?.trendData?.length ? new Date(world.trendData[world.trendData.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase() : 'N/A'}</p>
                </div>
                <div className="flex justify-between lg:justify-end lg:min-h-11 h-auto items-center lg:border lg:border-border-primary lg:shadow-xs rounded-full lg:rounded-md overflow-hidden w-auto p-0.5 lg:p-0 bg-[#EFF1F5] lg:bg-transparent">
                    <button
                        onClick={() => setActiveView('map')}
                        className={`text-xs lg:text-base py-1.5 px-3 lg:py-2.5 lg:px-4 lg:border-r lg:border-border-primary cursor-pointer font-semibold text-center lg:flex-auto rounded-full lg:rounded-none ${activeView === 'map' ? 'bg-white lg:bg-[#414969] text-dark lg:text-white' : 'text-bg-primary-alt'}`}
                    >
                        Map
                    </button>
                    <button
                        onClick={() => setActiveView('graph')}
                        className={`text-xs lg:text-base py-1.5 px-3 lg:py-2.5 lg:py-2.5 cursor-pointer px-4 font-semibold text-center lg:flex-auto rounded-full lg:rounded-none ${activeView === 'graph' ? 'bg-white lg:bg-[#414969] text-dark lg:text-white' : 'text-bg-primary-alt'}`}
                    >
                        14-Day Graph
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-5 lg:gap-11 justify-between items-stretch mt-0 lg:mt-11">
                <div className="col-span-12 lg:col-span-3">
                    <MagaIndexStats world={world} loading={loading} />
                </div>
                <div className="col-span-12 lg:col-span-9 flex flex-col gap-6 items-start mt-5 lg:mt-0 justify-between p-4 lg:p-0 bg-[#F9F9FB] lg:bg-transparent rounded-lg lg:rounded-none border border-[#EFF1F5] lg:border-none shadow-md lg:shadow-none">
                    {activeView === 'map' && (
                        <>
                            <div className="grid grid-cols-12 gap-4 w-full">
                                <div className="col-span-12 lg:col-span-9 relative animate-fadeIn w-full min-h-[250px] lg:min-h-[600px]">
                                    <MAGAMap stateData={stateData} activeTab={activeTab} />
                                </div>
                                <SmallStatesPanel stateData={stateData} activeTab={activeTab} />
                            </div>
                            <div className="flex flex-col gap-1 w-full">
                                <h6 className="text-sm text-black font-bold">PMI Heat Scale · 0 → 100</h6>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-black">Leaning Democrat</p>
                                    <p className="text-sm text-black">Leaning Republican</p>
                                </div>
                                <div className="rounded-full lg:rounded-none h-2.5 w-full bg-[linear-gradient(to_right,#1756B5,#3B7EE2,#C2C8E8,#E96777,#AD2D42)]"></div>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm text-black">0</p>
                                    <p className="text-sm text-black">25</p>
                                    <p className="text-sm text-black">50</p>
                                    <p className="text-sm text-black">75</p>
                                    <p className="text-sm text-black">100</p>
                                </div>
                            </div>
                        </>
                    )}
                    {activeView === 'graph' && (
                        <div className="w-full animate-fadeIn">
                            <PMICardChart type="world" data={chartData} loading={loading} />
                        </div>
                    )}
                </div>
            </div>

            <img src="/images/border-plus.svg" alt="Border Plus" className="hidden lg:block absolute -left-[7px] -bottom-2 z-10" />
            <img src="/images/border-plus.svg" alt="Border Plus" className="hidden lg:block absolute -right-[7px] -bottom-2 z-10" />
        </div>
    );
}
