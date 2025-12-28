/**
 * Compression Utilities for TOSS
 *
 * Implements safe, deterministic compression for metadata only.
 * Transaction bytes are NEVER compressed to preserve determinism.
 *
 * Production-ready with official APIs.
 */

import { Buffer } from 'buffer';

/**
 * Simple DEFLATE-based compression using native zlib
 * (Available in Node.js and via polyfills in React Native)
 *
 * For metadata compression: memos, recipient names, etc.
 * NOT for transaction signatures or amounts!
 */
export interface CompressionResult {
  compressed: boolean;
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

/**
 * Compress metadata safely
 * Only compresses if compression saves >10% and data >200 bytes
 *
 * Safe for: memo text, user names, descriptions
 * UNSAFE for: signatures, amounts, transaction data
 */
export async function compressMetadata(
  data: string
): Promise<CompressionResult> {
  try {
    const originalBuffer = Buffer.from(data, 'utf-8');
    const originalSize = originalBuffer.length;

    // Only compress if it's worth it
    if (originalSize < 200) {
      return {
        compressed: false,
        data: new Uint8Array(originalBuffer),
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
      };
    }

    // Use native compression if available (Node.js)
    // For React Native, this will use a polyfill
    const zlib = await importZlib();

    const compressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.deflate(originalBuffer, (err: any, result: Buffer) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const compressedSize = compressed.length;
    const compressionRatio = compressedSize / originalSize;

    // Only use compression if it saves >10%
    if (compressionRatio > 0.9) {
      return {
        compressed: false,
        data: new Uint8Array(originalBuffer),
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
      };
    }

    return {
      compressed: true,
      data: new Uint8Array(compressed),
      originalSize,
      compressedSize,
      compressionRatio,
    };
  } catch (error) {
    // Graceful fallback: if compression fails, return uncompressed
    console.warn('Compression failed, returning uncompressed:', error);
    const buffer = Buffer.from(data, 'utf-8');
    return {
      compressed: false,
      data: new Uint8Array(buffer),
      originalSize: buffer.length,
      compressedSize: buffer.length,
      compressionRatio: 1.0,
    };
  }
}

/**
 * Decompress metadata
 */
export async function decompressMetadata(data: Uint8Array): Promise<string> {
  try {
    const zlib = await importZlib();

    const decompressed = await new Promise<Buffer>((resolve, reject) => {
      zlib.inflate(Buffer.from(data), (err: any, result: Buffer) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    return decompressed.toString('utf-8');
  } catch (error) {
    console.warn('Decompression failed:', error);
    // Assume data was not compressed
    return Buffer.from(data).toString('utf-8');
  }
}

/**
 * Compress intent metadata for efficient transmission
 * Returns the original intent with compressed metadata
 */
export async function compressIntentMetadata(
  intentMetadata: Record<string, any>
): Promise<{
  original: Record<string, any>;
  compressed: Record<string, any>;
  savings: number;
}> {
  const compressed: Record<string, any> = {};
  let totalOriginal = 0;
  let totalCompressed = 0;

  for (const [key, value] of Object.entries(intentMetadata)) {
    if (typeof value === 'string') {
      const result = await compressMetadata(value);
      totalOriginal += result.originalSize;
      totalCompressed += result.compressedSize;

      if (result.compressed) {
        compressed[key] = {
          __compressed: true,
          data: Array.from(result.data),
        };
      } else {
        compressed[key] = value;
      }
    } else {
      compressed[key] = value;
    }
  }

  const savings =
    totalOriginal > 0 ? ((totalOriginal - totalCompressed) / totalOriginal) * 100 : 0;

  return {
    original: intentMetadata,
    compressed,
    savings: Math.round(savings),
  };
}

/**
 * Decompress intent metadata
 */
export async function decompressIntentMetadata(
  compressedMetadata: Record<string, any>
): Promise<Record<string, any>> {
  const decompressed: Record<string, any> = {};

  for (const [key, value] of Object.entries(compressedMetadata)) {
    if (
      typeof value === 'object' &&
      value !== null &&
      value.__compressed === true
    ) {
      const buffer = new Uint8Array(value.data);
      decompressed[key] = await decompressMetadata(buffer);
    } else {
      decompressed[key] = value;
    }
  }

  return decompressed;
}

/**
 * Lazy-load zlib to avoid breaking in environments without it
 */
async function importZlib(): Promise<any> {
  // In Node.js, use native zlib
  if (typeof require !== 'undefined') {
    try {
      return require('zlib');
    } catch {
      // Fall through to polyfill
    }
  }

  // For React Native, try to use a polyfill
  // This can be pako (pako-zlib) or similar
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pako = await import('pako' as string) as any;
    return {
      deflate: (data: Buffer, callback: any) => {
        try {
          const compressed = pako.deflate(data);
          callback(null, Buffer.from(compressed));
        } catch (err) {
          callback(err);
        }
      },
      inflate: (data: Buffer, callback: any) => {
        try {
          const decompressed = pako.inflate(data);
          callback(null, Buffer.from(decompressed));
        } catch (err) {
          callback(err);
        }
      },
    };
  } catch {
    throw new Error(
      'Compression not available in this environment. Install pako or use Node.js.'
    );
  }
}

/**
 * Calculate size savings for a metadata object
 */
export function estimateCompressionSavings(
  metadata: Record<string, any>
): number {
  let totalSize = 0;

  for (const value of Object.values(metadata)) {
    if (typeof value === 'string') {
      totalSize += value.length;
    }
  }

  // Conservative estimate: ~35% savings on text (typical for DEFLATE)
  return Math.round(totalSize * 0.35);
}
