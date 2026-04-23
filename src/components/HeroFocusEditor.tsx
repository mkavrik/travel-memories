"use client";

import { useEffect, useState } from "react";

type Props = {
  tripName: string;
  /** null = trip hero (summary), "YYYY-MM-DD" = day hero. */
  date: string | null;
  heroUrl: string;
  heroFilename: string;
};

/**
 * Editor pozice ořezu hero fotky. Simuluje hero banner (nízký široký box)
 * a dává slider pro vertikální posun object-position.
 */
export function HeroFocusEditor({
  tripName,
  date,
  heroUrl,
  heroFilename,
}: Props) {
  const [focusY, setFocusY] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setMessage(null);
    const params = new URLSearchParams({ tripName });
    if (date) params.set("date", date);
    fetch(`/api/save-hero-focus?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { focusY?: number }) => {
        if (!isMounted) return;
        const initial =
          typeof data.focusY === "number" ? data.focusY : 50;
        setFocusY(initial);
      })
      .catch(() => {
        if (isMounted) setFocusY(50);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [tripName, date, heroFilename]);

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/save-hero-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripName, date, focusY }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? "Uložení selhalo.");
        return;
      }
      setMessage("Uloženo.");
    } catch {
      setMessage("Nastala neočekávaná chyba.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-slate-400">
        Náhled hero banneru — posuň slider a uprav, jaká část fotky bude
        viditelná na blogu:
      </p>
      <div className="aspect-[4/1] w-full overflow-hidden rounded-md border border-slate-700 bg-black">
        <img
          src={heroUrl}
          alt={heroFilename}
          className="h-full w-full object-cover"
          style={{ objectPosition: `50% ${focusY}%` }}
        />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-10 text-slate-400">Vrch</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={focusY}
          onChange={(e) => setFocusY(Number(e.target.value))}
          disabled={isLoading}
          className="flex-1 accent-emerald-500"
          aria-label="Vertikální pozice ořezu hero fotky"
        />
        <span className="w-10 text-right text-slate-400">Spodek</span>
        <span className="w-12 text-right font-mono text-slate-300">
          {focusY}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="rounded-lg border border-emerald-600/60 bg-slate-900 px-3 py-1.5 text-xs font-medium text-emerald-200 shadow-sm transition hover:border-emerald-500 hover:text-emerald-100 disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
        >
          {isSaving ? "Ukládám..." : "Uložit pozici"}
        </button>
        {message && <span className="text-slate-400">{message}</span>}
      </div>
    </div>
  );
}
