import { describe, it, expect } from 'vitest';
import { sanitizeUserText } from './sanitizer';

describe('sanitizeUserText utility', () => {
  it('normalizes Unicode into NFC form', () => {
    // 'e\u0301' (e + combining acute accent) should normalize to 'é' (\u00E9)
    const decomposed = 'e\u0301cole';
    const sanitized = sanitizeUserText(decomposed);
    expect(sanitized).toBe('école');
    expect(sanitized.length).toBe(5);
  });

  it('strips zero-width characters and directional bidi overrides', () => {
    const inputWithZeroWidth = 'Safe\u200BText\u200CWith\uFEFFZeroWidth\u202EOverride';
    const sanitized = sanitizeUserText(inputWithZeroWidth);
    expect(sanitized).toBe('SafeTextWithZeroWidthOverride');
  });

  it('collapses excessive vertical newlines to at most 2 by default', () => {
    const inputWithManyNewlines = 'Paragraph 1\n\n\n\n\nParagraph 2';
    const sanitized = sanitizeUserText(inputWithManyNewlines);
    expect(sanitized).toBe('Paragraph 1\n\nParagraph 2');
  });

  it('collapses multiple horizontal spaces into a single space', () => {
    const inputWithSpaces = 'Nairobi    Web     Development   Services';
    const sanitized = sanitizeUserText(inputWithSpaces);
    expect(sanitized).toBe('Nairobi Web Development Services');
  });

  it('collapses all newlines to single line when singleLine option is true', () => {
    const input = 'Title with\nmultiple\r\nlines\tand tabs';
    const sanitized = sanitizeUserText(input, { singleLine: true });
    expect(sanitized).toBe('Title with multiple lines and tabs');
  });

  it('safely handles null and undefined inputs', () => {
    expect(sanitizeUserText(null)).toBe('');
    expect(sanitizeUserText(undefined)).toBe('');
  });
});
