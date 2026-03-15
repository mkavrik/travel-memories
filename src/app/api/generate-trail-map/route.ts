import { NextResponse } from "next/server";
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
  type MapLayer,
  type TrailStats,
} from "@/lib/trailMap";
import type { FeatureCollection } from "geojson";
import { invalidateCache } from "@/lib/cache";

export const runtime = "nodejs";

const MAP_TRAIL_FILENAME = "map_trail.png";
const MAP_ELEVATION_FILENAME = "map_elevation.png";
const TRAIL_STATS_FILENAME = "trail_stats.json";

function mapPrefix(tripName: string, date: string): string {
  return `trips/${tripName.trim()}/${date.trim()}/map/`;
}

function outputsPrefix(tripName: string, date: string): string {
  return `trips/${tripName.trim()}/${date.trim()}/outputs/`;
}

function outputsKey(
  tripName: string,
  date: string,
  filename: string,
): string {
  return outputsPrefix(tripName, date) + filename;
}

const VALID_LAYERS: MapLayer[] = ["tourist", "winter", "aerial", "basic"];

export async function POST(request: Request) {
  let body: {
    tripName?: string;
    date?: string;
    mapLayer?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Neplatné JSON tělo." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const tripName = (body.tripName as string)?.trim();
  const date = (body.date as string)?.trim();
  const mapLayerRaw = (body.mapLayer as string) ?? "tourist";
  const mapLayer: MapLayer = VALID_LAYERS.includes(mapLayerRaw as MapLayer)
    ? (mapLayerRaw as MapLayer)
    : "tourist";

  if (!tripName || !date) {
    return new Response(
      JSON.stringify({ error: "tripName a date jsou povinné." }),
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
        send({ phase: "loading_gpx" });

        const client = createR2Client();
        const prefix = mapPrefix(tripName, date);
        const objects = await listObjects(client, prefix);
        const gpxKey = objects
          .map((o) => o.Key)
          .find((k): k is string => (k ?? "").toLowerCase().endsWith(".gpx"));

        if (!gpxKey) {
          send({
            error: "Pro zadaný den nebyl nalezen žádný GPX soubor ve složce map.",
          });
          controller.close();
          return;
        }

        const gpxString = await getTextObject(client, gpxKey);
        if (!gpxString) {
          send({ error: "Nepodařilo se načíst obsah GPX souboru." });
          controller.close();
          return;
        }

        const geojson = parseGpxToGeoJson(gpxString);
        const coords = extractCoordinates(geojson);
        if (coords.length < 2) {
          send({ error: "GPX neobsahuje dostatek bodů pro vykreslení trasy." });
          controller.close();
          return;
        }

        const bbox = getBoundingBox(geojson);
        const trailKey = outputsKey(tripName, date, MAP_TRAIL_FILENAME);
        const elevationKey = outputsKey(tripName, date, MAP_ELEVATION_FILENAME);

        if (await objectExists(client, trailKey)) {
          await deleteObject(client, trailKey);
        }
        if (await objectExists(client, elevationKey)) {
          await deleteObject(client, elevationKey);
        }

        send({ phase: "generating_map" });

        const pathCoords = samplePathForMap(coords);
        const mapUrl = buildMapyCzStaticUrl(bbox, pathCoords, mapLayer, apiKey);
        const mapRes = await fetch(mapUrl);
        if (!mapRes.ok) {
          const errText = await mapRes.text();
          send({
            error: `Mapy.cz API: ${mapRes.status} ${errText.slice(0, 200)}`,
          });
          controller.close();
          return;
        }
        const mapBuffer = Buffer.from(await mapRes.arrayBuffer());
        await putObjectBuffer(client, trailKey, mapBuffer, "image/png");

        send({ phase: "generating_elevation" });

        const profile = getElevationProfile(geojson);
        const svg = generateElevationSvg(profile);
        const elevationPng = await svgToPngBuffer(svg);
        await putObjectBuffer(client, elevationKey, elevationPng, "image/png");

        send({ phase: "trail_stats" });

        const trailStats = getTrailStats(profile);
        const trailStatsKey = outputsKey(tripName, date, TRAIL_STATS_FILENAME);
        if (await objectExists(client, trailStatsKey)) {
          await deleteObject(client, trailStatsKey);
        }
        await putTextObject(
          client,
          trailStatsKey,
          JSON.stringify(trailStats),
          "application/json",
        );

        send({ phase: "done" });

        try {
          await invalidateCache(tripName, date);
        } catch (e) {
          console.warn("[GENERATE_TRAIL_MAP] Cache invalidation failed:", e);
        }

        const mapTrailUrl = await getSignedR2Url(client, trailKey, 3600);
        const mapElevationUrl = await getSignedR2Url(client, elevationKey, 3600);

        send({
          phase: "urls",
          mapTrailUrl,
          mapElevationUrl,
          mapTrailKey: trailKey,
          mapElevationKey: elevationKey,
        });
      } catch (error) {
        console.error("[GENERATE_TRAIL_MAP]", error);
        const message =
          error instanceof Error ? error.message : "Chyba při generování mapy.";
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

/**
 * Vybere maximálně 150 bodů pro Mapy.cz Static API, rovnoměrně rozložených
 * po celé trase. Pokud má trasa 150 bodů nebo méně, použije všechny.
 *
 * index = round(i * (totalPoints - 1) / 149) pro i = 0..149
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

