-- Zapni RLS na všech cache tabulkách
ALTER TABLE public.trips_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.days_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_urls_cache ENABLE ROW LEVEL SECURITY;

-- Povol čtení pro všechny (anon i authenticated)
-- Cache obsahuje pouze veřejná data blogu
CREATE POLICY "Allow public read on trips_cache"
  ON public.trips_cache FOR SELECT
  USING (true);

CREATE POLICY "Allow public read on days_cache"
  ON public.days_cache FOR SELECT
  USING (true);

CREATE POLICY "Allow public read on photo_urls_cache"
  ON public.photo_urls_cache FOR SELECT
  USING (true);

-- Povol zápis pro anon i service_role (server-side API routes)
-- Cache obsahuje pouze veřejná data blogu, není potřeba omezovat
CREATE POLICY "Allow service insert/update on trips_cache"
  ON public.trips_cache FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service insert/update on days_cache"
  ON public.days_cache FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service insert/update on photo_urls_cache"
  ON public.photo_urls_cache FOR ALL
  USING (true)
  WITH CHECK (true);
