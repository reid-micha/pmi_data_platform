import type { TabType } from '@micah/types';
import React from 'react';
import type { PmiIndexSortMode } from '../utils/pmiIndexSort';
import MagaAllSection from './MagaAllSection';
import MagaQuestionsSection from './MagaQuestionsSection';
import MagaStatesSection from './MagaStatesSection';

interface HomeTabContentProps {
    activeTab: TabType;
    pmiSortMode: PmiIndexSortMode;
    hourly: boolean;
}

function HomeTabContent({ activeTab, pmiSortMode, hourly }: HomeTabContentProps): React.ReactElement | null {
    if (activeTab === 'all') {
        return <MagaAllSection pmiSortMode={pmiSortMode} />;
    }
    if (activeTab === 'states') {
        return <MagaStatesSection pmiSortMode={pmiSortMode} />;
    }
    if (activeTab === 'governor' || activeTab === 'senate' || activeTab === 'house') {
        return <MagaQuestionsSection hourly={hourly} activeTab={activeTab} pmiSortMode={pmiSortMode} />;
    }
    return null;
}

export default React.memo(HomeTabContent);
