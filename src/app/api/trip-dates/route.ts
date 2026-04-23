import { NextResponse } from "next/server";
import { createR2Client, listObjects } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripName = searchParams.get("tripName")?.trim();
    if (!tripName) {
      return NextResponse.json(
        { error: "tripName je povinný." },
        { status: 400 },
      );
    }
    const client = createR2Client();
    const basePrefix = `trips/${tripName}/`;
    const objects = await listObjects(client, basePrefix);
    const dates = new Set<string>();
    for (const obj of objects) {
      const relative = (obj.Key ?? "").replace(basePrefix, "");
      const [maybeDate] = relative.split("/");
      if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) dates.add(maybeDate);
    }
    const sorted = Array.from(dates).sort();
    return NextResponse.json({ dates: sorted }, { status: 200 });
  } catch (error) {
    console.error("[TRIP_DATES_API]", error);
    return NextResponse.json(
      { error: "Nastala chyba při načítání dnů tripu." },
      { status: 500 },
    );
  }
}
