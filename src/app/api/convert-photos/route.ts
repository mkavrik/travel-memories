import { createR2Client, isOriginalImage, listObjects } from "@/lib/r2";
import { ensureAllCaches } from "@/lib/photoCache";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type RequestBody = {
  tripName?: string;
  date?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const tripName = (body.tripName ?? "").trim();
    const date = (body.date ?? "").trim() || null;

    if (!tripName) {
      return new Response(
        JSON.stringify({ error: "tripName je povinný." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const client = createR2Client();
    // date === 'summary' → summary fotky; jinak konkrétní den
    const prefix =
      date === "summary" || !date
        ? `trips/${tripName}/summary/photos/`
        : `trips/${tripName}/${date}/photos/`;
    const objects = await listObjects(client, prefix);
    const imageKeys = objects
      .filter((obj) => isOriginalImage(obj.Key ?? ""))
      .map((obj) => obj.Key!);

    if (imageKeys.length === 0) {
      return new Response(
        JSON.stringify({
          message: "Žádné fotky k konverzi (.heic, .jpg, .jpeg, .png).",
          converted: 0,
          total: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const total = imageKeys.length;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(
            encoder.encode(JSON.stringify(data) + "\n"),
          );
        };

        for (let i = 0; i < imageKeys.length; i++) {
          send({
            progress: `Konvertuji ${i + 1}/${total} fotek...`,
            current: i + 1,
            total,
          });
          try {
            await ensureAllCaches(client, imageKeys[i]);
          } catch (err) {
            console.error("[convert-photos]", imageKeys[i], err);
            send({
              error: `Chyba u ${imageKeys[i].split("/").pop()}: ${(err as Error).message}`,
            });
          }
        }
        try {
          await invalidateCache(
            tripName,
            date === "summary" || !date ? undefined : date,
          );
        } catch (e) {
          console.warn("[CONVERT_PHOTOS] Cache invalidation failed:", e);
        }
        send({ done: true, converted: total, total });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    console.error("[CONVERT_PHOTOS] Unexpected error", error);
    return new Response(
      JSON.stringify({ error: "Nastala chyba při konverzi fotek." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
