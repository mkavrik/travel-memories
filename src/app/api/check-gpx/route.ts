import { NextResponse } from "next/server";
import { createR2Client, listObjects } from "@/lib/r2";

export const runtime = "nodejs";

function mapPrefix(tripName: string, date: string): string {
  return `trips/${tripName.trim()}/${date.trim()}/map/`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripName = searchParams.get("tripName")?.trim();
    const date = searchParams.get("date")?.trim();

    if (!tripName || !date) {
      return NextResponse.json(
        { error: "tripName a date jsou povinné." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const prefix = mapPrefix(tripName, date);
    const objects = await listObjects(client, prefix);
    const hasGpx = objects.some((o) => {
      const k = (o.Key ?? "").toLowerCase();
      return k.endsWith(".gpx");
    });

    return NextResponse.json({ hasGpx }, { status: 200 });
  } catch (error) {
    console.error("[CHECK_GPX]", error);
    return NextResponse.json(
      { error: "Nepodařilo se zkontrolovat GPX." },
      { status: 500 },
    );
  }
}
