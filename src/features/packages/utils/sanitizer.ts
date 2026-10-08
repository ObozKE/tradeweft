/**
 * Trade Weft User Text Sanitization Pipeline
 * Single point of entry for plain-text content sanitization.
 * Enforces Unicode NFC, strips dangerous control/bidi-override/zero-width chars,
 * and collapses excessive newlines.
 * 
 * Extension Point: Future automated moderation (profanity, off-platform contact detection)
 * will plug directly into this pipeline.
 */

// Characters to remove:
// \u0000-\u0008, \u000B, \u000C, \u000E-\u001F (ASCII control characters except \t and \n)
// \u007F-\u009F (C1 control characters)
// \u200B-\u200D (Zero-width space, non-joiner, joiner)
// \uFEFF (Zero-width no-break space / BOM)
// \u202A-\u202E, \u2066-\u2069 (Bidi override and directional formatting characters)
const STRIP_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g;

export interface SanitizeOptions {
  /** Maximum number of consecutive newlines allowed (default 2) */
  maxConsecutiveNewlines?: number;
  /** Whether to strip all newlines into single spaces (for single-line titles/summaries) */
  singleLine?: boolean;
}

export function sanitizeUserText(input: string | null | undefined, options: SanitizeOptions = {}): string {
  if (input === null || input === undefined) {
    return '';
  }

  // 1. Unicode NFC Normalization
  let text = input.normalize('NFC');

  // 2. Strip non-printable, zero-width, and bidi override characters
  text = text.replace(STRIP_REGEX, '');

  if (options.singleLine) {
    // Replace all line breaks with a single space and collapse multiple spaces
    text = text.replace(/[\r\n\t]+/g, ' ').replace(/[ ]{2,}/g, ' ');
  } else {
    // Normalize CRLF to LF
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse excess consecutive newlines
    const maxNewlines = options.maxConsecutiveNewlines ?? 2;
    const newlineRegex = new RegExp(`\\n{${maxNewlines + 1},}`, 'g');
    text = text.replace(newlineRegex, '\n'.repeat(maxNewlines));

    // Collapse multiple horizontal spaces/tabs on a single line
    text = text.replace(/[ \t]{2,}/g, ' ');
  }

  return text.trim();
}
