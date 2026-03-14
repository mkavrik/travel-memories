"use client";

import { memo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

const geoUrl =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type Props = {
  trips: string[];
};

function getCoordsForTrip(name: string): [number, number] {
  const lower = name.toLowerCase();

  if (/norsko|norway/.test(lower)) return [8, 61];
  if (/slovensko|slovakia|tatry|fatra/.test(lower)) return [20, 49];
  if (/portugalsko|portugal|lisabon|algarve/.test(lower)) return [-8, 39];
  if (/gr11|pyreneje|pyrenees/.test(lower)) return [1, 42.8];

  if (/usa|united states|california|colorado|utah|nevada|oregon|washington/.test(lower))
    return [-110, 38];

  // fallback: střed Evropy
  return [14.5, 48.7];
}

export const TripsWorldMap = memo(function TripsWorldMap({ trips }: Props) {
  if (trips.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        Zatím nejsou nahrané žádné tripy pro zobrazení na mapě.
      </p>
    );
  }

  const markers = trips.map((name) => ({
    name,
    coords: getCoordsForTrip(name),
  }));

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-800/70 bg-[#020617]">
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ center: [10, 52], scale: 900 }}
        style={{ width: "100%", height: "400px" }}
      >
        <Geographies geography={geoUrl}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                style={{
                  default: {
                    fill: "#0f172a",
                    outline: "none",
                    stroke: "#334155",
                    strokeWidth: 0.6,
                  },
                  hover: {
                    fill: "#0f172a",
                    outline: "none",
                  },
                  pressed: {
                    fill: "#0f172a",
                    outline: "none",
                  },
                }}
              />
            ))
          }
        </Geographies>

        {markers.map((marker) => (
          <Marker
            key={marker.name}
            coordinates={marker.coords}
            style={{
              default: { cursor: "pointer" },
              hover: { cursor: "pointer" },
            }}
            onClick={() => {
              window.location.href = `/blog/${encodeURIComponent(marker.name)}`;
            }}
          >
            <circle
              r={7}
              fill="#f5c842"
              stroke="#e5f2ff"
              strokeWidth={1.8}
            />
            <title>{marker.name}</title>
          </Marker>
        ))}
      </ComposableMap>
    </div>
  );
});

