import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase";
import {
  getCachedDayData,
  getCachedPhotoUrls,
  getCachedTripData,
  getTripNamesStaleFirst,
  getTripSections,
} from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Kdy přestat brát další trip. Vercel funkci po `maxDuration` tvrdě zabije
 * uprostřed práce; radši skončíme řízeně a nahlásíme, co zbylo. Rezerva
 * pokrývá dojetí posledního rozdělaného tripu.
 */
const DEADLINE_MS = (maxDuration - 45) * 1000;

/** Souběžnost dnů v rámci jednoho tripu. */
const DAY_CONCURRENCY = 3;

function ndjsonLine(obj: { message?: string; [key: string]: unknown }): string {
  return JSON.stringify(obj) + "\n";
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        await fn(items[i]);
      }
    }),
  );
}

/**
 * Force-refresh Supabase cache pro všechny tripy. Smaže řádky,
 * pak nad nimi zavolá getCachedXxx, které je znovu naplní s čerstvými
 * podepsanými R2 URL.
 *
 * Volá se:
 *   - ručně z /upload (POST)
 *   - Vercel cron 1× denně (GET, viz vercel.json)
 *
 * Tripy jdou v pořadí od nejdéle neobnoveného (`getTripNamesStaleFirst`),
 * takže případný timeout nepostihne opakovaně ten samý trip — nedokončený
 * trip je příští běh naopak první na řadě.
 *
 * `?trip=<název>` omezí běh na jeden trip — pro cílenou opravu, když
 * nechceš čekat na celý cyklus.
 */
async function warmCache(onlyTrip?: string | null): Promise<ReadableStream> {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  return new ReadableStream({
    async start(controller) {
      const send = (obj: { message?: string; [key: string]: unknown }) =>
        controller.enqueue(encoder.encode(ndjsonLine(obj)));
      try {
        const supabase = createSupabaseServiceClient();
        const allTrips = await getTripNamesStaleFirst();
        const tripNames = onlyTrip
          ? allTrips.filter((t) => t === onlyTrip)
          : allTrips;

        if (onlyTrip && tripNames.length === 0) {
          send({ error: `Trip nenalezen v R2: ${onlyTrip}` });
          controller.close();
          return;
        }

        let tripCount = 0;
        let dayCount = 0;
        let summaryCount = 0;
        const skipped: string[] = [];

        for (const tripName of tripNames) {
          if (Date.now() - startedAt > DEADLINE_MS) {
            skipped.push(tripName);
            continue;
          }
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

          await mapLimit(days, DAY_CONCURRENCY, async (date) => {
            send({ message: `Warming: [${tripName}/${date}]…` });
            await getCachedDayData(tripName, date);
            await getCachedPhotoUrls(tripName, date);
            dayCount += 1;
          });

          if (hasSummary) {
            send({ message: `Warming: [${tripName}/summary]…` });
            // Trip page čte obojí — bez getCachedDayData by bulk delete výše
            // nechal summary řádek v days_cache smazaný a první návštěvník
            // po cronu by platil cold load z R2.
            await Promise.all([
              getCachedPhotoUrls(tripName, "summary"),
              getCachedDayData(tripName, "summary"),
            ]);
            summaryCount += 1;
          }

          // Flush ISR cache pro stránky tripu — jinak Next.js dál servíruje
          // cached HTML s podepsanými URL z předchozího renderu (i když
          // Supabase už má čerstvé). Trip page má `revalidate = 3600`,
          // takže bez explicitní revalidace by stale HTML žil až hodinu.
          const tripEncoded = encodeURIComponent(tripName);
          revalidatePath(`/blog/${tripEncoded}`);
          for (const date of days) {
            revalidatePath(`/blog/${tripEncoded}/${date}`);
          }
          // Seznam tripů na /blog nese cover URL každého tripu — bez tohohle
          // by úvodní stránka držela staré (expirované) ikonky až hodinu.
          revalidatePath("/blog");
        }

        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        send({
          message:
            `Cache warming hotovo za ${elapsed} s: ${tripCount} tripů, ` +
            `${dayCount} dní, ${summaryCount} summary` +
            (skipped.length
              ? ` — kvůli časovému limitu přeskočeno: ${skipped.join(", ")} ` +
                `(příští běh je vezme jako první)`
              : ""),
          skipped,
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

export async function POST(request: Request) {
  const trip = new URL(request.url).searchParams.get("trip");
  return streamResponse(await warmCache(trip));
}

// Vercel Cron posílá GET. Stejné chování jako POST.
export async function GET(request: Request) {
  const trip = new URL(request.url).searchParams.get("trip");
  return streamResponse(await warmCache(trip));
}
