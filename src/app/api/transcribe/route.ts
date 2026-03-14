import { NextResponse } from "next/server";
import {
  createR2Client,
  getObjectBuffer,
  listObjects,
  putTextObject,
} from "@/lib/r2";

export const runtime = "nodejs";

type SectionType = "day" | "summary";

function buildAudioPrefix(
  tripName: string,
  sectionType: SectionType,
  date: string | null,
): string {
  const safeTripName = tripName.trim();

  if (sectionType === "day") {
    const safeDate = (date || "").trim();
    return `trips/${safeTripName}/${safeDate}/audio/`;
  }

  return `trips/${safeTripName}/summary/audio/`;
}

function buildTranscriptPaths(
  tripName: string,
  sectionType: SectionType,
  date: string | null,
): { rawKey: string; cleanKey: string } {
  const safeTripName = tripName.trim();
  const rawFilename = "prepis_raw.txt";
  const cleanFilename = "prepis_clean.txt";

  if (sectionType === "day") {
    const safeDate = (date || "").trim();
    return {
      rawKey: `trips/${safeTripName}/${safeDate}/outputs/${rawFilename}`,
      cleanKey: `trips/${safeTripName}/${safeDate}/outputs/${cleanFilename}`,
    };
  }

  return {
    rawKey: `trips/${safeTripName}/summary/outputs/${rawFilename}`,
    cleanKey: `trips/${safeTripName}/summary/outputs/${cleanFilename}`,
  };
}

async function cleanTranscriptWithClaude(rawTranscript: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  const systemPrompt =
    "Jsi pečlivý editor přepisů audio nahrávek. Dostaneš surový přepis z modelu Whisper.\n" +
    "Tvůj úkol:\n" +
    "1. Oprav interpunkci, velká písmena a rozděl text do odstavců tak, aby byl dobře čitelný.\n" +
    "2. Místa, která jsou nejistá nebo nesrozumitelná (zjevně nedává smysl, chybí slova apod.), označ pomocí [?] přímo v textu.\n" +
    "3. Neměň obsah, význam ani styl řeči. Nezjemňuj, nepřepisuj do spisovné češtiny, pouze oprav technické nedostatky.\n" +
    "4. Nevkládej vlastní komentáře ani nadpisy, vrať pouze vyčištěný text.";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content:
            "Tady je surový přepis z Whisperu. Vyčisti ho podle instrukcí.\n\n" +
            rawTranscript,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Claude API request failed with status ${response.status}: ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
  };

  const textPart = data.content.find((c) => c.type === "text");
  if (!textPart) {
    throw new Error("Claude API response did not contain text content.");
  }

  return textPart.text.trim();
}

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  filename: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/m4a" });

  formData.append("file", blob, filename);
  formData.append("model", "whisper-1");
  formData.append("response_format", "text");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Whisper API request failed with status ${response.status}: ${errorText}`,
    );
  }

  return await response.text();
}

export async function POST(request: Request) {
  try {
    const client = createR2Client();

    const body = await request.json();
    const tripName = (body.tripName as string | null)?.trim();
    const sectionType = body.sectionType as SectionType | null;
    const date = (body.date as string | null) || null;

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

    const prefix = buildAudioPrefix(tripName, sectionType, date);
    const objects = await listObjects(client, prefix);

    const audioObjects = objects.filter((obj) => {
      const key = (obj.Key || "").toLowerCase();
      return key.endsWith(".m4a") || key.endsWith(".mp3");
    });

    if (audioObjects.length === 0) {
      return NextResponse.json(
        { error: "Pro zadaný den/summary nebyly nalezeny žádné audio soubory." },
        { status: 404 },
      );
    }

    const parts: string[] = [];

    for (const obj of audioObjects) {
      const key = obj.Key;
      if (!key) continue;

      const buffer = await getObjectBuffer(client, key);
      if (!buffer) continue;

      const filename = key.split("/").pop() || "audio.m4a";
      const text = await transcribeWithWhisper(buffer, filename);

      parts.push(`=== ${filename} ===\n${text.trim()}\n`);
    }

    const combinedTranscript = parts.join("\n");
    const { rawKey, cleanKey } = buildTranscriptPaths(tripName, sectionType, date);

    await putTextObject(
      client,
      rawKey,
      combinedTranscript,
      "text/plain; charset=utf-8",
    );

    const cleanedTranscript = await cleanTranscriptWithClaude(combinedTranscript);

    await putTextObject(
      client,
      cleanKey,
      cleanedTranscript,
      "text/plain; charset=utf-8",
    );

    return NextResponse.json(
      {
        message: "Přepis dokončen.",
        rawTranscriptKey: rawKey,
        cleanTranscriptKey: cleanKey,
        audioFiles: audioObjects.map((o) => o.Key),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[TRANSCRIBE_API]", error);
    return NextResponse.json(
      { error: "Nastala chyba při přepisu audia." },
      { status: 500 },
    );
  }
}
