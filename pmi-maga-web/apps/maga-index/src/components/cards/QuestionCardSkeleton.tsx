import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const cardClass = "p-6 gap-5 lg:gap-10 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20 cursor-pointer relative";

export default function QuestionCardSkeleton(): React.ReactElement {
    return (
        <div className={`${cardClass} overflow-hidden`}>
            {/* Left: probability box + text — col-span-12 -> lg:col-span-9 */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 min-w-0">
                <div className="flex flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                    {/* Probability box — smaller on mobile, larger on desktop */}
                    <div className="max-w-16 w-full lg:min-w-[110px] h-16 lg:h-[117px] flex-shrink-0 flex flex-col items-center justify-center rounded-lg bg-[#F7B27A]/30 p-4 text-center gap-1">
                        <Skeleton width={40} height={24} baseColor="#e89a60" highlightColor="#f5c090" />
                        <Skeleton width={56} height={10} style={{ marginTop: 4 }} baseColor="#e89a60" highlightColor="#f5c090" />
                    </div>
                    {/* Title + badge + close date */}
                    <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex flex-col items-start gap-1 mb-3">
                            <Skeleton width={130} height={16} baseColor="#C3C3C3" highlightColor="#ffffff" className="block lg:hidden" />
                            <div className="flex items-center gap-1">
                                <Skeleton width={60} height={22} borderRadius={99} baseColor="#C3C3C3" highlightColor="#ffffff" />
                                <Skeleton width={60} height={22} borderRadius={99} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            {/* Right: share button + logo + contracts — col-span-3 */}
            <div className="col-span-12 lg:col-span-4 min-w-0">
                <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-between lg:justify-start gap-4">
                    {/* Share button skeleton */}
                    <Skeleton width={32} height={32} borderRadius={8} baseColor="#C3C3C3" highlightColor="#ffffff" />
                    {/* Exchange icons + contracts skeleton */}
                    <div className="flex flex-col lg:flex-row justify-between items-center">
                        <div className="flex flex-row">
                            <Skeleton width={28} height={28} circle style={{ marginRight: -4 }} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            <Skeleton width={28} height={28} circle style={{ marginRight: -4 }} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            <Skeleton width={28} height={28} circle style={{ marginRight: -4 }} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            <Skeleton width={28} height={28} circle style={{ marginRight: 8 }} baseColor="#C3C3C3" highlightColor="#ffffff" />
                        </div>
                        <Skeleton width={90} height={16} baseColor="#C3C3C3" highlightColor="#ffffff" />
                    </div>
                </div>
            </div>
        </div>
    );
}

