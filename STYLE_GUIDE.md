# Travel Globe — Style Guide

Tento dokument popisuje designový systém prototypu Travel Globe, aby byl reprodukovatelný v produkčním projektu.

---

## Fonty

| Použití | Font | Váhy | Odkaz |
|---------|------|------|-------|
| Nadpisy, labely, statistiky, pin labely | **Orbitron** | 400, 700, 900 | `fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900` |
| Body text, popisy, UI | **Exo 2** | 300, 400, 600 | `fonts.googleapis.com/css2?family=Exo+2:wght@300;400;600` |

Orbitron dává cyberpunk/sci-fi charakter. Exo 2 je čitelný doplněk pro delší texty.

---

## Barevná paleta

### CSS Custom Properties

```css
:root {
  --bg-void:      #0a001a;                    /* hlavní pozadí — téměř černá s nádechem fialové */
  --neon-cyan:    #00f0ff;                    /* primární akcent — atmosféra, bordery, nadpisy */
  --neon-green:   #00ff88;                    /* marker glow, trip piny */
  --neon-magenta: #ff00aa;                    /* sekundární akcent, gradienty oblouků */
  --neon-amber:   #ffaa00;                    /* terciární akcent (střídmě) */
  --card-bg:      #1E1E2E;                    /* pozadí karet, tooltipů */
  --card-border:  rgba(0, 240, 255, 0.2);     /* bordery karet — cyan s nízkou opacitou */
  --text-main:    #e0e0f0;                    /* hlavní text — světle modro-šedá */
  --text-muted:   #8888aa;                    /* sekundární text — tlumená fialovo-šedá */
}
```

### Pravidla použití barev

- **Pozadí**: vždy `--bg-void` nebo jeho rgba varianta s backdrop-blur pro overlay panely
- **Neon akcenty**: max 2-3 neon barvy na jedné obrazovce, každá s jasným účelem
- **Text**: `--text-main` pro primární obsah, `--text-muted` pro metadata (datumy, popisy)
- **Karty**: `--card-bg` pozadí + `--card-border` border, nikdy čistě bílé ani čistě černé

---

## Neon Glow efekt — triple-stacked box-shadow

Klíčový vizuální prvek celého designu. Čtyři vrstvy box-shadow simulují záři neonové trubice:

```css
.element-with-glow {
  box-shadow:
    0 0 4px  var(--glow-color),                                           /* ostrý vnitřní core */
    0 0 10px var(--glow-color),                                           /* střední difúze */
    0 0 20px var(--glow-color),                                           /* vnější záře */
    0 0 40px color-mix(in srgb, var(--glow-color) 40%, transparent);      /* široký halo */
}
```

Pro animovanou pulzaci:

```css
@keyframes glow-pulse {
  0%   {
    box-shadow:
      0 0 4px  var(--glow-color),
      0 0 8px  var(--glow-color),
      0 0 16px var(--glow-color),
      0 0 32px color-mix(in srgb, var(--glow-color) 30%, transparent);
  }
  100% {
    box-shadow:
      0 0 6px  var(--glow-color),
      0 0 14px var(--glow-color),
      0 0 28px var(--glow-color),
      0 0 50px color-mix(in srgb, var(--glow-color) 50%, transparent);
  }
}

.pulsing-element {
  animation: glow-pulse 2.5s ease-in-out infinite alternate;
}
```

Pro neon text:

```css
.neon-heading {
  color: var(--neon-cyan);
  text-shadow: 0 0 8px rgba(0, 240, 255, 0.6), 0 0 24px rgba(0, 240, 255, 0.3);
}
```

---

## Komponenty

### Sidebar panel

- `position: fixed`, šířka `340px`, výška `100vh`
- Pozadí: `rgba(10, 0, 26, 0.88)` s `backdrop-filter: blur(16px)`
- Pravý border: `1px solid rgba(0, 240, 255, 0.15)` + `box-shadow: 4px 0 32px rgba(0, 240, 255, 0.06)`
- Vnitřní padding: `32px 24px 24px`
- Scrollbar: tenký 4px, transparentní track, cyan thumb `rgba(0, 240, 255, 0.2)`

### Trip karta (sidebar)

```
┌──────────────────────────────────┐
│ [foto 44px ●]  Název destinace  │  ← Orbitron 0.82rem, barva dle tripu
│                Krátký popis     │  ← Exo 2 0.72rem, --text-muted
│                          2024-03│  ← Orbitron 0.62rem, --text-muted
└──────────────────────────────────┘
```

- Pozadí: `--card-bg`, border: `1px solid --card-border`, border-radius: `10px`
- Padding: `14px 16px`, gap mezi foto a textem: `14px`
- Hover/active stav: border změní barvu na accent tripu, `transform: translateX(4px)`, subtilní box-shadow glow
- Levý accent bar: `::before` pseudo-element, `width: 3px`, barva tripu, `opacity: 0 → 1` na hover

### Foto thumbnail (v kartě i pinu)

- Kruhový: `border-radius: 50%`
- V sidebar kartě: `44px × 44px`, border `2px solid rgba(255,255,255,0.15)`
- V map pinu: `42px × 42px`, border `2px solid rgba(255,255,255,0.8)` + neon glow
- `object-fit: cover`

### Map pin (na globu)

Struktura HTML markeru:

```html
<div class="pin-container">
  <div class="trip-pin">           <!-- kruhová fotka s neon glow -->
    <img src="..." />
  </div>
  <div class="pin-ring"></div>     <!-- expandující ring animace -->
  <div class="pin-label">TOKYO</div>  <!-- název pod pinem -->
</div>
```

- Pin: 42px kruh, neon glow (viz výše), `glow-pulse` animace
- Ring: stejná velikost, `border: 1.5px solid`, animace `ring-expand` (scale 1→2.8, opacity 0.7→0)
- Label: Orbitron 0.6rem, uppercase, `letter-spacing: 2px`, text-shadow v barvě pinu
- Hover: pin se zvětší `transform: scale(1.25)`

```css
@keyframes ring-expand {
  0%   { transform: scale(1); opacity: 0.7; }
  100% { transform: scale(2.8); opacity: 0; }
}
```

### Tooltip karta

- Pozadí: `--card-bg`, border: `1px solid --card-border`, border-radius: `12px`
- Padding: `16px`, max-width: `280px`
- Box-shadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(0,240,255,0.08)`
- Obrázek: `width: 100%`, `height: 120px`, `border-radius: 8px`
- Název: Orbitron 0.9rem bold, barva dle tripu
- Datum: Orbitron 0.7rem, `--text-muted`
- Popis: Exo 2 0.8rem, `--text-muted`, `line-height: 1.4`
- Animace vstupu: `opacity 0→1`, `translateY(10px→0)`, `transition 0.25s ease`
- `pointer-events: none` (nesmí blokovat interakci s globem)

### Stats bar

- `border-top: 1px solid rgba(0, 240, 255, 0.1)`
- Hodnoty: Orbitron 1.3rem bold, `--neon-cyan`, text-shadow glow
- Labely: Exo 2 0.62rem, uppercase, `letter-spacing: 1.5px`, `--text-muted`

---

## Globe konfigurace (globe.gl)

```javascript
Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')   // NASA night-lights
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png') // topografie
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png') // hvězdné pozadí
  .showAtmosphere(true)
  .atmosphereColor('#00f0ff')       // cyan atmosférická záře
  .atmosphereAltitude(0.2)
```

### Bodové markery (point layer)

- `pointAltitude: 0.04` — nízké sloupce
- `pointRadius: 0.35`
- Barva odpovídá tripu
- Transition: `1500ms`

### Oblouky (arc layer)

- Barva: gradient mezi barvami start/end tripu s 60% opacitou (`${color}99`)
- `arcStroke: 0.6`
- Animované čárky: `dashLength: 0.5`, `dashGap: 0.3`, `dashAnimateTime: 2500ms`
- `arcAltitudeAutoScale: 0.45` — výška oblouku proporční k vzdálenosti

### Kamera

- Auto-rotace: `speed: 0.35`, zastaví se při interakci uživatele
- Fly-to animace: `altitude: 1.8`, `duration: 1200ms`
- Damping: `enabled`, `factor: 0.1`

---

## Responsive chování

### Desktop (> 800px)

- Sidebar: fixed vlevo, 340px šířka
- Globe: `margin-left: 340px`, vyplní zbytek

### Mobile (≤ 800px)

- Sidebar se přesune dolů jako horizontální pruh (72px výška)
- Karty se řadí horizontálně se scroll
- Nadpis, subtitle a stats bar se skryjí
- Globe vyplní celou šířku, `height: calc(100vh - 72px)`

---

## Klíčové designové principy

1. **Tmavá jako výchozí** — veškerý obsah svítí proti void-black pozadí
2. **Glow = hierarchie** — intenzivnější záře = důležitější element
3. **Barva = identita tripu** — každá destinace má svou neon barvu, konzistentní napříč pinem, kartou, obloukem
4. **Minimální bordery** — místo silných ohraničení používáme subtilní rgba bordery a glow shadows
5. **Backdrop blur** — overlay panely vždy s blur efektem, nikdy plně neprůhledné
6. **Orbitron pro identitu, Exo 2 pro čitelnost** — nikdy nesmíchat role fontů
