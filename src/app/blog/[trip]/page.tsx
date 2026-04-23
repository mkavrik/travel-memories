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

function getTripShortName(name: string): string {
  return name
    .replace(/^\d{2}_\d{4}\s*/, "")
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
}

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
    heroFocusY: tripData.coverFocusY,
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
  const { tripName, heroUrl, heroFocusY, summaryText, summaryGalleryPhotos, days } =
    await getTripData(params.trip);

  return (
    <main className="min-h-screen flex flex-col bg-[#050509] text-slate-50 md:h-screen md:overflow-hidden">
      {/* Hero – full width on top */}
      <section className="relative h-[25vh] shrink-0 w-full overflow-hidden md:h-[40vh]">
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/30 via-transparent to-[#050509]" />
        <HeroBackgroundImage
          heroUrl={heroUrl}
          focusY={heroFocusY}
          fallbackGradient="radial-gradient(circle at top, #1f2933 0, #020617 60%)"
        />
        {/* No text overlay — name is in sidebar */}
      </section>

      {/* Below hero: sidebar + content */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sidebar – days list */}
        <aside className="blog-sidebar shrink-0 border-b border-[var(--stroke)] bg-[var(--bg-paper)] md:h-full md:w-[300px] lg:w-[340px] md:overflow-y-auto md:border-b-0 md:border-r md:border-[var(--stroke)]">
          <div className="p-5 md:p-7">
            {/* Header */}
            <div className="mb-5">
              <a href="/blog" className="font-nunito text-xs text-[var(--text-muted)] transition hover:text-[var(--accent-orange)]">
                Xar&apos;s travel
              </a>
              <p className="mt-1 font-dela text-lg text-[var(--ink)]">
                {getTripShortName(tripName)}
              </p>
              <div className="mt-2 h-[2px] w-[50px] bg-[var(--accent-orange)]" />
            </div>

            {/* Day cards */}
            <div className="flex gap-3 overflow-x-auto pb-2 md:flex-col md:gap-2 md:overflow-x-visible md:pb-0">
              {days.length === 0 ? (
                <p className="font-nunito text-sm text-[var(--text-muted)]">
                  Zatím žádné dny.
                </p>
              ) : (
                days.map((day) => (
                  <a
                    key={day.date}
                    href={`/blog/${encodeURIComponent(tripName)}/${encodeURIComponent(day.date)}`}
                    className="trip-card group flex shrink-0 items-center gap-3 rounded-md border border-[var(--stroke)] bg-[var(--card-bg)] px-3 py-3 shadow-[0_2px_8px_var(--shadow-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--shadow-ink)] md:w-full"
                    style={{ minWidth: "180px" }}
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--stroke)]">
                      {day.coverUrl ? (
                        <img
                          src={day.coverUrl}
                          alt={day.date}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[var(--accent-teal)] text-[10px] text-white">
                          {day.date.slice(-2)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-dela text-[0.85rem] leading-tight text-[var(--ink)]">
                        {day.date}
                      </p>
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 md:overflow-y-auto">
          <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-10 md:py-12">
            {/* Breadcrumbs */}
            <nav
              aria-label="Breadcrumb"
              className="font-nunito text-xs text-[var(--text-muted)]"
            >
              <ol className="flex flex-wrap items-center gap-1">
                <li>
                  <a
                    href="/blog"
                    className="transition hover:text-[var(--accent-orange)]"
                  >
                    Blog
                  </a>
                </li>
                <li>/</li>
                <li>{getTripShortName(tripName)}</li>
              </ol>
            </nav>

            {/* Summary */}
            <div className="space-y-4">
              <h2 className="font-dela text-lg text-[var(--ink)]">
                Shrnutí tripu
              </h2>
              <div className="rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)] p-5 font-nunito text-sm leading-relaxed text-slate-200">
                {summaryText ? (
                  <MarkdownProse>{summaryText}</MarkdownProse>
                ) : (
                  <p className="text-slate-400">
                    Pro tento trip zatím není připravený shrnující blog post.
                  </p>
                )}
              </div>
            </div>

            {/* Summary photos */}
            {summaryGalleryPhotos.length > 0 && (
              <div className="space-y-4">
                <h2 className="font-dela text-lg text-[var(--ink)]">Fotky</h2>
                <DayGallery
                  primaryUrl={null}
                  date={tripName}
                  photos={summaryGalleryPhotos}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
