import React from 'react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const cardClass = "p-6 gap-4 lg:gap-10 col-span-12 grid grid-cols-12 rounded-md bg-bg-dark-primary border border-border-tertiary transition-all duration-300 hover:bg-gradient-to-r hover:from-[#F2F7F9]/20 hover:to-[#97B9C9]/20 relative";

export default function RegionCardSkeleton(): React.ReactElement {
    return (
        <SkeletonTheme baseColor="#C3C3C3" highlightColor="#fff80">
            <div className={`${cardClass} overflow-hidden`}>
                <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 min-w-0">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-5 lg:gap-10 relative">
                        {/* PMI Score box skeleton - responsive size */}
                        <div className="min-w-16 w-16 lg:min-w-[110px] lg:w-[110px] h-16 lg:h-[117px] flex-shrink-0 flex flex-col items-center justify-center rounded-lg relative z-50 bg-bg-secondary gap-2">
                            <Skeleton width={40} height={24} />
                            <Skeleton width={50} height={10} />
                        </div>
                        <div className="flex flex-col min-w-0 w-full">
                            {/* Title + badge skeleton */}
                            <div className="flex items-center gap-4 mb-3">
                                <Skeleton width={130} height={16} className="block lg:hidden" />
                                <Skeleton width={200} height={22} className="hidden lg:block" />
                                <Skeleton width={55} height={22} borderRadius={20} />
                            </div>
                            {/* Description lines skeleton */}
                            <Skeleton width="90%" height={12} />
                            <Skeleton width="75%" height={12} style={{ marginTop: 4 }} />
                            <Skeleton width="60%" height={12} style={{ marginTop: 4 }} className="hidden lg:block" />
                        </div>
                    </div>
                </div>
                <div className="col-span-12 lg:col-span-4 min-w-0">
                    <div className="flex flex-row-reverse lg:flex-col items-center lg:items-end h-full justify-start gap-4">
                        {/* Share button skeleton */}
                        <Skeleton width={32} height={32} borderRadius={8} />
                        {/* Exchange icons + contracts skeleton */}
                        <div className="flex items-center">
                            <Skeleton width={28} height={28} circle style={{ marginRight: -4 }} />
                            <Skeleton width={28} height={28} circle style={{ marginRight: -4 }} />
                            <Skeleton width={28} height={28} circle style={{ marginRight: -4 }} />
                            <Skeleton width={28} height={28} circle style={{ marginRight: 8 }} />
                            <Skeleton width={90} height={16} />
                        </div>
                    </div>
                </div>
            </div>
        </SkeletonTheme>
    );
}

