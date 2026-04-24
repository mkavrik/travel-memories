"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { HeroFocusEditor } from "@/components/HeroFocusEditor";

/** Read an NDJSON response stream, calling `onLine` for each parsed JSON object. */
async function readNdjsonStream<T extends Record<string, unknown>>(
  body: ReadableStream<Uint8Array>,
  onLine: (data: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onLine(JSON.parse(trimmed) as T);
      } catch {
        /* ignore non-JSON lines */
      }
    }
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

type SectionType = "day" | "summary";

interface UploadResult {
  message?: string;
  error?: string;
  uploaded?: string[];
  skipped?: { filename: string; reason: string }[];
}

interface TranscribeResult {
  message?: string;
  error?: string;
  rawTranscriptKey?: string;
  cleanTranscriptKey?: string;
  audioFiles?: string[];
}

interface BlogPostResult {
  message?: string;
  error?: string;
  blogPostKey?: string;
  preview?: string;
  iterations?: number;
}

type SummaryPhase = "loading" | "generating" | "correcting" | "done";

interface TripSummaryResult {
  error?: string;
  blogPostKey?: string;
  preview?: string;
  iterations?: number;
}

interface HeroPhotoResult {
  scope: "day" | "trip";
  /** Filename je prázdný, dokud uživatel neklikne na náhled. */
  filename: string;
  heroUrl: string | null;
  photos: { filename: string; url: string }[];
}

interface CurrentHeroData {
  filename: string;
  heroUrl: string | null;
  focusY: number;
  reason: string | null;
}

type RouteType = "hiking" | "car";

interface GpxFileItem {
  filename: string;
  displayName: string;
}

interface GpxConfigState {
  filename: string;
  displayName: string;
  routeType: RouteType;
  mapLayer: string;
}

interface GeneratedRoutePreview {
  slug: string;
  name: string;
  routeType: RouteType;
  mapTrailUrl: string;
  mapElevationUrl: string | null;
}

interface TrailMapResult {
  error?: string;
  routes?: GeneratedRoutePreview[];
}

const MAP_LAYER_OPTIONS: { value: string; label: string }[] = [
  { value: "tourist", label: "Turistická mapa" },
  { value: "winter", label: "Zimní mapa" },
  { value: "aerial", label: "Letecká mapa" },
  { value: "basic", label: "Základní mapa" },
];

const ROUTE_TYPE_OPTIONS: { value: RouteType; label: string }[] = [
  { value: "hiking", label: "Pěší trasa" },
  { value: "car", label: "Auto trasa" },
];

export default function UploadPage() {
  const [tripName, setTripName] = useState("");
  const [tripOptions, setTripOptions] = useState<string[]>([]);
  const [selectedTripOption, setSelectedTripOption] = useState<string>("");
  const [isLoadingTrips, setIsLoadingTrips] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [sectionType, setSectionType] = useState<SectionType>("day");
  const [date, setDate] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    loaded: number;
    total: number;
    percent: number;
    current?: number;
    count?: number;
    filename?: string;
    phase?: "preparing" | "uploading" | "finalizing";
  } | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeResult, setTranscribeResult] =
    useState<TranscribeResult | null>(null);
  const [heroMessage, setHeroMessage] = useState<string | null>(null);
  const [heroProgress, setHeroProgress] = useState<{
    scope: "day" | "trip";
    message: string;
    current?: number;
    total?: number;
  } | null>(null);
  const [isGeneratingBlogPost, setIsGeneratingBlogPost] = useState(false);
  const [blogPostStatus, setBlogPostStatus] = useState<
    "idle" | "deleting" | "generating"
  >("idle");
  const [blogPostResult, setBlogPostResult] = useState<BlogPostResult | null>(
    null,
  );
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryPhase, setSummaryPhase] = useState<SummaryPhase | null>(null);
  const [summaryIteration, setSummaryIteration] = useState<number>(0);
  const [summaryResult, setSummaryResult] = useState<TripSummaryResult | null>(
    null,
  );
  const [dayHero, setDayHero] = useState<HeroPhotoResult | null>(null);
  const [tripHero, setTripHero] = useState<HeroPhotoResult | null>(null);
  const [currentDayHero, setCurrentDayHero] = useState<CurrentHeroData | null>(
    null,
  );
  const [currentTripHero, setCurrentTripHero] =
    useState<CurrentHeroData | null>(null);
  const [isLoadingCurrentHero, setIsLoadingCurrentHero] = useState<
    "day" | "trip" | null
  >(null);
  const [currentHeroError, setCurrentHeroError] = useState<string | null>(null);
  const [gpxFiles, setGpxFiles] = useState<GpxFileItem[]>([]);
  const [gpxConfigs, setGpxConfigs] = useState<GpxConfigState[]>([]);
  const [gpxReloadTick, setGpxReloadTick] = useState(0);
  const [isGeneratingTrailMap, setIsGeneratingTrailMap] = useState(false);
  const [trailMapProgress, setTrailMapProgress] = useState<string | null>(null);
  const [trailMapResult, setTrailMapResult] =
    useState<TrailMapResult | null>(null);
  const [isConvertingPhotos, setIsConvertingPhotos] = useState(false);
  const [convertPhotosProgress, setConvertPhotosProgress] = useState<
    string | null
  >(null);
  const [isCleaningPhotos, setIsCleaningPhotos] = useState(false);
  const [cleanupPhotosResult, setCleanupPhotosResult] = useState<
    string | null
  >(null);
  const [isUploadingDayVideos, setIsUploadingDayVideos] = useState(false);
  const [streamDayResult, setStreamDayResult] = useState<{
    uploaded?: { filename: string; streamId: string }[];
    skipped?: string[];
    message?: string;
    error?: string;
  } | null>(null);
  const [isSyncingAllVideos, setIsSyncingAllVideos] = useState(false);
  const [streamSyncProgress, setStreamSyncProgress] = useState<string | null>(null);
  const [streamSyncResult, setStreamSyncResult] = useState<{
    uploaded?: number;
    total?: number;
    error?: string;
  } | null>(null);
  const [heroLightbox, setHeroLightbox] = useState<{
    scope: "day" | "trip";
    filename: string;
    displayUrl: string | null;
    loading: boolean;
  } | null>(null);
  const [isWarmingCache, setIsWarmingCache] = useState(false);
  const [warmCacheLines, setWarmCacheLines] = useState<string[]>([]);
  const [warmCacheSummary, setWarmCacheSummary] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTextLoaded, setEditTextLoaded] = useState(false);
  const [editTextNotFound, setEditTextNotFound] = useState(false);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [isSavingText, setIsSavingText] = useState(false);
  const [editTextMessage, setEditTextMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadTrips() {
      setIsLoadingTrips(true);
      setTripsError(null);
      try {
        const res = await fetch("/api/trips");
        const data = (await res.json()) as { trips?: string[]; error?: string };
        if (!res.ok) {
          if (isMounted) {
            setTripsError(data.error || "Nepodařilo se načíst seznam tripů.");
          }
          return;
        }
        if (isMounted && Array.isArray(data.trips)) {
          setTripOptions(data.trips);
          if (data.trips.length > 0) {
            setSelectedTripOption(data.trips[0]);
            setTripName(data.trips[0]);
          }
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setTripsError("Nepodařilo se načíst seznam tripů.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingTrips(false);
        }
      }
    }

    void loadTrips();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const trimmed = tripName?.trim();
    if (!trimmed) return;
    let isMounted = true;
    async function loadDates() {
      try {
        const res = await fetch(
          `/api/trip-dates?tripName=${encodeURIComponent(trimmed!)}`,
        );
        const data = (await res.json()) as { dates?: string[] };
        if (!isMounted) return;
        const first = data.dates?.[0];
        if (first) setDate(first);
      } catch {
        /* ignore */
      }
    }
    void loadDates();
    return () => {
      isMounted = false;
    };
  }, [tripName]);

  useEffect(() => {
    if (sectionType !== "day" || !tripName?.trim() || !date?.trim()) {
      setGpxFiles([]);
      setGpxConfigs([]);
      return;
    }
    let isMounted = true;
    async function check() {
      try {
        const res = await fetch(
          `/api/check-gpx?tripName=${encodeURIComponent(tripName.trim())}&date=${encodeURIComponent(date.trim())}`,
        );
        const data = (await res.json()) as {
          hasGpx?: boolean;
          files?: GpxFileItem[];
        };
        if (!isMounted) return;
        const files = data.files ?? [];
        setGpxFiles(files);
        setGpxConfigs((prev) => {
          const byName = new Map(prev.map((c) => [c.filename, c]));
          return files.map((f) => {
            const existing = byName.get(f.filename);
            return {
              filename: f.filename,
              displayName: f.displayName,
              routeType: existing?.routeType ?? "hiking",
              mapLayer: existing?.mapLayer ?? "tourist",
            };
          });
        });
      } catch {
        if (isMounted) {
          setGpxFiles([]);
          setGpxConfigs([]);
        }
      }
    }
    void check();
    return () => {
      isMounted = false;
    };
  }, [sectionType, tripName, date, gpxReloadTick]);

  // Reset všech náhledů/ech při přepnutí tripu/dne/sekce,
  // aby nevisel starý obsah z předchozího kontextu.
  useEffect(() => {
    setResult(null);
    setTranscribeResult(null);
    setBlogPostResult(null);
    setSummaryResult(null);
    setDayHero(null);
    setTripHero(null);
    setCurrentDayHero(null);
    setCurrentTripHero(null);
    setCurrentHeroError(null);
    setHeroMessage(null);
    setStreamDayResult(null);
    setStreamSyncResult(null);
    setStreamSyncProgress(null);
    setCleanupPhotosResult(null);
    setConvertPhotosProgress(null);
    setTrailMapResult(null);
    setTrailMapProgress(null);
    setEditText("");
    setEditTextLoaded(false);
    setEditTextNotFound(false);
    setEditTextMessage(null);
    setWarmCacheLines([]);
    setWarmCacheSummary(null);
  }, [sectionType, tripName, date]);

  async function handleShowCurrentHero(scope: "day" | "trip") {
    if (!tripName?.trim()) {
      setCurrentHeroError("Vyber nejdřív trip.");
      return;
    }
    if (scope === "day" && !date?.trim()) {
      setCurrentHeroError("Vyber nejdřív datum.");
      return;
    }
    setCurrentHeroError(null);
    setIsLoadingCurrentHero(scope);
    try {
      const params = new URLSearchParams({ tripName: tripName.trim() });
      if (scope === "day") params.set("date", date.trim());
      const res = await fetch(`/api/get-hero?${params.toString()}`);
      const data = (await res.json()) as {
        exists?: boolean;
        filename?: string;
        heroUrl?: string | null;
        focusY?: number;
        reason?: string | null;
        error?: string;
      };
      if (!res.ok || !data.exists || !data.filename) {
        setCurrentHeroError(data.error ?? "Hero fotka není nastavena.");
        if (scope === "day") setCurrentDayHero(null);
        else setCurrentTripHero(null);
        return;
      }
      const current: CurrentHeroData = {
        filename: data.filename,
        heroUrl: data.heroUrl ?? null,
        focusY: typeof data.focusY === "number" ? data.focusY : 50,
        reason: data.reason ?? null,
      };
      if (scope === "day") setCurrentDayHero(current);
      else setCurrentTripHero(current);
    } catch (err) {
      console.error(err);
      setCurrentHeroError("Nastala neočekávaná chyba.");
    } finally {
      setIsLoadingCurrentHero(null);
    }
  }

  async function handleGenerateTrailMap() {
    setTrailMapResult(null);
    setTrailMapProgress(null);
    if (!tripName?.trim() || !date?.trim()) {
      setTrailMapResult({ error: "Zadej trip a datum." });
      return;
    }
    if (gpxConfigs.length === 0) {
      setTrailMapResult({ error: "Pro tento den není žádný GPX soubor." });
      return;
    }
    setIsGeneratingTrailMap(true);
    try {
      const res = await fetch("/api/generate-trail-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName: tripName.trim(),
          date: date.trim(),
          routes: gpxConfigs.map((c) => ({
            gpxFilename: c.filename,
            routeType: c.routeType,
            mapLayer: c.mapLayer,
          })),
        }),
      });
      if (!res.ok || !res.body) {
        setTrailMapResult({
          error: res.ok ? "Prázdná odpověď." : "Generování map selhalo.",
        });
        return;
      }
      await readNdjsonStream<{
        phase?: string;
        error?: string;
        index?: number;
        total?: number;
        slug?: string;
        name?: string;
        routes?: GeneratedRoutePreview[];
      }>(res.body, (data) => {
        if (data.error) {
          setTrailMapResult({ error: data.error });
          return;
        }
        const label = data.name ?? data.slug ?? "";
        if (
          data.phase === "route_start" &&
          data.index != null &&
          data.total != null
        ) {
          setTrailMapProgress(
            `Generuji mapu ${data.index}/${data.total}${label ? ` — ${label}` : ""}...`,
          );
        }
        if (
          data.phase === "generating_elevation" &&
          data.index != null &&
          data.total != null
        ) {
          setTrailMapProgress(
            `Výškový profil ${data.index}/${data.total}${label ? ` — ${label}` : ""}...`,
          );
        }
        if (
          data.phase === "routing_duration" &&
          data.index != null &&
          data.total != null
        ) {
          setTrailMapProgress(
            `Počítám dobu jízdy ${data.index}/${data.total}${label ? ` — ${label}` : ""}...`,
          );
        }
        if (data.phase === "done") {
          setTrailMapProgress("Hotovo");
        }
        if (data.phase === "urls" && Array.isArray(data.routes)) {
          setTrailMapResult({ routes: data.routes });
        }
      });
    } catch (err) {
      console.error(err);
      setTrailMapResult({
        error: "Nastala neočekávaná chyba při generování map.",
      });
    } finally {
      setIsGeneratingTrailMap(false);
    }
  }

  function updateGpxConfig(
    filename: string,
    patch: Partial<GpxConfigState>,
  ) {
    setGpxConfigs((prev) =>
      prev.map((c) =>
        c.filename === filename ? { ...c, ...patch } : c,
      ),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Read files from the DOM input as source of truth. iOS Safari can
    // invalidate a FileList held in React state across re-renders even though
    // the native input still displays the selected filename.
    const selectedFiles = fileInputRef.current?.files ?? files;

    if (!selectedFiles || selectedFiles.length === 0) {
      setResult({ error: "Vyber alespoň jeden soubor." });
      return;
    }

    const fileArray = Array.from(selectedFiles);

    setIsSubmitting(true);
    setResult(null);
    setUploadProgress({
      loaded: 0,
      total: 0,
      percent: 0,
      phase: "preparing",
    });

    try {
      // 1. Ask server for presigned PUT URLs (tiny JSON — bypasses Vercel body limit).
      const presignRes = await fetch("/api/upload-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName,
          sectionType,
          date: sectionType === "day" ? date : null,
          files: fileArray.map((f) => ({
            name: f.name,
            contentType: f.type,
          })),
        }),
      });
      const presignData = (await presignRes.json()) as {
        presigned?: {
          filename: string;
          objectKey: string;
          uploadUrl: string;
          contentType: string;
        }[];
        skipped?: { filename: string; reason: string }[];
        error?: string;
      };

      if (!presignRes.ok || !presignData.presigned) {
        setResult({
          error: presignData.error || "Nepodařilo se připravit upload.",
          skipped: presignData.skipped,
        });
        return;
      }

      const presignMap = new Map(
        presignData.presigned.map((p) => [p.filename, p]),
      );
      const serverSkipped = presignData.skipped ?? [];
      const filesToUpload = fileArray.filter((f) => presignMap.has(f.name));
      const totalBytes = filesToUpload.reduce((sum, f) => sum + f.size, 0);

      // 2. PUT each file directly to R2 via presigned URL. Sequential to keep
      //    progress math simple and avoid saturating mobile connections.
      const uploaded: string[] = [];
      const failed: { filename: string; reason: string }[] = [];
      let completedBytes = 0;

      for (let i = 0; i < filesToUpload.length; i += 1) {
        const file = filesToUpload[i];
        const info = presignMap.get(file.name);
        if (!info) continue;

        setUploadProgress({
          loaded: completedBytes,
          total: totalBytes,
          percent:
            totalBytes > 0
              ? Math.round((completedBytes / totalBytes) * 100)
              : 0,
          current: i + 1,
          count: filesToUpload.length,
          filename: file.name,
          phase: "uploading",
        });

        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", info.uploadUrl);
            xhr.setRequestHeader("Content-Type", info.contentType);

            xhr.upload.addEventListener("progress", (ev) => {
              if (ev.lengthComputable) {
                const loaded = completedBytes + ev.loaded;
                setUploadProgress({
                  loaded,
                  total: totalBytes,
                  percent:
                    totalBytes > 0
                      ? Math.round((loaded / totalBytes) * 100)
                      : 0,
                  current: i + 1,
                  count: filesToUpload.length,
                  filename: file.name,
                  phase: "uploading",
                });
              }
            });

            xhr.addEventListener("load", () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
              } else {
                reject(
                  new Error(
                    `R2 odmítlo soubor (HTTP ${xhr.status}).` +
                      (xhr.responseText
                        ? ` ${xhr.responseText.slice(0, 120)}`
                        : ""),
                  ),
                );
              }
            });
            xhr.addEventListener("error", () =>
              reject(new Error("Síťová chyba při uploadu do R2.")),
            );
            xhr.addEventListener("abort", () =>
              reject(new Error("Upload přerušen.")),
            );

            xhr.send(file);
          });

          completedBytes += file.size;
          uploaded.push(info.objectKey);
        } catch (err) {
          failed.push({
            filename: file.name,
            reason:
              err instanceof Error ? err.message : "Upload selhal.",
          });
        }
      }

      if (uploaded.length === 0) {
        setResult({
          error: "Žádný soubor nebyl nahrán.",
          skipped: [...serverSkipped, ...failed],
        });
        return;
      }

      // 3. Finalize — cache invalidation (best-effort; files are already in R2).
      setUploadProgress({
        loaded: totalBytes,
        total: totalBytes,
        percent: 100,
        current: filesToUpload.length,
        count: filesToUpload.length,
        phase: "finalizing",
      });

      try {
        await fetch("/api/upload-finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripName,
            sectionType,
            date: sectionType === "day" ? date : null,
            uploaded,
          }),
        });
      } catch (e) {
        console.warn("[UPLOAD] Finalize failed (files are in R2):", e);
      }

      setResult({
        message: "Upload dokončen.",
        uploaded,
        skipped: [...serverSkipped, ...failed],
      });
      setFiles(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      // Trigger re-fetch GPX seznamu — nově nahrané .gpx se objeví v sekci map.
      setGpxReloadTick((t) => t + 1);
    } catch (error) {
      console.error(error);
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Nastala neočekávaná chyba.",
      });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  }

  async function handleTranscribe() {
    setTranscribeResult(null);

    if (!tripName) {
      setTranscribeResult({ error: "Zadej název tripu." });
      return;
    }

    if (sectionType === "day" && !date) {
      setTranscribeResult({ error: "Zvol datum pro konkrétní den." });
      return;
    }

    setIsTranscribing(true);

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tripName,
          sectionType,
          date: sectionType === "day" ? date : null,
        }),
      });

      const data = (await response.json()) as TranscribeResult;

      if (!response.ok) {
        setTranscribeResult({ ...data, error: data.error || "Přepis selhal." });
        return;
      }

      setTranscribeResult(data);
    } catch (error) {
      console.error(error);
      setTranscribeResult({ error: "Nastala neočekávaná chyba při přepisu." });
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleGenerateBlogPost() {
    setBlogPostResult(null);
    setBlogPostStatus("idle");

    if (!tripName) {
      setBlogPostResult({ error: "Zadej název tripu." });
      return;
    }

    if (sectionType !== "day" || !date) {
      setBlogPostResult({
        error: "Pro generování blog postu zvol konkrétní den a vyplň datum.",
      });
      return;
    }

    setIsGeneratingBlogPost(true);

    try {
      const prepareRes = await fetch("/api/generate-blog-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripName, date, step: "prepare" }),
      });

      if (!prepareRes.ok) {
        const err = (await prepareRes.json()) as { error?: string };
        setBlogPostResult({
          error: err.error || "Příprava selhala.",
        });
        return;
      }

      const prepareData = (await prepareRes.json()) as { hadExisting?: boolean };

      if (prepareData.hadExisting) {
        setBlogPostStatus("deleting");
        await new Promise((r) => setTimeout(r, 800));
      }

      setBlogPostStatus("generating");

      const response = await fetch("/api/generate-blog-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripName, date }),
      });

      const data = (await response.json()) as BlogPostResult;

      if (!response.ok) {
        setBlogPostResult({
          ...data,
          error: data.error || "Generování blog postu selhalo.",
        });
        return;
      }

      setBlogPostResult(data);
    } catch (error) {
      console.error(error);
      setBlogPostResult({
        error: "Nastala neočekávaná chyba při generování blog postu.",
      });
    } finally {
      setIsGeneratingBlogPost(false);
      setBlogPostStatus("idle");
    }
  }

  async function handleGenerateSummary() {
    setSummaryResult(null);
    setSummaryPhase(null);
    setSummaryIteration(0);

    if (!tripName?.trim()) {
      setSummaryResult({ error: "Zadej název tripu." });
      return;
    }

    setIsGeneratingSummary(true);
    setSummaryPhase("loading");

    try {
      const res = await fetch("/api/generate-trip-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripName: tripName.trim() }),
      });

      if (!res.ok || !res.body) {
        setSummaryResult({
          error: res.ok ? "Prázdná odpověď." : "Generování summary selhalo.",
        });
        return;
      }

      await readNdjsonStream<{
        phase?: string;
        iteration?: number;
        error?: string;
        preview?: string;
        iterations?: number;
        blogPostKey?: string;
      }>(res.body, (data) => {
        if (data.error) {
          setSummaryResult({ error: data.error });
          return;
        }
        if (data.phase === "loading") setSummaryPhase("loading");
        if (data.phase === "generating") setSummaryPhase("generating");
        if (data.phase === "correcting") {
          setSummaryPhase("correcting");
          setSummaryIteration(data.iteration ?? 0);
        }
        if (data.phase === "done") {
          setSummaryPhase("done");
          setSummaryResult({
            preview: data.preview,
            iterations: data.iterations,
            blogPostKey: data.blogPostKey,
          });
        }
      });
    } catch (err) {
      console.error(err);
      setSummaryResult({
        error: "Nastala neočekávaná chyba při generování summary.",
      });
    } finally {
      setIsGeneratingSummary(false);
      setSummaryPhase(null);
    }
  }

  async function handleSelectHeroPhoto(scope: "day" | "trip") {
    if (!tripName?.trim()) {
      setHeroMessage("Zadej název tripu.");
      return;
    }
    if (scope === "day" && (!date || !date.trim())) {
      setHeroMessage("Pro výběr hero fotky dne zadej datum.");
      return;
    }

    setHeroMessage(null);
    setHeroProgress({ scope, message: "Spouštím…" });

    try {
      const res = await fetch("/api/select-hero-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName: tripName.trim(),
          date: scope === "day" ? date.trim() : null,
          scope,
        }),
      });

      if (!res.ok || !res.body) {
        setHeroMessage(`Výběr hero fotky selhal (HTTP ${res.status}).`);
        return;
      }

      let finalResult: HeroPhotoResult | null = null;
      let errorMessage: string | null = null;

      await readNdjsonStream<{
        progress?: string;
        current?: number;
        total?: number;
        done?: boolean;
        error?: string;
        photos?: { filename: string; url: string }[];
      }>(res.body, (line) => {
        if (line.error) {
          errorMessage = line.error;
          return;
        }
        if (line.progress) {
          setHeroProgress({
            scope,
            message: line.progress,
            current: line.current,
            total: line.total,
          });
        }
        if (line.done) {
          finalResult = {
            scope,
            filename: "",
            heroUrl: null,
            photos: line.photos ?? [],
          };
        }
      });

      if (errorMessage) {
        setHeroMessage(errorMessage);
        return;
      }
      if (!finalResult) {
        setHeroMessage("Načítání kandidátů skončilo bez výsledku.");
        return;
      }

      const result: HeroPhotoResult = finalResult;
      if (scope === "day") {
        setDayHero(result);
        setHeroMessage(
          `Načteno ${result.photos.length} kandidátů — klikni na fotku pro výběr jako hero dne.`,
        );
      } else {
        setTripHero(result);
        setHeroMessage(
          `Načteno ${result.photos.length} kandidátů — klikni na fotku pro výběr jako hero tripu.`,
        );
      }
    } catch (error) {
      console.error(error);
      setHeroMessage("Nastala neočekávaná chyba při výběru hero fotky.");
    } finally {
      setHeroProgress(null);
    }
  }

  async function handleOverrideHeroPhoto(
    scope: "day" | "trip",
    filename: string,
  ) {
    if (!tripName?.trim()) {
      setHeroMessage("Zadej název tripu.");
      return;
    }
    if (scope === "day" && (!date || !date.trim())) {
      setHeroMessage("Pro výběr hero fotky dne zadej datum.");
      return;
    }

    setHeroMessage(null);

    try {
      const res = await fetch("/api/set-hero-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName: tripName.trim(),
          date: scope === "day" ? date.trim() : null,
          filename,
        }),
      });
      const data = (await res.json()) as
        | { scope: "day" | "trip"; filename: string }
        | { error?: string };

      if (!res.ok || "error" in data) {
        setHeroMessage(
          (data as { error?: string }).error ||
            "Ukládání hero fotky selhalo.",
        );
        return;
      }

      const payload = data as {
        scope: "day" | "trip";
        filename: string;
      };

      if (scope === "day" && dayHero) {
        const heroUrl =
          dayHero.photos.find((p) => p.filename === payload.filename)?.url ??
          null;
        setDayHero({
          ...dayHero,
          filename: payload.filename,
          heroUrl,
        });
      } else if (scope === "trip" && tripHero) {
        const heroUrl =
          tripHero.photos.find((p) => p.filename === payload.filename)?.url ??
          null;
        setTripHero({
          ...tripHero,
          filename: payload.filename,
          heroUrl,
        });
      }

      setHeroMessage("Hero fotka uložena");
    } catch (error) {
      console.error(error);
      setHeroMessage("Nastala neočekávaná chyba při ukládání hero fotky.");
    }
  }

  function openHeroLightbox(scope: "day" | "trip", filename: string) {
    setHeroLightbox({
      scope,
      filename,
      displayUrl: null,
      loading: true,
    });
    const params = new URLSearchParams({
      tripName: tripName.trim(),
      scope,
      filename,
    });
    if (scope === "day" && date?.trim()) params.set("date", date.trim());
    fetch(`/api/photo-display-url?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { url?: string; error?: string }) => {
        setHeroLightbox((prev) =>
          prev
            ? {
                ...prev,
                displayUrl: data.url ?? null,
                loading: false,
              }
            : null,
        );
      })
      .catch(() => {
        setHeroLightbox((prev) =>
          prev ? { ...prev, displayUrl: null, loading: false } : null,
        );
      });
  }

  function closeHeroLightbox() {
    setHeroLightbox(null);
  }

  function selectHeroFromLightbox() {
    if (!heroLightbox) return;
    handleOverrideHeroPhoto(heroLightbox.scope, heroLightbox.filename);
    closeHeroLightbox();
  }

  async function handleConvertPhotos() {
    if (!tripName?.trim()) {
      setConvertPhotosProgress("Zadej název tripu.");
      return;
    }
    if (sectionType === "day" && !date?.trim()) {
      setConvertPhotosProgress("Zadej datum pro konkrétní den.");
      return;
    }
    setIsConvertingPhotos(true);
    setConvertPhotosProgress(null);
    try {
      const res = await fetch("/api/convert-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName: tripName.trim(),
          date: sectionType === "summary" ? "summary" : date.trim(),
        }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setConvertPhotosProgress(err.error ?? "Konverze selhala.");
        return;
      }
      await readNdjsonStream<{
        progress?: string;
        error?: string;
        done?: boolean;
        converted?: number;
        total?: number;
      }>(res.body, (data) => {
        if (data.error) {
          setConvertPhotosProgress(data.error);
          return;
        }
        if (data.progress) setConvertPhotosProgress(data.progress);
        if (data.done && data.converted != null) {
          setConvertPhotosProgress(
            `Hotovo: ${data.converted} fotek zkonvertováno.`,
          );
        }
      });
    } catch (error) {
      console.error(error);
      setConvertPhotosProgress("Nastala neočekávaná chyba při konverzi.");
    } finally {
      setIsConvertingPhotos(false);
    }
  }

  async function handleCleanupPhotos() {
    if (!tripName?.trim()) {
      setCleanupPhotosResult("Zadej název tripu.");
      return;
    }
    if (sectionType === "day" && !date?.trim()) {
      setCleanupPhotosResult("Pro den zadej datum.");
      return;
    }
    setIsCleaningPhotos(true);
    setCleanupPhotosResult(null);
    try {
      const res = await fetch("/api/cleanup-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName: tripName.trim(),
          date: sectionType === "day" ? date.trim() : null,
        }),
      });
      const data = (await res.json()) as {
        deleted?: number;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setCleanupPhotosResult(data.error ?? "Čištění selhalo.");
        return;
      }
      setCleanupPhotosResult(
        data.message ?? `Smazáno ${data.deleted ?? 0} souborů.`,
      );
    } catch (error) {
      console.error(error);
      setCleanupPhotosResult("Nastala neočekávaná chyba při čištění.");
    } finally {
      setIsCleaningPhotos(false);
    }
  }

  async function handleUploadDayVideosToStream() {
    setStreamDayResult(null);
    if (!tripName?.trim() || !date?.trim()) {
      setStreamDayResult({ error: "Zadej název tripu a datum." });
      return;
    }
    setIsUploadingDayVideos(true);
    try {
      const res = await fetch("/api/upload-day-videos-to-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripName: tripName.trim(), date: date.trim() }),
      });
      const data = (await res.json()) as {
        uploaded?: { filename: string; streamId: string }[];
        skipped?: string[];
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setStreamDayResult({ error: data.error ?? "Nahrání do Stream selhalo." });
        return;
      }
      setStreamDayResult(data);
    } catch (error) {
      console.error(error);
      setStreamDayResult({ error: "Nastala neočekávaná chyba." });
    } finally {
      setIsUploadingDayVideos(false);
    }
  }

  async function handleWarmCache() {
    setWarmCacheLines([]);
    setWarmCacheSummary(null);
    setIsWarmingCache(true);
    try {
      const res = await fetch("/api/warm-cache", { method: "POST" });
      if (!res.ok || !res.body) {
        setWarmCacheSummary(
          res.ok ? "Prázdná odpověď." : "Zahřívání cache selhalo.",
        );
        return;
      }
      await readNdjsonStream<{ message?: string; error?: string }>(
        res.body,
        (data) => {
          if (data.error) {
            setWarmCacheSummary(data.error);
            return;
          }
          if (data.message) {
            if (data.message.startsWith("Cache warming dokončen:")) {
              const rest = data.message.slice("Cache warming dokončen:".length).trim();
              setWarmCacheSummary(`Cache zahřáta:${rest ? ` ${rest}` : ""}`);
            } else {
              setWarmCacheLines((prev) => [...prev, data.message!]);
            }
          }
        },
      );
    } catch (err) {
      console.error(err);
      setWarmCacheSummary("Nastala neočekávaná chyba při zahřívání cache.");
    } finally {
      setIsWarmingCache(false);
    }
  }

  async function handleLoadBlogText() {
    setEditTextMessage(null);
    setEditTextNotFound(false);
    setEditTextLoaded(false);
    setEditText("");

    const effectiveDate = sectionType === "summary" ? "summary" : date?.trim();
    if (!tripName?.trim() || !effectiveDate) {
      setEditTextMessage("Zadej název tripu a datum (nebo vyber summary).");
      return;
    }

    setIsLoadingText(true);
    try {
      const params = new URLSearchParams({
        tripName: tripName.trim(),
        date: effectiveDate,
      });
      const res = await fetch(`/api/get-blog-post?${params.toString()}`);
      const data = (await res.json()) as { content: string | null; error?: string };
      if (data.error) {
        setEditTextMessage(data.error);
        return;
      }
      if (data.content == null) {
        setEditTextNotFound(true);
        return;
      }
      setEditText(data.content);
      setEditTextLoaded(true);
    } catch (err) {
      console.error(err);
      setEditTextMessage("Nastala neočekávaná chyba při načítání textu.");
    } finally {
      setIsLoadingText(false);
    }
  }

  async function handleSaveBlogText() {
    setEditTextMessage(null);

    const effectiveDate = sectionType === "summary" ? "summary" : date?.trim();
    if (!tripName?.trim() || !effectiveDate) {
      setEditTextMessage("Zadej název tripu a datum.");
      return;
    }

    setIsSavingText(true);
    try {
      const res = await fetch("/api/save-blog-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripName: tripName.trim(),
          date: effectiveDate,
          content: editText,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.error) {
        setEditTextMessage(data.error);
        return;
      }
      setEditTextMessage("Text uložen");
    } catch (err) {
      console.error(err);
      setEditTextMessage("Nastala neočekávaná chyba při ukládání textu.");
    } finally {
      setIsSavingText(false);
    }
  }

  async function handleSyncAllVideosToStream() {
    setStreamSyncResult(null);
    setStreamSyncProgress(null);
    setIsSyncingAllVideos(true);
    try {
      const res = await fetch("/api/sync-all-videos-to-stream", {
        method: "POST",
      });
      if (!res.ok || !res.body) {
        setStreamSyncResult({
          error: res.ok ? "Prázdná odpověď." : "Synchronizace selhala.",
        });
        return;
      }
      await readNdjsonStream<{
        progress?: string;
        current?: number;
        total?: number;
        done?: boolean;
        uploaded?: number;
        error?: string;
      }>(res.body, (data) => {
        if (data.error) {
          setStreamSyncResult({ error: data.error });
          return;
        }
        if (data.progress) setStreamSyncProgress(data.progress);
        if (data.done && data.uploaded != null) {
          setStreamSyncResult({
            uploaded: data.uploaded,
            total: data.total,
          });
        }
      });
    } catch (error) {
      console.error(error);
      setStreamSyncResult({ error: "Nastala neočekávaná chyba." });
    } finally {
      setIsSyncingAllVideos(false);
      setStreamSyncProgress(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl shadow-slate-900/40 backdrop-blur">
        <div className="border-b border-slate-800 px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Upload cestovních vzpomínek
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Soubory se automaticky uloží do správných adresářů v Cloudflare R2.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Název tripu
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedTripOption || (tripOptions.length === 0 ? "" : "new")}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedTripOption(value === "new" ? "" : value);
                  if (value === "new") {
                    setTripName("");
                  } else {
                    setTripName(value);
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40 sm:w-1/2"
                disabled={isLoadingTrips}
              >
                {tripOptions.length > 0 && (
                  <>
                    {tripOptions.map((trip) => (
                      <option key={trip} value={trip}>
                        {trip}
                      </option>
                    ))}
                    <option value="new">Nový trip…</option>
                  </>
                )}
                {tripOptions.length === 0 && (
                  <option value="new">Nový trip…</option>
                )}
              </select>

              <input
                type="text"
                required={!selectedTripOption}
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder="např. 02_2026 bezky Norsko"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-0 transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40 sm:flex-1"
              />
            </div>
            <p className="text-xs text-slate-500">
              Formát doporučený v dokumentaci:{" "}
              <span className="font-mono">MM_YYYY nazev</span>.
            </p>
            {isLoadingTrips && (
              <p className="text-xs text-slate-500">Načítám existující tripy…</p>
            )}
            {tripsError && (
              <p className="text-xs text-red-400">{tripsError}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Typ sekce
              </label>
              <select
                value={sectionType}
                onChange={(e) => {
                  const value = e.target.value as SectionType;
                  setSectionType(value);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
              >
                <option value="day">Konkrétní den</option>
                <option value="summary">Summary (celý trip)</option>
              </select>
            </div>

            {sectionType === "day" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-200">
                  Datum
                </label>
                <input
                  type="date"
                  required={sectionType === "day"}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                />
                <p className="text-xs text-slate-500">
                  Formát: <span className="font-mono">YYYY-MM-DD</span>.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Soubory
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(e) => setFiles(e.target.files)}
              className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-700 bg-slate-900 px-3 py-4 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:border-slate-500"
            />
            <p className="text-xs text-slate-500">
              Podporované typy:{" "}
              <span className="font-mono">
                .m4a, .mp3, .jpg, .jpeg, .heic, .png, .txt, .md, .gpx, .mov,
                .mp4
              </span>
              . Automatické rozdělení do složek{" "}
              <span className="font-mono">
                audio / photos / notes / map / video
              </span>
              .
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {isSubmitting ? "Nahrávám..." : "Nahrát do R2"}
            </button>

            <button
              type="button"
              onClick={handleTranscribe}
              disabled={isTranscribing}
              className="flex-1 rounded-lg border border-sky-600/60 bg-slate-900 px-4 py-2.5 text-sm font-medium text-sky-200 shadow-sm transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {isTranscribing ? "Přepisuji audio..." : "Přepsat audio"}
            </button>

            <button
              type="button"
              onClick={handleGenerateBlogPost}
              disabled={
                isGeneratingBlogPost ||
                sectionType !== "day" ||
                !date ||
                !tripName
              }
              className="flex-1 rounded-lg border border-amber-600/60 bg-slate-900 px-4 py-2.5 text-sm font-medium text-amber-200 shadow-sm transition hover:border-amber-500 hover:text-amber-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {isGeneratingBlogPost
                ? blogPostStatus === "deleting"
                  ? "Mažu předchozí verzi..."
                  : "Generuji blog post..."
                : "Generovat blog post"}
            </button>
          </div>

          {uploadProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <span className="min-w-0 truncate">
                  {uploadProgress.phase === "preparing" &&
                    "Připravuji upload…"}
                  {uploadProgress.phase === "uploading" && (
                    <>
                      Nahrávám do R2
                      {uploadProgress.count ? (
                        <>
                          {" "}
                          <span className="text-slate-400">
                            ({uploadProgress.current}/{uploadProgress.count})
                          </span>
                        </>
                      ) : null}
                      {uploadProgress.filename ? (
                        <>
                          :{" "}
                          <span className="text-slate-400">
                            {uploadProgress.filename}
                          </span>
                        </>
                      ) : null}
                    </>
                  )}
                  {uploadProgress.phase === "finalizing" && "Dokončuji…"}
                  {!uploadProgress.phase && "Nahrávám…"}
                </span>
                <span className="shrink-0 font-mono text-slate-400">
                  {formatBytes(uploadProgress.loaded)}
                  {uploadProgress.total > 0 && (
                    <> / {formatBytes(uploadProgress.total)}</>
                  )}
                  {" · "}
                  {uploadProgress.percent}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-150 ease-out"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {sectionType === "day" && (
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <p className="text-xs font-medium text-slate-300">
                Mapy tras (GPX)
              </p>
              {gpxFiles.length === 0 && tripName && date && (
                <p className="text-xs text-slate-500">
                  Pro tento den není v R2 žádný GPX soubor ve složce map.
                </p>
              )}
              {gpxConfigs.length > 0 && (
                <div className="space-y-2">
                  {gpxConfigs.map((cfg) => (
                    <div
                      key={cfg.filename}
                      className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2 sm:flex-row sm:items-center"
                    >
                      <p
                        className="min-w-0 flex-1 truncate font-mono text-xs text-slate-300"
                        title={cfg.filename}
                      >
                        {cfg.displayName}
                      </p>
                      <select
                        value={cfg.routeType}
                        onChange={(e) =>
                          updateGpxConfig(cfg.filename, {
                            routeType: e.target.value as RouteType,
                          })
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40 sm:w-36"
                      >
                        {ROUTE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={cfg.mapLayer}
                        onChange={(e) =>
                          updateGpxConfig(cfg.filename, {
                            mapLayer: e.target.value,
                          })
                        }
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40 sm:w-40"
                      >
                        {MAP_LAYER_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleGenerateTrailMap}
                  disabled={gpxConfigs.length === 0 || isGeneratingTrailMap}
                  className="rounded-lg border border-emerald-600/60 bg-slate-900 px-4 py-2.5 text-sm font-medium text-emerald-200 shadow-sm transition hover:border-emerald-500 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  {isGeneratingTrailMap
                    ? trailMapProgress ?? "Generuji..."
                    : gpxConfigs.length > 1
                      ? "Generovat mapy"
                      : "Generovat mapu"}
                </button>
                {!isGeneratingTrailMap && trailMapProgress && (
                  <p className="text-xs text-slate-400">{trailMapProgress}</p>
                )}
              </div>
            </div>
          )}

          {(sectionType === "day" || sectionType === "summary") && (
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <p className="text-xs font-medium text-slate-300">
                {sectionType === "day"
                  ? "HEIC / JPG / PNG → cache (thumb, display, ai)"
                  : "Fotky summary – konverze do cache"}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                <button
                  type="button"
                  onClick={handleConvertPhotos}
                  disabled={
                    !tripName ||
                    (sectionType === "day" && !date) ||
                    isConvertingPhotos
                  }
                  className="rounded-lg border border-amber-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-amber-200 shadow-sm transition hover:border-amber-500 hover:text-amber-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  {isConvertingPhotos ? "Konvertuji..." : "Konvertovat fotky"}
                </button>
                <button
                  type="button"
                  onClick={handleCleanupPhotos}
                  disabled={
                    !tripName ||
                    (sectionType === "day" && !date) ||
                    isCleaningPhotos
                  }
                  className="rounded-lg border border-slate-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-200 shadow-sm transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  {isCleaningPhotos ? "Čistím..." : "Vyčistit cache fotek"}
                </button>
                {convertPhotosProgress != null && (
                  <p className="text-xs text-slate-400">
                    {convertPhotosProgress}
                  </p>
                )}
                {cleanupPhotosResult != null && (
                  <p className="text-xs text-slate-400">
                    {cleanupPhotosResult}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Videa – Cloudflare Stream */}
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <p className="text-xs font-medium text-slate-300">
              Videa – Cloudflare Stream
            </p>
            <p className="text-xs text-slate-500">
              Po nahrání .mov / .mp4 do R2 je nahraj do Stream pro kompresi a streaming. Na blogu se pak zobrazí v sekci Videa.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={handleUploadDayVideosToStream}
                disabled={
                  !tripName || !date || isUploadingDayVideos
                }
                className="rounded-lg border border-sky-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-sky-200 shadow-sm transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isUploadingDayVideos ? "Nahrávám..." : "Nahrát videa do Stream"}
              </button>
              <span className="text-xs text-slate-500">
                (pro vybraný den)
              </span>
              <button
                type="button"
                onClick={handleSyncAllVideosToStream}
                disabled={isSyncingAllVideos}
                className="rounded-lg border border-violet-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-violet-200 shadow-sm transition hover:border-violet-500 hover:text-violet-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isSyncingAllVideos ? "Synchronizuji..." : "Synchronizovat všechna videa do Stream"}
              </button>
            </div>
            {streamSyncProgress != null && (
              <p className="text-xs text-slate-400">{streamSyncProgress}</p>
            )}
            {streamDayResult && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs">
                {streamDayResult.error && (
                  <p className="font-medium text-red-400">{streamDayResult.error}</p>
                )}
                {streamDayResult.message && !streamDayResult.error && (
                  <p className="text-slate-300">{streamDayResult.message}</p>
                )}
                {streamDayResult.uploaded && streamDayResult.uploaded.length > 0 && (
                  <ul className="mt-2 space-y-1 text-slate-400">
                    {streamDayResult.uploaded.map(({ filename, streamId }) => (
                      <li key={filename}>
                        <span className="font-mono">{filename}</span> → Stream ID:{" "}
                        <span className="font-mono text-sky-300">{streamId}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {streamDayResult.skipped && streamDayResult.skipped.length > 0 && (
                  <p className="mt-1 text-slate-500">
                    Přeskočeno (již v Stream): {streamDayResult.skipped.join(", ")}
                  </p>
                )}
              </div>
            )}
            {streamSyncResult && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs">
                {streamSyncResult.error && (
                  <p className="font-medium text-red-400">{streamSyncResult.error}</p>
                )}
                {!streamSyncResult.error && streamSyncResult.uploaded != null && (
                  <p className="text-slate-300">
                    Hotovo: nahráno {streamSyncResult.uploaded} z {streamSyncResult.total} videí do Stream.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Upravit text */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <p className="text-xs font-medium text-slate-300">
              Upravit text
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleLoadBlogText}
                disabled={
                  isLoadingText ||
                  !tripName?.trim() ||
                  (sectionType === "day" && !date?.trim())
                }
                className="rounded-lg border border-sky-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-sky-200 shadow-sm transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isLoadingText ? "Načítám..." : "Načíst text"}
              </button>
              {editTextLoaded && (
                <button
                  type="button"
                  onClick={handleSaveBlogText}
                  disabled={isSavingText}
                  className="rounded-lg border border-emerald-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-emerald-200 shadow-sm transition hover:border-emerald-500 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
                >
                  {isSavingText ? "Ukládám..." : "Uložit text"}
                </button>
              )}
            </div>
            {editTextNotFound && (
              <p className="text-xs text-slate-500">
                Pro tento den ještě nebyl vygenerován text.
              </p>
            )}
            {editTextLoaded && (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full min-h-[400px] rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-relaxed text-slate-200 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40 font-sans"
                spellCheck={false}
              />
            )}
            {editTextMessage && (
              <p
                className={`text-xs ${
                  editTextMessage === "Text uložen"
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {editTextMessage}
              </p>
            )}
          </div>

          {/* Hero fotky */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <p className="text-xs font-medium text-slate-300">
              Hero fotky
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => handleSelectHeroPhoto("day")}
                disabled={!tripName || !date || heroProgress !== null}
                className="rounded-lg border border-emerald-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-emerald-200 shadow-sm transition hover:border-emerald-500 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {heroProgress?.scope === "day"
                  ? "Vybírám hero fotku dne…"
                  : "Vybrat hero fotku dne"}
              </button>
              <button
                type="button"
                onClick={() => handleSelectHeroPhoto("trip")}
                disabled={!tripName || heroProgress !== null}
                className="rounded-lg border border-sky-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-sky-200 shadow-sm transition hover:border-sky-500 hover:text-sky-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {heroProgress?.scope === "trip"
                  ? "Vybírám hero fotku tripu…"
                  : "Vybrat hero fotku tripu"}
              </button>
              <button
                type="button"
                onClick={() => handleShowCurrentHero("day")}
                disabled={
                  !tripName || !date || isLoadingCurrentHero === "day"
                }
                className="rounded-lg border border-slate-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-200 shadow-sm transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isLoadingCurrentHero === "day"
                  ? "Načítám..."
                  : "Zobraz aktuální hero dne"}
              </button>
              <button
                type="button"
                onClick={() => handleShowCurrentHero("trip")}
                disabled={!tripName || isLoadingCurrentHero === "trip"}
                className="rounded-lg border border-slate-600/60 bg-slate-900 px-4 py-2.5 text-xs font-medium text-slate-200 shadow-sm transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isLoadingCurrentHero === "trip"
                  ? "Načítám..."
                  : "Zobraz aktuální hero tripu"}
              </button>
            </div>
            {heroProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                  <span className="min-w-0 truncate">
                    {heroProgress.scope === "day" ? "Hero dne: " : "Hero tripu: "}
                    <span className="text-slate-400">{heroProgress.message}</span>
                  </span>
                  {heroProgress.total != null && heroProgress.current != null && (
                    <span className="shrink-0 font-mono text-slate-400">
                      {heroProgress.current}/{heroProgress.total}
                    </span>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-[width] duration-150 ease-out ${
                      heroProgress.scope === "day"
                        ? "bg-emerald-500"
                        : "bg-sky-500"
                    }`}
                    style={{
                      width:
                        heroProgress.total && heroProgress.total > 0
                          ? `${Math.min(
                              100,
                              Math.round(
                                ((heroProgress.current ?? 0) /
                                  heroProgress.total) *
                                  100,
                              ),
                            )}%`
                          : "40%",
                    }}
                  />
                </div>
              </div>
            )}
            {currentHeroError && (
              <p className="text-xs text-amber-300">{currentHeroError}</p>
            )}

            {(currentDayHero || currentTripHero) && (
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs">
                {currentDayHero && (
                  <div className="space-y-2">
                    <p className="font-medium text-slate-200">
                      Aktuální hero dne:{" "}
                      <span className="text-sky-300">
                        {currentDayHero.filename}
                      </span>
                    </p>
                    {currentDayHero.heroUrl && tripName && date && (
                      <HeroFocusEditor
                        tripName={tripName.trim()}
                        date={date.trim()}
                        heroUrl={currentDayHero.heroUrl}
                        heroFilename={currentDayHero.filename}
                      />
                    )}
                  </div>
                )}
                {currentTripHero && (
                  <div className="space-y-2 border-t border-slate-800 pt-3 mt-3">
                    <p className="font-medium text-slate-200">
                      Aktuální hero tripu:{" "}
                      <span className="text-sky-300">
                        {currentTripHero.filename}
                      </span>
                    </p>
                    {currentTripHero.heroUrl && tripName && (
                      <HeroFocusEditor
                        tripName={tripName.trim()}
                        date={null}
                        heroUrl={currentTripHero.heroUrl}
                        heroFilename={currentTripHero.filename}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {(dayHero || tripHero) && (
              <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs">
                {dayHero && (
                  <div className="space-y-2">
                    {dayHero.filename && (
                      <p className="font-medium text-slate-200">
                        Hero fotka dne:{" "}
                        <span className="text-sky-300">
                          {dayHero.filename}
                        </span>
                      </p>
                    )}
                    {dayHero.filename && dayHero.heroUrl && (
                      <img
                        src={dayHero.heroUrl}
                        alt={dayHero.filename}
                        className="max-h-40 w-full rounded-md object-cover"
                      />
                    )}
                    <div className="space-y-1">
                      <p className="text-slate-400">
                        Klikni na fotku pro výběr jako hero dne (až 40 fotek, jen s&nbsp;cache):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {dayHero.photos.map((p) => (
                          <button
                            key={p.filename}
                            type="button"
                            onClick={() =>
                              openHeroLightbox("day", p.filename)
                            }
                            className={`overflow-hidden rounded-md border ${
                              p.filename === dayHero.filename
                                ? "border-emerald-500 ring-2 ring-emerald-500/50"
                                : "border-slate-700"
                            }`}
                          >
                            <img
                              src={p.url}
                              alt={p.filename}
                              className="h-20 w-20 object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {tripHero && (
                  <div className="space-y-2 border-t border-slate-800 pt-3 mt-3">
                    {tripHero.filename && (
                      <p className="font-medium text-slate-200">
                        Hero fotka tripu:{" "}
                        <span className="text-sky-300">
                          {tripHero.filename}
                        </span>
                      </p>
                    )}
                    {tripHero.filename && tripHero.heroUrl && (
                      <img
                        src={tripHero.heroUrl}
                        alt={tripHero.filename}
                        className="max-h-40 w-full rounded-md object-cover"
                      />
                    )}
                    <div className="space-y-1">
                      <p className="text-slate-400">
                        Klikni na fotku pro výběr jako hero tripu (až 40 fotek, dedupe
                        podle názvu):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {tripHero.photos.map((p) => (
                          <button
                            key={p.filename}
                            type="button"
                            onClick={() =>
                              openHeroLightbox("trip", p.filename)
                            }
                            className={`overflow-hidden rounded-md border ${
                              p.filename === tripHero.filename
                                ? "border-emerald-500 ring-2 ring-emerald-500/50"
                                : "border-slate-700"
                            }`}
                          >
                            <img
                              src={p.url}
                              alt={p.filename}
                              className="h-20 w-20 object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {heroLightbox != null && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Náhled fotky"
                  >
                    <div className="relative max-h-[90vh] w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
                      <button
                        type="button"
                        onClick={closeHeroLightbox}
                        className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                        aria-label="Zavřít"
                      >
                        <span className="text-xl">×</span>
                      </button>
                      {heroLightbox.loading ? (
                        <p className="py-12 text-center text-slate-400">
                          Načítám náhled…
                        </p>
                      ) : heroLightbox.displayUrl ? (
                        <>
                          <img
                            src={heroLightbox.displayUrl}
                            alt={heroLightbox.filename}
                            className="mx-auto max-h-[70vh] w-full rounded-lg object-contain"
                          />
                          <div className="mt-3 flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={selectHeroFromLightbox}
                              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                            >
                              Vybrat jako hero
                            </button>
                            <button
                              type="button"
                              onClick={closeHeroLightbox}
                              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                            >
                              Zavřít
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="py-8 text-center text-slate-400">
                            Nepodařilo se načíst náhled.
                          </p>
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={closeHeroLightbox}
                              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                            >
                              Zavřít
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {trailMapResult && (
            <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              {trailMapResult.error && (
                <p className="font-medium text-red-400">
                  {trailMapResult.error}
                </p>
              )}
              {trailMapResult.routes && trailMapResult.routes.length > 0 && (
                <div className="space-y-4">
                  <p className="text-xs font-medium text-slate-300">
                    Náhled vygenerovaných map
                  </p>
                  {trailMapResult.routes.map((r) => (
                    <div key={r.slug} className="space-y-2">
                      <p className="text-xs text-slate-400">
                        <span className="font-semibold text-slate-200">
                          {r.name}
                        </span>
                        {" · "}
                        {r.routeType === "car" ? "Auto" : "Pěší"}
                      </p>
                      <img
                        src={r.mapTrailUrl}
                        alt={`Mapa trasy — ${r.name}`}
                        className="w-full rounded border border-slate-700 object-contain max-h-72"
                      />
                      {r.mapElevationUrl && (
                        <img
                          src={r.mapElevationUrl}
                          alt={`Výškový profil — ${r.name}`}
                          className="w-full rounded border border-slate-700 object-contain max-h-56"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-slate-800 pt-4">
            <p className="mb-2 text-xs font-medium text-slate-300">
              Summary celého tripu
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={!tripName?.trim() || isGeneratingSummary}
                className="rounded-lg border border-violet-600/60 bg-slate-900 px-4 py-2.5 text-sm font-medium text-violet-200 shadow-sm transition hover:border-violet-500 hover:text-violet-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
              >
                {isGeneratingSummary
                  ? summaryPhase === "loading"
                    ? "Načítám materiály..."
                    : summaryPhase === "generating"
                      ? "Generuji..."
                      : summaryPhase === "correcting"
                        ? `Koriguji (iterace ${summaryIteration}/3)...`
                        : "Hotovo"
                  : "Generovat summary"}
              </button>
            </div>
          </div>

          {summaryResult && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              {summaryResult.error && (
                <p className="font-medium text-red-400">
                  {summaryResult.error}
                </p>
              )}
              {summaryResult.blogPostKey && !summaryResult.error && (
                <p className="text-xs text-slate-400">
                  Uloženo jako{" "}
                  <span className="font-mono">{summaryResult.blogPostKey}</span>
                </p>
              )}
              {summaryResult.iterations != null && (
                <p className="text-xs text-slate-400">
                  Počet iterací (Kreativec ↔ Korektor):{" "}
                  {summaryResult.iterations}
                </p>
              )}
              {summaryResult.preview && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-300">
                    Náhled výstupu:
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                    {summaryResult.preview}
                  </div>
                </div>
              )}
            </div>
          )}

          {blogPostResult && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              {blogPostResult.error && (
                <p className="font-medium text-red-400">
                  {blogPostResult.error}
                </p>
              )}
              {blogPostResult.message && !blogPostResult.error && (
                <p className="font-medium text-emerald-400">
                  {blogPostResult.message}
                </p>
              )}
              {blogPostResult.blogPostKey && (
                <p className="text-xs text-slate-400">
                  Uloženo jako{" "}
                  <span className="font-mono">
                    {blogPostResult.blogPostKey}
                  </span>
                </p>
              )}
              {blogPostResult.iterations != null && (
                <p className="text-xs text-slate-400">
                  Počet iterací (Kreativec ↔ Korektor):{" "}
                  {blogPostResult.iterations}
                </p>
              )}
              {blogPostResult.preview && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-300">
                    Náhled výstupu:
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                    {blogPostResult.preview}
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              {result.error && (
                <p className="font-medium text-red-400">{result.error}</p>
              )}
              {result.message && !result.error && (
                <p className="font-medium text-emerald-400">
                  {result.message}
                </p>
              )}

              {result.uploaded && result.uploaded.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-300">
                    Nahrané soubory:
                  </p>
                  <ul className="list-inside list-disc text-xs text-slate-400">
                    {result.uploaded.map((key) => (
                      <li key={key} className="font-mono break-all">
                        {key}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.skipped && result.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-300">
                    Přeskočené soubory:
                  </p>
                  <ul className="list-inside list-disc text-xs text-slate-400">
                    {result.skipped.map((item) => (
                      <li key={item.filename}>
                        <span className="font-mono">{item.filename}</span>{" "}
                        – {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {transcribeResult && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              {transcribeResult.error && (
                <p className="font-medium text-red-400">
                  {transcribeResult.error}
                </p>
              )}
              {transcribeResult.message && !transcribeResult.error && (
                <p className="font-medium text-emerald-400">
                  {transcribeResult.message}
                </p>
              )}

              {transcribeResult.rawTranscriptKey && (
                <p className="text-xs text-slate-400">
                  Surový přepis:{" "}
                  <span className="font-mono">
                    {transcribeResult.rawTranscriptKey}
                  </span>
                </p>
              )}
              {transcribeResult.cleanTranscriptKey && (
                <p className="text-xs text-slate-400">
                  Vyčištěný přepis:{" "}
                  <span className="font-mono">
                    {transcribeResult.cleanTranscriptKey}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Správa cache */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <h2 className="text-sm font-medium text-slate-100">
              Správa cache
            </h2>
            <p className="text-xs text-slate-500">
              Naplní Supabase cache všemi tripy a dny z R2. Blog se pak načte rychleji.
            </p>
            <button
              type="button"
              onClick={handleWarmCache}
              disabled={isWarmingCache}
              className="rounded-lg border border-amber-600/60 bg-slate-900 px-4 py-2.5 text-sm font-medium text-amber-200 shadow-sm transition hover:border-amber-500 hover:text-amber-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
            >
              {isWarmingCache ? "Zahřívám cache..." : "Zahřát cache"}
            </button>
            {(warmCacheLines.length > 0 || warmCacheSummary) && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs">
                {warmCacheLines.length > 0 && (
                  <div className="mb-2 max-h-48 overflow-y-auto font-mono text-slate-400">
                    {warmCacheLines.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}
                {warmCacheSummary && (
                  <p className="font-medium text-emerald-400">
                    {warmCacheSummary}
                  </p>
                )}
              </div>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}

