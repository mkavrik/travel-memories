import type { S3Client } from "@aws-sdk/client-s3";
import {
  getObjectBuffer,
  putObjectBuffer,
  objectExists,
  getSignedR2Url,
} from "@/lib/r2";
import heicConvert from "heic-convert";
import sharp from "sharp";

/** Přípony cache souborů v /cache/ */
export const CACHE_SUFFIX_THUMB = "thumb";
const CACHE_SUFFIX_DISPLAY = "display";

const SPECS: Record<
  string,
  { width: number; height: number; quality: number }
> = {
  [CACHE_SUFFIX_THUMB]: { width: 400, height: 300, quality: 75 },
  [CACHE_SUFFIX_DISPLAY]: { width: 1920, height: 1280, quality: 90 },
};

/**
 * Normalize hero filename to original name (e.g. IMG_9434.heic).
 * Strips cache suffixes (_v1_*, _thumb.jpg, _display.jpg, _ai.jpg).
 * The _ai.jpg check stays for backwards-compatibility with any existing
 * R2 objects left over from the removed Claude picker.
 */
export function toOriginalHeroFilename(filename: string): string {
  const f = filename.trim();
  if (f.includes("_v1_")) return f.split("_v1_")[0] + ".heic";
  if (/_thumb\.jpg$/i.test(f))
    return f.replace(/_thumb\.jpg$/i, "") + ".heic";
  if (/_display\.jpg$/i.test(f))
    return f.replace(/_display\.jpg$/i, "") + ".heic";
  if (/_ai\.jpg$/i.test(f)) return f.replace(/_ai\.jpg$/i, "") + ".heic";
  return f;
}

/**
 * Vytvoří R2 klíč pro cache verzi fotky.
 * trips/[trip]/[date]/photos/IMG_001.heic → .../photos/cache/IMG_001_thumb.jpg
 */
export function buildCacheKey(originalKey: string, suffix: string): string {
  const lastSlash = originalKey.lastIndexOf("/");
  if (lastSlash === -1) return originalKey;
  const dir = originalKey.slice(0, lastSlash);
  const filename = originalKey.slice(lastSlash + 1);
  const dot = filename.lastIndexOf(".");
  const base = dot === -1 ? filename : filename.slice(0, dot);
  return `${dir}/cache/${base}_${suffix}.jpg`;
}

function isHeic(key: string): boolean {
  return key.toLowerCase().endsWith(".heic");
}

/**
 * Cache hit: existence _thumb.jpg je proxy pro všechny tři verze.
 */
function thumbCacheKey(originalKey: string): string {
  return buildCacheKey(originalKey, CACHE_SUFFIX_THUMB);
}

/**
 * Při konverzi vždy vytvoř všechny tři verze najednou.
 * HEIC se dekóduje jen jednou, pak resize na tři velikosti.
 * Neprováděj konverzi na souborech z /cache/ (pouze originály z photos/).
 */
export async function ensureAllCaches(
  client: S3Client,
  originalKey: string,
): Promise<void> {
  if (originalKey.includes("/cache/")) return;

  const thumbKey = thumbCacheKey(originalKey);
  if (await objectExists(client, thumbKey)) {
    return;
  }

  const buffer = await getObjectBuffer(client, originalKey);
  if (!buffer) throw new Error(`Failed to load image: ${originalKey}`);

  let decodedBuffer: Buffer;
  if (isHeic(originalKey)) {
    const jpeg = await heicConvert({
      buffer,
      format: "JPEG",
      quality: 0.9,
    });
    decodedBuffer = Buffer.from(jpeg);
  } else {
    decodedBuffer = buffer;
  }

  const pipeline = sharp(decodedBuffer);
  const suffixes = [CACHE_SUFFIX_THUMB, CACHE_SUFFIX_DISPLAY] as const;

  await Promise.all(
    suffixes.map(async (suffix) => {
      const spec = SPECS[suffix];
      const cacheKey = buildCacheKey(originalKey, suffix);
      const out = await pipeline
        .clone()
        .resize(spec.width, spec.height, { fit: "inside" })
        .jpeg({ quality: spec.quality })
        .toBuffer();
      await putObjectBuffer(client, cacheKey, out, "image/jpeg");
    }),
  );
}

async function ensureDisplayCache(
  client: S3Client,
  originalKey: string,
): Promise<string | null> {
  await ensureAllCaches(client, originalKey);
  const key = buildCacheKey(originalKey, CACHE_SUFFIX_DISPLAY);
  return (await objectExists(client, key)) ? key : null;
}

/**
 * Lightbox a hero fotky na blogu → _display.jpg
 */
export async function getSignedDisplayUrl(
  client: S3Client,
  originalKey: string,
): Promise<string | null> {
  const cacheKey = await ensureDisplayCache(client, originalKey);
  if (!cacheKey) return null;
  return getSignedR2Url(client, cacheKey);
}

export const getSignedHeroUrl = getSignedDisplayUrl;
