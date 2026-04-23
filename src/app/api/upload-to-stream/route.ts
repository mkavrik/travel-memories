import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createR2Client,
  getSignedR2Url,
  putTextObject,
  objectExists,
} from "@/lib/r2";
import {
  uploadVideoToStreamFromUrl,
  streamMetaKey,
} from "@/lib/cloudflareStream";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type RequestBody = {
  tripName?: string;
  date?: string;
  filename?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const tripName = (body.tripName ?? "").trim();
    const date = (body.date ?? "").trim();
    const filename = (body.filename ?? "").trim();

    if (!tripName || !date || !filename) {
      return NextResponse.json(
        { error: "tripName, date a filename jsou povinné." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const videoKey = `trips/${tripName}/${date}/video/${filename}`;

    if (!(await objectExists(client, videoKey))) {
      return NextResponse.json(
        { error: "Video soubor v R2 nenalezen." },
        { status: 404 },
      );
    }

    // 24h presigned URL — Stream ingests asynchronously and the URL must stay
    // valid throughout the download on their side.
    const sourceUrl = await getSignedR2Url(client, videoKey, 24 * 3600);
    const streamId = await uploadVideoToStreamFromUrl(sourceUrl, filename);

    const videoPrefix = `trips/${tripName}/${date}/video/`;
    const metaKey = streamMetaKey(videoPrefix, filename);
    await putTextObject(
      client,
      metaKey,
      JSON.stringify({ streamId, filename }),
      "application/json",
    );

    try {
      await invalidateCache(tripName, date);
      revalidatePath(`/blog/${tripName}/${date}`);
    } catch (e) {
      console.warn("[UPLOAD_TO_STREAM] Cache invalidation failed:", e);
    }

    return NextResponse.json(
      { streamId, filename, metaKey },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[UPLOAD_TO_STREAM]", error);
    return NextResponse.json(
      { error: "Nastala chyba při nahrávání videa do Stream." },
      { status: 500 },
    );
  }
}
