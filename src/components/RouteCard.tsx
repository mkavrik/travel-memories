"use client";

import { useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import type { RouteInfo } from "@/lib/cache";

type Props = {
  route: RouteInfo;
  heading: string;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h} h ${m} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--content-card-border)] py-2 last:border-b-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-200">{value}</span>
    </div>
  );
}

export function RouteCard({ route, heading }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const slides = [
    { src: route.mapTrailUrl },
    ...(route.mapElevationUrl ? [{ src: route.mapElevationUrl }] : []),
  ];

  function openAt(i: number) {
    setIndex(i);
    setOpen(true);
  }

  const isHiking = route.routeType === "hiking";
  const stats = route.stats;
  const distanceKm = stats.distanceKm;

  return (
    <>
      <article className="space-y-4 rounded-xl border border-[var(--content-card-border)] bg-[var(--content-card-bg)] p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-dela text-base text-[var(--ink)]">{heading}</h3>
          <span className="font-nunito text-[0.7rem] uppercase tracking-widest text-[var(--text-muted)]">
            {isHiking ? "Pěší trasa" : "Auto trasa"}
          </span>
        </div>

        {/* Mapa — hlavní vizuál, plná šířka karty */}
        <button
          type="button"
          onClick={() => openAt(0)}
          className="group block w-full overflow-hidden rounded-lg border border-[var(--content-card-border)] bg-black/20 transition hover:border-[var(--accent-orange)]/40 cursor-zoom-in"
        >
          <img
            src={route.mapTrailUrl}
            alt={`Mapa trasy — ${heading}`}
            className="w-full object-contain transition duration-300 group-hover:scale-[1.02]"
          />
        </button>

        {isHiking && "elevationGainM" in stats ? (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Statistiky — vlevo, kompaktní */}
            <div className="font-nunito text-xs text-slate-300">
              <StatRow
                label="Celková délka"
                value={`${distanceKm.toFixed(1)} km`}
              />
              <StatRow
                label="Převýšení ↑"
                value={`${stats.elevationGainM} m`}
              />
              <StatRow
                label="Převýšení ↓"
                value={`${stats.elevationLossM} m`}
              />
              <StatRow
                label="Nejvyšší bod"
                value={`${stats.maxEleM} m n.m.`}
              />
              <StatRow
                label="Nejnižší bod"
                value={`${stats.minEleM} m n.m.`}
              />
            </div>

            {/* Výškový profil — vpravo */}
            {route.mapElevationUrl && (
              <button
                type="button"
                onClick={() => openAt(1)}
                className="group block w-full overflow-hidden rounded-lg border border-[var(--content-card-border)] bg-black/20 transition hover:border-[var(--accent-orange)]/40 cursor-zoom-in"
              >
                <img
                  src={route.mapElevationUrl}
                  alt={`Výškový profil — ${heading}`}
                  className="w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                />
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2 font-nunito text-sm text-slate-300">
            <div>
              <span className="text-slate-400">Vzdálenost: </span>
              <span className="font-semibold text-slate-200">
                {distanceKm.toFixed(1)} km
              </span>
            </div>
            <div>
              <span className="text-slate-400">Doba jízdy: </span>
              <span className="font-semibold text-slate-200">
                {route.durationS != null
                  ? formatDuration(route.durationS)
                  : "–"}
              </span>
            </div>
          </div>
        )}
      </article>

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
