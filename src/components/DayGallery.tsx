"use client";

import { useState, useMemo } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

type Photo = {
  key: string;
  url: string;
  /** Pro lightbox (CACHE_DISPLAY); pokud chybí, použije se url */
  displayUrl?: string;
  /** ISO timestamp DateTimeOriginal ze serveru (EXIF během convert-photos). */
  capturedAt?: string | null;
};

type Props = {
  date: string;
  photos: Photo[];
};

/** Extract a sortable timestamp from filename (e.g. IMG_20260203_143022) */
function filenameSortKey(key: string): string {
  const filename = key.split("/").pop() ?? key;
  const match = filename.match(
    /(\d{4})[\-_]?(\d{2})[\-_]?(\d{2})[\-_]?(\d{2})[\-_]?(\d{2})[\-_]?(\d{2})/,
  );
  if (match) {
    return `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}`;
  }
  return filename.toLowerCase();
}

export function DayGallery({ photos }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // Řadíme čistě podle server-side capturedAt (EXIF DateTimeOriginal).
  // Pokud ho nějaká fotka nemá (starý záznam bez _meta.json), jde
  // na konec a mezi sebou jsou seřazené podle filename.
  const sortedPhotos = useMemo(() => {
    const withTime = photos
      .filter((p) => p.url)
      .map((photo) => ({
        photo,
        ms: photo.capturedAt
          ? Date.parse(photo.capturedAt)
          : Number.NaN,
      }));
    withTime.sort((a, b) => {
      const aOk = Number.isFinite(a.ms);
      const bOk = Number.isFinite(b.ms);
      if (aOk && bOk) return a.ms - b.ms;
      if (aOk) return -1;
      if (bOk) return 1;
      return filenameSortKey(a.photo.key).localeCompare(
        filenameSortKey(b.photo.key),
      );
    });
    return withTime.map((w) => w.photo);
  }, [photos]);

  if (photos.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Pro tento den zatím nejsou nahrané žádné fotky.
      </p>
    );
  }

  function openAt(i: number) {
    setIndex(i);
    setOpen(true);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {sortedPhotos.map((photo, i) => (
          <button
            key={photo.key}
            type="button"
            onClick={() => openAt(i)}
            className="group overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
          >
            <img
              src={photo.url}
              alt={photo.key}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {open && (
        <Lightbox
          open={open}
          close={() => setOpen(false)}
          index={index}
          slides={sortedPhotos.map((photo) => ({
            src: photo.displayUrl ?? photo.url,
          }))}
          plugins={[Zoom]}
          zoom={{
            maxZoomPixelRatio: 3,
            scrollToZoom: true,
          }}
        />
      )}
    </>
  );
}
