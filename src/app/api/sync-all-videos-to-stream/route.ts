import {
  createR2Client,
  getObjectBuffer,
  putTextObject,
  listObjects,
  listTripPrefixes,
  objectExists,
} from "@/lib/r2";
import {
  uploadVideoToStream,
  streamMetaKey,
  isVideoKey,
} from "@/lib/cloudflareStream";

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

        for (let i = 0; i < tasks.length; i++) {
          send({
            progress: `Zpracovávám ${i + 1}/${total} videí...`,
            current: i + 1,
            total,
          });

          const task = tasks[i];
          console.log("[SYNC_ALL_VIDEOS] Nahrávám video:", {
            tripName: task.tripName,
            date: task.date,
            filename: task.filename,
            videoKey: task.videoKey,
          });

          const buffer = await getObjectBuffer(client, task.videoKey);
          if (!buffer) {
            console.error("[SYNC_ALL_VIDEOS] Nepodařilo se načíst z R2:", task.videoKey);
            continue;
          }

          try {
            const streamId = await uploadVideoToStream(buffer, task.filename);
            await putTextObject(
              client,
              task.metaKey,
              JSON.stringify({ streamId, filename: task.filename }),
              "application/json",
            );
            uploaded++;
            console.log("[SYNC_ALL_VIDEOS] OK:", task.filename, "→", streamId);
          } catch (err) {
            console.error("[SYNC_ALL_VIDEOS] Upload selhal:", task.filename, {
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            });
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
