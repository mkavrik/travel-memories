"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";

type Props = {
  mapTrailUrl: string;
  mapElevationUrl: string;
};

export function MapWithZoom({ mapTrailUrl, mapElevationUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const slides = [
    { src: mapTrailUrl },
    { src: mapElevationUrl },
  ];

  function openAt(i: number) {
    setIndex(i);
    setOpen(true);
  }

  return (
    <>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => openAt(0)}
          className="group w-full overflow-hidden rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)] transition hover:border-[var(--accent-orange)]/30 cursor-zoom-in"
        >
          <img
            src={mapTrailUrl}
            alt="Mapa trasy"
            className="w-full object-contain transition duration-300 group-hover:scale-[1.02]"
          />
        </button>
        <button
          type="button"
          onClick={() => openAt(1)}
          className="group w-full overflow-hidden rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)] transition hover:border-[var(--accent-orange)]/30 cursor-zoom-in"
        >
          <img
            src={mapElevationUrl}
            alt="Výškový profil"
            className="w-full object-contain transition duration-300 group-hover:scale-[1.02]"
          />
        </button>
      </div>

      {open && (
        <Lightbox
          open={open}
          close={() => setOpen(false)}
          index={index}
          slides={slides}
          plugins={[Zoom]}
          zoom={{
            maxZoomPixelRatio: 5,
            scrollToZoom: true,
          }}
        />
      )}
    </>
  );
}
