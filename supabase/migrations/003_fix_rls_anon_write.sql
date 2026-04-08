-- Oprava: anon role nemohla zapisovat/mazat cache (RLS blokoval tiše).
-- Drop staré restriktivní politiky a nahraď otevřenými.
-- Cache tabulky obsahují pouze veřejná data blogu.

DROP POLICY IF EXISTS "Allow service insert/update on trips_cache" ON public.trips_cache;
DROP POLICY IF EXISTS "Allow service insert/update on days_cache" ON public.days_cache;
DROP POLICY IF EXISTS "Allow service insert/update on photo_urls_cache" ON public.photo_urls_cache;

CREATE POLICY "Allow all write on trips_cache"
  ON public.trips_cache FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all write on days_cache"
  ON public.days_cache FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all write on photo_urls_cache"
  ON public.photo_urls_cache FOR ALL
  USING (true)
  WITH CHECK (true);
