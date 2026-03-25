export function getCoordsForTrip(name: string): { lat: number; lng: number } {
  const lower = name.toLowerCase();

  if (/norsko|norway/.test(lower)) return { lat: 61, lng: 8 };
  if (/slovensko|slovakia|tatry|fatra/.test(lower)) return { lat: 49, lng: 20 };
  if (/portugalsko|portugal|lisabon|algarve/.test(lower)) return { lat: 39, lng: -8 };
  if (/gr11|pyreneje|pyrenees/.test(lower)) return { lat: 42.8, lng: 1 };
  if (/usa|united states|california|colorado|utah|nevada|oregon|washington/.test(lower))
    return { lat: 38, lng: -110 };

  // fallback: střed Evropy
  return { lat: 48.7, lng: 14.5 };
}
