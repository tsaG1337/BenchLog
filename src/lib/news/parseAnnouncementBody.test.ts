import { describe, it, expect } from 'vitest';
import { parseAnnouncementBody } from './parseAnnouncementBody';

describe('parseAnnouncementBody', () => {
  it('returns nothing for empty input', () => {
    expect(parseAnnouncementBody('')).toEqual([]);
    expect(parseAnnouncementBody(undefined)).toEqual([]);
    expect(parseAnnouncementBody(null)).toEqual([]);
  });

  it('splits a bold label off the front of a line', () => {
    expect(parseAnnouncementBody('Favorites - Access them from the sidebar.')).toEqual([
      { label: 'Favorites', text: 'Access them from the sidebar.' },
    ]);
  });

  it('accepts en and em dashes as separators', () => {
    expect(parseAnnouncementBody('Plans – Zoom works properly now.')[0].label).toBe('Plans');
    expect(parseAnnouncementBody('Plans — Zoom works properly now.')[0].label).toBe('Plans');
  });

  it('makes one bullet per line and drops blank lines', () => {
    const out = parseAnnouncementBody('First - one\n\n  \nSecond - two\n');
    expect(out).toHaveLength(2);
    expect(out.map(b => b.label)).toEqual(['First', 'Second']);
  });

  it('tolerates markdown-style bullet characters', () => {
    expect(parseAnnouncementBody('- Favorites - Access them.')).toEqual([
      { label: 'Favorites', text: 'Access them.' },
    ]);
    expect(parseAnnouncementBody('* Plain line')).toEqual([{ label: null, text: 'Plain line' }]);
  });

  it('keeps a line whole when there is no separator', () => {
    expect(parseAnnouncementBody('Just a sentence about the update.')).toEqual([
      { label: null, text: 'Just a sentence about the update.' },
    ]);
  });

  it('does not treat a mid-sentence dash as a label separator', () => {
    // The dash here is punctuation: the "label" would be a whole clause,
    // which is the case MAX_LABEL_LENGTH exists to catch.
    const line = 'We rewrote how plan sheets zoom - it should feel a lot better now.';
    expect(parseAnnouncementBody(line)).toEqual([{ label: null, text: line }]);
  });

  it('does not treat a dash after a completed sentence as a separator', () => {
    const line = 'Zoom is fixed. - and so is fit to page';
    expect(parseAnnouncementBody(line)).toEqual([{ label: null, text: line }]);
  });

  it('requires text on both sides of the separator', () => {
    expect(parseAnnouncementBody('Favorites - ')).toEqual([{ label: null, text: 'Favorites -' }]);
  });

  it('leaves hyphenated words alone (no surrounding spaces)', () => {
    expect(parseAnnouncementBody('Double-tap zoom is new')).toEqual([
      { label: null, text: 'Double-tap zoom is new' },
    ]);
  });
});
