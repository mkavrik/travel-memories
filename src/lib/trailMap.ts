/**
 * Vizualizace GPX trasy: parsování, Mapy.cz Static API, výškový profil.
 */

import * as tj from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";

export type MapLayer = "tourist" | "winter" | "aerial" | "basic";

const MAPSET: Record<MapLayer, string> = {
  tourist: "outdoor",
  winter: "winter",
  aerial: "aerial",
  basic: "basic",
};

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export type ElevationPoint = {
  distanceKm: number;
  elevationM: number;
};

export type ElevationProfile = {
  points: ElevationPoint[];
  totalDistanceKm: number;
  totalElevationGainM: number;
  totalElevationLossM: number;
  minEleM: number;
  maxEleM: number;
};

export type TrailStats = {
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  maxEleM: number;
  minEleM: number;
};

export type RouteType = "hiking" | "car";

/** Statistiky auto trasy — pouze vzdálenost (bez převýšení). */
export type CarTrailStats = {
  distanceKm: number;
};

/** Struktura trail_stats_[slug].json — pěší i auto. */
export type TrailStatsFile = {
  name: string;
  slug: string;
  gpxFilename: string;
  routeType: RouteType;
  mapLayer: MapLayer;
  /** Pro pěší obsahuje plné TrailStats, pro auto pouze { distanceKm }. */
  stats: TrailStats | CarTrailStats;
  /** Pouze pro auto — odhadovaná doba jízdy v sekundách. null pokud Routing API selhalo. */
  durationS: number | null;
};

/**
 * Vyrobí URL-bezpečný slug z názvu GPX souboru (bez přípony).
 * Lowercase, bez diakritiky, nealfanumerické znaky → `-`, runy pomlček zkráceny.
 * Pokud by byl výsledek prázdný, vrací "trasa".
 */
export function slugifyRouteName(filenameOrName: string): string {
  const base = filenameOrName.replace(/\.[^.]+$/, "");
  const normalized = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "trasa";
}

type GeoJSONPosition = [number, number] | [number, number, number];

function extractCoordinatesFromGeoJSON(geojson: GeoJSON.FeatureCollection): GeoJSONPosition[] {
  const coords: GeoJSONPosition[] = [];
  for (const f of geojson.features ?? []) {
    const geom = f.geometry;
    if (!geom) continue;
    if (geom.type === "LineString" && geom.coordinates) {
      coords.push(...(geom.coordinates as GeoJSONPosition[]));
    }
    if (geom.type === "MultiLineString" && geom.coordinates) {
      for (const line of geom.coordinates) {
        coords.push(...(line as GeoJSONPosition[]));
      }
    }
    if (geom.type === "Point" && geom.coordinates) {
      coords.push(geom.coordinates as GeoJSONPosition);
    }
  }
  return coords;
}

/**
 * Parsuje GPX řetězec a vrátí GeoJSON.
 */
export function parseGpxToGeoJson(gpxString: string): GeoJSON.FeatureCollection {
  const doc = new DOMParser().parseFromString(gpxString, "text/xml");
  return tj.gpx(doc as unknown as Document) as GeoJSON.FeatureCollection;
}

/**
 * Vypočte bounding box z GeoJSON (všechny souřadnice).
 */
export function getBoundingBox(geojson: GeoJSON.FeatureCollection): BoundingBox {
  const coords = extractCoordinatesFromGeoJSON(geojson);
  if (coords.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const c of coords) {
    const lng = c[0], lat = c[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Haversine vzdálenost mezi dvěma body (km).
 */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Výškový profil z GeoJSON (ele z třetí složky souřadnice, nebo 0).
 */
export function getElevationProfile(
  geojson: GeoJSON.FeatureCollection,
): ElevationProfile {
  const coords = extractCoordinatesFromGeoJSON(geojson);
  const points: ElevationPoint[] = [];
  let distanceKm = 0;
  let totalGain = 0;
  let totalLoss = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  let prevLat: number | null = null;
  let prevLng: number | null = null;
  let prevEle: number | null = null;

  for (const c of coords) {
    const lng = c[0];
    const lat = c[1];
    const ele = c.length >= 3 && typeof c[2] === "number" ? c[2] : 0;
    if (prevLat != null && prevLng != null) {
      distanceKm += haversineKm(prevLat, prevLng, lat, lng);
      if (prevEle != null) {
        if (ele > prevEle) totalGain += ele - prevEle;
        else if (ele < prevEle) totalLoss += prevEle - ele;
      }
    }
    points.push({ distanceKm, elevationM: ele });
    if (ele < minEle) minEle = ele;
    if (ele > maxEle) maxEle = ele;
    prevLat = lat;
    prevLng = lng;
    prevEle = ele;
  }

  const totalDistanceKm = points.length > 0 ? points[points.length - 1].distanceKm : 0;
  return {
    points,
    totalDistanceKm,
    totalElevationGainM: Math.round(totalGain * 10) / 10,
    totalElevationLossM: Math.round(totalLoss * 10) / 10,
    minEleM: minEle === Infinity ? 0 : minEle,
    maxEleM: maxEle === -Infinity ? 0 : maxEle,
  };
}

/**
 * Statistiky trasy z GeoJSON (pro trail_stats.json).
 */
export function getTrailStats(profile: ElevationProfile): TrailStats {
  return {
    distanceKm: Math.round(profile.totalDistanceKm * 10) / 10,
    elevationGainM: Math.round(profile.totalElevationGainM),
    elevationLossM: Math.round(profile.totalElevationLossM),
    maxEleM: Math.round(profile.maxEleM),
    minEleM: Math.round(profile.minEleM),
  };
}

/**
 * Formát path pro Mapy.cz shapes: path:[(lon1,lat1;lon2,lat2;...)]
 * Souřadnice musí být ve formátu lon,lat (lng,lat).
 */
function formatPathForMapy(coords: GeoJSONPosition[]): string {
  const parts = coords.map((c) => `${c[0]},${c[1]}`);
  return `path:[(${parts.join(";")})]`;
}

/**
 * Sestaví URL pro Mapy.cz Static API (trasa červeně, bbox, vrstva),
 * která kreslí GPX trasu přímo pomocí shapes parametru.
 * Max size dle dokumentace 1024 px; použijeme 1024x512.
 */
export function buildMapyCzStaticUrl(
  bbox: BoundingBox,
  pathCoords: GeoJSONPosition[],
  mapLayer: MapLayer,
  apiKey: string,
  width = 1024,
  height = 512,
): string {
  const mapset = MAPSET[mapLayer];
  const path = formatPathForMapy(pathCoords);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    mapset,
    // shapes: color + šířka + GPX polyline
    shapes: `color:red;width:3;${path}`,
    apikey: apiKey,
  });
  // Bounding box z GPX souřadnic pro správný zoom
  params.append("lon", String(bbox.minLng));
  params.append("lat", String(bbox.maxLat));
  params.append("lon", String(bbox.maxLng));
  params.append("lat", String(bbox.minLat));
  return `https://api.mapy.cz/v1/static/map?${params.toString()}`;
}

const ELEVATION_SVG_WIDTH = 1200;
const ELEVATION_SVG_HEIGHT = 600;
const PAD_LEFT = 56;
const PAD_RIGHT = 24;
const PAD_TOP = 24;
const PAD_BOTTOM = 44;
const CHART_WIDTH = ELEVATION_SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const CHART_HEIGHT = ELEVATION_SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

/**
 * Vygeneruje SVG výškového profilu (tmavé pozadí, zlatá linie a plocha).
 */
export function generateElevationSvg(profile: ElevationProfile): string {
  const { points, totalDistanceKm, minEleM, maxEleM, totalElevationGainM } =
    profile;
  if (points.length < 2) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${ELEVATION_SVG_WIDTH}" height="${ELEVATION_SVG_HEIGHT}" viewBox="0 0 ${ELEVATION_SVG_WIDTH} ${ELEVATION_SVG_HEIGHT}"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#94a3b8" text-anchor="middle" font-size="14">Málo bodů pro výškový profil</text></svg>`;
  }

  const rangeEle = maxEleM - minEleM || 1;
  const scaleX = (d: number) =>
    PAD_LEFT + (d / totalDistanceKm) * CHART_WIDTH;
  const scaleY = (e: number) =>
    PAD_TOP + CHART_HEIGHT - ((e - minEleM) / rangeEle) * CHART_HEIGHT;

  const pathPoints = points
    .map((p) => `${scaleX(p.distanceKm)},${scaleY(p.elevationM)}`)
    .join(" ");
  const areaPoints = `${PAD_LEFT},${PAD_TOP + CHART_HEIGHT} ${pathPoints} ${PAD_LEFT + CHART_WIDTH},${PAD_TOP + CHART_HEIGHT}`;

  const labels = [
    `Výška: ${Math.round(minEleM)}–${Math.round(maxEleM)} m`,
    `Převýšení: +${totalElevationGainM} m`,
    `Délka: ${totalDistanceKm.toFixed(1)} km`,
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ELEVATION_SVG_WIDTH}" height="${ELEVATION_SVG_HEIGHT}" viewBox="0 0 ${ELEVATION_SVG_WIDTH} ${ELEVATION_SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <polyline points="${areaPoints}" fill="#f5c842" fill-opacity="0.3" stroke="none"/>
  <polyline points="${pathPoints}" fill="none" stroke="#f5c842" stroke-width="2" stroke-linejoin="round"/>
  <line x1="${PAD_LEFT}" y1="${PAD_TOP}" x2="${PAD_LEFT}" y2="${PAD_TOP + CHART_HEIGHT}" stroke="#475569" stroke-width="1"/>
  <line x1="${PAD_LEFT}" y1="${PAD_TOP + CHART_HEIGHT}" x2="${PAD_LEFT + CHART_WIDTH}" y2="${PAD_TOP + CHART_HEIGHT}" stroke="#475569" stroke-width="1"/>
  <text x="${PAD_LEFT - 8}" y="${PAD_TOP + CHART_HEIGHT / 2}" fill="#94a3b8" text-anchor="end" font-size="11" transform="rotate(-90 ${PAD_LEFT - 8} ${PAD_TOP + CHART_HEIGHT / 2})">výška (m)</text>
  <text x="${PAD_LEFT + CHART_WIDTH / 2}" y="${ELEVATION_SVG_HEIGHT - 8}" fill="#94a3b8" text-anchor="middle" font-size="11">vzdálenost (km)</text>
  <text x="${PAD_LEFT}" y="${PAD_TOP - 8}" fill="#e2e8f0" text-anchor="start" font-size="10">${Math.round(maxEleM)} m</text>
  <text x="${PAD_LEFT}" y="${PAD_TOP + CHART_HEIGHT + 14}" fill="#e2e8f0" text-anchor="start" font-size="10">${Math.round(minEleM)} m</text>
  <text x="${PAD_LEFT + CHART_WIDTH / 2}" y="${ELEVATION_SVG_HEIGHT - 24}" fill="#f5c842" font-size="11">${labels.join(" · ")}</text>
</svg>`;
}

/**
 * Konvertuje SVG na PNG buffer (sharp).
 */
export async function svgToPngBuffer(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

type LonLat = [number, number];

/**
 * Získá odhad doby jízdy autem mezi start a end bodem přes Mapy.cz Routing API.
 * Vrací délku v sekundách, nebo null pokud API selže.
 * Vstup souřadnic: [lon, lat].
 */
export async function fetchCarRouteDurationS(
  start: LonLat,
  end: LonLat,
  apiKey: string,
): Promise<number | null> {
  const params = new URLSearchParams({
    start: `${start[0]},${start[1]}`,
    end: `${end[0]},${end[1]}`,
    routeType: "car_fast",
    lang: "cs",
    format: "geojson",
    apikey: apiKey,
  });
  const url = `https://api.mapy.cz/v1/routing/route?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      duration?: number;
      length?: number;
    };
    if (typeof data.duration === "number" && data.duration > 0) {
      return Math.round(data.duration);
    }
    return null;
  } catch {
    return null;
  }
}
