import { NextResponse } from "next/server";
import { createR2Client, putObjectBuffer } from "@/lib/r2";

export const runtime = "nodejs";

type SectionType = "day" | "summary";

function getFolderForFile(filename: string): string | null {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".m4a") || lower.endsWith(".mp3")) return "audio";
  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".png")
  )
    return "photos";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "notes";
  if (lower.endsWith(".gpx")) return "map";
  if (lower.endsWith(".mov") || lower.endsWith(".mp4")) return "video";

  return null;
}

function buildObjectKey(
  tripName: string,
  sectionType: SectionType,
  date: string | null,
  folder: string,
  filename: string,
): string {
  const safeTripName = tripName.trim();

  if (sectionType === "day") {
    const safeDate = (date || "").trim();
    return `trips/${safeTripName}/${safeDate}/${folder}/${filename}`;
  }

  return `trips/${safeTripName}/summary/${folder}/${filename}`;
}

export async function POST(request: Request) {
  try {
    const client = createR2Client();
    const formData = await request.formData();

    const tripName = (formData.get("tripName") as string | null)?.trim();
    const sectionType = formData.get("sectionType") as SectionType | null;
    const date = (formData.get("date") as string | null) || null;

    if (!tripName) {
      return NextResponse.json(
        { error: "Název tripu je povinný." },
        { status: 400 },
      );
    }

    if (sectionType !== "day" && sectionType !== "summary") {
      return NextResponse.json(
        { error: "Neplatný typ sekce." },
        { status: 400 },
      );
    }

    if (sectionType === "day" && !date) {
      return NextResponse.json(
        { error: "Datum je povinné pro konkrétní den." },
        { status: 400 },
      );
    }

    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Musíš vybrat alespoň jeden soubor." },
        { status: 400 },
      );
    }

    const uploaded: string[] = [];
    const skipped: { filename: string; reason: string }[] = [];

    for (const file of files) {
      const folder = getFolderForFile(file.name);

      if (!folder) {
        skipped.push({
          filename: file.name,
          reason: "Nepodporovaný typ souboru.",
        });
        continue;
      }

      const key = buildObjectKey(tripName, sectionType, date, folder, file.name);
      const buffer = Buffer.from(await file.arrayBuffer());

      await putObjectBuffer(
        client,
        key,
        buffer,
        file.type || "application/octet-stream",
      );
      uploaded.push(key);
    }

    if (uploaded.length === 0) {
      return NextResponse.json(
        { error: "Žádný soubor nebyl nahrán.", skipped },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { message: "Upload dokončen.", uploaded, skipped },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[UPLOAD_API]", error);
    return NextResponse.json(
      { error: "Nastala chyba při uploadu souborů." },
      { status: 500 },
    );
  }
}
