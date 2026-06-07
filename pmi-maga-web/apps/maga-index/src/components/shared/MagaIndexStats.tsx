import React from 'react';
import type { MagaIndexData } from '@micah/types';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { getPmiColor } from '@/utils/pmiColor';
import PmiInfoTooltip from '@/components/shared/PmiInfoTooltip';

interface MagaIndexStatsProps {
    world: MagaIndexData | null;
    loading: boolean;
}

export default function MagaIndexStats({ world, loading }: MagaIndexStatsProps): React.ReactElement {
    return (
        <SkeletonTheme baseColor="#9DA1A3" highlightColor="#CFCFCF" duration={1.5} enableAnimation={true}>
            <div className="grid grid-cols-12 gap-2 lg:gap-4 mt-4 lg:mt-0 w-full lg:max-w-[367px]">
                {/* PMI Score */}
                <div
                    className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl items-start justify-center gap-4 lg:gap-0"
                    style={{ backgroundColor: getPmiColor(world?.pmiScore) }}>
                    <h4 className="text-xl lg:text-3xl font-bold text-dark-primary">
                        {loading ? <Skeleton width={60} height={36} baseColor="#FFFFFF80" highlightColor="#fff" /> : (world?.pmiScore != null ? Number(world.pmiScore).toFixed(1) : '—')}
                    </h4>
                    <div className="flex items-center gap-1">
                        <p className="text-xs lg:text-base text-dark-primary font-medium">PMI Score</p>
                        <PmiInfoTooltip type="pmiScore" />
                    </div>
                </div>
                {/* Live Contracts */}
                <div className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary gap-4 lg:gap-0">
                    <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                        {loading ? <Skeleton width={80} height={36} /> : (world?.activeContractsCount?.toLocaleString() ?? '—')}
                    </h4>
                    <div className="flex items-center gap-2">
                        <span className="pulsing-contracts w-2 h-2 bg-[#47CD89] rounded-full block"></span>
                        <p className="text-xs lg:text-base text-text-tertiary font-medium">Live Contracts</p>
                    </div>
                </div>
                {/* PMI Exchanges */}
                <div className="col-span-6 lg:col-span-12 flex flex-col text-start lg:text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary gap-1 lg:gap-0">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2">
                        <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                            {loading ? <Skeleton width={40} height={36} /> : (world?.sourceNames?.length ?? 0)}
                        </h4>
                        <div className="flex items-center">
                            {(world?.sourceNames ?? []).slice(0, 4).map((name) => (
                                <img
                                    key={name}
                                    src={`/images/PMMarkets/${name.toLowerCase()}.svg`}
                                    className="-mx-0.5 lg:-mx-1 w-4 h-4 lg:w-7.5 lg:h-7.5 object-contain"
                                    alt={name}
                                />
                            ))}
                            {(world?.sourceNames ?? []).length > 4 && (
                                <span className="rounded-full border border-border-primary w-4 h-4 lg:w-7.5 lg:h-7.5 text-[6px] lg:text-[10px] leading-3 flex items-center justify-center bg-bg-secondary">
                                    +{(world?.sourceNames?.length ?? 0) - 4}
                                </span>
                            )}
                        </div>
                    </div>
                    <p className="text-xs lg:text-base text-text-tertiary font-medium">
                        <span className="lg:hidden">Exchange</span>
                        <span className="hidden lg:inline">Prediction Market Exchanges</span>
                    </p>
                </div>
                {/* PMI Holdings */}
                <div className="col-span-6 lg:col-span-12 flex flex-col text-center p-3 lg:py-8 lg:px-6 rounded-2xl bg-bg-secondary items-start justify-center border border-border-tertiary gap-4 lg:gap-0">
                    <h4 className="text-xl lg:text-3xl font-bold text-text-secondary">
                        {loading ? <Skeleton width={60} height={36} /> : (world?.holdingsCount?.toLocaleString() ?? '—')}
                    </h4>
                    <div className="flex items-center gap-1">
                        <p className="text-xs lg:text-base text-dark-primary font-medium">PMI Holdings</p>
                        <PmiInfoTooltip type="pmiHoldings" />
                    </div>
                </div>
            </div>
        </SkeletonTheme>
    );
}


