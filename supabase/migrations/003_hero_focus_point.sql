-- Focus point pro hero fotky (pozice ořezu v object-cover).
-- Vertikální souřadnice 0-100 v procentech, 50 = střed = výchozí chování.

ALTER TABLE days_cache
  ADD COLUMN IF NOT EXISTS cover_focus_y smallint NOT NULL DEFAULT 50;

ALTER TABLE trips_cache
  ADD COLUMN IF NOT EXISTS cover_focus_y smallint NOT NULL DEFAULT 50;
