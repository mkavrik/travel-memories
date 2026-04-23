import { NextResponse } from "next/server";
import { createR2Client, getSignedPutUrl } from "@/lib/r2";

export const runtime = "nodejs";

type SectionType = "day" | "summary";

interface PresignFileRequest {
  name: string;
  contentType?: string;
}

interface PresignRequestBody {
  tripName?: string;
  sectionType?: SectionType;
  date?: string | null;
  files?: PresignFileRequest[];
}

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

function inferContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".gpx")) return "application/gpx+xml";
  return "application/octet-stream";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PresignRequestBody;
    const tripName = body.tripName?.trim();
    const sectionType = body.sectionType;
    const date = body.date ?? null;
    const files = Array.isArray(body.files) ? body.files : [];

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
    if (files.length === 0) {
      return NextResponse.json(
        { error: "Musíš vybrat alespoň jeden soubor." },
        { status: 400 },
      );
    }

    const client = createR2Client();

    const presigned: {
      filename: string;
      objectKey: string;
      uploadUrl: string;
      contentType: string;
    }[] = [];
    const skipped: { filename: string; reason: string }[] = [];

    for (const file of files) {
      const filename = file.name?.trim();
      if (!filename) {
        continue;
      }
      const folder = getFolderForFile(filename);
      if (!folder) {
        skipped.push({ filename, reason: "Nepodporovaný typ souboru." });
        continue;
      }
      const contentType =
        file.contentType && file.contentType.length > 0
          ? file.contentType
          : inferContentType(filename);
      const objectKey = buildObjectKey(
        tripName,
        sectionType,
        date,
        folder,
        filename,
      );
      const uploadUrl = await getSignedPutUrl(client, objectKey, contentType);
      presigned.push({ filename, objectKey, uploadUrl, contentType });
    }

    if (presigned.length === 0) {
      return NextResponse.json(
        { error: "Žádný podporovaný soubor.", skipped },
        { status: 400 },
      );
    }

    return NextResponse.json({ presigned, skipped }, { status: 200 });
  } catch (error) {
    console.error("[UPLOAD_PRESIGN]", error);
    return NextResponse.json(
      { error: "Nepodařilo se vytvořit presigned URL." },
      { status: 500 },
    );
  }
}
