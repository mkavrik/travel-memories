import { NextResponse } from "next/server";
import { createR2Client, listTripPrefixes } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET() {
  try {
    const client = createR2Client();
    const trips = (await listTripPrefixes(client)).sort((a, b) =>
      a.localeCompare(b, "cs"),
    );
    return NextResponse.json({ trips }, { status: 200 });
  } catch (error: unknown) {
    console.error("[TRIPS_API]", error);
    return NextResponse.json(
      { error: "Nastala chyba při načítání seznamu tripů." },
      { status: 500 },
    );
  }
}
