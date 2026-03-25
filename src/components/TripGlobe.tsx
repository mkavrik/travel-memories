"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Globe, { GlobeMethods } from "react-globe.gl";

type TripMarker = {
  name: string;
  lat: number;
  lng: number;
  coverUrl: string | null;
  color?: "orange" | "teal";
};

type Props = {
  trips: TripMarker[];
};

export default function TripGlobe({ trips }: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-rotation + initial camera — runs once globe is rendered (dimensions > 0)
  useEffect(() => {
    if (dimensions.width === 0) return;
    const globe = globeRef.current;
    if (!globe) return;

    // Small delay to ensure globe.gl internal scene is ready
    const timer = setTimeout(() => {
      const controls = globe.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;
        controls.enableZoom = false;
      }
      globe.pointOfView({ lat: 50, lng: 15, altitude: 1.6 }, 0);
    }, 100);

    return () => clearTimeout(timer);
  }, [dimensions.width > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arcs between trips
  const arcsData = trips.length > 1
    ? trips.slice(0, -1).map((t, i) => ({
        startLat: t.lat,
        startLng: t.lng,
        endLat: trips[i + 1].lat,
        endLng: trips[i + 1].lng,
        color: i % 2 === 0
          ? ["#E8652E", "#E8652E"]
          : ["#1A8C7E", "#1A8C7E"],
      }))
    : [];

  // HTML element factory for pins
  const createPinElement = useCallback((d: object) => {
    const marker = d as TripMarker;
    const container = document.createElement("div");
    container.className = "globe-pin-container";
    container.style.cursor = "pointer";

    // Pin dot
    const pin = document.createElement("div");
    pin.className = "globe-pin";
    const color = marker.color === "teal" ? "#1A8C7E" : "#E8652E";
    pin.style.backgroundColor = color;
    pin.style.borderColor = color === "#E8652E"
      ? "rgba(232, 101, 46, 0.3)"
      : "rgba(26, 140, 126, 0.3)";
    container.appendChild(pin);

    // Spike
    const spike = document.createElement("div");
    spike.className = "globe-pin-spike";
    spike.style.borderTopColor = color;
    container.appendChild(spike);

    // Label
    const label = document.createElement("div");
    label.className = "globe-pin-label";
    const shortName = marker.name
      .replace(/^\d{2}_\d{4}\s*/, "")
      .split(/\s+/)
      .slice(0, 2)
      .join(" ");
    label.textContent = shortName;
    container.appendChild(label);

    // Hover effect
    container.addEventListener("mouseenter", () => {
      container.style.transform = "scale(1.15)";
    });
    container.addEventListener("mouseleave", () => {
      container.style.transform = "scale(1)";
    });

    // Click
    container.addEventListener("click", () => {
      const globe = globeRef.current;
      if (globe) {
        globe.pointOfView({ lat: marker.lat, lng: marker.lng, altitude: 1.8 }, 1000);
      }
      setTimeout(() => {
        window.location.href = `/blog/${encodeURIComponent(marker.name)}`;
      }, 1100);
    });

    return container;
  }, []);

  if (dimensions.width === 0) {
    return <div ref={containerRef} className="h-full w-full" />;
  }

  return (
    <div ref={containerRef} className="h-full w-full globe-stars-bg">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl="/textures/earth-night.jpg"
        bumpImageUrl="/textures/earth-topology.png"
        backgroundColor="rgba(0, 0, 0, 0)"
        showAtmosphere={true}
        atmosphereColor="#E8652E"
        atmosphereAltitude={0.2}
        // HTML pins
        htmlElementsData={trips}
        htmlLat="lat"
        htmlLng="lng"
        htmlElement={createPinElement}
        htmlAltitude={0.01}
        // Arcs
        arcsData={arcsData}
        arcColor="color"
        arcStroke={1.5}
        arcDashLength={1}
        arcDashGap={0}
        arcDashAnimateTime={0}
        arcAltitudeAutoScale={0.4}
      />
    </div>
  );
}
