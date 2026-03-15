const HERO_SYSTEM_PROMPT = `Jsi fotograf a editor cestovního blogu. 
Vybíráš jednu nejlepší hero fotku.

Kritéria výběru (v pořadí důležitosti):
1. Emocionální síla – fotka musí zaujmout na první pohled
2. Technická kvalita – ostrost, expozice, kompozice
3. Reprezentuje obsah dne/tripu – zachycuje podstatu

Vyber fotku která nejlépe reprezentuje celý trip/den. 
Upřednostni fotky s výraznou krajinou, akcí nebo emocí.
Vyhni se fotkám interiérů, detailů jídla nebo technickým záběrům pokud není nic lepšího.

Vrať POUZE JSON ve formátu:
{
  "hero": "název_souboru.jpg",
  "reason": "krátké zdůvodnění v češtině (1 věta)"
}`;

export type HeroPhotoCandidate = {
  filename: string;
  mediaType: string;
  data: string; // base64-encoded image data
};

export type HeroPhotoSelection = {
  hero: string;
  reason: string;
};

/**
 * Zavolá Claude Sonnet 4.5 Vision a nechá vybrat jednu hero fotku.
 */
export async function selectHeroPhotoWithClaude(params: {
  tripName: string;
  date?: string | null;
  scope: "day" | "trip";
  photos: HeroPhotoCandidate[];
}): Promise<HeroPhotoSelection> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  if (!params.photos.length) {
    throw new Error("No photos provided to hero photo agent.");
  }

  const contextTextLines: string[] = [];
  contextTextLines.push(
    params.scope === "day"
      ? `Trip: ${params.tripName}\nDen: ${params.date ?? ""}`
      : `Trip: ${params.tripName}\nShrnutí celého tripu`,
  );
  contextTextLines.push(
    "K fotkám jsou k dispozici následující soubory (seřazeno podle názvu):",
  );
  for (const p of params.photos) {
    contextTextLines.push(`- ${p.filename}`);
  }
  contextTextLines.push(
    "\nVyber jednu nejlepší hero fotku podle kritérií v systémovém promptu a vrať pouze požadovaný JSON.",
  );

  const userContent: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      }
  > = [
    {
      type: "text",
      text: contextTextLines.join("\n"),
    },
  ];

  for (const photo of params.photos) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: photo.mediaType,
        data: photo.data,
      },
    });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 400,
      system: HERO_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Claude hero photo API failed with status ${response.status}: ${errText}`,
    );
  }

  const data = (await response.json()) as {
    content: { type: string; text?: string }[];
  };

  const textPart = data.content.find((c) => c.type === "text");
  if (!textPart?.text) {
    throw new Error("Claude hero photo response missing text content.");
  }

  const raw = textPart.text.trim();

  // Odstraň případné ```json ... ``` obaly
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse hero photo JSON from Claude: ${(err as Error).message}\nRaw: ${raw}`,
    );
  }

  const obj = parsed as { hero?: string; reason?: string };
  if (!obj.hero || typeof obj.hero !== "string") {
    throw new Error("Claude hero photo JSON missing 'hero' string.");
  }
  if (!obj.reason || typeof obj.reason !== "string") {
    throw new Error("Claude hero photo JSON missing 'reason' string.");
  }

  return {
    hero: obj.hero,
    reason: obj.reason,
  };
}

