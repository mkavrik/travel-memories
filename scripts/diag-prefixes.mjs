import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const s3 = new S3Client({ region: "auto", endpoint: process.env.CLOUDFLARE_R2_S3_API_URL,
  credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY } });
const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "trips/", Delimiter: "/" }));
for (const p of res.CommonPrefixes ?? []) {
  const name = p.Prefix.replace(/^trips\//, "").replace(/\/$/, "");
  console.log(JSON.stringify(name), "  bytes:", Buffer.from(name, "utf8").toString("hex"));
}
