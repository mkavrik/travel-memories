import {
  S3Client,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  _Object,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.CLOUDFLARE_R2_S3_API_URL;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
  console.warn(
    "[R2] Missing configuration. R2 helpers will fail until env vars are set.",
  );
}

export const R2_BUCKET_NAME = bucketName;

export function createR2Client() {
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 environment variables are not configured.");
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err: Error) => reject(err));
  });
}

export async function getSignedR2Url(
  client: S3Client,
  key: string,
  expiresInSeconds = 3600,
  options?: { responseCacheControl?: string },
): Promise<string> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseCacheControl: options?.responseCacheControl,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/** Cache-Control for photo/hero display URLs. The signed URL is stable for
 *  the lifetime of the Supabase cache entry (7 days) and the underlying file
 *  doesn't change; new uploads invalidate the cache and produce a new URL. */
export const PHOTO_CACHE_CONTROL = "public, max-age=604800, immutable";

export async function getSignedPutUrl(
  client: S3Client,
  key: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function listTripPrefixes(client: S3Client): Promise<string[]> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  const prefixes: string[] = [];
  let ContinuationToken: string | undefined = undefined;
  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: "trips/",
        Delimiter: "/",
        ContinuationToken,
      }),
    );
    for (const p of res.CommonPrefixes ?? []) {
      prefixes.push(p.Prefix || "");
    }
    ContinuationToken = res.IsTruncated
      ? res.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  return prefixes
    .filter((prefix) => prefix.startsWith("trips/") && prefix !== "trips/")
    .map((prefix) => prefix.replace(/^trips\//, "").replace(/\/$/, ""))
    .filter((name) => name.length > 0);
}

export async function listObjects(
  client: S3Client,
  prefix: string,
): Promise<_Object[]> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  const all: _Object[] = [];
  let ContinuationToken: string | undefined = undefined;
  do {
    const res: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken,
      }),
    );
    if (res.Contents) all.push(...res.Contents);
    ContinuationToken = res.IsTruncated
      ? res.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  return all;
}

export async function getTextObject(
  client: S3Client,
  key: string,
): Promise<string | null> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  const res = await client
    .send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    )
    .catch(() => null);

  if (!res || !res.Body) return null;

  const buffer = await streamToBuffer(res.Body as any);
  return buffer.toString("utf-8");
}

export async function getObjectBuffer(
  client: S3Client,
  key: string,
): Promise<Buffer | null> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  const res = await client
    .send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    )
    .catch(() => null);

  if (!res || !res.Body) return null;
  return streamToBuffer(res.Body as any);
}

export async function putTextObject(
  client: S3Client,
  key: string,
  body: string,
  contentType: string,
): Promise<void> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: Buffer.from(body, "utf-8"),
      ContentType: contentType,
    }),
  );
}

export async function objectExists(
  client: S3Client,
  key: string,
): Promise<boolean> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }),
    );
    return true;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
}

export async function deleteObject(
  client: S3Client,
  key: string,
): Promise<void> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );
}

export async function putObjectBuffer(
  client: S3Client,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (!bucketName) {
    throw new Error("R2 bucket name is not configured.");
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** R2 key for the _display.jpg cache version of a photo. */
export function displayCacheKey(
  photosPrefix: string,
  filename: string,
): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return `${photosPrefix}cache/${base}_display.jpg`;
}

/** Whether an R2 key is an original image (not in /cache/, has image extension). */
export function isOriginalImage(key: string): boolean {
  if (key.includes("/cache/")) return false;
  const lower = key.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".heic")
  );
}

