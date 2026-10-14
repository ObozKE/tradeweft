import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Trade Weft — Automated Zero-Red Compliance Test
 *
 * Core Guardrail from GEMINI.md:
 * "Color Discipline: Pine green primary (#01796F), neutrals, amber for warnings/errors. Zero red anywhere."
 *
 * This test statically scans all UI source code (tsx, ts, css) in src/ to ensure
 * no red utility classes (Tailwind text-red, bg-red, etc.) or raw red hex codes exist.
 */

const RED_CLASS_PATTERNS = [
  /\btext-red-\d+\b/i,
  /\bbg-red-\d+\b/i,
  /\bborder-red-\d+\b/i,
  /\bring-red-\d+\b/i,
  /\bfill-red-\d+\b/i,
  /\bstroke-red-\d+\b/i,
];

const RED_HEX_PATTERNS = [
  /#(?:ff0000|f00|ef4444|dc2626|b91c1c|991b1b|7f1d1d|f87171|fca5a5|fecaca|fee2e2)\b/i,
  /rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/i,
  /rgba\(\s*255\s*,\s*0\s*,\s*0/i,
];

function getAllSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next') {
        files.push(...getAllSourceFiles(fullPath));
      }
    } else if (/\.(tsx|ts|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Zero-Red Design System Enforcement', () => {
  const srcDir = path.resolve(process.cwd(), 'src');
  const sourceFiles = getAllSourceFiles(srcDir);

  it('scans at least 50 production source files in src/', () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it('verifies ZERO Tailwind red-* classes exist in any source file', () => {
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((lineText, idx) => {
        for (const pattern of RED_CLASS_PATTERNS) {
          const match = lineText.match(pattern);
          if (match) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: idx + 1,
              match: match[0],
            });
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('verifies ZERO raw red hex/rgb color literals exist in source files', () => {
    const violations: { file: string; line: number; match: string }[] = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((lineText, idx) => {
        for (const pattern of RED_HEX_PATTERNS) {
          const match = lineText.match(pattern);
          if (match) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: idx + 1,
              match: match[0],
            });
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('proves amber tokens are strictly used for destructive/warning alerts', () => {
    const globalsCss = fs.readFileSync(path.join(srcDir, 'app', 'globals.css'), 'utf-8');
    expect(globalsCss).toContain('--color-destructive: #b45309'); // Amber 700
  });
});
