/**
 * Generates an ASCII-safe URL slug from a package title.
 * Removes special characters, collapses hyphens, and truncates.
 */
export function generatePackageSlug(title: string): string {
  if (!title) return 'service';

  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except whitespace and hyphens
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 60) // Limit length
    .replace(/^-+|-+$/g, '') || 'service';
}
