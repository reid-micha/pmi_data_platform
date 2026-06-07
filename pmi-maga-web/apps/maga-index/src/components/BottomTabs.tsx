import React from "react";
import type { TabType } from '@micah/types';

interface BottomTabsProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    rightSlot?: React.ReactNode;
}
interface Tab {
    value: TabType;
    label: string;
}
const tabs: Tab[] = [
    { value: 'all', label: 'All' },
    { value: 'states', label: 'By States' },
    { value: 'governor', label: 'By Governor' },
    { value: 'senate', label: 'By Senate' },
    { value: 'house', label: 'By House' },
];
function BottomTabs({ activeTab, onTabChange, rightSlot }: BottomTabsProps): React.ReactElement {    return (
    <div className="flex items-center justify-between w-full overflow-x-auto lg:overflow-visible scrollbar-hide mt-4 lg:mt-0">
        <div className="lg:border lg:border-border-primary lg:rounded-lg lg:inline-flex flex items-center lg:gap-0 gap-2 items-center min-w-max overflow-hidden">
            {tabs.map((tab, index) => (
                <button
                    key={tab.value}
                    onClick={() => onTabChange(tab.value)}
                    className={`whitespace-nowrap leading-3 lg:leading-5 text-xs lg:text-sm py-2 px-4 border border-gray-400 lg:border-0 lg:py-2.5 lg:px-4 font-normal lg:font-semibold cursor-pointer transition-colors rounded-full lg:rounded-none
                        ${index !== tabs.length - 1 ? 'lg:border-r lg:border-border-primary' : ''}
                        ${
                        activeTab === tab.value
                            ? 'bg-[#40637A] lg:bg-[#414969] border-[#40637A] text-white'
                            : 'bg-transparent text-dark-primary hover:bg-[#414969] hover:text-white'
                    }
                `}
                >
                    {tab.label}
                </button>
            ))}
        </div>
        {rightSlot && (
            <div className="flex flex-row flex-nowrap items-center gap-2 w-full min-w-0 lg:w-auto lg:justify-end">
                {rightSlot}
            </div>
        )}
    </div>
)
}

export default BottomTabs
