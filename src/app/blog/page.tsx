import { Metadata } from "next";
import dynamic from "next/dynamic";
import { R2_BUCKET_NAME } from "@/lib/r2";
import { getTripNames, getCachedTripData } from "@/lib/cache";
import { getCoordsForTrip } from "@/lib/tripCoords";

const TripGlobe = dynamic(() => import("@/components/TripGlobe"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse bg-[#050509]" />
  ),
});

export const metadata: Metadata = {
  title: "Blog | Travel Memories",
};

export const revalidate = 3600;

type TripCard = {
  name: string;
  coverUrl: string | null;
  firstDate: string | null;
};

function getTripShortName(name: string): string {
  return name
    .replace(/^\d{2}_\d{4}\s*/, "")
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

async function getTripsForBlog(): Promise<TripCard[]> {
  const tripNames = await getTripNames();
  const trips: TripCard[] = await Promise.all(
    tripNames.map(async (name) => {
      const data = await getCachedTripData(name);
      return {
        name,
        coverUrl: data.coverUrl,
        firstDate: data.firstDate,
      };
    }),
  );
  return trips;
}

export default async function BlogHomePage() {
  if (!R2_BUCKET_NAME) {
    throw new Error("R2 bucket is not configured.");
  }

  const trips = await getTripsForBlog();

  return (
    <main className="min-h-screen bg-[#050509] text-slate-50 md:h-screen md:overflow-hidden">
      {/* Mobile: stacked layout, Desktop: sidebar + globe */}
      <div className="flex flex-col md:h-full md:flex-row">
        {/* Sidebar */}
        <aside className="blog-sidebar shrink-0 border-b border-[var(--stroke)] bg-[var(--bg-paper)] md:h-full md:w-[300px] lg:w-[340px] md:overflow-y-auto md:border-b-0 md:border-r md:border-[var(--stroke)]">
          <div className="p-5 md:p-7">
            {/* Header */}
            <div className="mb-6">
              <h1 className="font-dela text-xl text-[var(--ink)] md:text-[1.4rem]">
                Xar&apos;s travel
              </h1>
              <div className="mt-2 h-[2px] w-[50px] bg-[var(--accent-orange)]" />
              <p className="mt-3 font-nunito text-xs text-[var(--text-muted)]">
                Cestovní deník kolem světa
              </p>
            </div>

            {/* Trip cards */}
            <div className="flex gap-3 overflow-x-auto pb-2 md:flex-col md:gap-2 md:overflow-x-visible md:pb-0">
              {trips.length === 0 ? (
                <p className="font-nunito text-sm text-[var(--text-muted)]">
                  Zatím žádné cesty.
                </p>
              ) : (
                trips.map((trip, i) => (
                  <a
                    key={trip.name}
                    href={`/blog/${encodeURIComponent(trip.name)}`}
                    className="trip-card group flex shrink-0 items-center gap-3 rounded-md border border-[var(--stroke)] bg-[var(--card-bg)] px-3 py-3 shadow-[0_2px_8px_var(--shadow-ink)] transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--shadow-ink)] md:w-full"
                    style={{ minWidth: "200px" }}
                  >
                    {/* Photo thumbnail */}
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--stroke)]">
                      {trip.coverUrl ? (
                        <img
                          src={trip.coverUrl}
                          alt={getTripShortName(trip.name)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-full w-full items-center justify-center text-[10px] text-white"
                          style={{
                            backgroundColor:
                              i % 2 === 0
                                ? "var(--accent-orange)"
                                : "var(--accent-teal)",
                          }}
                        >
                          {getTripShortName(trip.name).charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <p className="font-dela text-[0.85rem] leading-tight text-[var(--ink)]">
                        {getTripShortName(trip.name)}
                      </p>
                      {trip.firstDate && (
                        <p className="mt-0.5 font-nunito text-[0.7rem] text-[var(--text-muted)]">
                          {trip.firstDate}
                        </p>
                      )}
                    </div>
                  </a>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Globe */}
        <div className="relative h-[70vh] flex-1 bg-[#050509] md:h-auto">
          <TripGlobe
            trips={trips.map((t, i) => ({
              name: t.name,
              ...getCoordsForTrip(t.name),
              coverUrl: t.coverUrl,
              color: (i % 2 === 0 ? "orange" : "teal") as "orange" | "teal",
            }))}
          />
        </div>
      </div>
    </main>
  );
}
