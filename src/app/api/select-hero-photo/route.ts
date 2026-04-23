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

type EmitFn = (obj: Record<string, unknown>) => void;

/** Maximálně 40 fotek pro manuální výběr; pouze ty s existující _thumb.jpg. */
const MAX_MANUAL_PHOTOS = 40;

async function getDayPhotoCandidates(
  tripName: string,
  date: string,
  emit: EmitFn,
) {
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/${date}/`;

  emit({ progress: "Načítám fotky dne…" });
  const photos = await listObjects(client, `${basePrefix}photos/`);

  const imageObjects = photos.filter((obj) =>
    isOriginalImage(obj.Key ?? ""),
  );
  const totalCandidates = Math.min(imageObjects.length, MAX_MANUAL_PHOTOS);

  const withThumb: { key: string; filename: string; url: string }[] = [];
  for (const obj of imageObjects) {
    const key = obj.Key!;
    const thumbKey = buildCacheKey(key, CACHE_SUFFIX_THUMB);
    if (!(await objectExists(client, thumbKey))) continue;
    const url = await getSignedR2Url(client, thumbKey);
    const filename = key.split("/").pop() || key;
    withThumb.push({ key, filename, url });
    emit({
      progress: `Připravuji náhledy ${withThumb.length}/${totalCandidates}…`,
      current: withThumb.length,
      total: totalCandidates,
    });
    if (withThumb.length >= MAX_MANUAL_PHOTOS) break;
  }

  return { client, basePrefix, candidates: withThumb };
}

async function getTripPhotoCandidates(tripName: string, emit: EmitFn) {
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/`;

  emit({ progress: "Načítám dny tripu…" });
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

  // 1) For each day, read hero_photo.json → the chosen day hero photo is a
  //    strong candidate for the trip hero. Always include all day heroes.
  emit({ progress: "Sbírám hero fotky jednotlivých dní…" });
  const dayHeroes: { key: string; filename: string }[] = [];
  const heroFilenames = new Set<string>();
  for (const date of sortedDates) {
    const heroMetaKey = `${basePrefix}${date}/outputs/hero_photo.json`;
    const raw = await getTextObject(client, heroMetaKey);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { filename?: string };
      const filename = parsed.filename?.trim();
      if (!filename) continue;
      const photoKey = `${basePrefix}${date}/photos/${filename}`;
      if (await objectExists(client, photoKey)) {
        dayHeroes.push({ key: photoKey, filename });
        heroFilenames.add(filename);
      }
    } catch {
      /* ignore invalid hero_photo.json */
    }
  }

  // 2) Collect the rest of the photos across summary + all days, excluding
  //    day heroes (already included above).
  emit({ progress: "Sbírám ostatní fotky tripu…" });
  const others: { key: string; filename: string }[] = [];
  const seen = new Set<string>(heroFilenames);

  const summaryPhotos = await listObjects(
    client,
    `${basePrefix}summary/photos/`,
  );
  for (const obj of summaryPhotos) {
    if (!isOriginalImage(obj.Key ?? "")) continue;
    const key = obj.Key!;
    const filename = key.split("/").pop() || key;
    if (seen.has(filename)) continue;
    seen.add(filename);
    others.push({ key, filename });
  }
  for (const date of sortedDates) {
    const photos = await listObjects(client, `${basePrefix}${date}/photos/`);
    for (const obj of photos) {
      if (!isOriginalImage(obj.Key ?? "")) continue;
      const key = obj.Key!;
      const filename = key.split("/").pop() || key;
      if (seen.has(filename)) continue;
      seen.add(filename);
      others.push({ key, filename });
    }
  }

  // 3) Shuffle "others" and take enough to fill up to MAX_MANUAL_PHOTOS total.
  const remainingSlots = Math.max(0, MAX_MANUAL_PHOTOS - dayHeroes.length);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const sample = others.slice(0, remainingSlots);

  // 4) Resolve thumbnails for both pools; day heroes keep their order first,
  //    random sample follows. Entries without a thumbnail are dropped.
  const combined = [...dayHeroes, ...sample];
  const totalCandidates = combined.length;
  const candidates: { key: string; filename: string; url: string }[] = [];
  for (const { key, filename } of combined) {
    const thumbKey = buildCacheKey(key, CACHE_SUFFIX_THUMB);
    if (!(await objectExists(client, thumbKey))) continue;
    const url = await getSignedR2Url(client, thumbKey);
    candidates.push({ key, filename, url });
    emit({
      progress: `Připravuji náhledy ${candidates.length}/${totalCandidates}…`,
      current: candidates.length,
      total: totalCandidates,
    });
  }

  return {
    client,
    basePrefix,
    candidates,
  } as const;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const tripName = (body.tripName || "").trim();
  const date = (body.date || "").trim() || null;
  const scope: Scope = body.scope === "trip" ? "trip" : "day";
  const manualFilename = body.manualFilename?.trim() || null;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit: EmitFn = (obj) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        if (!tripName) {
          emit({ error: "tripName je povinný." });
          return;
        }
        if (scope === "day" && !date) {
          emit({ error: "date je povinné pro výběr hero fotky dne." });
          return;
        }

        if (scope === "day") {
          const { client, basePrefix, candidates } =
            await getDayPhotoCandidates(tripName, date!, emit);

          if (candidates.length === 0) {
            emit({ error: "Pro tento den nejsou v R2 žádné fotky." });
            return;
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
            emit({ progress: "Analyzuji Claudem…" });
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

          emit({ progress: "Ukládám výběr…" });
          const heroKey = `${basePrefix}outputs/hero_photo.json`;
          if (await objectExists(client, heroKey)) {
            await deleteObject(client, heroKey);
          }
          const originalFilename = toOriginalHeroFilename(selection.filename);
          await putTextObject(
            client,
            heroKey,
            JSON.stringify({
              filename: originalFilename,
              reason: selection.reason,
            }),
            "application/json",
          );

          try {
            await invalidateCache(tripName, date ?? undefined);
          } catch (e) {
            console.warn("[SELECT_HERO_PHOTO] Cache invalidation failed:", e);
          }

          const chosen = candidates.find(
            (c) =>
              c.filename === originalFilename ||
              toOriginalHeroFilename(c.filename) === originalFilename,
          );
          const heroUrl = chosen
            ? await getSignedHeroUrl(client, chosen.key)
            : null;

          const previewPhotos = candidates.map((c) => ({
            filename: c.filename,
            url: c.url,
          }));

          emit({
            done: true,
            scope: "day",
            filename: originalFilename,
            reason: selection.reason,
            heroUrl,
            photos: previewPhotos,
          });
          return;
        }

        // scope === "trip"
        const { client, basePrefix, candidates } =
          await getTripPhotoCandidates(tripName, emit);

        if (candidates.length === 0) {
          emit({ error: "Pro tento trip nejsou v R2 žádné fotky." });
          return;
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
          emit({ progress: "Analyzuji Claudem…" });
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

        emit({ progress: "Ukládám výběr…" });
        const heroKey = `${basePrefix}summary/outputs/hero_photo.json`;
        if (await objectExists(client, heroKey)) {
          await deleteObject(client, heroKey);
        }
        const originalFilename = toOriginalHeroFilename(selection.filename);
        await putTextObject(
          client,
          heroKey,
          JSON.stringify({
            filename: originalFilename,
            reason: selection.reason,
          }),
          "application/json",
        );

        try {
          await invalidateCache(tripName);
        } catch (e) {
          console.warn("[SELECT_HERO_PHOTO] Cache invalidation failed:", e);
        }

        const chosen = candidates.find(
          (c) =>
            c.filename === originalFilename ||
            toOriginalHeroFilename(c.filename) === originalFilename,
        );
        const heroUrl = chosen
          ? await getSignedHeroUrl(client, chosen.key)
          : null;

        emit({
          done: true,
          scope: "trip",
          filename: originalFilename,
          reason: selection.reason,
          heroUrl,
          photos: previewPhotos,
        });
      } catch (error: unknown) {
        console.error("[SELECT_HERO_PHOTO] Unexpected error", error);
        emit({
          error:
            error instanceof Error
              ? error.message
              : "Nastala chyba při výběru hero fotky.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}
