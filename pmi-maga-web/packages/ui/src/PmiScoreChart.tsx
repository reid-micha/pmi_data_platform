import { computeYAxisDomain, getLast14DayWindow, type PmiChartDataPoint } from "@micah/shared";
import React from "react";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { renderPmiLineDot } from "./pmi-line-dot";

export type PmiChartType = "region" | "country" | "question" | "world";

const PMI_CHART_Y_AXIS_LABEL: Record<PmiChartType, string> = {
    question: "PMI Probability (%)",
    region: "PMI Score",
    country: "PMI Score",
    world: "PMI Score",
};

const DEFAULT_TOOLTIP_COLOR = "#F7B27A";
const DEFAULT_TOOLTIP_TEXT_COLOR = "#333";

export interface PmiScoreChartProps {
    data?: PmiChartDataPoint[];
    loading?: boolean;
    type: PmiChartType;
    pmiScore?: number | null;
    getTooltipColor?: (score: number | null) => string;
    getTooltipTextColor?: (score: number | null) => string;
    getDotColor?: () => string;
    filterEnd?: "xAxisEnd" | "latestTs";
}

export function PmiScoreChart({
    type,
    data = [],
    loading = false,
    pmiScore = null,
    getTooltipColor,
    getTooltipTextColor,
    getDotColor,
    filterEnd,
}: PmiScoreChartProps): React.ReactElement {
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (loading) {
        return (
            <div
                style={{ width: "100%", height: 350 }}
                className="flex flex-col justify-between px-2 pt-5 pb-14 overflow-hidden"
            >
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} width="100%" height={2} baseColor="#C3C3C3" highlightColor="#fff80" />
                ))}
                <div className="mt-5">
                    <Skeleton width="100%" height={3} baseColor="#C3C3C3" highlightColor="#fff80" borderRadius={4} />
                </div>
                <div className="flex justify-between mt-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <Skeleton key={i} width={40} height={12} baseColor="#C3C3C3" highlightColor="#fff80" />
                    ))}
                </div>
            </div>
        );
    }

    const { chartData, xAxisStart: xAxisStartTs, xAxisEnd: xAxisEndTs } = getLast14DayWindow(data, { filterEnd });

    const { domain: yDomain, ticks: yTicks } = computeYAxisDomain(chartData.map((d) => d.value));

    const CustomDot = (props: { cx?: number; cy?: number; index?: number }) =>
        renderPmiLineDot({ ...props }, chartData.length, getDotColor);

    const xAxisTicks = Array.from({ length: 7 }, (_, i) => xAxisStartTs + i * 2 * oneDayMs);

    const tooltipColor = getTooltipColor ? getTooltipColor(pmiScore) : DEFAULT_TOOLTIP_COLOR;
    const tooltipTextColor = getTooltipTextColor ? getTooltipTextColor(pmiScore) : DEFAULT_TOOLTIP_TEXT_COLOR;

    return (
        <div style={{ width: "100%", height: 500 }}>
            <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 50 }}>
                    <CartesianGrid stroke="#B9C0D4" vertical={false} />
                    <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={[xAxisStartTs, xAxisEndTs]}
                        stroke="#30374F"
                        tick={{ fill: "#30374F" }}
                        ticks={xAxisTicks}
                        label={{ value: "Date", position: "insideBottom", offset: -30, fill: "#30374F" }}
                        tickFormatter={(ts) => {
                            const date = new Date(ts);
                            const day = date.getDate();
                            const month = date.toLocaleString("default", { month: "short" });
                            return `${month} ${day}`;
                        }}
                    />
                    <Tooltip
                        content={
                            <ChartTooltip
                                tooltipColor={tooltipColor}
                                tooltipTextColor={tooltipTextColor}
                            />
                        }
                        cursor={false}
                    />
                    <YAxis
                        stroke="#30374F"
                        domain={yDomain}
                        ticks={yTicks}
                        tick={{ fill: "#30374F" }}
                        label={{
                            value: PMI_CHART_Y_AXIS_LABEL[type],
                            angle: -90,
                            offset: -30,
                            dx: -20,
                            fill: "#30374F",
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#6594AB"
                        strokeWidth={2}
                        dot={<CustomDot />}
                        animationDuration={250}
                        animationEasing="ease-in-out"
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export interface ChartTooltipProps {
    active?: boolean;
    payload?: Array<{ name: string; value: number }>;
    label?: string | number;
    tooltipColor?: string;
    tooltipTextColor?: string;
}

export const ChartTooltip = ({
    active,
    payload,
    label,
    tooltipColor = DEFAULT_TOOLTIP_COLOR,
    tooltipTextColor = DEFAULT_TOOLTIP_TEXT_COLOR,
}: ChartTooltipProps): React.ReactElement | null => {
    if (active && payload && payload.length) {
        const ts = typeof label === "number" ? label : Number(label);
        const date = new Date(ts);
        const formattedDate = date.toLocaleString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
        return (
            <div
                className="font-semibold text-dark-primary p-2 text-lg rounded-lg flex flex-col items-center justify-center"
                style={{ backgroundColor: tooltipColor, color: tooltipTextColor }}
            >
                {payload.map((entry) => (
                    <p key={entry.name}>{Number(entry.value).toFixed(1)}</p>
                ))}
                <p className="text-sm font-normal" style={{ color: tooltipTextColor }}>
                    {formattedDate}
                </p>
            </div>
        );
    }
    return null;
};
