// Verify that regenerated cache files have correct (post-rotate) dimensions
// and that EXIF Orientation tag is stripped (so browsers won't try to rotate
// them again).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;

const TRIP = "04_2026 Southwest USA National Parks Road Trip";
const FILES = [
  ["2026-04-21/photos/cache/IMG_0042_display.jpg", 8, "rotate-270-CW"],
  ["2026-04-24/photos/cache/IMG_0176_display.jpg", 3, "rotate-180"],
  ["2026-04-25/photos/cache/IMG_0295_display.jpg", 6, "rotate-90-CW"],
  ["2026-04-27/photos/cache/IMG_0334_display.jpg", 6, "rotate-90-CW"],
  ["2026-04-27/photos/cache/IMG_0336_display.jpg", 6, "rotate-90-CW"],
];

async function main() {
  for (const [rel, origOrient, label] of FILES) {
    const key = `trips/${TRIP}/${rel}`;
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const c of res.Body) chunks.push(c);
    const meta = await sharp(Buffer.concat(chunks)).metadata();
    const filename = key.split("/").pop();
    const portrait = meta.height > meta.width;
    console.log(
      `${filename}  ${meta.width}x${meta.height}  ` +
        `orientation=${meta.orientation ?? "stripped"}  ` +
        `[orig EXIF was ${origOrient} = ${label}]  ` +
        `→ ${portrait ? "PORTRAIT" : "landscape"}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
