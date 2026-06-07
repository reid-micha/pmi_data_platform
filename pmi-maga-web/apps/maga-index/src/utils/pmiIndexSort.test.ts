import { describe, expect, it } from 'vitest';
import { comparePmiIndexSort, sortByPmiIndex } from './pmiIndexSort';

type Item = { id: string; pmiScore?: number | null };

const item = (id: string, pmiScore?: number | null): Item => ({ id, pmiScore });

describe('comparePmiIndexSort', () => {
    describe('null handling', () => {
        it('treats two null scores as equal', () => {
            expect(comparePmiIndexSort(item('a'), item('b'), 'pmi-desc')).toBe(0);
        });

        it('sorts null scores after non-null scores', () => {
            expect(comparePmiIndexSort(item('a', null), item('b', 50), 'pmi-desc')).toBeGreaterThan(0);
            expect(comparePmiIndexSort(item('a', 50), item('b', null), 'pmi-desc')).toBeLessThan(0);
        });
    });

    describe('pmi-desc', () => {
        it('orders higher scores first', () => {
            expect(comparePmiIndexSort(item('a', 90), item('b', 30), 'pmi-desc')).toBeLessThan(0);
            expect(comparePmiIndexSort(item('a', 30), item('b', 90), 'pmi-desc')).toBeGreaterThan(0);
        });
    });

    describe('pmi-asc', () => {
        it('orders lower scores first', () => {
            expect(comparePmiIndexSort(item('a', 30), item('b', 90), 'pmi-asc')).toBeLessThan(0);
            expect(comparePmiIndexSort(item('a', 90), item('b', 30), 'pmi-asc')).toBeGreaterThan(0);
        });
    });

    describe('swing', () => {
        it('orders scores closer to 50 first', () => {
            expect(comparePmiIndexSort(item('a', 49), item('b', 90), 'swing')).toBeLessThan(0);
            expect(comparePmiIndexSort(item('a', 90), item('b', 49), 'swing')).toBeGreaterThan(0);
        });

        it('treats equal distance from 50 as equal', () => {
            expect(comparePmiIndexSort(item('a', 40), item('b', 60), 'swing')).toBe(0);
        });
    });
});

describe('sortByPmiIndex', () => {
    const items: Item[] = [
        item('high', 95),
        item('low', 10),
        item('swing', 49),
        item('null', null),
        item('mid', 70),
    ];

    it('pmi-desc: highest first, nulls last', () => {
        expect(sortByPmiIndex(items, 'pmi-desc').map((i) => i.id)).toEqual([
            'high',
            'mid',
            'swing',
            'low',
            'null',
        ]);
    });

    it('pmi-asc: lowest first, nulls last', () => {
        expect(sortByPmiIndex(items, 'pmi-asc').map((i) => i.id)).toEqual([
            'low',
            'swing',
            'mid',
            'high',
            'null',
        ]);
    });

    it('swing: closest to 50 first, nulls last', () => {
        expect(sortByPmiIndex(items, 'swing').map((i) => i.id)).toEqual([
            'swing',
            'mid',
            'low',
            'high',
            'null',
        ]);
    });

    it('does not mutate the original array', () => {
        const original = [item('a', 50), item('b', 30)];
        const copy = [...original];
        sortByPmiIndex(original, 'pmi-desc');
        expect(original).toEqual(copy);
    });
});
