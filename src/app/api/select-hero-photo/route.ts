import { NextResponse } from "next/server";
import {
  createR2Client,
  deleteObject,
  isOriginalImage,
  listObjects,
  getTextObject,
  putTextObject,
  objectExists,
  getSignedR2Url,
} from "@/lib/r2";
import {
  buildCacheKey,
  CACHE_SUFFIX_THUMB,
  getSignedHeroUrl,
  getAICacheBuffer,
  toOriginalHeroFilename,
} from "@/lib/photoCache";
import {
  selectHeroPhotoWithClaude,
  type HeroPhotoCandidate,
} from "@/lib/agents/heroPhotoAgent";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type Scope = "day" | "trip";

type RequestBody = {
  tripName?: string;
  date?: string | null;
  scope?: Scope;
  manualFilename?: string | null;
};

type HeroMeta = {
  filename: string;
  reason: string;
};

/** Maximálně 40 fotek pro manuální výběr; pouze ty s existující _thumb.jpg. */
const MAX_MANUAL_PHOTOS = 40;

async function getDayPhotoCandidates(
  tripName: string,
  date: string,
) {
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/${date}/`;
  const photos = await listObjects(client, `${basePrefix}photos/`);

  const imageObjects = photos.filter((obj) =>
    isOriginalImage(obj.Key ?? ""),
  );

  const withThumb: { key: string; filename: string; url: string }[] = [];
  for (const obj of imageObjects) {
    const key = obj.Key!;
    const thumbKey = buildCacheKey(key, CACHE_SUFFIX_THUMB);
    if (!(await objectExists(client, thumbKey))) continue;
    const url = await getSignedR2Url(client, thumbKey);
    const filename = key.split("/").pop() || key;
    withThumb.push({ key, filename, url });
    if (withThumb.length >= MAX_MANUAL_PHOTOS) break;
  }

  return { client, basePrefix, candidates: withThumb };
}

async function getTripPhotoCandidates(tripName: string) {
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/`;

  // 1) Fotky ze summary/photos
  const summaryPhotos = await listObjects(
    client,
    `${basePrefix}summary/photos/`,
  );
  const summaryImages = summaryPhotos.filter((obj) =>
    isOriginalImage(obj.Key ?? ""),
  );

  // 2) Fotky ze všech dní (YYYY-MM-DD/photos/*)
  const allObjects = await listObjects(client, basePrefix);
  const dates = new Set<string>();
  for (const obj of allObjects) {
    const key = obj.Key || "";
    const relative = key.replace(basePrefix, "");
    const [maybeDate] = relative.split("/");
    if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
      dates.add(maybeDate);
    }
  }

  const sortedDates = Array.from(dates).sort();
  const dayPhotosByDate: Record<string, { key: string; filename: string }[]> =
    {};

  for (const date of sortedDates) {
    const photos = await listObjects(
      client,
      `${basePrefix}${date}/photos/`,
    );
    const imagePhotos = photos.filter((obj) =>
      isOriginalImage(obj.Key ?? ""),
    );
    if (imagePhotos.length > 0) {
      dayPhotosByDate[date] = imagePhotos.map((obj) => {
        const key = obj.Key!;
        const filename = key.split("/").pop() || key;
        return { key, filename };
      });
    }
  }

  // Sběr všech fotek (summary + dny), deduplikace podle názvu souboru
  const byFilename = new Map<string, { key: string; filename: string }>();
  for (const obj of summaryImages) {
    const key = obj.Key!;
    const filename = key.split("/").pop() || key;
    if (!byFilename.has(filename)) byFilename.set(filename, { key, filename });
  }
  for (const date of sortedDates) {
    const dayList = dayPhotosByDate[date];
    if (!dayList) continue;
    for (const { key, filename } of dayList) {
      if (!byFilename.has(filename)) byFilename.set(filename, { key, filename });
    }
  }

  // Pouze fotky s existující _thumb.jpg, max 40 pro manuální náhled
  const candidates: { key: string; filename: string; url: string }[] = [];
  for (const { key, filename } of Array.from(byFilename.values())) {
    if (candidates.length >= MAX_MANUAL_PHOTOS) break;
    const thumbKey = buildCacheKey(key, CACHE_SUFFIX_THUMB);
    if (!(await objectExists(client, thumbKey))) continue;
    const url = await getSignedR2Url(client, thumbKey);
    candidates.push({ key, filename, url });
  }

  return {
    client,
    basePrefix,
    candidates,
  } as const;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const tripName = (body.tripName || "").trim();
    const date = (body.date || "").trim() || null;
    const scope: Scope = body.scope === "trip" ? "trip" : "day";
    const manualFilename = body.manualFilename?.trim() || null;

    if (!tripName) {
      return NextResponse.json(
        { error: "tripName je povinný." },
        { status: 400 },
      );
    }

    if (scope === "day" && !date) {
      return NextResponse.json(
        { error: "date je povinné pro výběr hero fotky dne." },
        { status: 400 },
      );
    }

    if (scope === "day") {
      const { client, basePrefix, candidates } = await getDayPhotoCandidates(
        tripName,
        date!,
      );

      if (candidates.length === 0) {
        return NextResponse.json(
          { error: "Pro tento den nejsou v R2 žádné fotky." },
          { status: 404 },
        );
      }

      // Omez počet fotek pro Claude na max 10 rovnoměrně rozložených
      const dayCandidates =
        candidates.length <= 10
          ? candidates
          : Array.from({ length: 10 }, (_, i) => {
              const idx = Math.round(
                (i * (candidates.length - 1)) / (10 - 1),
              );
              return candidates[idx];
            });

      const photosForClaude: HeroPhotoCandidate[] = [];
      for (const c of dayCandidates) {
        const outBuffer = await getAICacheBuffer(client, c.key);
        if (!outBuffer) continue;
        photosForClaude.push({
          filename: c.filename,
          mediaType: "image/jpeg",
          data: outBuffer.toString("base64"),
        });
      }

      let selection: HeroMeta;

      if (manualFilename) {
        selection = {
          filename: manualFilename,
          reason: "Manuální výběr uživatelem.",
        };
      } else {
        const aiSelection = await selectHeroPhotoWithClaude({
          tripName,
          date,
          scope: "day",
          photos: photosForClaude,
        });
        selection = {
          filename: aiSelection.hero,
          reason: aiSelection.reason,
        };
      }

      const heroKey = `${basePrefix}outputs/hero_photo.json`;
      if (await objectExists(client, heroKey)) {
        await deleteObject(client, heroKey);
      }
      const originalFilename = toOriginalHeroFilename(selection.filename);
      await putTextObject(
        client,
        heroKey,
        JSON.stringify({ filename: originalFilename, reason: selection.reason }),
        "application/json",
      );

      try {
        await invalidateCache(tripName, date ?? undefined);
      } catch (e) {
        console.warn("[SELECT_HERO_PHOTO] Cache invalidation failed:", e);
      }

      const chosen = candidates.find(
        (c) => c.filename === originalFilename || toOriginalHeroFilename(c.filename) === originalFilename,
      );
      const heroUrl = chosen
        ? await getSignedHeroUrl(client, chosen.key)
        : null;

      const previewPhotos = candidates.map((c) => ({
        filename: c.filename,
        url: c.url,
      }));

      return NextResponse.json(
        {
          scope: "day",
          filename: originalFilename,
          reason: selection.reason,
          heroUrl,
          photos: previewPhotos,
        },
        { status: 200 },
      );
    }

    // scope === "trip"
    const { client, basePrefix, candidates } =
      await getTripPhotoCandidates(tripName);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Pro tento trip nejsou v R2 žádné fotky." },
        { status: 404 },
      );
    }

    const photosForClaude: HeroPhotoCandidate[] = [];
    for (const c of candidates) {
      const outBuffer = await getAICacheBuffer(client, c.key);
      if (!outBuffer) continue;
      photosForClaude.push({
        filename: c.filename,
        mediaType: "image/jpeg",
        data: outBuffer.toString("base64"),
      });
    }

    const previewPhotos = candidates.map((c) => ({
      filename: c.filename,
      url: c.url,
    }));

    let selection: HeroMeta;

    if (manualFilename) {
      selection = {
        filename: manualFilename,
        reason: "Manuální výběr uživatelem.",
      };
    } else {
      const aiSelection = await selectHeroPhotoWithClaude({
        tripName,
        scope: "trip",
        photos: photosForClaude,
      });
      selection = {
        filename: aiSelection.hero,
        reason: aiSelection.reason,
      };
    }

    const heroKey = `${basePrefix}summary/outputs/hero_photo.json`;

    if (await objectExists(client, heroKey)) {
      await deleteObject(client, heroKey);
    }

    const originalFilename = toOriginalHeroFilename(selection.filename);
    await putTextObject(
      client,
      heroKey,
      JSON.stringify({ filename: originalFilename, reason: selection.reason }),
      "application/json",
    );

    try {
      await invalidateCache(tripName);
    } catch (e) {
      console.warn("[SELECT_HERO_PHOTO] Cache invalidation failed:", e);
    }

    const chosen = candidates.find(
      (c) => c.filename === originalFilename || toOriginalHeroFilename(c.filename) === originalFilename,
    );
    const heroUrl = chosen
      ? await getSignedHeroUrl(client, chosen.key)
      : null;

    return NextResponse.json(
      {
        scope: "trip",
        filename: originalFilename,
        reason: selection.reason,
        heroUrl,
        photos: previewPhotos,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[SELECT_HERO_PHOTO] Unexpected error", error);
    return NextResponse.json(
      { error: "Nastala chyba při výběru hero fotky." },
      { status: 500 },
    );
  }
}

