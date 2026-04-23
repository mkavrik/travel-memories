import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createR2Client,
  getSignedR2Url,
  getTextObject,
  putTextObject,
  listObjects,
  objectExists,
  deleteObject,
} from "@/lib/r2";
import {
  uploadVideoToStreamFromUrl,
  streamMetaKey,
  isVideoKey,
  streamVideoExists,
} from "@/lib/cloudflareStream";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type RequestBody = {
  tripName?: string;
  date?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const tripName = (body.tripName ?? "").trim();
    const date = (body.date ?? "").trim();

    if (!tripName || !date) {
      return NextResponse.json(
        { error: "tripName a date jsou povinné." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const videoPrefix = `trips/${tripName}/${date}/video/`;
    const objects = await listObjects(client, videoPrefix);

    const videoFiles = objects
      .map((o) => o.Key ?? "")
      .filter((key) => {
        const name = key.replace(videoPrefix, "");
        return name && isVideoKey(name) && !name.endsWith("_stream.json");
      })
      .map((key) => key.replace(videoPrefix, ""));

    const uploaded: { filename: string; streamId: string }[] = [];
    const skipped: string[] = [];

    for (const filename of videoFiles) {
      const metaKey = streamMetaKey(videoPrefix, filename);

      // If _stream.json already exists, verify the streamId still works on
      // Cloudflare Stream. Stale metadata (from half-failed old uploads) is
      // purged so we re-upload.
      if (await objectExists(client, metaKey)) {
        const raw = await getTextObject(client, metaKey);
        let validStreamId: string | null = null;
        if (raw) {
          try {
            const meta = JSON.parse(raw) as { streamId?: string };
            if (meta.streamId && (await streamVideoExists(meta.streamId))) {
              validStreamId = meta.streamId;
            }
          } catch {
            /* treat as invalid */
          }
        }
        if (validStreamId) {
          skipped.push(filename);
          continue;
        }
        console.log(
          "[UPLOAD_DAY_VIDEOS_TO_STREAM] Stale metadata, re-uploading:",
          filename,
        );
        await deleteObject(client, metaKey);
      }

      try {
        const videoKey = `${videoPrefix}${filename}`;
        const sourceUrl = await getSignedR2Url(client, videoKey, 24 * 3600);
        const streamId = await uploadVideoToStreamFromUrl(sourceUrl, filename);
        await putTextObject(
          client,
          metaKey,
          JSON.stringify({ streamId, filename }),
          "application/json",
        );
        uploaded.push({ filename, streamId });
      } catch (err) {
        console.error("[UPLOAD_DAY_VIDEOS_TO_STREAM] Stream copy failed:", {
          filename,
          error: err instanceof Error ? err.message : String(err),
        });
        skipped.push(filename);
      }
    }

    // Always invalidate — user might be syncing because they noticed stale
    // cached state, even if nothing new was uploaded.
    try {
      await invalidateCache(tripName, date);
      revalidatePath(`/blog/${tripName}/${date}`);
    } catch (e) {
      console.warn("[UPLOAD_DAY_VIDEOS_TO_STREAM] Cache invalidation failed:", e);
    }

    return NextResponse.json(
      { uploaded, skipped, message: `Nahráno ${uploaded.length} videí do Stream.` },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[UPLOAD_DAY_VIDEOS_TO_STREAM]", error);
    return NextResponse.json(
      { error: "Nastala chyba při nahrávání videí do Stream." },
      { status: 500 },
    );
  }
}
