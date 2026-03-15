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
  │                                     │      │
  │  Generovat mapu (pokud GPX)         │      │
  │    GPX → Mapy.cz Static API         │      │
  │    → map_trail.png                  │      │
  │    → map_elevation.png              │      │
  │    → trail_stats.json               │      │
  │                                     │      │
  │  Vybrat hero fotku                  │      │
  │    fotky → Claude vision            │      │
  │    → hero_photo.json                │      │
  └─────────────────────────────────────────────┘
        ↓
CLOUDFLARE STREAM (videa)
  Automatická komprese MOV → streamovatelné video
  Iframe embed na blogu
        ↓
BLOG (/blog stránky)
  /blog                    ← seznam tripů + mapa světa s knihovničkami
  /blog/[trip]             ← summary + fotky + rozcestník dní
  /blog/[trip]/[datum]     ← blog post + fotky + videa + mapa + statistiky
        ↓
PUBLIKACE (budoucí fáze)
  Instagram agent → příspěvek
```

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
- Hero fotka se zobrazí jako ikonka dne na stránce tripu

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
- Hero fotka se zobrazí jako ikonka tripu na hlavní stránce blogu

---

---

## Tech stack

| Část | Technologie | Poznámka |
|---|---|---|
| Frontend + Backend | Next.js | vše na jednom místě |
| Hosting | Vercel | nasazení jedním příkazem |
| Úložiště souborů | Cloudflare R2 | levné, pro osobní objem prakticky zadarmo |
| Videa | Cloudflare Stream | automatická komprese + streaming, $5/měsíc |
| Databáze | Supabase | metadata, stavy zpracování, výstupy |
| Přepis audia | OpenAI Whisper | nejlepší kvalita přepisu |
| Agenti (text) | Claude API | blog post, Instagram popisky |
| Agenti (fotky) | Claude API | výběr hero fotky, analýza obsahu |
| Konverze fotek | sharp + heic-convert | HEIC → JPEG, 3 verze cache |
| Mapy | Mapy.cz Static API | turistická/zimní/letecká mapa s GPX trasou |
| Vývoj | Cursor | AI asistent při psaní kódu |

---

## Datová struktura v cloudu (Cloudflare R2)

```
trips/
  /02_2026 bezky Norsko/        ← název tripu (měsíc_rok + popis)
    /2026-02-03/                ← konkrétní den (YYYY-MM-DD)
      /audio/                   ← nahrávky z diktafonu (.m4a, .mp3)
      /photos/                  ← fotky (.jpg, .heic)
      /video/                   ← videa (.mov, .mp4) – úložiště, střih řešíme později
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

## Mobilní upload

- Jednoduchá webová stránka (otevřená v mobilním prohlížeči)
- Výběr cesty, datum do kdy se má kontent zpracovat
- Výběr souborů (fotky, audio, poznámky)
- Podpora přerušeného uploadu (offline fronta pro refugia bez signálu)
- Upload po 2–3 dnech je standardní scénář (GR11 = omezený signál)

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

## Systémové prompty – principy

- Základ všeho jsou dobře odladěné systémové prompty pro každého agenta
- Agenti se sami neučí – styl se buduje iterací promptů po každé cestě
- Metoda: style guide (popis stylu) + few-shot příklady (ukázky dobrých výstupů)
- Agent nikdy nic nevymýšlí – pokud neví, nechá prázdné místo
- Iterace promptů probíhá na laptopu po cestě, ne v terénu přes mobil

---

## Důležitá rozhodnutí

- ✅ Upload přes webovou stránku (ne nativní mobilní appka)
- ✅ Manuální trigger zpracování (ne automatický po uploadu)
- ✅ Schválení výstupu před publikací
- ✅ Osobní použití jako první fáze, ostatní cestovatelé až later
- ✅ Zásadní editace a ladění promptů pouze na laptopu
- ✅ V terénu akceptovat 80% výsledek, finální úpravy po cestě

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

## Postup vývoje (doporučené pořadí)

1. Založit účty u všech služeb (Vercel, Supabase, Cloudflare R2, OpenAI, Anthropic, GitHub)
2. Vytvořit `.env.local` s credentials
3. Rozchodit upload souborů do R2 + adresářová struktura
4. Přepis audia přes Whisper
5. První agent – blog post
6. UI pro zobrazení a schválení výstupu
7. Testování na datech z Norska
8. Nasazení před cestou do USA
9. Vše ostatní iterativně po jednotlivých cestách

---

## Budoucí fáze

- 🔜 Automatické střihání videa (krátké reels pro Instagram + delší video pro YouTube/blog)
- 🔜 Rozšíření pro ostatní cestovatele
- 🔜 Odhadovaná doba trvání trasy – Mapy.cz Route API nepodporuje ski routeType, rozdíl oproti webu ~50 min. Vrátit se později a prozkoumat přesnější řešení.
- 🔜 Zabezpečení admin části (/upload) – přidat HTTP Basic Auth přes Vercel nebo jinou autentizaci
- 🔜 Instagram agent
- 🔜 Výkon blogu – caching výsledků R2 volání do Supabase, stránky se načítají pomalu kvůli mnoha API voláním (signed URLs, Stream metadata, hero fotky)
- ✅ Textový agent – vyladěný systémový prompt podle SKILL.md, model claude-opus-4-6, jednoduchá pipeline (jeden agent bez korektora)

---

- [ ] GitHub
- [ ] Vercel (napojit na GitHub)
- [ ] Supabase
- [ ] Cloudflare R2
- [ ] OpenAI (Whisper + případně GPT-4o)
- [ ] Anthropic (Claude API)
- [ ] Cursor (editor)

---

*Dokument vytvořen na základě úvodní architektury diskutované s Claude (březen 2026).*
*Aktualizuj tento soubor po každé iteraci nebo důležitém rozhodnutí.*
