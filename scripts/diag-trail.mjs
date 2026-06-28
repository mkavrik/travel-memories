import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// load .env.local
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const TRIP = process.argv[2] || "Surf v Portugalsku";
const DATE = process.argv[3] || "2026-07-26";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_S3_API_URL,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;

async function listAll(prefix) {
  const out = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of res.Contents ?? []) out.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

async function getText(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return await res.Body.transformToString();
}

console.log(`\n=== R2: trips/${TRIP}/${DATE}/ ===`);
console.log("\n--- map/ (GPX) ---");
for (const k of await listAll(`trips/${TRIP}/${DATE}/map/`)) console.log(" ", k.split("/").pop());

console.log("\n--- outputs/ ---");
const outs = await listAll(`trips/${TRIP}/${DATE}/outputs/`);
for (const k of outs) console.log(" ", k.split("/").pop());

console.log("\n--- trail_stats_*.json obsah ---");
for (const k of outs.filter((k) => k.includes("trail_stats_") && k.endsWith(".json"))) {
  const j = JSON.parse(await getText(k));
  console.log(` ${k.split("/").pop()}: routeType=${j.routeType}, slug=${j.slug}, gpx=${j.gpxFilename}, durationS=${j.durationS}`);
}

console.log("\n=== Supabase days_cache ===");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from("days_cache").select("trip_name,date,routes").eq("trip_name", TRIP).eq("date", DATE);
if (error) console.log("error:", error.message);
else if (!data?.length) console.log("(žádný řádek — cache prázdná pro tento den)");
else for (const row of data) {
  console.log(`row date=${row.date}, routes=${(row.routes ?? []).length}`);
  for (const r of row.routes ?? []) console.log(`   slug=${r.slug}, routeType=${r.routeType}, hasElevationUrl=${!!r.mapElevationUrl}, durationS=${r.durationS}`);
}
