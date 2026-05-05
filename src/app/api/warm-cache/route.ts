import { createSupabaseClient } from "@/lib/supabase";
import {
  getCachedDayData,
  getCachedPhotoUrls,
  getCachedTripData,
  getTripNames,
  getTripSections,
} from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function ndjsonLine(obj: { message?: string; [key: string]: unknown }): string {
  return JSON.stringify(obj) + "\n";
}

/**
 * Force-refresh Supabase cache pro všechny tripy. Smaže řádky,
 * pak nad nimi zavolá getCachedXxx, které je znovu naplní s čerstvými
 * podepsanými R2 URL.
 *
 * Volá se:
 *   - ručně z /upload (POST)
 *   - Vercel cron 1× denně (GET, viz vercel.json)
 */
async function warmCache(): Promise<ReadableStream> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (obj: { message?: string; [key: string]: unknown }) =>
        controller.enqueue(encoder.encode(ndjsonLine(obj)));
      try {
        const supabase = createSupabaseClient();
        const tripNames = await getTripNames();
        let tripCount = 0;
        let dayCount = 0;

        let summaryCount = 0;

        for (const tripName of tripNames) {
          send({ message: `Warming: [${tripName}]…` });

          // Bulk delete VŠECH řádků pro daný trip — bez per-date filtru.
          // Iterovat přes konkrétní `date` hodnoty by neselo, protože
          // `getTripDays` filtruje jen YYYY-MM-DD a řádky s `date='summary'`
          // (nebo cokoli budoucího) by zůstaly se starou expirovanou URL.
          if (supabase) {
            await supabase.from("trips_cache").delete().eq("trip_name", tripName);
            await supabase.from("days_cache").delete().eq("trip_name", tripName);
            await supabase.from("photo_urls_cache").delete().eq("trip_name", tripName);
          }

          await getCachedTripData(tripName);
          tripCount += 1;

          // Sekce, které v R2 reálně existují → repopulujeme přesně je.
          const { days, hasSummary } = await getTripSections(tripName);

          for (const date of days) {
            send({ message: `Warming: [${tripName}/${date}]…` });
            await getCachedDayData(tripName, date);
            await getCachedPhotoUrls(tripName, date);
            dayCount += 1;
          }

          if (hasSummary) {
            send({ message: `Warming: [${tripName}/summary]…` });
            await getCachedPhotoUrls(tripName, "summary");
            summaryCount += 1;
          }
        }

        send({
          message: `Cache warming hotovo: ${tripCount} tripů, ${dayCount} dní, ${summaryCount} summary`,
        });
      } catch (e) {
        send({
          error: String(e instanceof Error ? e.message : e),
        });
      } finally {
        controller.close();
      }
    },
  });
}

function streamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST() {
  return streamResponse(await warmCache());
}

// Vercel Cron posílá GET. Stejné chování jako POST.
export async function GET() {
  return streamResponse(await warmCache());
}
