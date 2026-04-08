import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createR2Client, putTextObject } from "@/lib/r2";
import { createSupabaseServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    tripName?: string;
    date?: string;
    content?: string;
  };

  const { tripName, date, content } = body;

  if (!tripName || !date || content == null) {
    return NextResponse.json(
      { error: "tripName, date, and content are required" },
      { status: 400 },
    );
  }

  const isSummary = date === "summary";
  const key = isSummary
    ? `trips/${tripName}/summary/outputs/blog_post.txt`
    : `trips/${tripName}/${date}/outputs/blog_post.txt`;

  const client = createR2Client();
  await putTextObject(client, key, content, "text/plain; charset=utf-8");

  // Directly update cache instead of delete+hope-for-miss
  const supabase = createSupabaseServiceClient();
  if (supabase) {
    if (isSummary) {
      await supabase
        .from("trips_cache")
        .update({ summary_text: content, updated_at: new Date().toISOString() })
        .eq("trip_name", tripName);
    } else {
      await supabase
        .from("days_cache")
        .update({ blog_post: content, updated_at: new Date().toISOString() })
        .eq("trip_name", tripName)
        .eq("date", date);
    }
  }

  // Purge Next.js full route cache so the blog page re-renders
  const tripEncoded = encodeURIComponent(tripName);
  if (isSummary) {
    revalidatePath(`/blog/${tripEncoded}`);
  } else {
    revalidatePath(`/blog/${tripEncoded}/${date}`);
  }

  return NextResponse.json({ success: true });
}
