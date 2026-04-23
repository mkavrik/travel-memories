import { NextResponse } from "next/server";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type SectionType = "day" | "summary";

interface FinalizeRequestBody {
  tripName?: string;
  sectionType?: SectionType;
  date?: string | null;
  uploaded?: string[];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FinalizeRequestBody;
    const tripName = body.tripName?.trim();
    const sectionType = body.sectionType;
    const date = body.date ?? null;
    const uploaded = Array.isArray(body.uploaded) ? body.uploaded : [];

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

    try {
      await invalidateCache(
        tripName,
        sectionType === "day" ? date ?? undefined : undefined,
      );
    } catch (e) {
      console.warn("[UPLOAD_FINALIZE] Cache invalidation failed:", e);
    }

    return NextResponse.json(
      { message: "Upload dokončen.", uploaded },
      { status: 200 },
    );
  } catch (error) {
    console.error("[UPLOAD_FINALIZE]", error);
    return NextResponse.json(
      { error: "Nepodařilo se dokončit upload." },
      { status: 500 },
    );
  }
}
