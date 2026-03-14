import { NextResponse } from "next/server";
import {
  createR2Client,
  getObjectBuffer,
  putTextObject,
  listObjects,
  objectExists,
} from "@/lib/r2";
import {
  uploadVideoToStream,
  streamMetaKey,
  isVideoKey,
} from "@/lib/cloudflareStream";

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

      const videoKey = `${videoPrefix}${filename}`;
      const buffer = await getObjectBuffer(client, videoKey);
      if (!buffer) {
        skipped.push(filename);
        continue;
      }

      try {
        const streamId = await uploadVideoToStream(buffer, filename);
        await putTextObject(
          client,
          metaKey,
          JSON.stringify({ streamId, filename }),
          "application/json",
        );
        uploaded.push({ filename, streamId });
      } catch {
        skipped.push(filename);
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
