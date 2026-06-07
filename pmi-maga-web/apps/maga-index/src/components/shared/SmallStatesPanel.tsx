import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MagaState, TabType } from '@micah/types';
import { SMALL_STATES_GROUPS, STATE_NAME_TO_ABBR } from '@/constants';
import { getPmiColor } from '@/utils/pmiColor';
import { statePagePathForTab } from '@/utils/stateRouteId';

interface SmallStatesPanelProps {
    stateData: Record<string, MagaState>;
    activeTab: TabType;
}

export default function SmallStatesPanel({ stateData, activeTab }: SmallStatesPanelProps): React.ReactElement {
    const panelRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ name: string; score: number; x: number; y: number } | null>(null);

    return (
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-4">
            {SMALL_STATES_GROUPS.map(group => (
                <div key={group.label}>
                    <p className="text-xs font-semibold text-[#717B80] lg:text-black mb-2 tracking-widest">NORTHEAST CORRIDOR</p>
                    <div ref={panelRef} className="relative flex flex-row flex-wrap lg:flex-nowrap lg:flex-col gap-1.5">
                        {group.states.map(abbr => {
                            const fullName = Object.entries(STATE_NAME_TO_ABBR).find(([, a]) => a === abbr)?.[0] ?? abbr;
                            const state = stateData[fullName.toLowerCase()];
                            const hasData = !!state && state.pmiScore != null;
                            const score = hasData ? (state.pmiScore as number) : null;
                            const bg = score !== null ? getPmiColor(score) : '#D1D5DB';
                            const isDark = score !== null && (score <= 20 || score > 80);
                            const textColor = isDark ? '#fff' : '#333';
                            return (
                                <Link
                                    key={abbr}
                                    to={statePagePathForTab(fullName, state, activeTab)}
                                    className="relative flex items-center justify-between py-1 px-4 lg:px-3 lg:py-4 rounded-md cursor-pointer no-underline"
                                    style={{ backgroundColor: bg }}
                                    onMouseEnter={(e) => {
                                        if (score === null) return;
                                        const rect = panelRef.current?.getBoundingClientRect();
                                        if (rect) setTooltip({ name: fullName, score, x: e.clientX - rect.left, y: e.clientY - rect.top });
                                    }}
                                    onMouseMove={(e) => {
                                        if (score === null) return;
                                        const rect = panelRef.current?.getBoundingClientRect();
                                        if (rect) setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
                                    }}
                                    onMouseLeave={() => setTooltip(null)}
                                >
                                    <span className="text-sm font-bold" style={{ color: textColor }}>{abbr}</span>
                                </Link>
                            );
                        })}
                        {tooltip && (
                            <div
                                className="absolute z-20 shadow-lg animate-popup py-3 px-4 bg-bg-dark-primary rounded-lg border border-black/10 flex flex-col gap-2 items-center justify-center w-36 text-center pointer-events-none"
                                style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, calc(-100% - 10px))' }}
                            >
                                <h2
                                    className="font-semibold w-16 h-10 rounded-lg flex items-center justify-center text-lg"
                                    style={{
                                        backgroundColor: getPmiColor(tooltip.score),
                                        color: tooltip.score <= 20 || tooltip.score > 80 ? '#fff' : '#000'
                                    }}
                                >
                                    {tooltip.score.toFixed(1)}
                                </h2>
                                <h4 className="text-sm text-text-primary font-semibold">{tooltip.name} MAGA Index</h4>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}


