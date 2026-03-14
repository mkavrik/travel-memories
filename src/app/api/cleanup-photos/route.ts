import { NextResponse } from "next/server";
import { createR2Client, listObjects, deleteObject } from "@/lib/r2";

export const runtime = "nodejs";

const ORIGINAL_EXTENSIONS = /\.(heic|jpg|jpeg|png)$/i;
const VERSION_IN_NAME = /_v\d+_/;

/**
 * Má být soubor smazán? Smaž vše kromě originálních fotek.
 * Zachovat: .heic, .jpg, .jpeg, .png mimo /cache/ a bez _v1_, _v2_ v názvu.
 */
function shouldDelete(key: string): boolean {
  const keyLower = key.toLowerCase();
  const filename = key.split("/").pop() ?? "";

  // Smaž vše ve složce /cache/
  if (keyLower.includes("/cache/")) return true;
  // Smaž vše s verzí v názvu (_v1_, _v2_, …)
  if (VERSION_IN_NAME.test(filename)) return true;
  // Smaž cokoli, co není originální fotka (přípona)
  if (!ORIGINAL_EXTENSIONS.test(filename)) return true;

  return false;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tripName?: string;
      date?: string | null;
    };
    const tripName = (body.tripName ?? "").trim();
    const date = (body.date ?? "").trim() || null;

    if (!tripName) {
      return NextResponse.json(
        { error: "tripName je povinný." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const prefix = date
      ? `trips/${tripName}/${date}/photos/`
      : `trips/${tripName}/summary/photos/`;

    const objects = await listObjects(client, prefix);
    const toDelete = objects.filter(
      (obj) => obj.Key != null && shouldDelete(obj.Key),
    );

    for (const obj of toDelete) {
      if (obj.Key) await deleteObject(client, obj.Key);
    }

    return NextResponse.json(
      {
        deleted: toDelete.length,
        message:
          toDelete.length === 0
            ? "Žádné soubory k smazání."
            : `Smazáno ${toDelete.length} souborů.`,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[CLEANUP_PHOTOS] Unexpected error", error);
    return NextResponse.json(
      { error: "Nastala chyba při čištění." },
      { status: 500 },
    );
  }
}
