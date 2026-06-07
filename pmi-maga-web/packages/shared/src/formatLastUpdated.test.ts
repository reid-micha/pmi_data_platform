import { describe, expect, it, vi } from 'vitest';
import { formatLastUpdated } from './formatLastUpdated';

describe('formatLastUpdated', () => {
  it('returns null for missing or invalid input', () => {
    expect(formatLastUpdated(null)).toBeNull();
    expect(formatLastUpdated(undefined)).toBeNull();
    expect(formatLastUpdated('not-a-date')).toBeNull();
  });

  it('formats date and time with en-US date and 2-digit time', () => {
    const spyDate = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('May 22, 2026');
    const spyTime = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('4:00 PM');

    const result = formatLastUpdated('2026-05-22T16:00:00Z');

    expect(result).toEqual({ date: 'May 22, 2026', time: '4:00 PM' });
    expect(spyDate).toHaveBeenCalledWith('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    expect(spyTime).toHaveBeenCalledWith([], { hour: '2-digit', minute: '2-digit' });

    spyDate.mockRestore();
    spyTime.mockRestore();
  });

  it('accepts Date instances', () => {
    const spyDate = vi.spyOn(Date.prototype, 'toLocaleDateString').mockReturnValue('May 22, 2026');
    const spyTime = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('4:00 PM');

    const result = formatLastUpdated(new Date('2026-05-22T16:00:00Z'));

    expect(result).toEqual({ date: 'May 22, 2026', time: '4:00 PM' });

    spyDate.mockRestore();
    spyTime.mockRestore();
  });
});
