import {
  createR2Client,
  listObjects,
  getTextObject,
  putTextObject,
  objectExists,
  deleteObject,
} from "@/lib/r2";
import type { S3Client } from "@aws-sdk/client-s3";
import { runTripSummaryPipeline } from "@/lib/agents/tripSummaryAgent";

export const runtime = "nodejs";

const BLOG_POST_FILENAME = "blog_post.txt";
const PREPIS_CLEAN_KEY = "prepis_clean.txt";

function summaryBlogPostKey(tripName: string): string {
  const safe = tripName.trim();
  return `trips/${safe}/summary/outputs/${BLOG_POST_FILENAME}`;
}

function summaryNotesPrefix(tripName: string): string {
  const safe = tripName.trim();
  return `trips/${safe}/summary/notes/`;
}

/**
 * Načte surové vstupy ze summary: poznámky (notes) + přepis audia.
 * Blog posty jednotlivých dní se nepředávají — agent pracuje jen s poznámkami.
 */
async function buildTripSummaryInput(
  client: S3Client,
  tripName: string,
): Promise<{ input: string } | { error: string }> {
  const parts: string[] = [];

  // 1. Poznámky summary: trips/[tripName]/summary/notes/*.md
  const notesPrefix = summaryNotesPrefix(tripName);
  const noteObjects = await listObjects(client, notesPrefix);
  const noteKeys = noteObjects
    .map((o) => o.Key)
    .filter((key): key is string => {
      if (!key) return false;
      const lower = key.toLowerCase();
      return lower.endsWith(".md") || lower.endsWith(".txt");
    })
    .sort();

  if (noteKeys.length > 0) {
    const noteParts: string[] = [];
    for (const key of noteKeys) {
      const text = await getTextObject(client, key);
      if (text?.trim()) noteParts.push(text.trim());
    }
    if (noteParts.length > 0) {
      parts.push("[POZNÁMKY SUMMARY]\n\n" + noteParts.join("\n\n"));
    }
  }

  // 2. Přepis audia: trips/[tripName]/summary/outputs/prepis_clean.txt
  const prepisKey = `trips/${tripName.trim()}/summary/outputs/${PREPIS_CLEAN_KEY}`;
  const prepis = await getTextObject(client, prepisKey);
  if (prepis?.trim()) {
    parts.push("[PŘEPIS AUDIA SUMMARY]\n\n" + prepis.trim());
  }

  const input = parts.join("\n\n---\n\n");
  if (!input.trim()) {
    return {
      error:
        "Žádné vstupní materiály (poznámky summary nebo přepis audia).",
    };
  }

  return { input };
}

export async function POST(request: Request) {
  let body: { tripName?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Neplatné JSON tělo požadavku." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const tripName = (body.tripName as string | null)?.trim();
  if (!tripName) {
    return new Response(
      JSON.stringify({ error: "Název tripu je povinný." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        send({ phase: "loading" });

        const client = createR2Client();
          const inputResult = await buildTripSummaryInput(client, tripName);
        if ("error" in inputResult) {
          send({ error: inputResult.error });
          controller.close();
          return;
        }

        const key = summaryBlogPostKey(tripName);

        if (await objectExists(client, key)) {
          await deleteObject(client, key);
        }

        send({ phase: "generating" });

        const result = await runTripSummaryPipeline({
          input: inputResult.input,
          tripName,
        });

        await putTextObject(
          client,
          key,
          result.text,
          "text/plain; charset=utf-8",
        );

        send({
          phase: "done",
          preview: result.text,
          blogPostKey: key,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Nastala chyba při generování.";
        send({ error: message });
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
