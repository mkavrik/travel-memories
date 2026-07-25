import { NextResponse } from "next/server";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  createR2Client,
  listObjects,
  getTextObject,
  putTextObject,
  objectExists,
  deleteObject,
} from "@/lib/r2";
import { runBlogPostPipeline } from "@/lib/agents/blogPostAgent";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

const BLOG_POST_FILENAME = "blog_post.txt";
const PREPIS_CLEAN_KEY = "prepis_clean.txt";

function blogPostKey(tripName: string, date: string): string {
  const safeTrip = tripName.trim();
  const safeDate = date.trim();
  return `trips/${safeTrip}/${safeDate}/outputs/${BLOG_POST_FILENAME}`;
}

function notesPrefix(tripName: string, date: string): string {
  const safeTrip = tripName.trim();
  const safeDate = date.trim();
  return `trips/${safeTrip}/${safeDate}/notes/`;
}

/**
 * Sestaví vstup pro blog post agenta z obou zdrojů dne: textové poznámky
 * (notes/*.md|.txt) + přepis audia (outputs/prepis_clean.txt). Každý blok se
 * olabeluje, aby agent rozlišil původ. Selže jen když nejsou žádné vstupy.
 */
async function buildDayBlogInput(
  client: S3Client,
  tripName: string,
  date: string,
): Promise<{ input: string } | { error: string }> {
  const parts: string[] = [];

  // 1. Textové poznámky: trips/[trip]/[date]/notes/*.md|.txt
  const noteObjects = await listObjects(client, notesPrefix(tripName, date));
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
      parts.push("[POZNÁMKY]\n\n" + noteParts.join("\n\n"));
    }
  }

  // 2. Přepis audia: trips/[trip]/[date]/outputs/prepis_clean.txt
  const prepisKey = `trips/${tripName.trim()}/${date.trim()}/outputs/${PREPIS_CLEAN_KEY}`;
  const prepis = await getTextObject(client, prepisKey);
  if (prepis?.trim()) {
    parts.push("[PŘEPIS AUDIA]\n\n" + prepis.trim());
  }

  const input = parts.join("\n\n---\n\n");
  if (!input.trim()) {
    return {
      error:
        "Pro zadaný den nebyly nalezeny žádné vstupy (poznámky ve složce notes ani přepis audia prepis_clean.txt v outputs).",
    };
  }

  return { input };
}

export async function POST(request: Request) {
  try {
    const client = createR2Client();

    const body = await request.json();
    const tripName = (body.tripName as string | null)?.trim();
    const date = (body.date as string | null)?.trim();
    const step = body.step as string | undefined;

    if (!tripName || !date) {
      return NextResponse.json(
        { error: "Název tripu a datum jsou povinné." },
        { status: 400 },
      );
    }

    const key = blogPostKey(tripName, date);

    if (step === "prepare") {
      const existed = await objectExists(client, key);
      if (existed) {
        await deleteObject(client, key);
      }
      return NextResponse.json({ hadExisting: existed }, { status: 200 });
    }

    const inputResult = await buildDayBlogInput(client, tripName, date);
    if ("error" in inputResult) {
      return NextResponse.json({ error: inputResult.error }, { status: 404 });
    }
    const notes = inputResult.input;

    const existedBefore = await objectExists(client, key);
    if (existedBefore) {
      await deleteObject(client, key);
    }

    const { text: blogPostText } = await runBlogPostPipeline({
      notes,
      date,
      tripName,
    });

    await putTextObject(
      client,
      key,
      blogPostText,
      "text/plain; charset=utf-8",
    );

    try {
      await invalidateCache(tripName, date);
    } catch (e) {
      console.warn("[GENERATE_BLOG_POST] Cache invalidation failed:", e);
    }

    return NextResponse.json(
      {
        message: "Blog post byl vygenerován a uložen.",
        blogPostKey: key,
        preview: blogPostText,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("[GENERATE_BLOG_POST]", error);
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Nastala chyba při generování blog postu." },
      { status: 500 },
    );
  }
}
