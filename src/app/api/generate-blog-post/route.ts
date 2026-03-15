import { NextResponse } from "next/server";
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

    const prefix = notesPrefix(tripName, date);
    const objects = await listObjects(client, prefix);

    const noteKeys = objects
      .map((o) => o.Key)
      .filter((key): key is string => {
        if (!key) return false;
        const lower = key.toLowerCase();
        return lower.endsWith(".md") || lower.endsWith(".txt");
      })
      .sort();

    if (noteKeys.length === 0) {
      return NextResponse.json(
        {
          error:
            "Pro zadaný den nebyly nalezeny žádné poznámky (.md nebo .txt ve složce notes).",
        },
        { status: 404 },
      );
    }

    const parts: string[] = [];
    for (const key of noteKeys) {
      const text = await getTextObject(client, key);
      if (text) {
        parts.push(text.trim());
      }
    }

    const notes = parts.join("\n\n");
    if (!notes.trim()) {
      return NextResponse.json(
        { error: "Soubory s poznámkami jsou prázdné." },
        { status: 400 },
      );
    }

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
