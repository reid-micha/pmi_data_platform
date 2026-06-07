const DEFAULT_ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateToLocalTimestamp(input: string): number {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
    if (dateOnlyMatch) {
        const [, y, m, d] = dateOnlyMatch;
        return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
    }
    return new Date(input).getTime();
}

export interface PmiChartDataPoint {
    month: string;
    value: number;
}

export interface GetLast14DayWindowOptions {
    nowMs?: number;
    oneDayMs?: number;
    /**
     * Controls the upper bound of the data filter.
     * - `'xAxisEnd'` (default): filters data up to the start-of-day of the latest data point.
     * - `'latestTs'`: filters data up to the exact timestamp of the latest data point,
     *    preserving intra-day entries.
     */
    filterEnd?: 'xAxisEnd' | 'latestTs';
}

export function getLast14DayWindow(
    sourceData: PmiChartDataPoint[],
    options?: GetLast14DayWindowOptions,
): {
    chartData: Array<PmiChartDataPoint & { ts: number }>;
    xAxisStart: number;
    xAxisEnd: number;
} {
    const oneDayMs = options?.oneDayMs ?? DEFAULT_ONE_DAY_MS;
    const filterEnd = options?.filterEnd ?? 'xAxisEnd';

    let nextChartData = sourceData.map(d => ({ ...d, ts: parseDateToLocalTimestamp(d.month) }));

    const latestTs = nextChartData.length
        ? Math.max(...nextChartData.map(d => d.ts))
        : (options?.nowMs ?? Date.now());

    const latestDate = new Date(latestTs);
    const latestDayStartTs = Date.UTC(
        latestDate.getUTCFullYear(),
        latestDate.getUTCMonth(),
        latestDate.getUTCDate(),
    );

    const xAxisStart = latestDayStartTs - 13 * oneDayMs;
    const xAxisEnd = latestDayStartTs;

    const upperBound = filterEnd === 'latestTs' ? latestTs : xAxisEnd;
    nextChartData = nextChartData.filter(d => d.ts >= xAxisStart && d.ts <= upperBound);

    return { chartData: nextChartData, xAxisStart, xAxisEnd };
}
