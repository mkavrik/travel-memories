import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const s3 = new S3Client({ region: "auto", endpoint: process.env.CLOUDFLARE_R2_S3_API_URL,
  credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY } });
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const TRIP = process.argv[2] || "Surf v Portugalsku";
let token, keys = [];
do {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `trips/${TRIP}/`, ContinuationToken: token }));
  for (const o of res.Contents ?? []) keys.push(o.Key);
  token = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (token);
console.log(`celkem objektů: ${keys.length}`);
// jen relevantní: map/ a outputs/ s mapami
for (const k of keys.filter(k => k.includes("/map/") || k.includes("map_trail") || k.includes("trail_stats") || k.includes("map_elevation"))) console.log(" ", k);
console.log("\n--- unikátní dny ---");
console.log([...new Set(keys.map(k => k.split("/")[2]))].sort().join("\n"));
