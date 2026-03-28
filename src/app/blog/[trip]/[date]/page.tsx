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

function getTripShortName(name: string): string {
  return name
    .replace(/^\d{2}_\d{4}\s*/, "")
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
}

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

  // Build sidebar nav items based on available content
  const sidebarLinks: { label: string; anchor: string }[] = [
    { label: "Příběh dne", anchor: "pribeh" },
    { label: "Fotky", anchor: "fotky" },
  ];
  if (streamVideos.length > 0) {
    sidebarLinks.push({ label: "Videa", anchor: "videa" });
  }
  sidebarLinks.push({ label: "Trasa dne", anchor: "trasa" });
  if (trailStats) {
    sidebarLinks.push({ label: "Statistiky", anchor: "statistiky" });
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#050509] text-slate-50 md:h-screen md:overflow-hidden">
      {/* Hero – full width on top */}
      <section className="relative h-[25vh] shrink-0 w-full overflow-hidden md:h-[40vh]">
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/30 via-transparent to-[#050509]" />
        <HeroBackgroundImage
          heroUrl={heroUrl}
          fallbackGradient="radial-gradient(circle at top, #1f2933 0, #020617 60%)"
        />
        {/* No text overlay — navigation is in sidebar */}
      </section>

      {/* Below hero: sidebar + content */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="blog-sidebar shrink-0 border-b border-[var(--stroke)] bg-[var(--bg-paper)] md:h-full md:w-[260px] lg:w-[300px] md:overflow-y-auto md:border-b-0 md:border-r md:border-[var(--stroke)]">
          <div className="flex h-full flex-col p-5 md:p-7">
            {/* Header */}
            <div className="mb-5">
              <a href="/blog" className="font-nunito text-xs text-[var(--text-muted)] transition hover:text-[var(--accent-orange)]">
                Xar&apos;s travel
              </a>
              <a
                href={`/blog/${encodeURIComponent(tripName)}`}
                className="mt-0.5 block font-nunito text-xs text-[var(--text-muted)] transition hover:text-[var(--accent-orange)]"
              >
                {getTripShortName(tripName)}
              </a>
              <p className="mt-1 font-dela text-lg text-[var(--ink)]">
                {date}
              </p>
              <div className="mt-2 h-[2px] w-[50px] bg-[var(--accent-orange)]" />
            </div>

            {/* Section links */}
            <div className="flex gap-3 overflow-x-auto pb-2 md:flex-col md:gap-2 md:overflow-x-visible md:pb-0">
              {sidebarLinks.map((link) => (
                <a
                  key={link.anchor}
                  href={`#${link.anchor}`}
                  className="trip-card group flex shrink-0 items-center gap-3 rounded-md border border-[var(--stroke)] bg-[var(--card-bg)] px-3 py-3 shadow-[0_2px_8px_var(--shadow-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--shadow-ink)] md:w-full"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-dela text-[0.85rem] leading-tight text-[var(--ink)]">
                      {link.label}
                    </p>
                  </div>
                </a>
              ))}
            </div>

            {/* Prev/next day — pinned to bottom */}
            {(prevDate || nextDate) && (
              <div className="mt-4 flex flex-col gap-2 md:mt-auto md:pt-5">
                {prevDate && (
                  <Link
                    href={`/blog/${encodeURIComponent(tripName)}/${encodeURIComponent(prevDate)}`}
                    className="trip-card group flex shrink-0 items-center gap-3 rounded-md border border-[var(--stroke)] bg-[var(--card-bg)] px-3 py-3 shadow-[0_2px_8px_var(--shadow-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--shadow-ink)] md:w-full"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-nunito text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
                        Předchozí den
                      </p>
                      <p className="font-dela text-[0.85rem] leading-tight text-[var(--ink)]">
                        ← {prevDate}
                      </p>
                    </div>
                  </Link>
                )}
                {nextDate && (
                  <Link
                    href={`/blog/${encodeURIComponent(tripName)}/${encodeURIComponent(nextDate)}`}
                    className="trip-card group flex shrink-0 items-center gap-3 rounded-md border border-[var(--stroke)] bg-[var(--card-bg)] px-3 py-3 shadow-[0_2px_8px_var(--shadow-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--shadow-ink)] md:w-full"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-nunito text-[0.65rem] uppercase tracking-widest text-[var(--text-muted)]">
                        Následující den
                      </p>
                      <p className="font-dela text-[0.85rem] leading-tight text-[var(--ink)]">
                        {nextDate} →
                      </p>
                    </div>
                  </Link>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Main content — scrollable */}
        <div className="flex-1 scroll-smooth md:overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-10 px-6 py-8 md:px-10 md:py-12">
            {/* Blog post */}
            <section id="pribeh" className="scroll-mt-6 space-y-4">
              <h2 className="font-dela text-lg text-[var(--ink)]">
                Příběh dne
              </h2>
              <div className="rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)] p-5 font-nunito text-sm leading-relaxed text-slate-200">
                {blogPost ? (
                  <MarkdownProse>{blogPost}</MarkdownProse>
                ) : (
                  <p className="text-slate-400">
                    Pro tento den zatím není připravený blog post.
                  </p>
                )}
              </div>
            </section>

            {/* Photo gallery */}
            <section id="fotky" className="scroll-mt-6 space-y-4">
              <h2 className="font-dela text-lg text-[var(--ink)]">Fotky</h2>
              <DayGallery
                primaryUrl={heroUrl}
                date={date}
                photos={galleryPhotos.filter((p) => Boolean(p.url))}
              />
            </section>

            {/* Videos */}
            {streamVideos.length > 0 && (
              <section id="videa" className="scroll-mt-6 space-y-4">
                <h2 className="font-dela text-lg text-[var(--ink)]">Videa</h2>
                <VideoGridWithLightbox videos={streamVideos} />
              </section>
            )}

            {/* Trail map */}
            <section id="trasa" className="scroll-mt-6 space-y-4">
              <h2 className="font-dela text-lg text-[var(--ink)]">Trasa dne</h2>
              {mapTrailUrl && mapElevationUrl ? (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)]">
                    <img
                      src={mapTrailUrl}
                      alt="Mapa trasy"
                      className="w-full object-contain"
                    />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)]">
                    <img
                      src={mapElevationUrl}
                      alt="Výškový profil"
                      className="w-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[var(--content-card-bg)] p-6 font-nunito text-sm text-slate-400">
                  Mapa trasy není k dispozici
                </div>
              )}
            </section>

            {/* Trail stats */}
            {trailStats && (
              <section id="statistiky" className="scroll-mt-6 space-y-4">
                <h2 className="font-dela text-lg text-[var(--ink)]">
                  Statistiky trasy
                </h2>
                <div className="overflow-hidden rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)]">
                  <table className="w-full font-nunito text-sm text-slate-200">
                    <tbody>
                      <tr className="border-b border-[var(--content-card-border)]">
                        <td className="py-3 pl-5 pr-3 text-slate-400">📍</td>
                        <td className="py-3 pr-5">Celková délka</td>
                        <td className="py-3 pr-5 text-right font-semibold">
                          {trailStats.distanceKm.toFixed(1)} km
                        </td>
                      </tr>
                      <tr className="border-b border-[var(--content-card-border)]">
                        <td className="py-3 pl-5 pr-3 text-slate-400">⬆️</td>
                        <td className="py-3 pr-5">Převýšení nahoru</td>
                        <td className="py-3 pr-5 text-right font-semibold">
                          {trailStats.elevationGainM} m
                        </td>
                      </tr>
                      <tr className="border-b border-[var(--content-card-border)]">
                        <td className="py-3 pl-5 pr-3 text-slate-400">⬇️</td>
                        <td className="py-3 pr-5">Převýšení dolů</td>
                        <td className="py-3 pr-5 text-right font-semibold">
                          {trailStats.elevationLossM} m
                        </td>
                      </tr>
                      <tr className="border-b border-[var(--content-card-border)]">
                        <td className="py-3 pl-5 pr-3 text-slate-400">🏔️</td>
                        <td className="py-3 pr-5">Nejvyšší bod</td>
                        <td className="py-3 pr-5 text-right font-semibold">
                          {trailStats.maxEleM} m n.m.
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 pl-5 pr-3 text-slate-400">📉</td>
                        <td className="py-3 pr-5">Nejnižší bod</td>
                        <td className="py-3 pr-5 text-right font-semibold">
                          {trailStats.minEleM} m n.m.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
