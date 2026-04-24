import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createR2Client,
  putTextObject,
  objectExists,
  deleteObject,
} from "@/lib/r2";
import { toOriginalHeroFilename } from "@/lib/photoCache";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type RequestBody = {
  tripName?: string;
  date?: string | null;
  filename?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const tripName = (body.tripName ?? "").trim();
    const date = (body.date ?? "").trim() || null;
    const filename = (body.filename ?? "").trim();

    if (!tripName) {
      return NextResponse.json(
        { error: "tripName je povinný." },
        { status: 400 },
      );
    }

    if (!filename) {
      return NextResponse.json(
        { error: "filename je povinný." },
        { status: 400 },
      );
    }

    const originalFilename = toOriginalHeroFilename(filename);
    const client = createR2Client();
    const isDay = Boolean(date);
    const basePrefix = isDay
      ? `trips/${tripName}/${date}/`
      : `trips/${tripName}/summary/`;
    const heroKey = `${basePrefix}outputs/hero_photo.json`;

    if (await objectExists(client, heroKey)) {
      await deleteObject(client, heroKey);
    }

    await putTextObject(
      client,
      heroKey,
      JSON.stringify({ filename: originalFilename }),
      "application/json",
    );

    try {
      if (isDay) {
        await invalidateCache(tripName, date ?? undefined);
        revalidatePath(`/blog/${tripName}/${date}`);
      } else {
        await invalidateCache(tripName);
        revalidatePath(`/blog/${tripName}`);
      }
    } catch (e) {
      console.warn("[SET_HERO_PHOTO] Cache invalidation failed:", e);
    }

    return NextResponse.json(
      {
        scope: isDay ? "day" : "trip",
        filename: originalFilename,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[SET_HERO_PHOTO] Unexpected error", error);
    return NextResponse.json(
      { error: "Nastala chyba při ukládání hero fotky." },
      { status: 500 },
    );
  }
}
