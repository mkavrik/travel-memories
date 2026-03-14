"use client";

import { useState } from "react";

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

export function VideoGridWithLightbox({ videos }: Props) {
  const [lightboxVideo, setLightboxVideo] = useState<StreamVideoItem | null>(null);

  function openLightbox(video: StreamVideoItem) {
    setLightboxVideo(video);
  }

  function closeLightbox() {
    setLightboxVideo(null);
  }

  return (
    <>
      <div className="grid grid-cols-6 gap-4">
        {videos.map((video) => (
          <button
            key={video.streamId}
            type="button"
            onClick={() => openLightbox(video)}
            className={`overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/40 text-left shadow-xl shadow-black/40 transition hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500/70 ${
              video.isLandscape ? "col-span-2" : "col-span-1"
            }`}
          >
            <div
              className="w-full overflow-hidden bg-black"
              style={{ aspectRatio: `${video.width} / ${video.height}` }}
            >
              <iframe
                src={`https://iframe.cloudflarestream.com/${video.streamId}`}
                title={video.filename}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full pointer-events-none"
              />
            </div>
            <p className="p-2 text-xs text-slate-400">{video.filename}</p>
          </button>
        ))}
      </div>

      {lightboxVideo != null && (
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
            <div className="h-full w-full overflow-hidden rounded-2xl border border-slate-700/80 bg-black shadow-2xl">
              <iframe
                src={`https://iframe.cloudflarestream.com/${lightboxVideo.streamId}`}
                title={lightboxVideo.filename}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
