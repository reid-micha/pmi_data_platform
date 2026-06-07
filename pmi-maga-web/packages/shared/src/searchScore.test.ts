import { describe, expect, it } from 'vitest';
import { filterAndSortByQueryScore, maxScoreText, scoreText } from './searchScore';

describe('scoreText', () => {
  it('ranks exact match highest', () => {
    expect(scoreText('alabama', 'alabama')).toBe(3);
    expect(scoreText('alabama', 'ala')).toBe(2);
    expect(scoreText('north alabama', 'ala')).toBe(1);
    expect(scoreText('foo alabama bar', 'bama')).toBe(0);
    expect(scoreText('texas', 'ala')).toBe(-1);
  });
});

describe('filterAndSortByQueryScore', () => {
  it('filters and sorts by score', () => {
    const items = ['Texas', 'Alabama', 'Alaska'];
    const result = filterAndSortByQueryScore(items, (name) => scoreText(name, 'ala'));
    expect(result).toEqual(['Alabama', 'Alaska']);
  });
});

describe('maxScoreText', () => {
  it('returns best score across fields', () => {
    expect(maxScoreText(['texas', 'CA'], 'ca')).toBe(3);
  });
});
