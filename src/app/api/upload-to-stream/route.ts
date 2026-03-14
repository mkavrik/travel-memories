import { NextResponse } from "next/server";
import {
  createR2Client,
  getObjectBuffer,
  putTextObject,
  objectExists,
} from "@/lib/r2";
import {
  uploadVideoToStream,
  streamMetaKey,
} from "@/lib/cloudflareStream";

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

    const buffer = await getObjectBuffer(client, videoKey);
    if (!buffer) {
      return NextResponse.json(
        { error: "Nepodařilo se načíst video z R2." },
        { status: 500 },
      );
    }

    const streamId = await uploadVideoToStream(buffer, filename);
    const videoPrefix = `trips/${tripName}/${date}/video/`;
    const metaKey = streamMetaKey(videoPrefix, filename);
    await putTextObject(
      client,
      metaKey,
      JSON.stringify({ streamId, filename }),
      "application/json",
    );

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
