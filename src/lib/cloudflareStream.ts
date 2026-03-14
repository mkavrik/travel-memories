/**
 * Cloudflare Stream API – nahrání videa a vrácení stream ID.
 */

const STREAM_API = "https://api.cloudflare.com/client/v4/accounts";

export type StreamVideoDetails = {
  width: number;
  height: number;
  isLandscape: boolean;
};

export async function getStreamVideoDetails(
  streamId: string,
): Promise<StreamVideoDetails | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) return null;

  const url = `${STREAM_API}/${accountId}/stream/${streamId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    result?: { input?: { width?: number; height?: number } };
    success?: boolean;
  };

  if (!data.success || !data.result?.input) return null;
  const w = data.result.input.width ?? 0;
  const h = data.result.input.height ?? 0;
  if (w <= 0 || h <= 0) return null;

  return {
    width: w,
    height: h,
    isLandscape: w >= h,
  };
}

export async function uploadVideoToStream(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID nebo CLOUDFLARE_STREAM_API_TOKEN není nastaven.",
    );
  }

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "video/mp4" }),
    filename,
  );

  const url = `${STREAM_API}/${accountId}/stream`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Cloudflare Stream API] Upload failed:", {
      status: res.status,
      statusText: res.statusText,
      body: errText,
    });
    throw new Error(`Cloudflare Stream API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    result?: { uid?: string };
    success?: boolean;
  };
  if (!data.success || !data.result?.uid) {
    console.error("[Cloudflare Stream API] Response missing uid:", {
      success: data.success,
      result: data.result,
    });
    throw new Error("Cloudflare Stream nevrátil video ID.");
  }
  return data.result.uid;
}

export function isVideoKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.endsWith(".mov") ||
    lower.endsWith(".mp4")
  );
}

/** Basename bez přípony pro [název]_stream.json */
export function streamMetaKey(videoPrefix: string, filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return `${videoPrefix}${base}_stream.json`;
}
