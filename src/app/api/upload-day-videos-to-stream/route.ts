import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createR2Client,
  getSignedR2Url,
  putTextObject,
  listObjects,
  objectExists,
} from "@/lib/r2";
import {
  uploadVideoToStreamFromUrl,
  streamMetaKey,
  isVideoKey,
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
      if (await objectExists(client, metaKey)) {
        skipped.push(filename);
        continue;
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

    if (uploaded.length > 0) {
      try {
        await invalidateCache(tripName, date);
        revalidatePath(`/blog/${tripName}/${date}`);
      } catch (e) {
        console.warn("[UPLOAD_DAY_VIDEOS_TO_STREAM] Cache invalidation failed:", e);
      }
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
