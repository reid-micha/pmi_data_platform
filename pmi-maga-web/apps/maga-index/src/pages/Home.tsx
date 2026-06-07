import BottomTabs from "@/components/BottomTabs.tsx";
import PmiIndexSortSelect from "@/components/shared/PmiIndexSortSelect.tsx";
import type { MagaViewType } from '@micah/api';
import type { TabType, WorldMarker } from '@micah/types';
import React, { useRef, useState } from 'react';
import type { PmiIndexSortMode } from '../utils/pmiIndexSort';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HomeIndexSearchBar from '../components/HomeIndexSearchBar';
import HomeSearchResults from '../components/HomeSearchResults';
import HomeTabContent from '../components/HomeTabContent';
import Layout from '../components/Layout';
import WorldConflicts from '../components/WorldConflictIndex';
import { worldMarkers } from '../data/worldMarkers';
import { useHourlyParam, withHourlyParam } from '../utils/hourlyRouting';

const TAB_TO_MAGA_VIEW: Partial<Record<TabType, MagaViewType>> = {
    all: 'all',
    states: 'state',
    governor: 'governor',
    senate: 'senate',
    house: 'house',
};

function Home(): React.ReactElement {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = (searchParams.get('tab') as TabType) || 'all';
    const [activeMarker, setActiveMarker] = useState<WorldMarker | null>(null);
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
    const [pmiSortMode, setPmiSortMode] = useState<PmiIndexSortMode>('pmi-desc');
    const popupRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const hourly = useHourlyParam();

    const handleMarkerClick = (marker: WorldMarker) => {
        navigate(withHourlyParam(`/region/${marker.slug}`, hourly));
    };

    const handleTabChange = (tab: TabType) => {
        setActiveTab(tab);
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('q');
            return next;
        });
    };

    const magaView: MagaViewType = TAB_TO_MAGA_VIEW[activeTab] ?? 'state';
    const searchQuery = searchParams.get('q')?.trim() ?? '';
    const isSearching = searchQuery.length > 0;

    return (
        <Layout>
            <WorldConflicts
                markers={worldMarkers}
                activeMarker={activeMarker}
                setActiveMarker={setActiveMarker}
                popupRef={popupRef}
                onMarkerClick={handleMarkerClick}
                countries={[]}
                magaView={magaView}
                activeTab={activeTab}
                onTabChange={handleTabChange}
            />
            <div className="flex flex-col gap-0.5 lg:gap-3 p-6 lg:px-12 mt-0 lg:mt-6">
                <h3 className="text-lg lg:text-3xl text-text-primary leading-8 instrument">Prediction Market Indexes</h3>
                <p className="text-sm lg:text-lg leading-5 lg:leading-7 text-text-tertiary w-full lg:w-[90%]">PMIs aggregate & structure related prediction market contracts into one index. PMIs are powered by more data, resulting in stronger predictive power. Micah PMIs' account for many variables, such as volume and relevancy.</p>
            </div>
            <div className="px-6 pt-0 pb-5 lg:px-12 lg:py-6">
                <BottomTabs
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    rightSlot={
                        <>
                            <PmiIndexSortSelect value={pmiSortMode} onChange={setPmiSortMode} />
                            <div className="flex-1 min-w-0">
                                <HomeIndexSearchBar key={activeTab} />
                            </div>
                        </>
                    }
                />
            </div>
            {isSearching ? (
                <HomeSearchResults
                    query={searchQuery}
                    scope={magaView}
                    pmiSortMode={pmiSortMode}
                />
            ) : (
                <HomeTabContent activeTab={activeTab} pmiSortMode={pmiSortMode} hourly={hourly} />
            )}
        </Layout>
    );
}

export default Home;
