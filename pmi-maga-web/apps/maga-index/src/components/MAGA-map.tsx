import type { MagaState, TabType } from '@micah/types';
import { geoCentroid } from 'd3-geo';
import React, { useRef, useState } from "react";
import { useNavigate } from 'react-router-dom';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { getPmiColor } from '../utils/pmiColor';
import { statePagePathForTab } from '../utils/stateRouteId';

const geoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const STATE_ABBR: Record<string, string> = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

const SMALL_STATES = new Set([
    "Connecticut", "Delaware", "District of Columbia", "Maryland",
    "Massachusetts", "New Hampshire", "New Jersey", "Rhode Island", "Vermont",
]);

const LABEL_OFFSETS: Record<string, [number, number]> = {
    "Florida": [1, 0],
    "Louisiana": [-1, 0.5],
};

/** Fixed label colors for states where PMI-based contrast is unreliable (e.g. small inset). */
const LABEL_COLORS: Record<string, string> = {
    "Hawaii": "#333",
};

interface TooltipState {
    name: string;
    x: number;
    y: number;
    pmiScore: number;
}

interface MAGAMapProps {
    stateData: Record<string, MagaState>;
    activeTab: TabType;
}

const MAGAMap = ({ stateData, activeTab }: MAGAMapProps) => {
    const navigate = useNavigate();
    const [hovered, setHovered] = useState<string | null>(null);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);


    const handleMouseEnter = (geoName: string, e: React.MouseEvent) => {
        const state = stateData[geoName.toLowerCase()];
        if (!state) return; // no tooltip for unavailable states
        setHovered(geoName.toLowerCase());
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            setTooltip({
                name: geoName,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                pmiScore: state.pmiScore ?? 0,
            });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!tooltip) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
        }
    };

    const handleMouseLeave = () => {
        setHovered(null);
        setTooltip(null);
    };

    return (
        <div ref={containerRef} className="relative w-full" onMouseMove={handleMouseMove}>
            <ComposableMap projection="geoAlbersUsa" width={800} height={500} style={{ width: "100%", height: "auto", objectFit: "contain" }}>
                {/* SVG pattern for disabled (no-data) states with diagonal gray lines */}
                <defs>
                    <pattern id="diag-hatch-disabled" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                        <rect width="8" height="8" fill="#E5E7EB" />
                        <path d="M0 0 L0 8" stroke="#9CA3AF" strokeWidth="1" />
                    </pattern>
                </defs>

                <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                        geographies.map((geo) => {
                            const geoName: string = geo.properties.name;
                            const state = stateData[geoName.toLowerCase()];
                            const hasData = !!state && state.pmiScore != null;
                            const fillColor = hasData ? getPmiColor(state.pmiScore) : 'url(#diag-hatch-disabled)';
                            const isActive = hovered === geoName.toLowerCase();
                            return (
                                <Geography
                                    key={geo.rsmKey}
                                    geography={geo}
                                    onMouseEnter={(e) => handleMouseEnter(geoName, e)}
                                    onMouseLeave={handleMouseLeave}
                                    onClick={() => state && navigate(statePagePathForTab(geoName, state, activeTab))}
                                    stroke="#FFFFFF"
                                    strokeWidth={1}
                                    style={{
                                        default: { fill: isActive ? "#111827" : fillColor, outline: "none", cursor: hasData ? "pointer" : "default" },
                                        hover: { fill: hasData ? fillColor : 'url(#diag-hatch-disabled)', outline: "none", cursor: hasData ? "pointer" : "default" },
                                        pressed: { fill: fillColor, outline: "none", cursor: hasData ? "pointer" : "default" }
                                    }}
                                />
                            );
                        })
                    }
                </Geographies>
                <Geographies geography={geoUrl}>
                    {({ geographies }) =>
                        geographies.map((geo) => {
                            const geoName: string = geo.properties.name;
                            const abbr = STATE_ABBR[geoName];
                            if (!abbr || SMALL_STATES.has(geoName)) return null;
                            const centroid = geoCentroid(geo);
                            const offset = LABEL_OFFSETS[geoName];
                            const coords: [number, number] = offset
                                ? [centroid[0] + offset[0], centroid[1] + offset[1]]
                                : centroid as [number, number];
                            const state = stateData[geoName.toLowerCase()];
                            const score = state?.pmiScore ?? null;
                            const isDark = score !== null && (score <= 20 || score > 80);
                            const labelColor = LABEL_COLORS[geoName] ?? (isDark ? "#fff" : "#333");
                            return (
                                <Marker key={`label-${geo.rsmKey}`} coordinates={coords}>
                                    <text
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        style={{ fontSize: 9, fontWeight: 600, fill: labelColor, pointerEvents: "none", userSelect: "none" }}
                                    >
                                        {abbr}
                                    </text>
                                </Marker>
                            );
                        })
                    }
                </Geographies>
            </ComposableMap>

            {tooltip && (
                <div
                    className="absolute z-10 pointer-events-none"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: 'translate(-50%, calc(-100% - 12px))',
                    }}
                >
                    <div className="animate-tooltip-pop shadow-lg py-3 px-4 bg-bg-dark-primary rounded-lg border border-black/10 flex flex-col gap-2 items-center justify-center max-w-35 w-full text-center">
                        <h2
                            className="font-semibold text-gray-900 w-16 h-10 rounded-lg flex items-center justify-center text-lg"
                            style={{ backgroundColor: getPmiColor(tooltip.pmiScore), color: (tooltip.pmiScore <= 20 || tooltip.pmiScore > 80) ? "#fff" : "#333" }}
                        >
                            {tooltip.pmiScore.toFixed(1)}
                        </h2>
                        <h4 className="text-sm text-text-primary font-semibold">{tooltip.name} MAGA Index</h4>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MAGAMap;

