import { Metadata } from "next";
import {
  R2_BUCKET_NAME,
  createR2Client,
  displayCacheKey,
  getSignedR2Url,
  getTextObject,
  isOriginalImage,
  listObjects,
  listTripPrefixes,
  objectExists,
} from "@/lib/r2";
import { TripsWorldMap } from "@/components/TripsWorldMap";

export const metadata: Metadata = {
  title: "Blog | Travel Memories",
};

type TripCard = {
  name: string;
  coverUrl: string | null;
  firstDate: string | null;
};

async function getTripsForBlog(client: ReturnType<typeof createR2Client>): Promise<TripCard[]> {
  const tripNames = await listTripPrefixes(client);

  const trips: TripCard[] = [];

  for (const trip of tripNames) {
    const basePrefix = `trips/${trip}/`;
    const summaryPhotosPrefix = `${basePrefix}summary/photos/`;
    const summaryPhotos = await listObjects(client, summaryPhotosPrefix);

    const imagePhotos = summaryPhotos.filter((obj) =>
      isOriginalImage(obj.Key ?? ""),
    );

    // Dny tripu (pro hledání hero v dnech a pro firstDate)
    const dates = new Set<string>();
    const objects = await listObjects(client, basePrefix);
    for (const obj of objects) {
      const key = obj.Key || "";
      const parts = key.replace(basePrefix, "").split("/");
      const maybeDate = parts[0];
      if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
        dates.add(maybeDate);
      }
    }
    const sortedDates = Array.from(dates).sort();
    const firstDate = sortedDates[0] ?? null;

    let coverUrl: string | null = null;

    // 1) Načti filename z hero_photo.json (např. IMG_9384.heic) → basename IMG_9384
    const heroMetaKey = `${basePrefix}summary/outputs/hero_photo.json`;
    if (await objectExists(client, heroMetaKey)) {
      const raw = await getTextObject(client, heroMetaKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { filename?: string };
          const filename = (parsed.filename ?? "").trim();
          if (filename) {
            const basename = filename.replace(/\.[^.]+$/, "");
            // 2–4) Cesta k display v summary: trips/[tripName]/summary/photos/cache/BASENAME_display.jpg
            const summaryDisplayKey = `${basePrefix}summary/photos/cache/${basename}_display.jpg`;
            if (await objectExists(client, summaryDisplayKey)) {
              coverUrl = await getSignedR2Url(client, summaryDisplayKey);
            } else {
              // 5–6) Ve summary není → hledej ve všech dnech
              for (const date of sortedDates) {
                const dayDisplayKey = `${basePrefix}${date}/photos/cache/${basename}_display.jpg`;
                if (await objectExists(client, dayDisplayKey)) {
                  coverUrl = await getSignedR2Url(client, dayDisplayKey);
                  break;
                }
              }
            }
          }
        } catch {
          // ignore invalid JSON
        }
      }
    }

    // 7) Fallback: první dostupná fotka (summary cache nebo první _display z dne)
    if (!coverUrl && imagePhotos[0]?.Key) {
      const key = imagePhotos[0].Key;
      const prefix = key.replace(/[^/]+$/, "");
      const filename = key.split("/").pop() ?? "";
      const dKey = displayCacheKey(prefix, filename);
      if (await objectExists(client, dKey)) {
        coverUrl = await getSignedR2Url(client, dKey);
      }
    }
    if (!coverUrl) {
      const firstDisplay = objects.find((obj) => {
        const key = obj.Key ?? "";
        return (
          key.includes("/photos/cache/") &&
          key.toLowerCase().endsWith("_display.jpg")
        );
      });
      if (firstDisplay?.Key) {
        coverUrl = await getSignedR2Url(client, firstDisplay.Key);
      }
    }

    trips.push({ name: trip, coverUrl, firstDate });
  }

  return trips;
}

export default async function BlogHomePage() {
  if (!R2_BUCKET_NAME) {
    throw new Error("R2 bucket is not configured.");
  }

  const client = createR2Client();

  // Profilová hero fotka
  let heroUrl: string | null = null;
  try {
    heroUrl = await getSignedR2Url(client, "profile/hero.jpg");
  } catch {
    heroUrl = null;
  }

  const trips = await getTripsForBlog(client);

  return (
    <main className="min-h-screen bg-[#050509] text-slate-50">
      {/* Hero */}
      <section className="relative h-[80vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/90 z-10" />
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: heroUrl
              ? `url(${heroUrl})`
              : "radial-gradient(circle at top, #1f2933 0, #020617 60%)",
          }}
        />
        <div className="relative z-20 flex h-full items-center px-6 md:px-12 lg:px-20">
          <div className="max-w-xl space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300/80">
              Travel Memories
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Xarův cestovní deník
            </h1>
            <p className="text-sm text-slate-200/80 sm:text-base">
              Fotky, kilometry a příběhy z cest po horách, oceánech a městech,
              zachycené co nejblíž tomu, jak jsem je doopravdy prožil.
            </p>
          </div>
        </div>
      </section>

      {/* Obsah */}
      <section className="w-full">
        <div className="px-6 py-10 md:px-12 md:py-12 lg:px-20 lg:py-16">
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            {/* Mapa světa */}
            <div className="rounded-3xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-xl shadow-black/40 backdrop-blur">
              <div className="mb-4 flex items-baseline justify-between px-1">
                <h2 className="text-base font-medium text-slate-100">
                  Místa, kam se ukládají vzpomínky
                </h2>
              </div>
              <div className="h-[500px] w-full md:h-[540px]">
                <TripsWorldMap trips={trips.map((t) => t.name)} />
              </div>
            </div>

            {/* Tripy */}
            <div className="space-y-4">
              <h2 className="text-base font-medium text-slate-100">
                Cesty
              </h2>

              {trips.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Zatím tu nejsou žádné tripy. Začni uploadem na stránce{" "}
                  <a
                    href="/upload"
                    className="text-sky-400 underline-offset-2 hover:underline"
                  >
                    upload
                  </a>
                  .
                </p>
              ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {trips.map((trip) => (
                    <a
                      key={trip.name}
                      href={`/blog/${encodeURIComponent(trip.name)}`}
                      className="group overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 shadow-lg shadow-black/40 transition hover:border-sky-500/70 hover:bg-slate-900/80"
                    >
                      <div className="relative h-40 w-full overflow-hidden">
                        {trip.coverUrl ? (
                          <img
                            src={trip.coverUrl}
                            alt={trip.name}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03] group-hover:brightness-110"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-xs text-slate-400">
                            Bez fotky
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-3 left-3 right-3 z-10">
                          {trip.firstDate && (
                            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-200/80">
                              {trip.firstDate}
                            </p>
                          )}
                          <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-50">
                            {trip.name}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

