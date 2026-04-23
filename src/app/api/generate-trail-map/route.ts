import {
  createR2Client,
  listObjects,
  getTextObject,
  putObjectBuffer,
  putTextObject,
  objectExists,
  deleteObject,
  getSignedR2Url,
} from "@/lib/r2";
import {
  parseGpxToGeoJson,
  getBoundingBox,
  getElevationProfile,
  getTrailStats,
  buildMapyCzStaticUrl,
  generateElevationSvg,
  svgToPngBuffer,
  slugifyRouteName,
  fetchCarRouteDurationS,
  type MapLayer,
  type RouteType,
  type TrailStatsFile,
} from "@/lib/trailMap";
import type { FeatureCollection } from "geojson";
import { invalidateCache } from "@/lib/cache";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const VALID_LAYERS: MapLayer[] = ["tourist", "winter", "aerial", "basic"];
const VALID_ROUTE_TYPES: RouteType[] = ["hiking", "car"];

type RouteInput = {
  gpxFilename: string;
  routeType: RouteType;
  mapLayer: MapLayer;
};

function mapPrefix(tripName: string, date: string): string {
  return `trips/${tripName.trim()}/${date.trim()}/map/`;
}

function outputsPrefix(tripName: string, date: string): string {
  return `trips/${tripName.trim()}/${date.trim()}/outputs/`;
}

export async function POST(request: Request) {
  let body: {
    tripName?: string;
    date?: string;
    routes?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Neplatné JSON tělo." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const tripName = body.tripName?.trim();
  const date = body.date?.trim();
  const routes = parseRoutes(body.routes);

  if (!tripName || !date) {
    return new Response(
      JSON.stringify({ error: "tripName a date jsou povinné." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (routes.length === 0) {
    return new Response(
      JSON.stringify({ error: "Pole routes nesmí být prázdné." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const apiKey =
    process.env.MAPY_CZ_API_KEY ?? process.env.MAPY_CZ_ID_API_KEY ?? "";
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "MAPY_CZ_API_KEY nebo MAPY_CZ_ID_API_KEY není nastaven.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      try {
        const client = createR2Client();
        const outPrefix = outputsPrefix(tripName, date);

        // 1) Ověření všech GPX před generováním — ať se nepokazíme uprostřed.
        const gpxPrefix = mapPrefix(tripName, date);
        const allMapObjects = await listObjects(client, gpxPrefix);
        const availableGpxKeys = new Map<string, string>(); // filename → full key
        for (const o of allMapObjects) {
          const key = o.Key ?? "";
          if (!key.toLowerCase().endsWith(".gpx")) continue;
          const filename = key.split("/").pop() ?? "";
          availableGpxKeys.set(filename, key);
        }

        for (const r of routes) {
          if (!availableGpxKeys.has(r.gpxFilename)) {
            send({
              error: `GPX soubor "${r.gpxFilename}" nebyl nalezen v map/.`,
            });
            controller.close();
            return;
          }
        }

        // 2) Vyřešit kolizi slugů (různé GPX se stejným slug jménem).
        const assignedSlugs = resolveSlugs(routes.map((r) => r.gpxFilename));

        // 3) Vyčistit staré výstupy mapy (starý single-file formát i multi).
        await cleanOldMapOutputs(client, outPrefix);

        const total = routes.length;

        // 4) Zpracovat každou trasu.
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          const slug = assignedSlugs[i];
          const displayName = r.gpxFilename.replace(/\.gpx$/i, "");
          const indexOneBased = i + 1;

          send({
            phase: "route_start",
            index: indexOneBased,
            total,
            slug,
            name: displayName,
          });

          const gpxKey = availableGpxKeys.get(r.gpxFilename)!;
          const gpxString = await getTextObject(client, gpxKey);
          if (!gpxString) {
            send({
              error: `Nepodařilo se načíst obsah GPX souboru "${r.gpxFilename}".`,
            });
            controller.close();
            return;
          }

          const geojson = parseGpxToGeoJson(gpxString);
          const coords = extractCoordinates(geojson);
          if (coords.length < 2) {
            send({
              error: `GPX "${r.gpxFilename}" neobsahuje dostatek bodů pro vykreslení trasy.`,
            });
            controller.close();
            return;
          }

          const bbox = getBoundingBox(geojson);

          // Mapa (vždy turistická vrstva pro oba typy dle specifikace? Ne —
          // uživatel v /upload volí vrstvu per GPX, respektujeme ji.)
          send({
            phase: "generating_map",
            index: indexOneBased,
            total,
            slug,
          });

          const pathCoords = samplePathForMap(coords);
          const mapUrl = buildMapyCzStaticUrl(
            bbox,
            pathCoords,
            r.mapLayer,
            apiKey,
          );
          const mapRes = await fetch(mapUrl);
          if (!mapRes.ok) {
            const errText = await mapRes.text();
            send({
              error: `Mapy.cz Static API (${r.gpxFilename}): ${mapRes.status} ${errText.slice(0, 200)}`,
            });
            controller.close();
            return;
          }
          const mapBuffer = Buffer.from(await mapRes.arrayBuffer());
          const trailKey = `${outPrefix}map_trail_${slug}.png`;
          await putObjectBuffer(client, trailKey, mapBuffer, "image/png");

          // Výškový profil — jen pro pěší.
          const profile = getElevationProfile(geojson);
          let statsPayload: TrailStatsFile["stats"];
          let durationS: number | null = null;

          if (r.routeType === "hiking") {
            send({
              phase: "generating_elevation",
              index: indexOneBased,
              total,
              slug,
            });
            const svg = generateElevationSvg(profile);
            const elevationPng = await svgToPngBuffer(svg);
            const elevationKey = `${outPrefix}map_elevation_${slug}.png`;
            await putObjectBuffer(
              client,
              elevationKey,
              elevationPng,
              "image/png",
            );
            statsPayload = getTrailStats(profile);
          } else {
            // Auto: žádný elevation profile, stats = jen distanceKm z GPX.
            statsPayload = {
              distanceKm: Math.round(profile.totalDistanceKm * 10) / 10,
            };
            // Doba jízdy přes Routing API (start/end z GPX).
            send({
              phase: "routing_duration",
              index: indexOneBased,
              total,
              slug,
            });
            const start = coords[0];
            const end = coords[coords.length - 1];
            durationS = await fetchCarRouteDurationS(start, end, apiKey);
          }

          // trail_stats_[slug].json
          const statsFile: TrailStatsFile = {
            name: displayName,
            slug,
            gpxFilename: r.gpxFilename,
            routeType: r.routeType,
            mapLayer: r.mapLayer,
            stats: statsPayload,
            durationS,
          };
          const statsKey = `${outPrefix}trail_stats_${slug}.json`;
          await putTextObject(
            client,
            statsKey,
            JSON.stringify(statsFile),
            "application/json",
          );

          send({
            phase: "route_done",
            index: indexOneBased,
            total,
            slug,
            name: displayName,
          });
        }

        send({ phase: "done", total });

        try {
          await invalidateCache(tripName, date);
        } catch (e) {
          console.warn("[GENERATE_TRAIL_MAP] Cache invalidation failed:", e);
        }

        // Purge Next.js route cache, aby ISR (revalidate 3600) neukazovala starou verzi.
        try {
          const tripEncoded = encodeURIComponent(tripName);
          revalidatePath(`/blog/${tripEncoded}/${date}`);
          revalidatePath(`/blog/${tripEncoded}`);
        } catch (e) {
          console.warn("[GENERATE_TRAIL_MAP] revalidatePath failed:", e);
        }

        // Vrátit finální seznam se signed URLs pro UI náhled.
        const resultRoutes = [];
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          const slug = assignedSlugs[i];
          const trailKey = `${outPrefix}map_trail_${slug}.png`;
          const mapTrailUrl = await getSignedR2Url(client, trailKey, 3600);
          let mapElevationUrl: string | null = null;
          if (r.routeType === "hiking") {
            const elevationKey = `${outPrefix}map_elevation_${slug}.png`;
            mapElevationUrl = await getSignedR2Url(client, elevationKey, 3600);
          }
          resultRoutes.push({
            slug,
            name: r.gpxFilename.replace(/\.gpx$/i, ""),
            routeType: r.routeType,
            mapTrailUrl,
            mapElevationUrl,
          });
        }
        send({ phase: "urls", routes: resultRoutes });
      } catch (error) {
        console.error("[GENERATE_TRAIL_MAP]", error);
        const message =
          error instanceof Error ? error.message : "Chyba při generování map.";
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

function parseRoutes(raw: unknown): RouteInput[] {
  if (!Array.isArray(raw)) return [];
  const out: RouteInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const gpxFilename =
      typeof obj.gpxFilename === "string" ? obj.gpxFilename.trim() : "";
    const routeTypeRaw =
      typeof obj.routeType === "string" ? obj.routeType : "hiking";
    const mapLayerRaw =
      typeof obj.mapLayer === "string" ? obj.mapLayer : "tourist";
    if (!gpxFilename) continue;
    const routeType: RouteType = VALID_ROUTE_TYPES.includes(
      routeTypeRaw as RouteType,
    )
      ? (routeTypeRaw as RouteType)
      : "hiking";
    const mapLayer: MapLayer = VALID_LAYERS.includes(mapLayerRaw as MapLayer)
      ? (mapLayerRaw as MapLayer)
      : "tourist";
    out.push({ gpxFilename, routeType, mapLayer });
  }
  return out;
}

/**
 * Přiřadí každému GPX unikátní slug. Pokud by dva soubory slugovaly stejně,
 * přidá k druhému a dalším `-2`, `-3`, ... (v pořadí výskytu).
 */
function resolveSlugs(gpxFilenames: string[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const filename of gpxFilenames) {
    const base = slugifyRouteName(filename);
    let candidate = base;
    let counter = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }
    used.add(candidate);
    out.push(candidate);
  }
  return out;
}

/** Smaže všechny staré mapové výstupy v outputs/ (single-file i multi-file formát). */
async function cleanOldMapOutputs(
  client: ReturnType<typeof createR2Client>,
  outPrefix: string,
): Promise<void> {
  const objects = await listObjects(client, outPrefix);
  const toDelete: string[] = [];
  for (const o of objects) {
    const key = o.Key ?? "";
    const filename = key.split("/").pop() ?? "";
    if (
      filename === "map_trail.png" ||
      filename === "map_elevation.png" ||
      filename === "trail_stats.json" ||
      filename.startsWith("map_trail_") ||
      filename.startsWith("map_elevation_") ||
      filename.startsWith("trail_stats_")
    ) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    if (await objectExists(client, key)) {
      await deleteObject(client, key);
    }
  }
}

/**
 * Vybere maximálně 150 bodů pro Mapy.cz Static API, rovnoměrně rozložených
 * po celé trase. Pokud má trasa 150 bodů nebo méně, použije všechny.
 */
function samplePathForMap(
  coords: [number, number][],
): [number, number][] {
  const n = coords.length;
  if (n <= 150) return coords;

  const indices = new Set<number>();
  const lastIndex = n - 1;

  for (let i = 0; i < 150; i++) {
    const idx = Math.round((i * lastIndex) / 149);
    indices.add(Math.min(Math.max(idx, 0), lastIndex));
  }

  return Array.from(indices).sort((a, b) => a - b).map((i) => coords[i]);
}

function extractCoordinates(
  geojson: FeatureCollection,
): [number, number][] {
  const out: [number, number][] = [];
  for (const f of geojson.features ?? []) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === "LineString" && geom.coordinates) {
      for (const c of geom.coordinates) {
        out.push([c[0], c[1]]);
      }
    }
    if (geom.type === "MultiLineString" && geom.coordinates) {
      for (const line of geom.coordinates) {
        for (const c of line) {
          out.push([c[0], c[1]]);
        }
      }
    }
    if (geom.type === "Point" && geom.coordinates) {
      out.push([geom.coordinates[0], geom.coordinates[1]]);
    }
  }
  return out;
}
