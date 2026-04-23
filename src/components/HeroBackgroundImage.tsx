type Props = {
  heroUrl: string | null;
  fallbackGradient: string;
  /** Vertikální focus point 0-100 (procenta). 50 = střed. */
  focusY?: number;
};

export function HeroBackgroundImage({
  heroUrl,
  fallbackGradient,
  focusY = 50,
}: Props) {
  if (!heroUrl) {
    return (
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: fallbackGradient }}
      />
    );
  }

  const clampedY = Math.max(0, Math.min(100, focusY));

  return (
    <img
      src={heroUrl}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{ objectPosition: `50% ${clampedY}%` }}
    />
  );
}
