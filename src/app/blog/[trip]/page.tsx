import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCachedTripData, getCachedTripDays, getCachedPhotoUrls } from "@/lib/cache";
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

export const revalidate = 3600;

type DayCard = {
  date: string;
  coverUrl: string | null;
};

async function getTripData(tripParam: string) {
  const tripName = decodeURIComponent(tripParam);
  const [tripData, days, summaryGalleryPhotos] = await Promise.all([
    getCachedTripData(tripName),
    getCachedTripDays(tripName),
    getCachedPhotoUrls(tripName, "summary"),
  ]);

  if (days.length === 0 && !tripData.summaryText) {
    notFound();
  }

  return {
    tripName,
    heroUrl: tripData.coverUrl,
    summaryText: tripData.summaryText,
    summaryGalleryPhotos: summaryGalleryPhotos.map((p) => ({
      key: p.key,
      url: p.displayUrl,
      displayUrl: p.displayUrl,
    })),
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

