/**
 * Trade Weft — Magic-Byte Sniffing & Anti-Polyglot Security
 * Strictly permits JPEG, PNG, and WebP raster images.
 * Definitively blocks SVG, XML, HTML, and script polyglots.
 */

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface SniffResult {
  valid: boolean;
  detectedMime?: AllowedImageMime;
  error?: string;
}

export function sniffMagicBytes(buffer: Buffer): SniffResult {
  if (!buffer || buffer.length < 12) {
    return { valid: false, error: 'File buffer too small to determine image format' };
  }

  // Check for SVG, XML, HTML, and script polyglot indicators in the first 1024 bytes
  const headerSample = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('ascii').toLowerCase();
  if (
    headerSample.includes('<svg') ||
    headerSample.includes('<?xml') ||
    headerSample.includes('<!doctype') ||
    headerSample.includes('<html') ||
    headerSample.includes('<script')
  ) {
    return { valid: false, error: 'Vector SVG, HTML, and XML documents are strictly prohibited' };
  }

  // 1. JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, detectedMime: 'image/jpeg' };
  }

  // 2. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, detectedMime: 'image/png' };
  }

  // 3. WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, detectedMime: 'image/webp' };
  }

  return { valid: false, error: 'Unsupported file format. Only JPEG, PNG, and WebP images are supported.' };
}
