import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createR2Client,
  getTextObject,
  putTextObject,
} from "@/lib/r2";
import { createSupabaseServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

type RequestBody = {
  tripName?: string;
  date?: string | null;
  focusY?: number;
};

function clampFocusY(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripName = searchParams.get("tripName")?.trim();
    const date = searchParams.get("date")?.trim() || null;
    if (!tripName) {
      return NextResponse.json(
        { error: "tripName je povinný." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const basePrefix = date
      ? `trips/${tripName}/${date}/`
      : `trips/${tripName}/summary/`;
    const heroKey = `${basePrefix}outputs/hero_photo.json`;
    const raw = await getTextObject(client, heroKey);
    if (!raw) {
      return NextResponse.json({ focusY: 50, exists: false }, { status: 200 });
    }
    try {
      const parsed = JSON.parse(raw) as { focusY?: unknown };
      return NextResponse.json(
        { focusY: clampFocusY(parsed.focusY ?? 50), exists: true },
        { status: 200 },
      );
    } catch {
      return NextResponse.json({ focusY: 50, exists: true }, { status: 200 });
    }
  } catch (error) {
    console.error("[GET_HERO_FOCUS]", error);
    return NextResponse.json(
      { error: "Nastala chyba při načítání pozice hero fotky." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const tripName = (body.tripName ?? "").trim();
    const date = (body.date ?? "").trim() || null;
    const focusY = clampFocusY(body.focusY);

    if (!tripName) {
      return NextResponse.json(
        { error: "tripName je povinný." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const isDay = Boolean(date);
    const basePrefix = isDay
      ? `trips/${tripName}/${date}/`
      : `trips/${tripName}/summary/`;
    const heroKey = `${basePrefix}outputs/hero_photo.json`;

    const existing = await getTextObject(client, heroKey);
    if (!existing) {
      return NextResponse.json(
        { error: "Hero fotka není nastavena — nejdřív ji vyber." },
        { status: 400 },
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "hero_photo.json je poškozený." },
        { status: 500 },
      );
    }

    parsed.focusY = focusY;
    await putTextObject(
      client,
      heroKey,
      JSON.stringify(parsed),
      "application/json",
    );

    // Supabase cache update — rovnou přepíšeme sloupec, ať další request
    // nemusí zpět do R2.
    const supabase = createSupabaseServiceClient();
    if (supabase) {
      if (isDay) {
        await supabase
          .from("days_cache")
          .update({
            cover_focus_y: focusY,
            updated_at: new Date().toISOString(),
          })
          .eq("trip_name", tripName)
          .eq("date", date);
      } else {
        await supabase
          .from("trips_cache")
          .update({
            cover_focus_y: focusY,
            updated_at: new Date().toISOString(),
          })
          .eq("trip_name", tripName);
      }
    }

    // Purge Next.js ISR cache.
    const tripEncoded = encodeURIComponent(tripName);
    if (isDay) {
      revalidatePath(`/blog/${tripEncoded}/${date}`);
    }
    revalidatePath(`/blog/${tripEncoded}`);

    return NextResponse.json({ success: true, focusY }, { status: 200 });
  } catch (error) {
    console.error("[SAVE_HERO_FOCUS]", error);
    return NextResponse.json(
      { error: "Nastala chyba při ukládání pozice hero fotky." },
      { status: 500 },
    );
  }
}
