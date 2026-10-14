import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { sniffMagicBytes } from '../utils/magic-bytes';
import {
  processPackageImage,
  processEvidenceImage,
  validateImageDimensions,
} from '../utils/image-processor';

describe('Magic Bytes Sniffer', () => {
  it('detects valid JPEG headers', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const res = sniffMagicBytes(jpeg);
    expect(res.valid).toBe(true);
    expect(res.detectedMime).toBe('image/jpeg');
  });

  it('detects valid PNG headers', () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const res = sniffMagicBytes(png);
    expect(res.valid).toBe(true);
    expect(res.detectedMime).toBe('image/png');
  });

  it('detects valid WebP headers', () => {
    const webp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    const res = sniffMagicBytes(webp);
    expect(res.valid).toBe(true);
    expect(res.detectedMime).toBe('image/webp');
  });

  it('strictly rejects SVG documents', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
    const res = sniffMagicBytes(svg);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/prohibited/i);
  });

  it('strictly rejects XML and HTML polyglots', () => {
    const xml = Buffer.from('<?xml version="1.0"?><svg></svg>');
    expect(sniffMagicBytes(xml).valid).toBe(false);

    const html = Buffer.from('<!doctype html><html><script>alert(1)</script></html>');
    expect(sniffMagicBytes(html).valid).toBe(false);
  });

  it('rejects buffers smaller than 12 bytes', () => {
    const small = Buffer.from([0x01, 0x02]);
    expect(sniffMagicBytes(small).valid).toBe(false);
  });
});

describe('Sharp Image Processing Pipeline', () => {
  it('processes package images with WebP variants and blur placeholder', async () => {
    // Generate sample 200x200 PNG test image
    const samplePng = await sharp({
      create: {
        width: 200,
        height: 200,
        channels: 3,
        background: { r: 1, g: 121, b: 111 }, // Pine green
      },
    })
      .png()
      .toBuffer();

    const result = await processPackageImage(samplePng);
    expect(result.width).toBe(200);
    expect(result.height).toBe(200);
    expect(result.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(result.fullBuffer.length).toBeGreaterThan(0);
    expect(result.thumbBuffer.length).toBeGreaterThan(0);

    // Verify output is valid WebP
    const sniffFull = sniffMagicBytes(result.fullBuffer);
    expect(sniffFull.valid).toBe(true);
    expect(sniffFull.detectedMime).toBe('image/webp');
  });

  it('processes evidence images and re-encodes to WebP', async () => {
    const samplePng = await sharp({
      create: {
        width: 300,
        height: 200,
        channels: 3,
        background: { r: 180, g: 83, b: 9 }, // Deep amber
      },
    })
      .png()
      .toBuffer();

    const result = await processEvidenceImage(samplePng);
    expect(result.mime).toBe('image/webp');
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);

    const sniff = sniffMagicBytes(result.buffer);
    expect(sniff.valid).toBe(true);
    expect(sniff.detectedMime).toBe('image/webp');
  });

  it('validates image dimensions correctly', async () => {
    const sample = await sharp({
      create: {
        width: 150,
        height: 100,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toBuffer();

    const dims = await validateImageDimensions(sample);
    expect(dims.width).toBe(150);
    expect(dims.height).toBe(100);
  });
});
