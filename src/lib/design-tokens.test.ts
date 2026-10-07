import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Converts a hex color code to HSL coordinates
 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h = h * 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

describe('Design Tokens & Zero-Red Brand Discipline', () => {
  it('enforces that no CSS token in globals.css violates the zero-red rule', () => {
    const cssPath = path.resolve(__dirname, '../app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Extract all hex colors
    const hexMatches = cssContent.match(/#[0-9a-fA-F]{3,8}/g) || [];

    for (const hex of hexMatches) {
      const { h, s } = hexToHsl(hex);

      // Forbidden red hue range: 340° to 15° with saturation > 20%
      const isRedHue = (h >= 340 && h <= 360) || (h >= 0 && h <= 15);
      const isSaturated = s > 20;

      if (isRedHue && isSaturated) {
        throw new Error(
          `Forbidden red color token found in globals.css: ${hex} (Hue: ${h.toFixed(1)}°, Saturation: ${s.toFixed(1)}%). Rule: Zero red anywhere.`
        );
      }
    }

    expect(hexMatches.length).toBeGreaterThan(0);
  });

  it('verifies primary Pine Green is exactly #01796F', () => {
    const cssPath = path.resolve(__dirname, '../app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    expect(cssContent).toContain('#01796f');
  });

  it('verifies amber-700 (#b45309) is used for destructive/warning states', () => {
    const cssPath = path.resolve(__dirname, '../app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    expect(cssContent).toContain('#b45309');
  });
});
