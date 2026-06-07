import { describe, expect, it } from 'vitest';
import { computeYAxisDomain } from './computeYAxisDomain';

describe('computeYAxisDomain', () => {
    it('returns [0, 100] fallback for empty values', () => {
        const result = computeYAxisDomain([]);
        expect(result.domain).toEqual([0, 100]);
        expect(result.ticks.length).toBeGreaterThanOrEqual(2);
        expect(result.ticks[0]).toBe(0);
        expect(result.ticks[result.ticks.length - 1]).toBe(100);
    });

    it('zooms in for small spread (85–90)', () => {
        const result = computeYAxisDomain([85, 86, 87, 88, 89, 90]);
        expect(result.domain[0]).toBeGreaterThanOrEqual(75);
        expect(result.domain[1]).toBeLessThanOrEqual(100);
        expect(result.domain[1] - result.domain[0]).toBeLessThan(100);
    });

    it('uses wide range for large spread (10–90)', () => {
        const result = computeYAxisDomain([10, 30, 50, 70, 90]);
        expect(result.domain[0]).toBeLessThanOrEqual(5);
        expect(result.domain[1]).toBeGreaterThanOrEqual(95);
    });

    it('handles single value', () => {
        const result = computeYAxisDomain([50]);
        expect(result.domain[0]).toBeLessThan(50);
        expect(result.domain[1]).toBeGreaterThan(50);
        expect(result.domain[1] - result.domain[0]).toBeGreaterThanOrEqual(4);
    });

    it('clamps to [0, …] at low boundary', () => {
        const result = computeYAxisDomain([0, 1, 2, 3, 5]);
        expect(result.domain[0]).toBe(0);
        expect(result.domain[1]).toBeGreaterThanOrEqual(4);
    });

    it('clamps to […, 100] at high boundary', () => {
        const result = computeYAxisDomain([95, 96, 97, 98, 100]);
        expect(result.domain[1]).toBe(100);
        expect(result.domain[0]).toBeLessThanOrEqual(95);
    });

    it('enforces minimum range of 4', () => {
        const result = computeYAxisDomain([50, 50.5, 51]);
        expect(result.domain[1] - result.domain[0]).toBeGreaterThanOrEqual(4);
    });

    it('generates evenly spaced ticks', () => {
        const result = computeYAxisDomain([86, 87, 88, 89]);
        const steps = result.ticks.slice(1).map((t, i) => t - result.ticks[i]);
        const uniqueSteps = [...new Set(steps)];
        expect(uniqueSteps).toHaveLength(1);
        expect(result.ticks[0]).toBe(result.domain[0]);
        expect(result.ticks[result.ticks.length - 1]).toBe(result.domain[1]);
    });

    it('keeps reasonable tick count for wide range', () => {
        const result = computeYAxisDomain([]);
        expect(result.ticks.length).toBeLessThanOrEqual(8);
        expect(result.ticks.length).toBeGreaterThanOrEqual(3);
    });

    it('respects custom absoluteMin and absoluteMax', () => {
        const result = computeYAxisDomain([], { absoluteMin: 10, absoluteMax: 50 });
        expect(result.domain).toEqual([10, 50]);
    });

    it('domain values are aligned to step unit of 2', () => {
        const result = computeYAxisDomain([33, 37, 42]);
        expect(result.domain[0] % 2).toBe(0);
        expect(result.domain[1] % 2).toBe(0);
    });

    it('identical values still produce valid range', () => {
        const result = computeYAxisDomain([75, 75, 75]);
        expect(result.domain[0]).toBeLessThan(75);
        expect(result.domain[1]).toBeGreaterThan(75);
        expect(result.domain[1] - result.domain[0]).toBeGreaterThanOrEqual(4);
    });
});
