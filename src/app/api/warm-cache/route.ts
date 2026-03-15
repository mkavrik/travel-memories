import {
  getCachedDayData,
  getCachedPhotoUrls,
  getCachedTripData,
  getCachedTripDays,
  getTripNames,
} from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ndjsonLine(obj: { message?: string; [key: string]: unknown }): string {
  return JSON.stringify(obj) + "\n";
}

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const tripNames = await getTripNames();
        let tripCount = 0;
        let dayCount = 0;

        for (const tripName of tripNames) {
          controller.enqueue(
            encoder.encode(
              ndjsonLine({
                message: `Warming cache: [${tripName}]...`,
              }),
            ),
          );
          await getCachedTripData(tripName);
          tripCount += 1;

          const days = await getCachedTripDays(tripName);
          for (const { date } of days) {
            controller.enqueue(
              encoder.encode(
                ndjsonLine({
                  message: `Warming cache: [${tripName}/${date}]...`,
                }),
              ),
            );
            await getCachedDayData(tripName, date);
            await getCachedPhotoUrls(tripName, date);
            dayCount += 1;
          }
        }

        controller.enqueue(
          encoder.encode(
            ndjsonLine({
              message: `Cache warming dokončen: ${tripCount} tripů, ${dayCount} dní`,
            }),
          ),
        );
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            ndjsonLine({
              error: String(e instanceof Error ? e.message : e),
            }),
          ),
        );
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
