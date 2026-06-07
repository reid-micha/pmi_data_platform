import React from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const cardClass = "relative gap-4 lg:gap-10 p-6 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20";

export default function CountryCardSkeleton(): React.ReactElement {
    return (
        <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
            <div className={`${cardClass} overflow-hidden`}>
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 min-w-0">
                    <div className="flex flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                        {/* PMI Score box skeleton - responsive size */}
                        <div className="min-w-16 w-16 lg:min-w-[110px] lg:w-[110px] h-16 lg:h-[117px] flex-shrink-0 flex flex-col items-center justify-center rounded-lg bg-bg-secondary gap-2">
                            <Skeleton width={40} height={24} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            <Skeleton width={50} height={10} baseColor="#C3C3C3" highlightColor="#ffffff" />
                        </div>
                        <div className="flex flex-col min-w-0 w-full">
                            {/* Title + badge skeleton */}
                            <div className="flex flex-col items-start gap-1 mb-3">
                                <Skeleton width={200} height={22} className="hidden lg:block" baseColor="#C3C3C3" highlightColor="#ffffff" />
                                <Skeleton width={55} height={22} borderRadius={20} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            </div>
                            {/* Description lines skeleton */}
                            <div className="hidden lg:block">
                                <Skeleton width="90%" height={12} baseColor="#C3C3C3" highlightColor="#ffffff" />
                                <Skeleton width="75%" height={12} style={{ marginTop: 4 }} baseColor="#C3C3C3" highlightColor="#ffffff"/>
                                <Skeleton width="60%" height={12} style={{ marginTop: 4 }} baseColor="#C3C3C3" highlightColor="#ffffff" />
                            </div>
                        </div>
                    </div>
                </div>
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
                            <Skeleton width={90} height={16} />
                        </div>
                    </div>
                </div>
            </div>
        </SkeletonTheme>
    );
}

