import { NextResponse } from "next/server";
import {
  createR2Client,
  getTextObject,
  objectExists,
  getSignedR2Url,
  listObjects,
} from "@/lib/r2";
import { buildCacheKey } from "@/lib/photoCache";

export const runtime = "nodejs";

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
      return NextResponse.json(
        { exists: false, error: "Hero fotka není nastavena." },
        { status: 404 },
      );
    }

    let parsed: { filename?: string; focusY?: unknown; reason?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "hero_photo.json je poškozený." },
        { status: 500 },
      );
    }

    const filename = (parsed.filename ?? "").trim();
    if (!filename) {
      return NextResponse.json(
        { error: "hero_photo.json neobsahuje filename." },
        { status: 500 },
      );
    }

    // Display URL — nejprve zkusit cache v dané složce.
    const originalKey = `${basePrefix}photos/${filename}`;
    const displayKey = buildCacheKey(originalKey, "display");
    let heroUrl: string | null = null;
    if (await objectExists(client, displayKey)) {
      heroUrl = await getSignedR2Url(client, displayKey, 3600);
    } else if (!date) {
      // Trip hero může odkazovat na fotku z konkrétního dne.
      // Prohledáme všechny dny tripu a najdeme display verzi.
      const tripPrefix = `trips/${tripName}/`;
      const allObjects = await listObjects(client, tripPrefix);
      const days = new Set<string>();
      for (const obj of allObjects) {
        const rel = (obj.Key ?? "").replace(tripPrefix, "");
        const [d] = rel.split("/");
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) days.add(d);
      }
      for (const d of Array.from(days).sort()) {
        const dayDisplayKey = buildCacheKey(
          `${tripPrefix}${d}/photos/${filename}`,
          "display",
        );
        if (await objectExists(client, dayDisplayKey)) {
          heroUrl = await getSignedR2Url(client, dayDisplayKey, 3600);
          break;
        }
      }
    }

    const focusYRaw = parsed.focusY;
    const focusY =
      typeof focusYRaw === "number" && Number.isFinite(focusYRaw)
        ? Math.max(0, Math.min(100, Math.round(focusYRaw)))
        : 50;

    return NextResponse.json(
      {
        exists: true,
        filename,
        heroUrl,
        focusY,
        reason: parsed.reason ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[GET_HERO]", error);
    return NextResponse.json(
      { error: "Nastala chyba při načítání hero fotky." },
      { status: 500 },
    );
  }
}
