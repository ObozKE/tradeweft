import { describe, it, expect } from 'vitest';
import {
  CANONICAL_CATEGORIES,
  FALLBACK_CATEGORIES,
  getFallbackCategories,
} from './categories.constants';

describe('Category Taxonomy Constants', () => {
  it('contains all 14 top-level disciplines', () => {
    const roots = CANONICAL_CATEGORIES.filter((c) => c.parentId === null);
    expect(roots).toHaveLength(14);
  });

  it('contains subcategories correctly linked to parents', () => {
    const children = CANONICAL_CATEGORIES.filter((c) => c.parentId !== null);
    expect(children.length).toBeGreaterThanOrEqual(23);

    const rootIds = new Set(CANONICAL_CATEGORIES.filter((c) => !c.parentId).map((c) => c.id));
    for (const child of children) {
      expect(rootIds.has(child.parentId!)).toBe(true);
    }
  });

  it('provides bilingual translations for English and Swahili', () => {
    const enCats = getFallbackCategories('en');
    const swCats = getFallbackCategories('sw');

    expect(enCats).toHaveLength(CANONICAL_CATEGORIES.length);
    expect(swCats).toHaveLength(CANONICAL_CATEGORIES.length);

    const webEn = enCats.find((c) => c.slug === 'web-software');
    const webSw = swCats.find((c) => c.slug === 'web-software');

    expect(webEn?.name).toBe('Web & Software');
    expect(webSw?.name).toBe('Tovuti na Programu');
  });

  it('orders categories hierarchically with children immediately following parents', () => {
    const enCats = getFallbackCategories('en');
    const rootIndex = enCats.findIndex((c) => c.slug === 'web-software');
    const frontendIndex = enCats.findIndex((c) => c.slug === 'frontend-dev');

    expect(rootIndex).toBe(0);
    expect(frontendIndex).toBe(1);
  });
});
