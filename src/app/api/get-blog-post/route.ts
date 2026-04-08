import { NextRequest, NextResponse } from "next/server";
import { createR2Client, getTextObject } from "@/lib/r2";

export async function GET(req: NextRequest) {
  const tripName = req.nextUrl.searchParams.get("tripName");
  const date = req.nextUrl.searchParams.get("date");

  if (!tripName || !date) {
    return NextResponse.json(
      { error: "tripName and date are required" },
      { status: 400 },
    );
  }

  const isSummary = date === "summary";
  const key = isSummary
    ? `trips/${tripName}/summary/outputs/blog_post.txt`
    : `trips/${tripName}/${date}/outputs/blog_post.txt`;

  const client = createR2Client();
  const content = await getTextObject(client, key);

  return NextResponse.json({ content: content ?? null });
}
