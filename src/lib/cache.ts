/**
 * Blog cache layer: Supabase for fast reads, R2 on miss.
 * Cache TTL 7 days; signed URLs generated with 7-day expiry.
 */

import {
  createR2Client,
  displayCacheKey,
  getSignedR2Url,
  PHOTO_CACHE_CONTROL,
  getTextObject,
  isOriginalImage,
  listObjects,
  listTripPrefixes,
  objectExists,
} from "@/lib/r2";
import { createSupabaseClient } from "@/lib/supabase";
import type { TrailStatsFile } from "@/lib/trailMap";
import { getStreamVideoDetails } from "@/lib/cloudflareStream";

const CACHE_TTL_DAYS = 7;
const SIGNED_URL_EXPIRY_SEC = 604800; // 7 days

function thumbCacheKey(photosPrefix: string, filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return `${photosPrefix}cache/${base}_thumb.jpg`;
}

// --- Trip cache (one trip: cover, first_date, summary_text) ---

export type CachedTripData = {
  coverUrl: string | null;
  firstDate: string | null;
  summaryText: string | null;
  coverFocusY: number;
};

const DEFAULT_FOCUS_Y = 50;

function parseFocusY(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_FOCUS_Y;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function loadTripFromR2(tripName: string): Promise<CachedTripData> {
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/`;

  const objects = await listObjects(client, basePrefix);
  const dates = new Set<string>();
  for (const obj of objects) {
    const key = obj.Key || "";
    const relative = key.replace(basePrefix, "");
    const [maybeDate] = relative.split("/");
    if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) dates.add(maybeDate);
  }
  const sortedDates = Array.from(dates).sort();
  const firstDate = sortedDates[0] ?? null;

  const summaryPhotos = await listObjects(client, `${basePrefix}summary/photos/`);
  const imagePhotos = summaryPhotos.filter((obj) =>
    isOriginalImage(obj.Key ?? ""),
  );

  let coverUrl: string | null = null;
  let coverFocusY = DEFAULT_FOCUS_Y;
  const heroMetaKey = `${basePrefix}summary/outputs/hero_photo.json`;
  if (await objectExists(client, heroMetaKey)) {
    const raw = await getTextObject(client, heroMetaKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          filename?: string;
          focusY?: unknown;
        };
        if (parsed.focusY !== undefined) {
          coverFocusY = parseFocusY(parsed.focusY);
        }
        const filename = (parsed.filename ?? "").trim();
        if (filename) {
          const basename = filename.replace(/\.[^.]+$/, "");
          const summaryDisplayKey = `${basePrefix}summary/photos/cache/${basename}_display.jpg`;
          if (await objectExists(client, summaryDisplayKey)) {
            coverUrl = await getSignedR2Url(
              client,
              summaryDisplayKey,
              SIGNED_URL_EXPIRY_SEC,
              { responseCacheControl: PHOTO_CACHE_CONTROL },
            );
          } else {
            for (const d of sortedDates) {
              const dayDisplayKey = `${basePrefix}${d}/photos/cache/${basename}_display.jpg`;
              if (await objectExists(client, dayDisplayKey)) {
                coverUrl = await getSignedR2Url(
                  client,
                  dayDisplayKey,
                  SIGNED_URL_EXPIRY_SEC,
                  { responseCacheControl: PHOTO_CACHE_CONTROL },
                );
                break;
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (!coverUrl && imagePhotos[0]?.Key) {
    const key = imagePhotos[0].Key;
    const prefix = key.replace(/[^/]+$/, "");
    const filename = key.split("/").pop() ?? "";
    const dKey = displayCacheKey(prefix, filename);
    if (await objectExists(client, dKey)) {
      coverUrl = await getSignedR2Url(client, dKey, SIGNED_URL_EXPIRY_SEC, {
        responseCacheControl: PHOTO_CACHE_CONTROL,
      });
    }
  }
  if (!coverUrl) {
    const firstDisplay = objects.find(
      (obj) =>
        (obj.Key ?? "").includes("/photos/cache/") &&
        (obj.Key ?? "").toLowerCase().endsWith("_display.jpg"),
    );
    if (firstDisplay?.Key) {
      coverUrl = await getSignedR2Url(
        client,
        firstDisplay.Key,
        SIGNED_URL_EXPIRY_SEC,
        { responseCacheControl: PHOTO_CACHE_CONTROL },
      );
    }
  }

  const summaryTextKey = `${basePrefix}summary/outputs/blog_post.txt`;
  const summaryText = (await getTextObject(client, summaryTextKey)) ?? null;

  return { coverUrl, firstDate, summaryText, coverFocusY };
}

export async function getCachedTripData(
  tripName: string,
): Promise<CachedTripData> {
  const key = `trip/${tripName}`;
  const supabase = createSupabaseClient();
  if (!supabase) {
    console.log(`Cache: Supabase client is null (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY?), skipping DB for ${key}`);
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_TTL_DAYS);

  if (supabase) {
    try {
      const t0 = Date.now();
      const { data: row, error: selectError } = await supabase
        .from("trips_cache")
        .select("cover_url, first_date, summary_text, cover_focus_y, updated_at")
        .eq("trip_name", tripName)
        .maybeSingle();
      const ms = Date.now() - t0;
      if (selectError) {
        console.error(`Cache Supabase SELECT error [${key}]:`, selectError);
      }
      if (row && new Date(row.updated_at) >= cutoff) {
        console.log(`Cache HIT: ${key} (Supabase ${ms} ms)`);
        return {
          coverUrl: row.cover_url ?? null,
          firstDate: row.first_date ?? null,
          summaryText: row.summary_text ?? null,
          coverFocusY: parseFocusY(row.cover_focus_y),
        };
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (select):`, e);
    }
  }

  console.log(`Cache MISS: ${key}`);
  const tR2 = Date.now();
  const loaded = await loadTripFromR2(tripName);
  console.log(`Cache MISS: ${key} (R2 load ${Date.now() - tR2} ms)`);
  if (supabase) {
    try {
      const tWrite = Date.now();
      const { error: upsertError } = await supabase.from("trips_cache").upsert(
        {
          trip_name: tripName,
          cover_url: loaded.coverUrl,
          first_date: loaded.firstDate,
          summary_text: loaded.summaryText,
          cover_focus_y: loaded.coverFocusY,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_name" },
      );
      if (upsertError) {
        console.error(`Cache Supabase UPSERT error [${key}]:`, upsertError);
      } else {
        console.log(`Cache WRITE: ${key} (Supabase ${Date.now() - tWrite} ms)`);
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (upsert):`, e);
    }
  }
  return loaded;
}

/** Returns all trip names (from R2). Then use getCachedTripData for each. */
export async function getTripNames(): Promise<string[]> {
  const client = createR2Client();
  return listTripPrefixes(client);
}

// --- Day cache ---

/** Jedna trasa dne (pěší nebo auto) po načtení z R2 / cache. */
export type RouteInfo = TrailStatsFile & {
  mapTrailUrl: string;
  /** Null pro auto trasy (bez výškového profilu). */
  mapElevationUrl: string | null;
};

export type CachedDayData = {
  coverUrl: string | null;
  coverFocusY: number;
  heroFilename: string | null;
  blogPost: string | null;
  routes: RouteInfo[];
  streamVideos: {
    streamId: string;
    filename: string;
    width: number;
    height: number;
    isLandscape: boolean;
  }[];
};

async function loadDayFromR2(
  tripName: string,
  date: string,
): Promise<CachedDayData> {
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/${date}/`;

  const blogPostKey = `${basePrefix}outputs/blog_post.txt`;
  const blogPost = (await getTextObject(client, blogPostKey)) ?? null;

  const photos = await listObjects(client, `${basePrefix}photos/`);
  const imagePhotos = photos.filter((obj) =>
    isOriginalImage(obj.Key ?? ""),
  );

  let coverUrl: string | null = null;
  let coverFocusY = DEFAULT_FOCUS_Y;
  let heroFilename: string | null = null;
  const heroMetaKey = `${basePrefix}outputs/hero_photo.json`;
  if (await objectExists(client, heroMetaKey)) {
    const rawHero = await getTextObject(client, heroMetaKey);
    if (rawHero) {
      try {
        const parsed = JSON.parse(rawHero) as {
          filename?: string;
          focusY?: unknown;
        };
        if (parsed.focusY !== undefined) {
          coverFocusY = parseFocusY(parsed.focusY);
        }
        if (parsed.filename) {
          heroFilename = parsed.filename;
          const photosPrefix = `${basePrefix}photos/`;
          const dKey = displayCacheKey(photosPrefix, parsed.filename);
          if (await objectExists(client, dKey)) {
            coverUrl = await getSignedR2Url(
              client,
              dKey,
              SIGNED_URL_EXPIRY_SEC,
              { responseCacheControl: PHOTO_CACHE_CONTROL },
            );
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (!coverUrl && imagePhotos[0]?.Key) {
    const key = imagePhotos[0].Key;
    const photosPrefix = key.replace(/[^/]+$/, "");
    const filename = key.split("/").pop() ?? "";
    const dKey = displayCacheKey(photosPrefix, filename);
    if (await objectExists(client, dKey)) {
      coverUrl = await getSignedR2Url(client, dKey, SIGNED_URL_EXPIRY_SEC, {
        responseCacheControl: PHOTO_CACHE_CONTROL,
      });
    }
  }

  // Načtení všech tras: pro každý trail_stats_[slug].json v outputs/
  // podepíšeme URL na mapu a (pro pěší) výškový profil.
  const outputsPrefix = `${basePrefix}outputs/`;
  const outputObjects = await listObjects(client, outputsPrefix);
  const statsKeys = outputObjects
    .map((o) => o.Key ?? "")
    .filter((k) => {
      const filename = k.split("/").pop() ?? "";
      return (
        filename.startsWith("trail_stats_") && filename.endsWith(".json")
      );
    })
    .sort();

  const routes: RouteInfo[] = [];
  for (const statsKey of statsKeys) {
    const raw = await getTextObject(client, statsKey);
    if (!raw) continue;
    let parsed: TrailStatsFile;
    try {
      parsed = JSON.parse(raw) as TrailStatsFile;
    } catch {
      continue;
    }
    if (!parsed.slug || !parsed.routeType) continue;

    const trailKey = `${outputsPrefix}map_trail_${parsed.slug}.png`;
    if (!(await objectExists(client, trailKey))) continue;
    const mapTrailUrl = await getSignedR2Url(
      client,
      trailKey,
      SIGNED_URL_EXPIRY_SEC,
      { responseCacheControl: PHOTO_CACHE_CONTROL },
    );

    let mapElevationUrl: string | null = null;
    if (parsed.routeType === "hiking") {
      const elevationKey = `${outputsPrefix}map_elevation_${parsed.slug}.png`;
      if (await objectExists(client, elevationKey)) {
        mapElevationUrl = await getSignedR2Url(
          client,
          elevationKey,
          SIGNED_URL_EXPIRY_SEC,
          { responseCacheControl: PHOTO_CACHE_CONTROL },
        );
      }
    }

    routes.push({
      ...parsed,
      mapTrailUrl,
      mapElevationUrl,
    });
  }

  const videoPrefix = `${basePrefix}video/`;
  const videoObjects = await listObjects(client, videoPrefix);
  const streamMetaKeys = videoObjects
    .map((o) => o.Key ?? "")
    .filter((k) => k.endsWith("_stream.json"));

  const streamVideos: CachedDayData["streamVideos"] = [];
  for (const key of streamMetaKeys) {
    const raw = await getTextObject(client, key);
    if (!raw) continue;
    try {
      const meta = JSON.parse(raw) as {
        streamId?: string;
        filename?: string;
      };
      if (!meta.streamId || !meta.filename) continue;
      let details = null;
      try {
        details = await getStreamVideoDetails(meta.streamId);
      } catch {
        /* use fallback */
      }
      const w = details?.width ?? 16;
      const h = details?.height ?? 9;
      streamVideos.push({
        streamId: meta.streamId,
        filename: meta.filename,
        width: w,
        height: h,
        isLandscape: details?.isLandscape ?? w >= h,
      });
    } catch {
      /* ignore */
    }
  }

  return {
    coverUrl,
    coverFocusY,
    heroFilename,
    blogPost,
    routes,
    streamVideos,
  };
}

export async function getCachedDayData(
  tripName: string,
  date: string,
): Promise<CachedDayData | null> {
  const key = `trip/${tripName}/${date}`;
  const supabase = createSupabaseClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_TTL_DAYS);

  if (supabase) {
    try {
      const t0 = Date.now();
      const { data: row, error: selectError } = await supabase
        .from("days_cache")
        .select("*")
        .eq("trip_name", tripName)
        .eq("date", date)
        .maybeSingle();
      const ms = Date.now() - t0;
      if (selectError) {
        console.error(`Cache Supabase SELECT error [${key}]:`, selectError);
      }
      if (row && new Date(row.updated_at) >= cutoff) {
        console.log(`Cache HIT: ${key} (Supabase ${ms} ms)`);
        return {
          coverUrl: row.cover_url ?? null,
          coverFocusY: parseFocusY(row.cover_focus_y),
          heroFilename: row.hero_filename ?? null,
          blogPost: row.blog_post ?? null,
          routes: (row.routes as RouteInfo[] | null) ?? [],
          streamVideos: (row.stream_videos as CachedDayData["streamVideos"]) ?? [],
        };
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (select):`, e);
    }
  }

  const client = createR2Client();
  const basePrefix = `trips/${tripName}/${date}/`;
  const objects = await listObjects(client, basePrefix);
  if (objects.length === 0) return null;

  console.log(`Cache MISS: ${key}`);
  const tR2 = Date.now();
  const loaded = await loadDayFromR2(tripName, date);
  console.log(`Cache MISS: ${key} (R2 load ${Date.now() - tR2} ms)`);
  if (supabase) {
    try {
      const tWrite = Date.now();
      const { error: upsertError } = await supabase.from("days_cache").upsert(
        {
          trip_name: tripName,
          date,
          cover_url: loaded.coverUrl,
          cover_focus_y: loaded.coverFocusY,
          hero_filename: loaded.heroFilename,
          blog_post: loaded.blogPost,
          routes: loaded.routes,
          stream_videos: loaded.streamVideos,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_name,date" },
      );
      if (upsertError) {
        console.error(`Cache Supabase UPSERT error [${key}]:`, upsertError);
      } else {
        console.log(`Cache WRITE: ${key} (Supabase ${Date.now() - tWrite} ms)`);
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (upsert):`, e);
    }
  }
  return loaded;
}

/**
 * Seznam dnů tripu. Source of truth pro existenci dne je R2 (vždy listujeme).
 * Supabase použijeme pouze jako cache pro cover_url — díra v Supabase
 * nesmí skrýt den, který v R2 existuje.
 */
export async function getCachedTripDays(
  tripName: string,
): Promise<{ date: string; coverUrl: string | null }[]> {
  const key = `trip/${tripName}/days`;
  const supabase = createSupabaseClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CACHE_TTL_DAYS);

  // 1) Ground truth — dny z R2.
  const tR2 = Date.now();
  const client = createR2Client();
  const basePrefix = `trips/${tripName}/`;
  const allObjects = await listObjects(client, basePrefix);
  const datesSet = new Set<string>();
  for (const obj of allObjects) {
    const k = obj.Key || "";
    const relative = k.replace(basePrefix, "");
    const [maybeDate] = relative.split("/");
    if (/^\d{4}-\d{2}-\d{2}$/.test(maybeDate)) datesSet.add(maybeDate);
  }
  const sortedDates = Array.from(datesSet).sort();
  console.log(
    `${key}: R2 list ${Date.now() - tR2} ms, ${sortedDates.length} days`,
  );

  // 2) Cover URLs — přednostně z Supabase (fresh), jinak přes getCachedDayData (R2).
  const freshCovers = new Map<string, string | null>();
  if (supabase) {
    try {
      const { data: rows } = await supabase
        .from("days_cache")
        .select("date, cover_url, updated_at")
        .eq("trip_name", tripName);
      for (const r of rows ?? []) {
        if (new Date(r.updated_at) >= cutoff) {
          freshCovers.set(r.date, r.cover_url ?? null);
        }
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (select):`, e);
    }
  }

  const days: { date: string; coverUrl: string | null }[] = [];
  for (const date of sortedDates) {
    if (freshCovers.has(date)) {
      days.push({ date, coverUrl: freshCovers.get(date) ?? null });
      continue;
    }
    // Chybí v Supabase (nebo je stale) — načti z R2 a rovnou upsertni.
    const dayData = await getCachedDayData(tripName, date);
    days.push({ date, coverUrl: dayData?.coverUrl ?? null });
  }
  return days;
}

// --- Photo URLs cache ---

export type CachedPhotoUrl = {
  key: string;
  url: string;
  displayUrl: string;
};

async function loadPhotoUrlsFromR2(
  tripName: string,
  date: string,
): Promise<{ key: string; url: string; displayUrl: string; thumbUrl: string }[]> {
  const client = createR2Client();
  const isSummary = date === "summary";
  const basePrefix = isSummary
    ? `trips/${tripName}/summary/`
    : `trips/${tripName}/${date}/`;
  const photosPrefix = `${basePrefix}photos/`;

  const photos = await listObjects(client, photosPrefix);
  const displayOnly = photos
    .map((o) => o.Key ?? "")
    .filter(
      (key) =>
        key.includes("/cache/") && key.toLowerCase().endsWith("_display.jpg"),
    );
  const byBasename = new Map<string, string>();
  for (const key of displayOnly) {
    const filename = key.split("/").pop() ?? "";
    const base = filename.replace(/_display\.jpg$/i, "");
    if (!byBasename.has(base)) byBasename.set(base, key);
  }
  const keys = Array.from(byBasename.values());
  const result: { key: string; url: string; displayUrl: string; thumbUrl: string }[] = [];
  for (const displayKey of keys) {
    const url = await getSignedR2Url(
      client,
      displayKey,
      SIGNED_URL_EXPIRY_SEC,
      { responseCacheControl: PHOTO_CACHE_CONTROL },
    );
    const filename = displayKey.split("/").pop() ?? "";
    const base = filename.replace(/_display\.jpg$/i, "");
    const thumbKey = thumbCacheKey(photosPrefix, base + ".jpg");
    let thumbUrl = url;
    if (await objectExists(client, thumbKey)) {
      thumbUrl = await getSignedR2Url(
        client,
        thumbKey,
        SIGNED_URL_EXPIRY_SEC,
        { responseCacheControl: PHOTO_CACHE_CONTROL },
      );
    }
    result.push({ key: displayKey, url, displayUrl: url, thumbUrl });
  }
  return result;
}

export async function getCachedPhotoUrls(
  tripName: string,
  date: string,
): Promise<CachedPhotoUrl[]> {
  const key = `trip/${tripName}/photos/${date}`;
  const supabase = createSupabaseClient();
  const now = new Date();

  if (supabase) {
    try {
      const t0 = Date.now();
      const { data: rows, error: selectError } = await supabase
        .from("photo_urls_cache")
        .select("filename, display_url, thumb_url, expires_at")
        .eq("trip_name", tripName)
        .eq("date", date)
        .gt("expires_at", now.toISOString());
      const ms = Date.now() - t0;
      if (selectError) {
        console.error(`Cache Supabase SELECT error [${key}]:`, selectError);
      }
      if (rows && rows.length > 0) {
        console.log(`Cache HIT: ${key} (${rows.length} photos, Supabase ${ms} ms)`);
        return rows.map((r) => ({
          key: r.filename,
          url: r.display_url ?? r.thumb_url ?? "",
          displayUrl: r.display_url ?? r.thumb_url ?? "",
        }));
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (select):`, e);
    }
  }

  console.log(`Cache MISS: ${key}`);
  const tR2 = Date.now();
  const loaded = await loadPhotoUrlsFromR2(tripName, date);
  console.log(`Cache MISS: ${key} (R2 load ${Date.now() - tR2} ms)`);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

  if (supabase) {
    try {
      const tWrite = Date.now();
      let writeOk = true;
      for (const p of loaded) {
        const filename = p.key.split("/").pop() ?? "";
        const base = filename.replace(/_display\.jpg$/i, "");
        const { error: upsertError } = await supabase.from("photo_urls_cache").upsert(
          {
            trip_name: tripName,
            date,
            filename: base,
            display_url: p.displayUrl,
            thumb_url: p.thumbUrl,
            expires_at: expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "trip_name,date,filename" },
        );
        if (upsertError) {
          console.error(`Cache Supabase UPSERT error [${key}]:`, upsertError);
          writeOk = false;
          break;
        }
      }
      if (writeOk) {
        console.log(`Cache WRITE: ${key} (Supabase ${Date.now() - tWrite} ms)`);
      }
    } catch (e) {
      console.error(`Cache Supabase exception [${key}] (upsert):`, e);
    }
  }
  return loaded.map((p) => ({
    key: p.key,
    url: p.url,
    displayUrl: p.displayUrl,
  }));
}

// --- Invalidation ---

export async function invalidateCache(
  tripName: string,
  date?: string | null,
): Promise<void> {
  const supabase = createSupabaseClient();
  if (!supabase) return;
  if (date) {
    await supabase.from("days_cache").delete().eq("trip_name", tripName).eq("date", date);
    await supabase.from("photo_urls_cache").delete().eq("trip_name", tripName).eq("date", date);
    await supabase.from("trips_cache").delete().eq("trip_name", tripName);
  } else {
    await supabase.from("days_cache").delete().eq("trip_name", tripName);
    await supabase.from("photo_urls_cache").delete().eq("trip_name", tripName);
    await supabase.from("trips_cache").delete().eq("trip_name", tripName);
  }
}
