// One-off diagnostic: scan all original photos on R2, read EXIF Orientation
// via sharp().metadata() (handles JPEG + HEIC), and print those != 1.
//
// Usage: node scripts/scan-orientation.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

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
  console.error("Chybi CLOUDFLARE_R2_* env vars. Pust skript v korenu projektu.");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const PHOTO_EXT = /\.(jpe?g|heic|heif|png)$/i;
const PHOTOS_DIR_RE = /\/photos\//;
const SKIP_RE = /\/photos\/cache\/|_meta\.json$|hero_photo\.json$/;

async function* listAllObjects(prefix) {
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) yield { key: obj.Key, size: obj.Size ?? 0 };
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

async function fetchBytes(key, range) {
  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range ? { Range: range } : {}),
    }),
  );
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return Buffer.concat(chunks);
}

const ORIENT_LABEL = {
  1: "normal",
  2: "mirror-horizontal",
  3: "rotate-180",
  4: "mirror-vertical",
  5: "mirror-h+rotate-270",
  6: "rotate-90-CW",
  7: "mirror-h+rotate-90",
  8: "rotate-270-CW",
};

async function readOrientation(key, sizeHint) {
  // For small files (<1.5 MB), grab the whole thing.
  // For larger, try 1 MB prefix first; if sharp can't parse, fall back to full.
  let buf;
  if (sizeHint > 0 && sizeHint <= 1_500_000) {
    buf = await fetchBytes(key);
  } else {
    buf = await fetchBytes(key, "bytes=0-1048575"); // 1 MB
  }

  async function tryParse(b) {
    try {
      const meta = await sharp(b, { failOn: "none" }).metadata();
      return meta.orientation;
    } catch {
      return undefined;
    }
  }

  let orient = await tryParse(buf);
  if (orient === undefined && (sizeHint === 0 || sizeHint > 1_500_000)) {
    // fall back to full download for HEIC where 1 MB wasn't enough
    buf = await fetchBytes(key);
    orient = await tryParse(buf);
  }
  return orient;
}

async function main() {
  const suspects = [];
  const noTag = [];
  const errors = [];
  let scanned = 0;

  process.stderr.write("Listing objects...\n");
  const items = [];
  for await (const { key, size } of listAllObjects("trips/")) {
    if (!PHOTO_EXT.test(key)) continue;
    if (!PHOTOS_DIR_RE.test(key)) continue;
    if (SKIP_RE.test(key)) continue;
    items.push({ key, size });
  }
  process.stderr.write(`Found ${items.length} originals. Scanning...\n`);

  const CONCURRENCY = 6;
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const { key, size } = items[idx];
      try {
        const orient = await readOrientation(key, size);
        scanned++;
        if (orient === undefined || orient === 1) {
          if (orient === undefined) noTag.push(key);
        } else {
          suspects.push({ key, orientation: orient });
        }
        if (scanned % 20 === 0) {
          process.stderr.write(
            `  ${scanned}/${items.length} (suspects: ${suspects.length}, noTag: ${noTag.length})\n`,
          );
        }
      } catch (err) {
        errors.push({ key, error: err?.message || String(err) });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  process.stderr.write("\n=== Summary ===\n");
  process.stderr.write(`Scanned: ${scanned}\n`);
  process.stderr.write(`Orientation != 1 (suspect): ${suspects.length}\n`);
  process.stderr.write(`Orientation = 1 or no tag: ${scanned - suspects.length}\n`);
  process.stderr.write(`  of which no tag at all: ${noTag.length}\n`);
  process.stderr.write(`Errors: ${errors.length}\n\n`);

  suspects.sort((a, b) => a.key.localeCompare(b.key));
  console.log("=== Suspect photos (Orientation != 1) ===\n");
  let lastGroup = "";
  for (const s of suspects) {
    const parts = s.key.split("/");
    const trip = parts[1];
    const date = parts[2];
    const file = parts[parts.length - 1];
    const group = `${trip} / ${date}`;
    if (group !== lastGroup) {
      console.log(`\n[${group}]`);
      lastGroup = group;
    }
    console.log(
      `  ${file}  →  Orientation=${s.orientation} (${ORIENT_LABEL[s.orientation] || "?"})`,
    );
  }

  if (errors.length) {
    console.log("\n=== Errors ===");
    for (const e of errors.slice(0, 20)) console.log(`  ${e.key}: ${e.error}`);
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
