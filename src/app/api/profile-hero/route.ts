import { NextResponse } from "next/server";
import { createR2Client, putObjectBuffer } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("hero") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Musíš vybrat jednu fotku." },
        { status: 400 },
      );
    }

    const client = createR2Client();
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = "profile/hero.jpg";

    await putObjectBuffer(client, key, buffer, file.type || "image/jpeg");

    return NextResponse.json(
      { message: "Profilová hero fotka byla nahrána.", key },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[PROFILE_HERO_API]", error);
    return NextResponse.json(
      { error: "Nastala chyba při uploadu profilové fotky." },
      { status: 500 },
    );
  }
}
