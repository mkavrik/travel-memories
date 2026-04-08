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
UPLOAD (webová stránka /upload)
  Výběr tripu + dne/summary → Nahrát do R2
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
  │    MOV/MP4 → Cloudflare Stream              │
  │    → automatická komprese + streaming       │
  │    → _stream.json metadata                  │
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
  │  Generovat mapu (pokud GPX)                 │
  │    GPX → Mapy.cz Static API                 │
  │    → map_trail.png                          │
  │    → map_elevation.png                      │
  │    → trail_stats.json                       │
  │                                             │
  │  Vybrat hero fotku                          │
  │    fotky → Claude vision                    │
  │    → hero_photo.json                        │
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
        ↓
CLOUDFLARE STREAM (videa)
  Automatická komprese MOV → streamovatelné video
  Iframe embed na blogu
        ↓
BLOG (sidebar navigace + obsah)
  /blog                    ← sidebar s tripy + 3D globus (react-globe.gl)
  /blog/[trip]             ← hero fotka + sidebar se dny + summary + fotky
  /blog/[trip]/[datum]     ← hero fotka + sidebar se sekcemi + blog post
                              + fotky + videa + mapa + statistiky
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
| `/blog/[trip]/[date]` | "Xar's travel" → trip → datum + sekční odkazy + prev/next navigace | Hero fotka nahoře, blog post + fotky + videa + mapa + statistiky |

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

### 6. Vygenerovat mapu (pokud máš GPX)
- Vyber typ mapové vrstvy (turistická / zimní / letecká)
- Klikni **Generovat mapu**
- Výstup: `map_trail.png`, `map_elevation.png`, `trail_stats.json`

### 7. Vybrat hero fotku
- Klikni **Vybrat hero fotku dne**
- Agent vybere nejlepší fotku automaticky
- Pokud nesouhlasíš → klikni na jinou v manuálním výběru
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
- Agent vybírá ze VŠECH fotek tripu (všechny dny + summary)
- Hero fotka se zobrazí jako cover tripu v sidebaru + hero banner na stránce tripu

---

## Tech stack

| Část | Technologie | Poznámka |
|---|---|---|
| Frontend + Backend | Next.js 14 | App Router, server components |
| Hosting | Vercel | nasazení jedním příkazem |
| Úložiště souborů | Cloudflare R2 | levné, pro osobní objem prakticky zadarmo |
| Videa | Cloudflare Stream | automatická komprese + streaming, $5/měsíc |
| Databáze | Supabase | cache vrstva, metadata; RLS zapnuté, zápis přes service_role |
| 3D globus | react-globe.gl | Three.js wrapper, NASA textury |
| Přepis audia | OpenAI Whisper | nejlepší kvalita přepisu |
| Agenti (text) | Claude API (claude-opus-4-6) | blog post, Instagram popisky |
| Agenti (fotky) | Claude API | výběr hero fotky, analýza obsahu |
| Konverze fotek | sharp + heic-convert | HEIC → JPEG, 3 verze cache |
| Mapy | Mapy.cz Static API | turistická/zimní/letecká mapa s GPX trasou |
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
      /map/                     ← soubor s trasou dne (.gpx)
      /outputs/                 ← výstupy agentů (blog post, Instagram)
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
| `src/components/MapWithZoom.tsx` | Mapa trasy s lightbox zoomem |
| `src/lib/cache.ts` | Supabase cache vrstva |
| `src/lib/r2.ts` | Cloudflare R2 client |
| `src/lib/supabase.ts` | Supabase klienti (anon pro čtení, service_role pro zápis) |
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

### Agent 4 – Fotky
- Vstup: fotky dne nebo tripu (HEIC, JPG)
- Nástroj: sharp + heic-convert (konverze a resize)
- Pipeline:
  - HEIC → heic-convert → JPEG
  - Všechny fotky → sharp resize do tří verzí:
    - `_thumb.jpg` (400x300, q75) – náhledy a manuální výběr hero fotky
    - `_display.jpg` (1920x1280, q90) – galerie, lightbox, hero fotky na blogu
    - `_ai.jpg` (800x600, q70) – Claude API analýza
  - Cache verzí v R2: `trips/[trip]/[date]/photos/cache/`
- Zobrazují se VŠECHNY nahrané fotky – žádný automatický výběr
- Hero fotka dne/tripu: Claude vision vybere nejlepší, autor může manuálně přepsat

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
- [ ] Automatické střihání videa (reels pro Instagram + delší video pro YouTube/blog)
- [ ] Instagram agent – generování popisků a výběr fotek
- [ ] Rozšíření pro ostatní cestovatele
- [ ] Odhadovaná doba trvání trasy – Mapy.cz Route API nepodporuje ski routeType
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

---

*Dokument vytvořen na základě úvodní architektury diskutované s Claude (březen 2026).*
*Poslední aktualizace: 8. dubna 2026 — editace blog textu z /upload, RLS oprava, cache invalidace.*
