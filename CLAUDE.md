# Travel Memories – projektová dokumentace

## Co to je
Osobní nástroj pro zpracování cestovního obsahu (audio nahrávky, fotky, textové poznámky)
do čistých výstupů – blog postů a Instagram příspěvků.
Projekt je primárně pro osobní použití, s výhledem na rozšíření pro ostatní cestovatele v budoucnu.

---

## Motivace
Při cestování vzniká velké množství autentického, ale hrubého obsahu.
Cílem je tento obsah zpracovat do ucesané podoby při zachování osobního stylu a autenticity.
Generický AI výstup není cílem – klíčové je, aby výsledek zněl jako autor.

---

## Plánované cesty a tréninkový plán

| Cesta | Kdy | Účel |
|---|---|---|
| Norsko (běžky) | již proběhlo | první cvičná data |
| USA | za měsíc | ladění agentů, první reálné výstupy |
| Portugalsko (surfování) | léto | další iterace promptů |
| Slovensko (přechod pohoří) | červenec | další iterace promptů |
| GR11 – Pyreneje (850 km) | prázdniny | ostré nasazení |

---

## Architektura systému

```
MOBILNÍ SBĚR OBSAHU
  iPhone (Voice Memos, Fotky, GPS, Kamera)
        ↓
UPLOAD (webová stránka /upload, funguje i z mobilu)
  Výběr tripu + dne/summary
  → /api/upload-presign vrátí presigned PUT URL per soubor
  → prohlížeč PUTuje přímo na R2 (Vercel je mimo datovou cestu,
     takže 4.5 MB body limit na serverless funkce neplatí → OK
     i pro stovky MB várky)
  → /api/upload-finalize invaliduje Supabase cache
  Progress bar: N/M souborů, aktuální filename, agregátní MB/%
        ↓
CLOUDFLARE R2 (úložiště souborů)
  trips/[trip]/[datum]/
    /audio/   /photos/  /video/  /notes/  /map/  /outputs/
        ↓
ZPRACOVÁNÍ (tlačítka na /upload stránce)
  ┌─────────────────────────────────────────────┐
  │  Konvertovat fotky                          │
  │    HEIC/JPG → sharp → 3 verze cache        │
  │    (_thumb, _display, _ai)                  │
  │                                             │
  │  Nahrát videa do Stream                     │
  │    MOV/MP4 → presigned R2 GET URL (24h)     │
  │    → POST /stream/copy (Stream si video     │
  │       stáhne z URL sám, bajty Vercelem      │
  │       netečou)                              │
  │    → _stream.json metadata (streamId)       │
  │    Validace existujícího _stream.json při   │
  │    sync: pokud streamId už neexistuje na    │
  │    Stream, metadata se smažou a nahraje     │
  │    se znovu                                 │
  │                                             │
  │  Přepsat audio                              │
  │    Whisper → prepis_raw.txt                 │
  │    Claude → prepis_clean.txt                │
  │                                             │
  │  Generovat blog post                        │
  │    Agent 2 (claude-opus-4-6)                │
  │    Vstup: prepis_clean.txt + poznámky       │
  │    → blog_post.txt → R2 /outputs/           │
  │                                             │
  │  Generovat mapy (každý GPX zvlášť)          │
  │    GPX → Mapy.cz Static API                 │
  │    → map_trail_[slug].png                   │
  │    → map_elevation_[slug].png  (pěší jen)   │
  │    → trail_stats_[slug].json                │
  │    Auto trasy: Routing API → doba jízdy     │
  │                                             │
  │  Vybrat hero fotku                          │
  │    /api/select-hero-photo → progres bar     │
  │    → až 40 kandidátů (thumbnails)           │
  │    Klik na náhled → /api/set-hero-photo     │
  │    → hero_photo.json (bez AI hodnocení)     │
  │                                             │
  │  Upravit text                               │
  │    Načíst blog_post.txt z R2 → textarea     │
  │    → uložit zpět do R2 + update Supabase    │
  │    → revalidatePath pro Next.js cache       │
  └─────────────────────────────────────────────┘
        ↓
SUPABASE (caching)
  Trips, dny, fotky, blog posty cachované po dobu 7 dní
  Automatická invalidace při uploadu/generování obsahu
  Cache warming přes tlačítko "Zahřát cache" na /upload
  Presigned GET URL nesou response-cache-control
  (public, max-age=604800, immutable) → prohlížeč fotky
  reálně cachuje mezi návštěvami
        ↓
CLOUDFLARE STREAM (videa)
  Automatická komprese MOV → streamovatelné video
  Iframe embed na blogu
        ↓
BLOG (sidebar navigace + obsah)
  /blog                    ← sidebar s tripy + 3D globus (react-globe.gl)
  /blog/[trip]             ← hero fotka + sidebar se dny + summary + fotky
  /blog/[trip]/[datum]     ← hero fotka + sidebar se sekcemi + blog post
                              + fotky + videa + trasy (karta per trasa
                              s mapou + statistikami / dobou jízdy)
                              + navigace ← předchozí / následující →
        ↓
PUBLIKACE (budoucí fáze)
  Instagram agent → příspěvek
```

---

## Design systém blogu

### Layout
Všechny stránky blogu sdílí jednotnou strukturu:
- **Tmavé pozadí** `#050509` — vesmírně temné, konzistentní napříč stránkami
- **Levý sidebar** — tmavý panel (`#0e0e14`) s navigací, karty (`#161620`) se subtilními bordery
- **Hlavní obsah** — scrollovatelný, oddělený od sidebaru 1px border

### Hierarchie stránek a sidebar

| Stránka | Sidebar obsahuje | Hlavní obsah |
|---|---|---|
| `/blog` | "Xar's travel" + seznam tripů (foto + název + datum) | 3D globus (react-globe.gl) |
| `/blog/[trip]` | "Xar's travel" → název tripu + seznam dní (foto + datum) | Hero fotka nahoře, summary text + fotky |
| `/blog/[trip]/[date]` | "Xar's travel" → trip → datum + sekční odkazy + prev/next navigace | Hero fotka nahoře, blog post + fotky + videa + trasy (karta per trasa) |

### 3D globus
- Knihovna: `react-globe.gl`
- Textura: NASA night-lights (`earth-night.jpg`) + topografie
- Atmosféra: oranžový glow (`#E8652E`)
- Piny: barevné tečky (oranžová/teal) s labely, kliknutelné
- Oblouky: plné čáry mezi tripy
- Hvězdné pozadí: CSS radial-gradient simulace
- Výchozí pohled: zaostřeno na Evropu (lat: 50, lng: 15, altitude: 1.6)

### Barevná paleta

```css
:root {
  --bg-paper: #0e0e14;           /* sidebar pozadí */
  --ink: #e8e4df;                /* hlavní text (teplá krémová) */
  --ink-light: #a09a93;          /* sekundární text */
  --stroke: rgba(255,255,255,0.1); /* bordery — subtilní */
  --accent-orange: #E8652E;      /* hlavní akcent — piny, linky, hover */
  --accent-teal: #1A8C7E;        /* sekundární akcent */
  --card-bg: #161620;            /* sidebar karty */
  --text-muted: #7a7570;         /* tlumený text */
  --shadow-ink: rgba(0,0,0,0.25); /* stíny */
  --content-card-bg: rgba(255,255,255,0.04);    /* content karty */
  --content-card-border: rgba(255,255,255,0.08); /* content bordery */
}
```

### Fonty
- **Dela Gothic One** (`font-dela`) — nadpisy, názvy, labely
- **Nunito** (`font-nunito`) — body text, popisy, breadcrumbs

### Designové principy
- Sidebar karty: `border border-[var(--stroke)]`, `shadow-[0_2px_8px]`, hover lift + oranžový border glow
- Content karty: téměř průhledné (`rgba(255,255,255,0.04)`)
- Hero fotky: gradient `from-black/30 via-transparent to-[#050509]` — lehký overlay, fotka vynikne
- Accent linka pod nadpisy: oranžová, 2px × 50px
- Žádný text overlay na hero fotkách — navigace je v sidebaru

---

## Jak přidat nový den – postup krok za krokem

Tento postup opakuj pro každý den tripu. Vše se dělá přes **/upload** stránku.

### 1. Nahrát soubory
- Vyber trip z dropdownu
- Typ sekce: **Konkrétní den**
- Vyber datum
- Klikni **Vybrat soubory** a přidej:
  - Audio nahrávky (.m4a, .mp3)
  - Fotky (.heic, .jpg)
  - Videa (.mov, .mp4)
  - Textové poznámky (.md, .txt)
  - GPX soubor trasy (.gpx) pokud máš
- Klikni **Nahrát do R2**

### 2. Konvertovat fotky
- Klikni **Konvertovat fotky**
- Počkej na dokončení (vytvoří se thumb, display, ai verze v `/photos/cache/`)

### 3. Nahrát videa do Cloudflare Stream
- Klikni **Nahrát videa do Stream**
- Videa se automaticky zkomprimují a připraví pro streaming
- Výstup: `[název]_stream.json` metadata v `/video/`

### 4. Přepsat audio
- Klikni **Přepsat audio**
- Whisper přepíše nahrávky → Claude vyčistí přepis
- Výstup: `prepis_clean.txt` v `/outputs/`

### 5. Vygenerovat blog post
- Klikni **Generovat blog post**
- Agent (claude-opus-4-6) zpracuje přepis + poznámky a napíše text
- Výstup: `blog_post.txt` v `/outputs/`
- Zkontroluj výsledek na blogu `/blog/[trip]/[datum]`

### 6. Vygenerovat mapy (pokud máš GPX)
- V R2 složce `map/` může být **více GPX souborů** — každý = samostatná trasa
- Pro každý GPX v seznamu vyber:
  - **Typ trasy:** Pěší / Auto (Auto bez výškového profilu, místo toho doba jízdy)
  - **Mapovou vrstvu:** turistická / zimní / letecká / základní
- Klikni **Generovat mapy**
- Progress ukazuje "Generuji mapu 1/N — [název]..."
- Výstup per trasa: `map_trail_[slug].png`, `trail_stats_[slug].json`
  a pro pěší navíc `map_elevation_[slug].png`
- Pro auto se doba jízdy spočte přes Mapy.cz Routing API (`routeType=car_fast`)

### 7. Vybrat hero fotku
- Klikni **Vybrat hero fotku dne**
- Načte se až 40 kandidátů (fotky s `_thumb.jpg` cache), progres bar ukazuje fáze: listing → příprava náhledů N/M
- Klikni na vybraný náhled v gridu → hero se uloží přes `/api/set-hero-photo` (žádný AI výběr, čistě manuálně)
- Hero fotka se zobrazí jako cover dne v sidebaru + hero banner na stránce dne

---

## Jak přidat summary tripu – postup krok za krokem

### 1. Nahrát soubory summary
- Typ sekce: **Summary (celý trip)**
- Nahraj poznámky, audio, nejlepší fotky a videa z celého tripu

### 2. Konvertovat fotky summary
- Klikni **Konvertovat fotky** v sekci Summary

### 3. Nahrát videa summary do Stream
- Klikni **Nahrát videa do Stream** v sekci Summary

### 4. Přepsat audio summary
- Klikni **Přepsat audio**

### 5. Vygenerovat summary blog post
- Klikni **Generovat summary**
- Agent zpracuje POUZE surové poznámky a audio ze summary sekce
- Výstup: `blog_post.txt` v `summary/outputs/`

### 6. Vybrat hero fotku tripu
- Klikni **Vybrat hero fotku tripu**
- Kandidáty tvoří: všechny day heroes (z `hero_photo.json` každého dne) + náhodný vzorek ostatních fotek (summary + dny), dedup podle filename, max 40 total
- Klikni na vybraný náhled v gridu → uloží se jako hero tripu
- Hero fotka se zobrazí jako cover tripu v sidebaru + hero banner na stránce tripu

---

## Tech stack

| Část | Technologie | Poznámka |
|---|---|---|
| Frontend + Backend | Next.js 14 | App Router, server components |
| Hosting | Vercel | nasazení jedním příkazem |
| Úložiště souborů | Cloudflare R2 | levné; upload z browseru přes presigned PUT URL (browser → R2, Vercel mimo); čtení z blogu přes presigned GET URL s `response-cache-control` |
| Videa | Cloudflare Stream | automatická komprese + streaming, $5/měsíc; ingest přes `/stream/copy` z presigned R2 URL (video bajty přes Vercel netečou) |
| Databáze | Supabase | cache vrstva, metadata; RLS zapnuté, zápis přes service_role |
| 3D globus | react-globe.gl | Three.js wrapper, NASA textury |
| Přepis audia | OpenAI Whisper | nejlepší kvalita přepisu |
| Agenti (text) | Claude API (claude-opus-4-6) | blog post, Instagram popisky |
| Konverze fotek | sharp + heic-convert | HEIC → JPEG, 2 verze cache (thumb + display) |
| Mapy | Mapy.cz Static API + Routing API | Static = mapa s GPX; Routing (`car_fast`) = doba jízdy pro auto trasy |
| EXIF čtení | exifr | řazení fotek v galerii podle data pořízení |
| CSS | Tailwind CSS | utility-first, CSS custom properties |
| Fonty | Dela Gothic One + Nunito | Google Fonts via next/font |

---

## Datová struktura v cloudu (Cloudflare R2)

```
trips/
  /02_2026 bezky Norsko/        ← název tripu (měsíc_rok + popis)
    /2026-02-03/                ← konkrétní den (YYYY-MM-DD)
      /audio/                   ← nahrávky z diktafonu (.m4a, .mp3)
      /photos/                  ← fotky (.jpg, .heic)
      /video/                   ← videa (.mov, .mp4)
      /notes/                   ← textové poznámky (.txt, .md)
      /map/                     ← jeden nebo více GPX souborů (každý = samostatná trasa)
      /outputs/                 ← výstupy agentů; per-trasa: map_trail_[slug].png,
                                   map_elevation_[slug].png (pěší), trail_stats_[slug].json
    /2026-02-04/
      /audio/
      /photos/
      /video/
      /notes/
      /map/
      /outputs/
    /summary/                   ← shrnutí celého tripu (ne konkrétního dne)
      /audio/                   ← celkové dojmy, závěrečné nahrávky
      /photos/                  ← nejlepší fotky z celého tripu
      /video/                   ← videa z celého tripu
      /notes/                   ← celkové poznámky k tripu
      /map/                     ← kompletní trasa tripu (.gpx)
      /outputs/                 ← výstupy agentů pro celý trip
```

### Pravidla pojmenování
- **Trip:** `MM_YYYY nazev` – např. `02_2026 bezky Norsko`
- **Den:** formát `YYYY-MM-DD` – zajišťuje správné řazení chronologicky
- Typ souboru určuje cílový adresář – řeší se automaticky při uploadu

---

## Klíčové soubory projektu

| Soubor | Účel |
|---|---|
| `src/app/blog/page.tsx` | Hlavní stránka blogu — sidebar s tripy + 3D globus |
| `src/app/blog/[trip]/page.tsx` | Stránka tripu — hero + sidebar se dny + summary |
| `src/app/blog/[trip]/[date]/page.tsx` | Stránka dne — hero + sidebar se sekcemi + obsah |
| `src/components/TripGlobe.tsx` | 3D globus komponent (react-globe.gl) |
| `src/lib/tripCoords.ts` | Mapování názvů tripů na GPS souřadnice |
| `src/app/globals.css` | CSS proměnné, globe styly, sidebar scrollbar |
| `src/app/upload/page.tsx` | Admin stránka pro upload a zpracování obsahu |
| `src/components/RouteCard.tsx` | Karta jedné trasy — mapa + statistiky / doba jízdy, lightbox zoom |
| `src/components/HeroBackgroundImage.tsx` | Hero fotka jako `object-cover` s nastavitelným `focusY` (pozice ořezu) |
| `src/components/HeroFocusEditor.tsx` | Klient UI — slider pro vertikální pozici ořezu hero fotky, live preview |
| `src/lib/trailMap.ts` | Parsování GPX, Mapy.cz Static + Routing API, elevation SVG, slugify |
| `src/app/api/generate-trail-map/route.ts` | Generování map pro pole GPX tras (streaming NDJSON) |
| `src/app/api/check-gpx/route.ts` | Seznam GPX souborů v `map/` pro daný den |
| `src/app/api/trip-dates/route.ts` | Seznam dnů existujících v R2 pro trip (použito autofillem v /upload) |
| `src/app/api/get-hero/route.ts` | Vrátí aktuální hero fotku (filename, display URL, focusY) pro den / trip |
| `src/app/api/save-hero-focus/route.ts` | GET/POST — načtení/uložení focusY do hero_photo.json + Supabase + revalidace |
| `src/lib/cache.ts` | Supabase cache vrstva; všechny `getSignedR2Url` pro fotky/hero/mapy nesou `response-cache-control` přes `PHOTO_CACHE_CONTROL` |
| `src/lib/r2.ts` | Cloudflare R2 client; `getSignedR2Url` s `responseCacheControl` option, `getSignedPutUrl` pro direct uploads, konstanta `PHOTO_CACHE_CONTROL` |
| `src/lib/supabase.ts` | Supabase klienti (anon pro čtení, service_role pro zápis) |
| `src/lib/cloudflareStream.ts` | `uploadVideoToStreamFromUrl` (přes `/stream/copy`), `streamVideoExists` (kontrola platnosti streamId), `getStreamVideoDetails`, `streamMetaKey` |
| `src/app/api/upload-presign/route.ts` | POST — vrací presigned PUT URL per soubor; validuje přípony |
| `src/app/api/upload-finalize/route.ts` | POST — invaliduje Supabase cache po direct-to-R2 uploadu |
| `src/app/api/upload-to-stream/route.ts` | Jedno video do Streamu přes `/copy` + invalidace cache |
| `src/app/api/upload-day-videos-to-stream/route.ts` | Všechna videa daného dne do Streamu; validuje existující `_stream.json` a přepíše stale |
| `src/app/api/sync-all-videos-to-stream/route.ts` | Bulk sync všech dnů (streaming NDJSON progress); invaliduje cache pro každý den s videi |
| `src/app/api/get-blog-post/route.ts` | GET API — načtení blog_post.txt z R2 |
| `src/app/api/save-blog-post/route.ts` | POST API — uložení textu do R2 + update cache + revalidace |

---

## Agenti

### Agent 1 – Přepis a čištění textu
- Vstup: audio nahrávky + textové poznámky
- Nástroj: OpenAI Whisper (přepis) → Claude API (čištění)
- Pipeline: Audio → Whisper (surový přepis) → Claude (čištění interpunkce, strukturování, nejistá místa označí [?]) → výstup
- Výstup: čistý strukturovaný přepis připravený pro dalšího agenta

### Agent 2 – Blog post
- Vstup: přepis audia (prepis_clean.txt) + textové poznámky z daného dne
- Nástroj: Claude API (claude-opus-4-6)
- Výstup: blog post v osobním stylu autora
- Pipeline: jednoduchá – jeden agent, jedno volání API

#### Systémový prompt – principy (SKILL.md):
- **Lepidlo, ne přepisovač** – poslepovat útržky dohromady, minimálně zasahovat
- **Tón:** vyprávění u piva – neformální, přirozené, humor plyne ze situací
- **Sarkasmus a ironie** pouze tam kde je naznačena v poznámkách
- **Konkrétní fakta zachovat** – časy, vzdálenosti, názvy, značky, ceny
- **Nedomýšlet** – co není v poznámkách, to nepsat
- **Netlačit na žádný aspekt** – nebudovat motiv přes celý text
- **Žádná klišé** – "co víc si přát", "vstříc dobrodružství" apod.
- **Délka odpovídá vstupu** – nenafoukávat
- **Nadpis:** formát "Den X — [výstižný nadpis]"

#### Systémový prompt pro summary:
- Stejné principy jako pro blog post dne
- Vstup: pouze surové poznámky ze summary sekce (NE blog posty dní)
- Nadpis: formát "[destinace] — [výstižný podtitul]"

### Agent 3 – Instagram
- Vstup: přepis + vybrané fotky
- Nástroj: Claude API
- Výstup: popisek příspěvku, návrh výběru fotek, návrh pořadí

### Konverze fotek (sharp + heic-convert)
- Vstup: fotky dne nebo tripu (HEIC, JPG)
- Pipeline:
  - HEIC → heic-convert → JPEG
  - Všechny fotky → sharp resize do dvou verzí:
    - `_thumb.jpg` (400x300, q75) – náhledy a manuální výběr hero fotky
    - `_display.jpg` (1920x1280, q90) – galerie, lightbox, hero fotky na blogu
  - Cache verzí v R2: `trips/[trip]/[date]/photos/cache/`
- Zobrazují se VŠECHNY nahrané fotky – žádný automatický výběr
- Hero fotka dne/tripu: čistě manuální výběr ze seznamu kandidátů v gridu (žádné AI hodnocení). Tlačítko "Vybrat hero" jen načte až 40 thumbnailů; uživatel klikne na preferovanou fotku a ta se uloží

---

## Důležitá rozhodnutí

- ✅ Upload přes webovou stránku (ne nativní mobilní appka)
- ✅ Manuální trigger zpracování (ne automatický po uploadu)
- ✅ Schválení výstupu před publikací
- ✅ Osobní použití jako první fáze, ostatní cestovatelé až later
- ✅ Zásadní editace a ladění promptů pouze na laptopu
- ✅ V terénu akceptovat 80% výsledek, finální úpravy po cestě
- ✅ Tmavý design blogu s 3D globem — sidebar navigace místo hero bannerů
- ✅ Profilová hero fotka na úvodní stránce blogu odstraněna — globus je hlavní vizuální prvek

---

## Jednorázová konfigurace (setup)

Mimo kód, aby produkční upload fungoval, musí být v pořádku:

### Environment variables na Vercelu

| Název | Účel | Sensitive? |
|---|---|---|
| `CLOUDFLARE_R2_ACCOUNT_ID` | Cloudflare account ID (čte ho i Stream kód — sdílená hodnota napříč službami) | ne |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 S3 API klíč | ✅ |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | R2 S3 API tajný klíč | ✅ |
| `CLOUDFLARE_R2_BUCKET_NAME` | `travel-memories` | ne |
| `CLOUDFLARE_R2_S3_API_URL` | endpoint pro S3 klienta | ne |
| `CLOUDFLARE_STREAM_API_TOKEN` | API token se scope `Account · Stream · Edit` | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | čtení | ne |
| `SUPABASE_SERVICE_ROLE_KEY` | zápis do cache (obchází RLS) | ✅ |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `MAPY_CZ_API_KEY` / `MAPY_CZ_ID_API_KEY` | agenti a mapy | ✅ / ✅ / ne / ne |

### R2 bucket CORS

Prohlížeč PUTuje přímo na `https://<account>.r2.cloudflarestorage.com`. Bez CORS to browser zablokuje. V Cloudflare Dashboard → R2 → `travel-memories` → Settings → CORS policy:

```json
[
  {
    "AllowedOrigins": [
      "https://travel-memories.vercel.app",
      "https://*.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## Tipy a triky pro používání upload stránky

- **GPX soubory pojmenovávej výstižně** — název souboru (bez přípony `.gpx`) se zobrazí jako nadpis karty trasy na stránce dne. Např. `Přejezd Oslo-Bergen.gpx` → karta "Přejezd Oslo-Bergen"; `Výstup na Galdhøpiggen.gpx` → karta "Výstup na Galdhøpiggen". Diakritika a mezery v názvu karty zůstanou; pro R2 klíče (`map_trail_[slug].png` atd.) se interně slugifikují.
- **Hero fotky používej vždy landscape (na šířku)** — hero banner je široký nízký pruh, portrétové fotky tam nedávají smysl.
- **Po výběru hero fotky nastav focus point** — klikni na "Zobraz aktuální hero dne" / "Zobraz aktuální hero tripu", v náhledu posunuj slider a ulož. Focus point se uloží do `hero_photo.json` a Supabase cache, na blogu se projeví po revalidaci (automaticky).
- **Autofill data:** po výběru tripu se datum automaticky nastaví na první den tripu v R2. Pokud přidáváš nový den (datum které ještě v R2 není), přepiš datum ručně.
- **Při přepnutí tripu/dne se všechny náhledy vymažou** — záměrně, aby nevisely zůstatky z jiného kontextu.
- **Mobile upload funguje přímo z produkčního webu** — fotky i videa jdou z browseru přímo na R2 (presigned PUT URL), takže Vercel 4.5 MB body limit neomezuje velké várky. Při uploadu běží progress bar: N/M souborů, aktuální filename, agregátní MB a %.
- **Po změně souborů na R2 je potřeba invalidovat Supabase cache** — volá se automaticky z upload-finalize, generátorů map a Stream sync routes. Pokud se něco zdá „zaseklé", ručně spusť v Supabase SQL Editor: `DELETE FROM photo_urls_cache; DELETE FROM days_cache; DELETE FROM trips_cache;`. Next.js ISR cache se invaliduje přes `revalidatePath` v příslušných routes.
- **Stream video po `/copy` chvíli enkóduje** — `uid` je k dispozici okamžitě, ale iframe může prvních pár minut ukazovat „Processing". Je to normální Cloudflare Stream flow; video naskočí samo.

---

## Odhadované náklady

| Položka | Cena za den |
|---|---|
| Audio přepis (1–2 hod záznamu) | ~0.50 EUR |
| LLM – blog post | ~0.10 EUR |
| Analýza 20–30 fotek | ~0.30 EUR |
| **Celkem** | **~1 EUR** |

Komfortní rozpočet: 5 EUR/den (reálně bude méně).

---

## TODO

- [ ] **Mobilní zobrazení blogu** — sidebar layout je optimalizovaný pro desktop, na mobilu se stacked layout (sidebar nahoře, obsah dole) potřebuje doladit: horizontální scroll karet, výška sidebaru, dotykové interakce na globu, hero fotka výška na menších obrazovkách
- [ ] Zabezpečení admin části (/upload) – přidat autentizaci
- [ ] Vizuální úpravy /upload stránky – přehlednější rozložení pro lepší UX
- [ ] Automatické střihání videa (reels pro Instagram + delší video pro YouTube/blog) — vyzkoušet Canva Magic Video a CyberLink PowerDirector (auto edit funkce pro kreativní automatický střih)
- [ ] Instagram agent – generování popisků a výběr fotek
- [ ] Rozšíření pro ostatní cestovatele
- [ ] Odhadovaná doba trvání trasy pěší – Mapy.cz Route API nepodporuje ski ani hiking routeType
- [ ] **Vlastní doména + CDN před R2 pro sdílené cachování fotek** — pořídit `xar.travel` (TLD `.travel` je dražší, ~$100+/rok; registrátoři: Cloudflare Registrar, Porkbun, Namecheap), převést DNS na Cloudflare, napojit subdoménu `media.xar.travel` na R2 bucket přes Settings → Connect Custom Domain, přidat Cache Rule "Cache Everything" s Edge TTL 30 dní. Kód: `getSignedR2Url` pro fotky/hero/mapy nahradit deterministickým URL builderem (`https://media.xar.travel/{key}`), odstranit tabulku `photo_urls_cache` (URL se nemusí cachovat, jsou stabilní), invalidaci při přepisu fotky řešit Cloudflare Purge API. Celkově ~3 h focus work. **Přínos:** bajty fotek cached v ~300 Cloudflare edge POPech globálně — první návštěvník v regionu zaplatí R2 egress, další dostanou z edge cache. Doplňuje ISR + browser cache o sdílenou rychlost fotek napříč uživateli (to, co dnes chybí — dnes HTML je rychlé přes Vercel Edge, ale bajty fotek tahá každý nový návštěvník sám z R2). Samotný blog lze zároveň přestěhovat na `xar.travel` / `blog.xar.travel` místo `travel-memories.vercel.app`.
- [ ] Smazat nepoužívané API `/api/profile-hero` (upload profilové fotky)
- [x] Textový agent – vyladěný systémový prompt podle SKILL.md, model claude-opus-4-6
- [x] Redesign blogu – 3D globus, tmavá paleta, sidebar navigace
- [x] Supabase caching – zrychlení blogu
- [x] Zoom na globusu (kolečko myši, min/max limity)
- [x] Galerie fotek – řazení podle EXIF data pořízení (exifr), fallback na název souboru
- [x] Lightbox fotek – zoom plugin (kolečko myši + pinch)
- [x] Automatické přehrávání videí – Cloudflare Stream SDK, auto-advance na další video
- [x] Mapa trasy – zoom přes lightbox s Zoom pluginem
- [x] Editace blog textu z /upload stránky — načtení/uložení blog_post.txt, update Supabase cache + Next.js revalidace
- [x] RLS oprava — service_role klient pro zápis do Supabase cache
- [x] Více GPX tras na jeden den — karta per trasa na stránce dne, pěší / auto typ, auto má dobu jízdy z Mapy.cz Routing API (migrace `002_multi_trail_routes.sql`)
- [x] Autofill dne po výběru tripu na /upload (endpoint `/api/trip-dates`)
- [x] Focus point hero fotek — slider v /upload, uložení do `hero_photo.json` + Supabase sloupec `cover_focus_y` (migrace `003_hero_focus_point.sql`), `object-position` na blogu
- [x] Reset všech náhledů na /upload při přepnutí tripu/dne/sekce
- [x] Fix: `getCachedTripDays` používá R2 jako source of truth pro seznam dnů (díra v Supabase nesmí skrýt den)
- [x] Fix: `generate-trail-map` volá `revalidatePath` po úspěchu (ISR cache neblokovala nové mapy)
- [x] Direct-to-R2 upload přes presigned PUT URL — obchází Vercel 4.5 MB body limit, velké várky (stovky MB) projdou
- [x] Progress bar u uploadu — N/M souborů, aktuální filename, agregátní MB/%
- [x] Mobile upload fix — čtení souborů přes DOM ref místo React state (iOS Safari invaliduje FileList v state)
- [x] Cloudflare Stream přes `/stream/copy` — video bajty netečou přes Vercel, Stream si video stáhne z presigned R2 URL sám
- [x] Validace existujících `_stream.json` proti Cloudflare Stream API — rozbité metadata se přepíšou re-uploadem
- [x] Sync videí vždy invaliduje Supabase cache + `revalidatePath` (nezávisle na tom, jestli se něco nového nahrálo)
- [x] `response-cache-control: public, max-age=604800, immutable` na všech podepsaných image URL (fotky, hero, mapy) — prohlížeč reálně cachuje mezi návštěvami
- [x] Stream kód akceptuje `CLOUDFLARE_ACCOUNT_ID` i `CLOUDFLARE_R2_ACCOUNT_ID` (stejná hodnota napříč službami, žádná duplikace v env vars)
- [x] Progress bar při výběru hero fotky (NDJSON streaming v `/api/select-hero-photo`) — listing → příprava náhledů N/M → done
- [x] Odstranění Claude vision hero pickeru — žádná AI evaluace ani auto-výběr fotek. `/api/select-hero-photo` jen vrací kandidáty pro grid, manuální klik na náhled uloží přes `/api/set-hero-photo`. Smazán `heroPhotoAgent.ts`, `_ai.jpg` cache verze (konverze teď dělá jen thumb + display), odstraněno `reason` z hero_photo.json. `set-hero-photo` nově invaliduje cache + `revalidatePath` (předtím chybělo)

---

*Dokument vytvořen na základě úvodní architektury diskutované s Claude (březen 2026).*
*Poslední aktualizace: 23. dubna 2026 — direct-to-R2 upload přes presigned PUT URL, Cloudflare Stream přes `/copy`, progress bar u uploadu i hero pickeru, mobile upload fix, browser caching fotek přes `response-cache-control`, odstranění Claude vision hero pickeru (čistě manuální výběr z gridu).*
