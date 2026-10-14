import sharp from 'sharp';

const MAX_PIXELS = 36_000_000; // 6000 x 6000 px limit
const MAX_DIMENSION = 6000;

export interface ProcessedEvidence {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  mime: 'image/webp';
}

export interface ProcessedPackageMedia {
  fullBuffer: Buffer;
  thumbBuffer: Buffer;
  blurDataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Validates pixel dimensions and decompression bomb bounds.
 */
export async function validateImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const image = sharp(buffer, { limitInputPixels: MAX_PIXELS });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('CORRUPT_IMAGE: Could not read image dimensions');
  }

  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error(
      `DIMENSIONS_EXCEEDED: Image exceeds maximum allowed dimensions of ${MAX_DIMENSION}x${MAX_DIMENSION}px`
    );
  }

  return { width: metadata.width, height: metadata.height };
}

/**
 * Processes screenshot evidence for verification: strips EXIF GPS, re-encodes to WebP.
 */
export async function processEvidenceImage(buffer: Buffer): Promise<ProcessedEvidence> {
  const { width, height } = await validateImageDimensions(buffer);

  // Strip EXIF metadata, auto-orient, cap width at 2048px, re-encode as WebP
  const processed = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 2048, withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: processed.data,
    width: processed.info.width,
    height: processed.info.height,
    bytes: processed.data.length,
    mime: 'image/webp',
  };
}

/**
 * Processes package cover/gallery images: strips EXIF, generates WebP full/thumb variants and blur placeholder.
 */
export async function processPackageImage(buffer: Buffer): Promise<ProcessedPackageMedia> {
  const { width: originalWidth, height: originalHeight } = await validateImageDimensions(buffer);

  // 1. Full variant (max 1600px width)
  const full = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 85, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  // 2. Thumb variant (max 400px width)
  const thumb = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  // 3. Blur placeholder (16px width)
  const blur = await sharp(buffer, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 16, withoutEnlargement: true })
    .webp({ quality: 20 })
    .toBuffer();

  const blurDataUrl = `data:image/webp;base64,${blur.toString('base64')}`;

  return {
    fullBuffer: full.data,
    thumbBuffer: thumb,
    blurDataUrl,
    width: full.info.width || originalWidth,
    height: full.info.height || originalHeight,
    bytes: full.data.length,
  };
}
