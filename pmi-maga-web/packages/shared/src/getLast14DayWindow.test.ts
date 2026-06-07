import { describe, expect, it } from 'vitest';
import { getLast14DayWindow, parseDateToLocalTimestamp, type PmiChartDataPoint } from './getLast14DayWindow';

describe('parseDateToLocalTimestamp', () => {
    it('parses date-only string as local midnight', () => {
        const ts = parseDateToLocalTimestamp('2024-06-15');
        const d = new Date(ts);
        expect(d.getFullYear()).toBe(2024);
        expect(d.getMonth()).toBe(5);
        expect(d.getDate()).toBe(15);
        expect(d.getHours()).toBe(0);
    });

    it('parses ISO datetime string', () => {
        const ts = parseDateToLocalTimestamp('2024-06-15T10:30:00Z');
        expect(ts).toBe(new Date('2024-06-15T10:30:00Z').getTime());
    });
});

describe('getLast14DayWindow', () => {
    const oneDayMs = 24 * 60 * 60 * 1000;

    function makeData(dates: string[], value = 50): PmiChartDataPoint[] {
        return dates.map(d => ({ month: d, value }));
    }

    function dateStr(daysAgo: number, baseDate = '2024-06-15'): string {
        const base = new Date(baseDate);
        base.setDate(base.getDate() - daysAgo);
        const y = base.getFullYear();
        const m = String(base.getMonth() + 1).padStart(2, '0');
        const d = String(base.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    it('returns empty chartData for empty input', () => {
        const now = new Date(2024, 5, 15).getTime();
        const result = getLast14DayWindow([], { nowMs: now });
        expect(result.chartData).toHaveLength(0);
        expect(result.xAxisEnd - result.xAxisStart).toBe(13 * oneDayMs);
    });

    it('keeps data within 14-day window', () => {
        const dates = Array.from({ length: 20 }, (_, i) => dateStr(i));
        const data = makeData(dates);
        const result = getLast14DayWindow(data);
        expect(result.chartData.length).toBeLessThanOrEqual(14);
        for (const d of result.chartData) {
            expect(d.ts).toBeGreaterThanOrEqual(result.xAxisStart);
        }
    });

    it('excludes data older than 14 days', () => {
        const data = makeData([dateStr(0), dateStr(5), dateStr(15)]);
        const result = getLast14DayWindow(data);
        expect(result.chartData).toHaveLength(2);
    });

    it('filterEnd="xAxisEnd" excludes intra-day entries beyond start-of-day', () => {
        const data: PmiChartDataPoint[] = [
            { month: '2024-06-15T10:00:00', value: 50 },
            { month: '2024-06-14', value: 40 },
        ];
        const result = getLast14DayWindow(data, { filterEnd: 'xAxisEnd' });
        expect(result.chartData).toHaveLength(1);
        expect(result.chartData[0].value).toBe(40);
    });

    it('filterEnd="latestTs" preserves intra-day entries', () => {
        const data: PmiChartDataPoint[] = [
            { month: '2024-06-15T10:00:00', value: 50 },
            { month: '2024-06-14', value: 40 },
        ];
        const result = getLast14DayWindow(data, { filterEnd: 'latestTs' });
        expect(result.chartData).toHaveLength(2);
    });

    it('defaults filterEnd to xAxisEnd', () => {
        const data: PmiChartDataPoint[] = [
            { month: '2024-06-15T10:00:00', value: 50 },
            { month: '2024-06-14', value: 40 },
        ];
        const defaultResult = getLast14DayWindow(data);
        const explicitResult = getLast14DayWindow(data, { filterEnd: 'xAxisEnd' });
        expect(defaultResult.chartData.length).toBe(explicitResult.chartData.length);
    });

    it('xAxisEnd - xAxisStart equals 13 days', () => {
        const data = makeData([dateStr(0), dateStr(3)]);
        const result = getLast14DayWindow(data);
        expect(result.xAxisEnd - result.xAxisStart).toBe(13 * oneDayMs);
    });
});
