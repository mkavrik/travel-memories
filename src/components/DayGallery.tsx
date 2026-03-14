"use client";

import { useState, useMemo } from "react";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";

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

export function DayGallery({ primaryUrl, date, photos }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const slides = useMemo(() => {
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
        />
      )}
    </>
  );
}

