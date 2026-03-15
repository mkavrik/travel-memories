import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCachedDayData,
  getCachedPhotoUrls,
  getCachedTripDays,
} from "@/lib/cache";
import { DayGallery } from "@/components/DayGallery";
import { HeroBackgroundImage } from "@/components/HeroBackgroundImage";
import { VideoGridWithLightbox } from "@/components/VideoGridWithLightbox";
import { MarkdownProse } from "@/components/MarkdownProse";

type Params = {
  trip: string;
  date: string;
};

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const tripName = decodeURIComponent(params.trip);
  const date = decodeURIComponent(params.date);
  return {
    title: `${tripName} – ${date} | Travel Memories`,
  };
}

export const revalidate = 3600;

async function getDayData(tripParam: string, dateParam: string) {
  const tripName = decodeURIComponent(tripParam);
  const date = decodeURIComponent(dateParam);

  const [dayData, photoUrls, daysList] = await Promise.all([
    getCachedDayData(tripName, date),
    getCachedPhotoUrls(tripName, date),
    getCachedTripDays(tripName),
  ]);

  if (!dayData) {
    notFound();
  }

  const dates = daysList.map((d) => d.date);
  const currentIdx = dates.indexOf(date);
  const prevDate = currentIdx > 0 ? dates[currentIdx - 1] : null;
  const nextDate =
    currentIdx >= 0 && currentIdx < dates.length - 1
      ? dates[currentIdx + 1]
      : null;

  const heroBasename = dayData.heroFilename
    ? dayData.heroFilename.replace(/\.[^.]+$/, "")
    : null;

  const galleryPhotos = photoUrls
    .filter((p) => {
      const base = p.key.replace(/_display\.jpg$/i, "").replace(/\.[^.]+$/, "");
      return base !== heroBasename;
    })
    .map((p) => ({
      key: p.key,
      url: p.displayUrl,
      displayUrl: p.displayUrl,
    }));

  return {
    tripName,
    date,
    prevDate,
    nextDate,
    heroUrl: dayData.coverUrl,
    blogPost: dayData.blogPost,
    galleryPhotos,
    mapTrailUrl: dayData.mapTrailUrl,
    mapElevationUrl: dayData.mapElevationUrl,
    trailStats: dayData.trailStats,
    streamVideos: dayData.streamVideos,
  };
}

export default async function DayPage({
  params,
}: {
  params: Params;
}) {
  const {
    tripName,
    date,
    prevDate,
    nextDate,
    heroUrl,
    blogPost,
    galleryPhotos,
    mapTrailUrl,
    mapElevationUrl,
    trailStats,
    streamVideos,
  } = await getDayData(params.trip, params.date);

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
              {tripName}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
              {date}
            </h1>
          </div>
        </div>
      </section>

      {/* Obsah */}
      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8 md:px-8 md:py-10 lg:py-12">
        {/* Breadcrumbs + navigace mezi dny */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <li>
                <a
                  href={`/blog/${encodeURIComponent(tripName)}`}
                  className="text-slate-300 transition hover:text-sky-400"
                >
                  {tripName}
                </a>
              </li>
              <li className="text-slate-600">/</li>
              <li className="text-slate-300">{date}</li>
            </ol>
          </nav>
          {(prevDate || nextDate) && (
            <nav
              aria-label="Navigace mezi dny"
              className="flex items-center gap-2 text-sm"
            >
              {prevDate && (
                <Link
                  href={`/blog/${encodeURIComponent(tripName)}/${encodeURIComponent(prevDate)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-2 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-sky-300"
                  title="Předchozí den"
                >
                  <span aria-hidden>←</span>
                  <span className="hidden sm:inline">{prevDate}</span>
                </Link>
              )}
              {nextDate && (
                <Link
                  href={`/blog/${encodeURIComponent(tripName)}/${encodeURIComponent(nextDate)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/50 px-3 py-2 text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-sky-300"
                  title="Následující den"
                >
                  <span className="hidden sm:inline">{nextDate}</span>
                  <span aria-hidden>→</span>
                </Link>
              )}
            </nav>
          )}
        </div>

        {/* Blog post */}
        <div className="space-y-4">
          <h2 className="text-base font-medium text-slate-100">
            Příběh dne
          </h2>
          <div className="rounded-3xl border border-slate-800/70 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-200 shadow-xl shadow-black/40">
            {blogPost ? (
              <MarkdownProse>{blogPost}</MarkdownProse>
            ) : (
              <p className="text-slate-400">
                Pro tento den zatím není připravený blog post.
              </p>
            )}
          </div>
        </div>

        {/* Fotogalerie */}
        <div className="space-y-4">
          <h2 className="text-base font-medium text-slate-100">Fotky</h2>
          <DayGallery
            primaryUrl={heroUrl}
            date={date}
            photos={galleryPhotos.filter((p) => Boolean(p.url))}
          />
        </div>

        {/* Videa – Cloudflare Stream */}
        {streamVideos.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-medium text-slate-100">Videa</h2>
            <VideoGridWithLightbox videos={streamVideos} />
          </div>
        )}

        {/* Trasa dne – mapa a výškový profil */}
        <div className="space-y-4">
          <h2 className="text-base font-medium text-slate-100">Trasa dne</h2>
          {mapTrailUrl && mapElevationUrl ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/40 shadow-xl shadow-black/40">
                <img
                  src={mapTrailUrl}
                  alt="Mapa trasy"
                  className="w-full object-contain"
                />
              </div>
              <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/40 shadow-xl shadow-black/40">
                <img
                  src={mapElevationUrl}
                  alt="Výškový profil"
                  className="w-full object-contain"
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-3xl border border-dashed border-slate-800/70 bg-slate-900/30 p-6 text-sm text-slate-400">
              Mapa trasy není k dispozici
            </div>
          )}
        </div>

        {/* Statistiky trasy (za mapou a výškovým profilem) */}
        {trailStats && (
          <div className="space-y-4">
            <h2 className="text-base font-medium text-slate-100">
              Statistiky trasy
            </h2>
            <div className="overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/40 shadow-xl shadow-black/40">
              <table className="w-full text-sm text-slate-200">
                <tbody>
                  <tr className="border-b border-slate-800/70">
                    <td className="py-3 pl-5 pr-3 text-slate-400">📍</td>
                    <td className="py-3 pr-5">Celková délka</td>
                    <td className="py-3 pr-5 text-right font-medium">
                      {trailStats.distanceKm.toFixed(1)} km
                    </td>
                  </tr>
                  <tr className="border-b border-slate-800/70">
                    <td className="py-3 pl-5 pr-3 text-slate-400">⬆️</td>
                    <td className="py-3 pr-5">Převýšení nahoru</td>
                    <td className="py-3 pr-5 text-right font-medium">
                      {trailStats.elevationGainM} m
                    </td>
                  </tr>
                  <tr className="border-b border-slate-800/70">
                    <td className="py-3 pl-5 pr-3 text-slate-400">⬇️</td>
                    <td className="py-3 pr-5">Převýšení dolů</td>
                    <td className="py-3 pr-5 text-right font-medium">
                      {trailStats.elevationLossM} m
                    </td>
                  </tr>
                  <tr className="border-b border-slate-800/70">
                    <td className="py-3 pl-5 pr-3 text-slate-400">🏔️</td>
                    <td className="py-3 pr-5">Nejvyšší bod</td>
                    <td className="py-3 pr-5 text-right font-medium">
                      {trailStats.maxEleM} m n.m.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 pl-5 pr-3 text-slate-400">📉</td>
                    <td className="py-3 pr-5">Nejnižší bod</td>
                    <td className="py-3 pr-5 text-right font-medium">
                      {trailStats.minEleM} m n.m.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

