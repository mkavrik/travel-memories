import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  R2_BUCKET_NAME,
  createR2Client,
  displayCacheKey,
  getSignedR2Url,
  getTextObject,
  isOriginalImage,
  listObjects,
  objectExists,
} from "@/lib/r2";
import { HeroBackgroundImage } from "@/components/HeroBackgroundImage";
import { DayGallery } from "@/components/DayGallery";
import { MarkdownProse } from "@/components/MarkdownProse";

type Params = {
  trip: string;
};

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const tripName = decodeURIComponent(params.trip);
  return {
    title: `${tripName} | Travel Memories`,
  };
}

type DayCard = {
  date: string;
  coverUrl: string | null;
};

async function getTripData(tripParam: string) {
  const client = createR2Client();
  const tripName = decodeURIComponent(tripParam);
  const basePrefix = `trips/${tripName}/`;

  if (!R2_BUCKET_NAME) {
    throw new Error("R2 bucket is not configured.");
  }

  const allObjects = await listObjects(client, basePrefix);
  if (allObjects.length === 0) {
    notFound();
  }

  // Dates (pro hero fallback do dní a pro day cards)
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

  const heroMetaKey = `trips/${tripName}/summary/outputs/hero_photo.json`;
  const heroMetaExists = await objectExists(client, heroMetaKey);

  const summaryPhotos = await listObjects(
    client,
    `${basePrefix}summary/photos/`,
  );
  const imagePhotos = summaryPhotos.filter((obj) =>
    isOriginalImage(obj.Key ?? ""),
  );

  let heroUrl: string | null = null;
  if (heroMetaExists) {
    const rawHero = await getTextObject(client, heroMetaKey);
    if (rawHero) {
      try {
        const parsed = JSON.parse(rawHero) as {
          filename?: string;
          reason?: string;
        };
        if (parsed.filename) {
          const want = parsed.filename.toLowerCase();
          // 1) Hledat v summary/photos/
          let heroObj = imagePhotos.find((obj) =>
            (obj.Key || "").toLowerCase().endsWith(`/${want}`),
          );
          // 2) Pokud nenalezeno, hledat v trips/[tripName]/[date]/photos/
          if (!heroObj?.Key && sortedDates.length > 0) {
            for (const date of sortedDates) {
              const dayPhotos = await listObjects(
                client,
                `${basePrefix}${date}/photos/`,
              );
              heroObj = dayPhotos.find((obj) =>
                (obj.Key || "").toLowerCase().endsWith(`/${want}`),
              );
              if (heroObj?.Key) break;
            }
          }
          if (heroObj?.Key) {
            const key = heroObj.Key;
            const photosPrefix = key.replace(/[^/]+$/, "");
            const filename = key.split("/").pop() ?? "";
            const dKey = displayCacheKey(photosPrefix, filename);
            if (await objectExists(client, dKey)) {
              heroUrl = await getSignedR2Url(client, dKey);
            }
          }
        }
      } catch (e) {
        console.warn("[blog trip] invalid hero_photo.json:", e);
      }
    }
  }

  if (!heroUrl && imagePhotos[0]?.Key) {
    const key = imagePhotos[0].Key;
    const photosPrefix = key.replace(/[^/]+$/, "");
    const filename = key.split("/").pop() ?? "";
    const dKey = displayCacheKey(photosPrefix, filename);
    if (await objectExists(client, dKey)) {
      heroUrl = await getSignedR2Url(client, dKey);
    }
  }

  // Summary text
  const summaryTextKey = `${basePrefix}summary/outputs/blog_post.txt`;
  const summaryText = (await getTextObject(client, summaryTextKey)) ?? null;

  // Summary fotky: trips/[tripName]/summary/photos/cache/*_display.jpg
  const summaryCachePrefix = `${basePrefix}summary/photos/cache/`;
  const summaryCacheObjects = await listObjects(client, summaryCachePrefix);
  const summaryDisplayKeys = summaryCacheObjects
    .filter((obj) => (obj.Key ?? "").toLowerCase().endsWith("_display.jpg"))
    .map((obj) => obj.Key as string);
  const byBase = new Map<string, string>();
  for (const key of summaryDisplayKeys) {
    const filename = key.split("/").pop() ?? "";
    const base = filename.replace(/_display\.jpg$/i, "");
    if (!byBase.has(base)) byBase.set(base, key);
  }
  const summaryGalleryPhotos = await Promise.all(
    Array.from(byBase.values()).map(async (displayKey) => {
      const url = await getSignedR2Url(client, displayKey);
      return { key: displayKey, url, displayUrl: url };
    }),
  );

  // Days: ikonka = hero fotka dne (_display.jpg) nebo první _display.jpg z dne
  const days: DayCard[] = [];

  for (const date of sortedDates) {
    const dayPrefix = `${basePrefix}${date}/`;
    const dayHeroKey = `${dayPrefix}outputs/hero_photo.json`;
    let coverUrl: string | null = null;

    if (await objectExists(client, dayHeroKey)) {
      const raw = await getTextObject(client, dayHeroKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { filename?: string };
          const filename = (parsed.filename ?? "").trim();
          if (filename) {
            const dKey = displayCacheKey(`${dayPrefix}photos/`, filename);
            if (await objectExists(client, dKey)) {
              coverUrl = await getSignedR2Url(client, dKey);
            }
          }
        } catch {
          // ignore invalid JSON
        }
      }
    }

    if (!coverUrl) {
      const dayPhotos = await listObjects(client, `${dayPrefix}photos/`);
      const firstDisplay = dayPhotos.find(
        (obj) =>
          (obj.Key ?? "").includes("/cache/") &&
          (obj.Key ?? "").toLowerCase().endsWith("_display.jpg"),
      );
      if (firstDisplay?.Key) {
        coverUrl = await getSignedR2Url(client, firstDisplay.Key);
      }
    }

    days.push({ date, coverUrl });
  }

  return {
    tripName,
    heroUrl,
    summaryText,
    summaryGalleryPhotos,
    days,
  };
}

export default async function TripPage({
  params,
}: {
  params: Params;
}) {
  const { tripName, heroUrl, summaryText, summaryGalleryPhotos, days } =
    await getTripData(params.trip);

  return (
    <main className="min-h-screen bg-[#050509] text-slate-50">
      {/* Hero – portrait fotky: object-fit contain, object-position center */}
      <section className="relative h-[60vh] w-full overflow-hidden">
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/60 via-black/40 to-black/90" />
        <HeroBackgroundImage
          heroUrl={heroUrl}
          fallbackGradient="radial-gradient(circle at top, #1f2933 0, #020617 60%)"
        />
        <div className="relative z-20 flex h-full items-end px-6 pb-10 md:px-12 lg:px-20">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-200/80">
              Trip
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {tripName}
            </h1>
          </div>
        </div>
      </section>

      {/* Obsah */}
      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8 md:px-8 md:py-10 lg:py-12">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="text-xs font-medium text-slate-400"
        >
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <a
                href="/blog"
                className="text-slate-300 transition hover:text-sky-400"
              >
                Blog
              </a>
            </li>
            <li className="text-slate-600">/</li>
            <li className="text-slate-300">{tripName}</li>
          </ol>
        </nav>

        {/* Summary */}
        <div className="space-y-4">
          <h2 className="text-base font-medium text-slate-100">Shrnutí tripu</h2>
          <div className="rounded-3xl border border-slate-800/70 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-200 shadow-xl shadow-black/40">
            {summaryText ? (
              <MarkdownProse>{summaryText}</MarkdownProse>
            ) : (
              <p className="text-slate-400">
                Pro tento trip zatím není připravený shrnující blog post.
              </p>
            )}
          </div>
        </div>

        {/* Fotky (summary) */}
        {summaryGalleryPhotos.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-medium text-slate-100">Fotky</h2>
            <DayGallery
              primaryUrl={null}
              date={tripName}
              photos={summaryGalleryPhotos}
            />
          </div>
        )}

        {/* Dny */}
        <div className="space-y-4">
          <h2 className="text-base font-medium text-slate-100">
            Jednotlivé dny
          </h2>
          {days.length === 0 ? (
            <p className="text-sm text-slate-400">
              Zatím nejsou k dispozici žádné dny pro tento trip.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {days.map((day) => (
                <a
                  key={day.date}
                  href={`/blog/${encodeURIComponent(
                    tripName,
                  )}/${encodeURIComponent(day.date)}`}
                  className="group overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 shadow-lg shadow-black/40 transition hover:border-sky-500/70 hover:bg-slate-900/80"
                >
                  <div className="relative h-32 w-full overflow-hidden">
                    {day.coverUrl ? (
                      <img
                        src={day.coverUrl}
                        alt={day.date}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03] group-hover:brightness-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-xs text-slate-400">
                        Bez fotky
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 z-10">
                      <p className="text-[11px] font-medium uppercase tracking-[0.25em] text-slate-200/80">
                        {day.date}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

