# VARIANTA B: „Ink & Trail" — mírně komiksová, ilustrativní

## Filosofie
Inspirace: Hergého Tintin, cestovní deníky Moleskin, illustrated editorial. Ručně kreslené detaily, ale elegantní — jako byste listovali ilustrovaným travel magazínem. Silné linky, výrazné barvy, ale žádná infantilnost. Myslíte si „comic", ale výsledek říká „auteur".

---

## Fonty

| Použití | Font | Váhy | Odkaz |
|---------|------|------|-------|
| Nadpisy, názvy cest, stats | **Dela Gothic One** | 400 | `fonts.googleapis.com/css2?family=Dela+Gothic+One` |
| Body text, popisy, UI | **Nunito** | 300, 400, 600 | `fonts.googleapis.com/css2?family=Nunito:wght@300;400;600` |

Dela Gothic One je tučný, výrazný display font s komiksovým charakterem — ale bez „bublinkového" fontu. Nunito je zakulacený sans-serif, friendly ale dospělý.

---

## Barevná paleta

### CSS Custom Properties

```css
:root {
  --bg-paper:      #F4F1EB;          /* teplý papír — jako stránka sketchbooku */
  --bg-dark:       #2B2D30;          /* tmavé pozadí pod globem */
  --ink:           #1D1D1B;          /* hlavní „inkoust" — téměř černá */
  --ink-light:     #4A4A48;          /* světlejší inkoust */
  --stroke:        #1D1D1B;          /* border = tah perem, 2px minimum */
  --accent-orange: #E8652E;          /* výrazná oranžová — hlavní akcent */
  --accent-teal:   #1A8C7E;          /* doplňková tmavá tyrkysová */
  --accent-yellow: #F2C744;          /* highlight, badges */
  --accent-coral:  #E85D5D;          /* chyby, důležitá info */
  --card-bg:       #FFFDF7;          /* karty — lehce teplejší než papír */
  --text-muted:    #8A8580;          /* sekundární text */
  --shadow-ink:    rgba(29, 29, 27, 0.12);   /* stíny jako inkoust, ne šedé */
}
```

### Pravidla použití barev
- **Pozadí**: `--bg-paper` — vždy teplý, nikdy studený šedý
- **Bordery**: vždy `--stroke` (téměř černý), **minimálně 2px** — simulace perokresebných tahů
- **Akcenty**: oranžová pro piny a aktivní stavy, teal pro sekundární, žlutá pro badges
- **Žádné gradienty** — plné barvy, jasné kontury

---

## Ilustrativní efekty

### „Pero" bordery — klíčový vizuální prvek

```css
/* Všechny karty a kontejnery mají silný, mírně nerovný border */
.card {
  border: 2.5px solid var(--stroke);
  border-radius: 6px;   /* zakulacení ANO, ale menší — komiksové panely nejsou kulaté */
  box-shadow: 3px 3px 0 var(--shadow-ink);   /* tvrdý offset stín — žádný blur */
}

/* Hover posune stín a kartu */
.card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--shadow-ink);
}
```

### „Stamp" badge pro trip status

```css
.trip-badge {
  display: inline-block;
  padding: 2px 8px;
  border: 2px solid var(--accent-orange);
  border-radius: 3px;
  font-family: 'Dela Gothic One', sans-serif;
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--accent-orange);
  transform: rotate(-3deg);           /* mírný náklon — jako razítko */
}
```

### Křížkový pattern pozadí (volitelný)

```css
.bg-crosshatch {
  background-image:
    repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(29,29,27,0.03) 4px, rgba(29,29,27,0.03) 5px),
    repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(29,29,27,0.03) 4px, rgba(29,29,27,0.03) 5px);
}
```

---

## Komponenty

### Sidebar panel
- `position: fixed`, šířka `340px`, výška `100vh`
- Pozadí: `--bg-paper`
- Pravý border: `3px solid --stroke` — **tlustý**, viditelný „rámeček"
- Vnitřní padding: `28px 20px`
- Nadpis: Dela Gothic One, 1.4rem, `--ink`
- Dekorativní linka pod nadpisem: `border-bottom: 2.5px solid --ink`, šířka 60px

### Trip karta (sidebar)

```
┌━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┐
│ [foto 44px ●]  Název cesty       │  ← Dela Gothic One 0.85rem
│                Krátký popis      │  ← Nunito 0.78rem, --text-muted
│                2026              │  ← Nunito 0.7rem, --text-muted
│         [COMPLETED]  ← razítko  │  ← rotated badge
└━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┘
    ↑ 3px border + 3px offset shadow
```

- Pozadí: `--card-bg`
- Border: `2.5px solid --stroke`, radius: `6px`
- Box-shadow: `3px 3px 0 var(--shadow-ink)` — **tvrdý, plochý stín**
- Hover: `transform: translate(-2px, -2px)`, shadow se zvětší na `5px 5px`
- Aktivní: pozadí změní na `--accent-orange`, text na bílou

### Foto thumbnail
- Kruhový: `border-radius: 50%`
- Border: `2.5px solid --stroke` — silnější než v Clean variantě
- Sidebar: `44px × 44px`
- Map pin: `40px × 40px`
- `object-fit: cover`

### Map pin (na globu)

```html
<div class="pin-container">
  <div class="trip-pin">
    <img src="..." />
  </div>
  <div class="pin-spike"></div>       <!-- trojúhelníková „špička" pinu -->
  <div class="pin-label">TOKYO</div>
</div>
```

- Pin: 40px kruh, `2.5px solid white` border, tvrdý stín `2px 2px 0 rgba(0,0,0,0.3)`
- Spike: CSS trojúhelník pod pinem (8px výška), bílý
- Label: Dela Gothic One 0.6rem, uppercase, `letter-spacing: 1.5px`, bílá, tvrdý text-shadow `1px 1px 0 rgba(0,0,0,0.6)`
- Hover: `scale(1.2)`, stín se zvětší
- **Žádná pulsující animace** — statický, grafický

### Tooltip karta

- Pozadí: `--card-bg`
- Border: `2.5px solid --stroke`, border-radius: `8px`
- Box-shadow: `4px 4px 0 var(--shadow-ink)`
- Obrázek: `width: 100%`, `height: 130px`, `border-radius: 6px 6px 0 0`, border-bottom: `2.5px solid --stroke`
- Název: Dela Gothic One 0.95rem, `--ink`
- Datum: Nunito 0.72rem, `--text-muted`
- Popis: Nunito 0.82rem, `--ink-light`, `line-height: 1.45`
- Entrance: `translateY(6px→0)`, `opacity 0→1`, `0.2s ease`

### Stats bar
- `border-top: 2.5px solid --stroke`
- Hodnoty: Dela Gothic One 1.5rem, `--accent-orange`
- Labely: Nunito 0.62rem, uppercase, `letter-spacing: 2px`, `--text-muted`
- Dekorativní prvky: malé ilustrativní ikony vedle stats (kompas, bota, vlajka) — SVG inline, stroke-based

---

## Globe konfigurace

```javascript
Globe()
  .globeImageUrl('/textures/earth-natural-light.jpg')   // přírodní denní textura
  .bumpImageUrl('/textures/earth-topology.png')
  .backgroundColor('rgba(43, 45, 48, 0)')
  .showAtmosphere(true)
  .atmosphereColor('#E8652E')          // oranžový nádech atmosféry — teplý
  .atmosphereAltitude(0.18)
```

### Oblouky
- Barva: `--accent-orange` s `--accent-teal` — kontrastní dvojice
- `arcStroke: 0.8` — tlustší než Clean varianta
- `dashLength: 0.3`, `dashGap: 0.2`, `dashAnimateTime: 2000ms`
- Čárkované oblouky vypadají jako **perokresba** na globu

### Kamera
- Auto-rotace: `speed: 0.3`
- Fly-to: `altitude: 1.8`, `duration: 1000ms`

---

## Klíčové designové principy

1. **Silná linka = identita** — minimum 2px bordery všude, žádné jemné hairline bordery
2. **Tvrdé stíny** — offset bez blur, jako v komiksu nebo screen printu
3. **Omezená paleta** — 3 barvy + ink + papír, nic víc
4. **Razítka a rotace** — drobné natočení elementů dodává ručně-dělaný feeling
5. **Ilustrativní detaily** — SVG ikonky (kompas, bota, stan) jako dekorace, ne fotorealistické
6. **Globe jako „panel"** — tmavý globe s oranžovou atmosférou = dramatický komiksový panel

---
---
