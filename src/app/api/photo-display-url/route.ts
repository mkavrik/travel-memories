import { NextResponse } from "next/server";
import { createR2Client, listObjects } from "@/lib/r2";
import { getSignedDisplayUrl } from "@/lib/photoCache";

export const runtime = "nodejs";

/**
 * GET /api/photo-display-url?tripName=...&date=...&scope=day|trip&filename=...
 * Vrátí signed URL pro _display.jpg (lightbox). Zajistí display cache pokud chybí.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripName = (searchParams.get("tripName") ?? "").trim();
    const date = (searchParams.get("date") ?? "").trim() || null;
    const scope = searchParams.get("scope") === "trip" ? "trip" : "day";
    const filename = (searchParams.get("filename") ?? "").trim();

    if (!tripName || !filename) {
      return NextResponse.json(
        { error: "tripName a filename jsou povinné." },
        { status: 400 },
      );
    }
    if (scope === "day" && !date) {
      return NextResponse.json(
        { error: "date je povinné pro scope=day." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    let originalKey: string | null = null;

    if (scope === "day") {
      originalKey = `trips/${tripName}/${date}/photos/${filename}`;
    } else {
      const basePrefix = `trips/${tripName}/`;
      const summaryPrefix = `${basePrefix}summary/photos/`;
      const summaryList = await listObjects(client, summaryPrefix);
      const inSummary = summaryList.find(
        (obj) => (obj.Key ?? "").endsWith(filename) || (obj.Key ?? "").endsWith(`/${filename}`),
      );
      if (inSummary?.Key) {
        originalKey = inSummary.Key;
      } else {
        const allObjects = await listObjects(client, basePrefix);
        const dates = new Set<string>();
        for (const obj of allObjects) {
          const key = obj.Key ?? "";
          const rel = key.replace(basePrefix, "");
          const [maybeDate] = rel.split("/");
          if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) dates.add(maybeDate);
        }
        for (const d of Array.from(dates).sort()) {
          const list = await listObjects(client, `${basePrefix}${d}/photos/`);
          const found = list.find(
            (obj) => (obj.Key ?? "").endsWith(`/${filename}`),
          );
          if (found?.Key) {
            originalKey = found.Key;
            break;
          }
        }
      }
    }

    if (!originalKey) {
      return NextResponse.json(
        { error: "Fotka nenalezena." },
        { status: 404 },
      );
    }

    const url = await getSignedDisplayUrl(client, originalKey);
    if (!url) {
      return NextResponse.json(
        { error: "Nepodařilo se připravit zobrazení." },
        { status: 500 },
      );
    }
    return NextResponse.json({ url }, { status: 200 });
  } catch (error: unknown) {
    console.error("[PHOTO_DISPLAY_URL]", error);
    return NextResponse.json(
      { error: "Nastala chyba." },
      { status: 500 },
    );
  }
}
