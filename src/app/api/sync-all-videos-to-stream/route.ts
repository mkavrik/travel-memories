import { revalidatePath } from "next/cache";
import {
  createR2Client,
  getSignedR2Url,
  putTextObject,
  listObjects,
  listTripPrefixes,
  objectExists,
} from "@/lib/r2";
import {
  uploadVideoToStreamFromUrl,
  streamMetaKey,
  isVideoKey,
} from "@/lib/cloudflareStream";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

type VideoTask = {
  tripName: string;
  date: string;
  filename: string;
  videoKey: string;
  metaKey: string;
};

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        const client = createR2Client();
        const tripNames = await listTripPrefixes(client);

        const tasks: VideoTask[] = [];

        for (const tripName of tripNames) {
          const basePrefix = `trips/${tripName}/`;
          const allObjects = await listObjects(client, basePrefix);

          const dates = new Set<string>();
          for (const obj of allObjects) {
            const key = obj.Key ?? "";
            const rel = key.replace(basePrefix, "");
            const [maybeDate] = rel.split("/");
            if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) {
              dates.add(maybeDate);
            }
          }

          for (const date of Array.from(dates).sort()) {
            const videoPrefix = `trips/${tripName}/${date}/video/`;
            const videoObjects = await listObjects(client, videoPrefix);

            for (const obj of videoObjects) {
              const key = obj.Key ?? "";
              const filename = key.replace(videoPrefix, "");
              if (!filename || !isVideoKey(filename) || filename.endsWith("_stream.json"))
                continue;

              const metaKey = streamMetaKey(videoPrefix, filename);
              if (await objectExists(client, metaKey)) continue;

              tasks.push({
                tripName,
                date,
                filename,
                videoKey: key,
                metaKey,
              });
            }
          }
        }

        const total = tasks.length;
        let uploaded = 0;
        const touchedDays = new Set<string>();

        for (let i = 0; i < tasks.length; i++) {
          send({
            progress: `Zpracovávám ${i + 1}/${total} videí...`,
            current: i + 1,
            total,
          });

          const task = tasks[i];
          console.log("[SYNC_ALL_VIDEOS] Stream copy:", {
            tripName: task.tripName,
            date: task.date,
            filename: task.filename,
          });

          try {
            const sourceUrl = await getSignedR2Url(client, task.videoKey, 24 * 3600);
            const streamId = await uploadVideoToStreamFromUrl(sourceUrl, task.filename);
            await putTextObject(
              client,
              task.metaKey,
              JSON.stringify({ streamId, filename: task.filename }),
              "application/json",
            );
            uploaded++;
            touchedDays.add(`${task.tripName}::${task.date}`);
            console.log("[SYNC_ALL_VIDEOS] OK:", task.filename, "→", streamId);
          } catch (err) {
            console.error("[SYNC_ALL_VIDEOS] Copy failed:", task.filename, {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        for (const key of Array.from(touchedDays)) {
          const [tripName, date] = key.split("::");
          try {
            await invalidateCache(tripName, date);
            revalidatePath(`/blog/${tripName}/${date}`);
          } catch (e) {
            console.warn("[SYNC_ALL_VIDEOS] Cache invalidation failed:", key, e);
          }
        }

        send({ done: true, uploaded, total });
      } catch (error: unknown) {
        console.error("[SYNC_ALL_VIDEOS_TO_STREAM]", error);
        send({
          error:
            error instanceof Error ? error.message : "Nastala chyba při synchronizaci.",
        });
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
