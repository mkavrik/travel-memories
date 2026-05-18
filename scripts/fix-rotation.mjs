// One-off fix: re-generate cache (thumb + display + _meta.json) for the
// 5 JPEGs identified by scan-orientation.mjs as having EXIF Orientation != 1,
// then invalidate Supabase cache for the 4 affected days so production
// re-signs fresh URLs.
//
// Usage: node scripts/fix-rotation.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import exifr from "exifr";

function loadEnv(file) {
  try {
    const text = readFileSync(file, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {}
}
loadEnv(resolve(process.cwd(), ".env.local"));

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || "travel-memories";

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("Chybi CLOUDFLARE_R2_* env vars.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
if (!supabase) {
  console.warn("Supabase env vars chybi — preskocim invalidaci.");
}

// The 5 affected files, identified by scan-orientation.mjs.
const TRIP = "04_2026 Southwest USA National Parks Road Trip";
const KEYS = [
  `trips/${TRIP}/2026-04-21/photos/IMG_0042.jpeg`,
  `trips/${TRIP}/2026-04-24/photos/IMG_0176.jpeg`,
  `trips/${TRIP}/2026-04-25/photos/IMG_0295.jpeg`,
  `trips/${TRIP}/2026-04-27/photos/IMG_0334.jpeg`,
  `trips/${TRIP}/2026-04-27/photos/IMG_0336.jpeg`,
];

const SPECS = {
  thumb: { width: 400, height: 300, quality: 75 },
  display: { width: 1920, height: 1280, quality: 90 },
};

function buildCacheKey(originalKey, suffix) {
  const lastSlash = originalKey.lastIndexOf("/");
  const dir = originalKey.slice(0, lastSlash);
  const filename = originalKey.slice(lastSlash + 1);
  const dot = filename.lastIndexOf(".");
  const base = dot === -1 ? filename : filename.slice(0, dot);
  return `${dir}/cache/${base}_${suffix}.jpg`;
}

function metaKey(originalKey) {
  const lastSlash = originalKey.lastIndexOf("/");
  const dir = originalKey.slice(0, lastSlash);
  const filename = originalKey.slice(lastSlash + 1);
  const dot = filename.lastIndexOf(".");
  const base = dot === -1 ? filename : filename.slice(0, dot);
  return `${dir}/cache/${base}_meta.json`;
}

async function getBuffer(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return Buffer.concat(chunks);
}

async function putBuffer(key, buf, contentType) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  );
}

async function tryDelete(key) {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404) return false;
    console.warn(`  delete ${key} failed: ${err.message}`);
    return false;
  }
}

async function processOne(originalKey) {
  console.log(`\n→ ${originalKey}`);
  const thumbKey = buildCacheKey(originalKey, "thumb");
  const displayKey = buildCacheKey(originalKey, "display");
  const metaKeyPath = metaKey(originalKey);

  // 1) wipe existing cache so ensureAllCaches logic would re-run anyway
  await tryDelete(thumbKey);
  await tryDelete(displayKey);
  await tryDelete(metaKeyPath);
  console.log("  cache wiped");

  // 2) download original
  const buf = await getBuffer(originalKey);
  console.log(`  downloaded ${buf.length} bytes`);

  // 3) sharp pipeline with .rotate() (auto-applies EXIF Orientation)
  const pipeline = sharp(buf).rotate();

  for (const [suffix, spec] of Object.entries(SPECS)) {
    const out = await pipeline
      .clone()
      .resize(spec.width, spec.height, { fit: "inside" })
      .jpeg({ quality: spec.quality })
      .toBuffer();
    const key = buildCacheKey(originalKey, suffix);
    await putBuffer(key, out, "image/jpeg");
    console.log(`  wrote ${suffix} (${out.length} bytes)`);
  }

  // 4) meta sidecar (captured_at)
  let capturedAt = null;
  try {
    const parsed = await exifr.parse(buf, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });
    const d = parsed?.DateTimeOriginal ?? parsed?.CreateDate ?? parsed?.ModifyDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) capturedAt = d;
  } catch {}
  await putBuffer(
    metaKeyPath,
    Buffer.from(
      JSON.stringify({ capturedAt: capturedAt ? capturedAt.toISOString() : null }),
    ),
    "application/json",
  );
  console.log(`  wrote meta (capturedAt=${capturedAt?.toISOString() ?? "null"})`);
}

async function invalidateSupabase(trip, dates) {
  if (!supabase) return;
  for (const date of dates) {
    const a = await supabase.from("days_cache").delete().eq("trip_name", trip).eq("date", date);
    const b = await supabase.from("photo_urls_cache").delete().eq("trip_name", trip).eq("date", date);
    console.log(
      `  invalidate ${date}: days_cache=${a.error ? "ERR " + a.error.message : "ok"}, photo_urls_cache=${b.error ? "ERR " + b.error.message : "ok"}`,
    );
  }
  const c = await supabase.from("trips_cache").delete().eq("trip_name", trip);
  console.log(`  invalidate trip ${trip}: trips_cache=${c.error ? "ERR " + c.error.message : "ok"}`);
}

async function main() {
  console.log(`Fixing ${KEYS.length} photos in ${TRIP}\n`);
  for (const key of KEYS) {
    try {
      await processOne(key);
    } catch (err) {
      console.error(`  FAIL: ${err.message}`);
    }
  }

  const uniqueDates = Array.from(
    new Set(KEYS.map((k) => k.split("/")[2])),
  );
  console.log(`\nInvalidating Supabase for dates: ${uniqueDates.join(", ")}`);
  await invalidateSupabase(TRIP, uniqueDates);

  console.log("\nDone. Production ISR cache (revalidate=3600) will refresh");
  console.log("automatically; for an instant refresh hit the affected day pages");
  console.log("after triggering Next.js revalidation (e.g. via /api/warm-cache).");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
