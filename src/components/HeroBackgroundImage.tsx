"use client";

import { useState, useCallback } from "react";

type Props = {
  heroUrl: string | null;
  fallbackGradient: string;
};

export function HeroBackgroundImage({
  heroUrl,
  fallbackGradient,
}: Props) {
  const [objectFit, setObjectFit] = useState<
    "cover" | "contain"
  >("cover");

  const onLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setObjectFit(h > w ? "contain" : "cover");
    },
    [],
  );

  if (!heroUrl) {
    return (
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: fallbackGradient }}
      />
    );
  }

  return (
    <img
      src={heroUrl}
      alt=""
      className="absolute inset-0 h-full w-full object-center"
      style={{
        objectFit,
        objectPosition: "center center",
      }}
      onLoad={onLoad}
    />
  );
}
