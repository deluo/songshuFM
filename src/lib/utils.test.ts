import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from './utils';

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('&quot;hi&quot;')).toBe('"hi"');
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>');
    expect(decodeHtmlEntities('it&apos;s')).toBe("it's");
  });
  it('decodes numeric decimal entities', () => {
    expect(decodeHtmlEntities('&#39;')).toBe("'");
    expect(decodeHtmlEntities('&#65;')).toBe('A');
  });
  it('decodes numeric hex entities', () => {
    expect(decodeHtmlEntities('&#x27;')).toBe("'");
    expect(decodeHtmlEntities('&#x41;')).toBe('A');
  });
  it('passes unknown entities through unchanged', () => {
    expect(decodeHtmlEntities('&unknownentity;')).toBe('&unknownentity;');
  });
  it('does not double-decode', () => {
    // &amp;quot; should become &quot; (the literal), NOT "
    expect(decodeHtmlEntities('&amp;quot;')).toBe('&quot;');
  });
  it('returns empty for null/undefined/empty', () => {
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities(undefined)).toBe('');
    expect(decodeHtmlEntities('')).toBe('');
  });
});
