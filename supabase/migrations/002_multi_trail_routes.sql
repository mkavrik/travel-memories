-- Multi-trail podpora: jeden den může mít více GPX tras (pěší i auto).
-- Staré sloupce (has_map, has_gpx, map_trail_url, map_elevation_url, trail_stats)
-- ponecháváme kvůli kompatibilitě existujících řádků, ale nový kód je nečte ani neplní.

ALTER TABLE days_cache
  ADD COLUMN IF NOT EXISTS routes jsonb;
