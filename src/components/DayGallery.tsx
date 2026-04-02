"use client";

import { useState, useMemo, useEffect } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import exifr from "exifr";

type Photo = {
  key: string;
  url: string;
  /** Pro lightbox (CACHE_DISPLAY); pokud chybí, použije se url */
  displayUrl?: string;
};

type Props = {
  primaryUrl: string | null;
  date: string;
  photos: Photo[];
};

/** Extract a sortable timestamp from filename (e.g. IMG_20260203_143022) */
function filenameSortKey(key: string): string {
  const filename = key.split("/").pop() ?? key;
  // Try to find date-like patterns in filename
  const match = filename.match(/(\d{4})[\-_]?(\d{2})[\-_]?(\d{2})[\-_]?(\d{2})[\-_]?(\d{2})[\-_]?(\d{2})/);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}${match[6]}`;
  }
  return filename.toLowerCase();
}

export function DayGallery({ primaryUrl, date, photos }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [sortedPhotos, setSortedPhotos] = useState<Photo[]>([]);

  const initialSlides = useMemo(() => {
    const all: Photo[] = [];
    if (primaryUrl) {
      all.push({ key: `${date}-hero`, url: primaryUrl });
    }
    for (const photo of photos) {
      if (!photo.url) continue;
      all.push(photo);
    }
    return all;
  }, [primaryUrl, photos, date]);

  // Sort photos by EXIF date, fallback to filename
  useEffect(() => {
    let cancelled = false;

    async function sortByExif() {
      // Hero photo always first, sort the rest
      const hero = primaryUrl ? [initialSlides[0]] : [];
      const rest = primaryUrl ? initialSlides.slice(1) : [...initialSlides];

      if (rest.length <= 1) {
        setSortedPhotos(initialSlides);
        return;
      }

      const withDates = await Promise.all(
        rest.map(async (photo) => {
          try {
            const exif = await exifr.parse(photo.url, {
              pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
            });
            const date = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.ModifyDate;
            return { photo, date: date instanceof Date ? date.getTime() : null };
          } catch {
            return { photo, date: null };
          }
        }),
      );

      if (cancelled) return;

      withDates.sort((a, b) => {
        if (a.date && b.date) return a.date - b.date;
        if (a.date) return -1;
        if (b.date) return 1;
        return filenameSortKey(a.photo.key).localeCompare(filenameSortKey(b.photo.key));
      });

      setSortedPhotos([...hero, ...withDates.map((w) => w.photo)]);
    }

    // Show immediately with filename sort, then re-sort with EXIF
    const hero = primaryUrl ? [initialSlides[0]] : [];
    const rest = primaryUrl ? initialSlides.slice(1) : [...initialSlides];
    const filenameSorted = [...rest].sort((a, b) =>
      filenameSortKey(a.key).localeCompare(filenameSortKey(b.key)),
    );
    setSortedPhotos([...hero, ...filenameSorted]);

    sortByExif();

    return () => {
      cancelled = true;
    };
  }, [initialSlides, primaryUrl]);

  const slides = sortedPhotos.length > 0 ? sortedPhotos : initialSlides;

  if (!primaryUrl && photos.length === 0) {
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
        {slides.map((photo, i) => (
          <button
            key={photo.key}
            type="button"
            onClick={() => openAt(i)}
            className="group overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 focus:outline-none focus:ring-2 focus:ring-sky-500/70"
          >
            <img
              src={photo.url}
              alt={photo.key}
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
          slides={slides.map((photo) => ({
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
