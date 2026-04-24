"use client";

import { useState, useRef, useEffect, useCallback } from "react";

declare global {
  interface Window {
    Stream?: (iframe: HTMLIFrameElement) => StreamPlayer;
  }
}

interface StreamPlayer {
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
  play(): void;
}

export type StreamVideoItem = {
  streamId: string;
  filename: string;
  width: number;
  height: number;
  isLandscape: boolean;
};

type Props = {
  videos: StreamVideoItem[];
};

/** Load Cloudflare Stream SDK script (once) */
function ensureStreamSdk(): Promise<void> {
  return new Promise((resolve) => {
    if (window.Stream) {
      resolve();
      return;
    }
    const existing = document.querySelector(
      'script[src*="embed.cloudflarestream.com"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.Stream) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
    script.async = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}

export function VideoGridWithLightbox({ videos }: Props) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const lightboxIframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<StreamPlayer | null>(null);

  const lightboxVideo = lightboxIdx !== null ? videos[lightboxIdx] : null;

  function openLightbox(idx: number) {
    setLightboxIdx(idx);
  }

  function closeLightbox() {
    playerRef.current = null;
    setLightboxIdx(null);
  }

  // Attach Stream SDK "ended" listener to lightbox iframe
  const lightboxIdxRef = useRef(lightboxIdx);
  lightboxIdxRef.current = lightboxIdx;

  const advanceToNext = useCallback(() => {
    const idx = lightboxIdxRef.current;
    if (idx !== null && idx < videos.length - 1) {
      setLightboxIdx(idx + 1);
    }
  }, [videos.length]);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const iframe = lightboxIframeRef.current;
    if (!iframe) return;

    let player: StreamPlayer | null = null;

    ensureStreamSdk().then(() => {
      if (!window.Stream || !lightboxIframeRef.current) return;
      player = window.Stream(lightboxIframeRef.current);
      playerRef.current = player;
      player.addEventListener("ended", advanceToNext);
    });

    return () => {
      if (player) {
        player.removeEventListener("ended", advanceToNext);
      }
      playerRef.current = null;
    };
  }, [lightboxIdx, advanceToNext]);

  function streamEmbedUrl(streamId: string, autoplay: boolean) {
    const base = `https://iframe.cloudflarestream.com/${streamId}`;
    return autoplay ? `${base}?autoplay=true` : base;
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-4">
        {videos.map((video, idx) => (
          <button
            key={video.streamId}
            type="button"
            onClick={() => openLightbox(idx)}
            className={`overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/40 text-left shadow-xl shadow-black/40 transition hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/70 ${
              video.isLandscape ? "col-span-2" : "col-span-1"
            }`}
          >
            <div
              className="w-full overflow-hidden bg-black"
              style={{ aspectRatio: `${video.width} / ${video.height}` }}
            >
              <iframe
                src={streamEmbedUrl(video.streamId, false)}
                title={video.filename}
                loading="lazy"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full pointer-events-none"
              />
            </div>
            <p className="p-2 text-xs text-slate-400">{video.filename}</p>
          </button>
        ))}
      </div>

      {lightboxVideo != null && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Video v přehrávači"
          onClick={closeLightbox}
        >
          <div
            className="relative shrink-0"
            style={{
              width: `min(90vw, 85vh * ${lightboxVideo.width} / ${lightboxVideo.height})`,
              aspectRatio: `${lightboxVideo.width} / ${lightboxVideo.height}`,
              maxHeight: "85vh",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-slate-800/90 p-2 text-slate-200 shadow-lg transition hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
              aria-label="Zavřít"
            >
              <span className="text-xl leading-none">×</span>
            </button>

            {/* Video counter */}
            {videos.length > 1 && (
              <div className="absolute -top-8 left-0 right-0 text-center font-nunito text-xs text-slate-400">
                {lightboxIdx + 1} / {videos.length}
              </div>
            )}

            <div className="h-full w-full overflow-hidden rounded-2xl border border-slate-700/80 bg-black shadow-2xl">
              <iframe
                ref={lightboxIframeRef}
                src={streamEmbedUrl(lightboxVideo.streamId, true)}
                title={lightboxVideo.filename}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>

            {/* Prev/Next buttons */}
            {videos.length > 1 && (
              <>
                {lightboxIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(lightboxIdx - 1)}
                    className="absolute left-0 top-1/2 -translate-x-12 -translate-y-1/2 rounded-full bg-slate-800/90 p-2 text-slate-200 shadow-lg transition hover:bg-slate-700 hover:text-white focus:outline-none"
                    aria-label="Předchozí video"
                  >
                    <span className="text-xl leading-none">‹</span>
                  </button>
                )}
                {lightboxIdx < videos.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(lightboxIdx + 1)}
                    className="absolute right-0 top-1/2 translate-x-12 -translate-y-1/2 rounded-full bg-slate-800/90 p-2 text-slate-200 shadow-lg transition hover:bg-slate-700 hover:text-white focus:outline-none"
                    aria-label="Následující video"
                  >
                    <span className="text-xl leading-none">›</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
