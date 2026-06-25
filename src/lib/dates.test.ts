import { describe, it, expect } from 'vitest';
import { parsePubDateMs, toMonthKey, toDayKey } from './dates';

describe('parsePubDateMs', () => {
  it('returns 0 for undefined', () => {
    expect(parsePubDateMs(undefined)).toBe(0);
  });
  it('returns 0 for null', () => {
    expect(parsePubDateMs(null)).toBe(0);
  });
  it('returns 0 for empty string', () => {
    expect(parsePubDateMs('')).toBe(0);
  });
  it('returns 0 for invalid date string', () => {
    expect(parsePubDateMs('not-a-date')).toBe(0);
  });
  it('returns ms for valid RFC822 date', () => {
    expect(parsePubDateMs('Wed, 02 Oct 2024 13:00:00 GMT')).toBe(new Date('Wed, 02 Oct 2024 13:00:00 GMT').getTime());
  });
  it('returns ms for ISO date', () => {
    expect(parsePubDateMs('2024-10-02T13:00:00Z')).toBe(new Date('2024-10-02T13:00:00Z').getTime());
  });
});

describe('toMonthKey', () => {
  it('zero-pads single-digit month', () => {
    expect(toMonthKey(new Date('2024-01-15T00:00:00').getTime())).toBe('2024-01');
  });
  it('does not pad two-digit month', () => {
    expect(toMonthKey(new Date('2024-10-15T00:00:00').getTime())).toBe('2024-10');
  });
  it('handles December', () => {
    expect(toMonthKey(new Date('2024-12-15T00:00:00').getTime())).toBe('2024-12');
  });
});

describe('toDayKey', () => {
  it('produces a local date key', () => {
    const ms = new Date('2024-10-02T00:00:00').getTime();
    expect(toDayKey(ms)).toMatch(/^\d+-\d+-\d+$/);
  });
});
