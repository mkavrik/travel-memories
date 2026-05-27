-- Zamkne write přístup na cache tabulky pouze pro service_role.
-- Reads pro anon (a publicly-shared blog HTML) zůstávají otevřené —
-- cache obsahuje pouze veřejná data blogu.
--
-- Předpoklad: v cache.ts a /api/warm-cache se pro všechny mutations
-- (upsert + delete) používá createSupabaseServiceClient(). Service_role
-- bypassuje RLS, takže write politiky pro něj nejsou potřeba.
--
-- Pořadí nasazení: nejdřív deploy kódu s service_role mutations,
-- potom tato migrace. Při opačném pořadí by anon writes (pokud někde
-- zbyly) začaly tiše selhávat a cache by degradovala na R2-only.
--
-- Supabase Security Advisor předtím hlásil "RLS Policy Always True"
-- na trips_cache / days_cache / photo_urls_cache kvůli politikám
-- z migrace 003_fix_rls_anon_write.sql.

DROP POLICY IF EXISTS "Allow all write on trips_cache" ON public.trips_cache;
DROP POLICY IF EXISTS "Allow all write on days_cache" ON public.days_cache;
DROP POLICY IF EXISTS "Allow all write on photo_urls_cache" ON public.photo_urls_cache;
