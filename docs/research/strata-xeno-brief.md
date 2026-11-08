# Strata-xeno design system — implementation brief for Narze (Discord music-bot dashboard)

**Source:** `D:\Github\Strata-xeno-System-Design\` (code survey of `xenodeve/Strata-xeno` @ `f0e4e82`, 20 Oct 2026). Token values were re-read from the actual source `D:\Github\Strata-xeno Web\app\globals.css` / `effects.css` and match the docs.
**Citation format:** `02 §2.1` = chapter `02-design-system.md`, section 2.1. `globals:NNN` = line in `app/globals.css`.
**Legend:** values marked **[source]** are taken verbatim from the system. Values marked **[Narze addition]** are not in Strata-xeno; they are proposed to fill a gap a dashboard needs (Strata-xeno is a marketing/showcase site, not an app) and are derived using the system's own rules.

Important framing facts before you start:
- Strata-xeno is **plain global CSS with custom properties, no Tailwind** (decision D2, `10 §10.1`). The Tailwind mapping in §10 is a translation, not something the system ships.
- All colours are **hex** (no oklch). Only **five** base colours change between themes; everything else is `color-mix()` of ink (`02 §2.1, §3.1`).
- There are **no spring physics** anywhere. Motion is cubic-bezier only; "springiness" comes from bezier curves whose y-values exceed 1 (`04 §2`).
- The system has **no toast, dialog, skeleton or spinner components in the site shell**. Their treatments below come from the product's motion table (`04 §2.3, §3.1`) which the site replays, and are marked accordingly.

---

## 1. Design philosophy & voice — the rules

1. **One ink, many opacities.** The whole palette is one ink colour at different strengths over one background, plus a single blue accent and a single green "ok". Secondary text, tertiary text, hairlines and fills are all `color-mix` of ink (`02 §3.5`: "the whole palette is one ink colour at different opacities").
2. **Accent is a signal, not a decoration.** Blue is reserved for: links/focus ring, slider fill, active switch, scan line, callout pins, highlighter, and the "ours" series in charts (`02 §2.1` `--accent` purpose column). Primary buttons are **ink**, not accent (`globals:451`).
3. **One motion language.** One easing `cubic-bezier(0.23, 1, 0.32, 1)`, three durations 160/320/600 ms, one stagger 38 ms (`00 §0.2` principle 4; `globals:1-3`).
4. **Content first, motion second.** Everything reads and works with JS off, reduced motion on, WebGL missing, or the backend down. Hidden start states exist only under `html.js` and never under reduced motion (`00 §0.2` principle 3; `02 §4.1`; `09 P2`).
5. **Use the real thing; never pictures of it.** Rebuild UI from source rather than screenshots; copy motion constants from the product's own stylesheet with the source named (`00 §0.2` principle 1; decisions D3/D4 in `10 §10.1`).
6. **Every number carries its conditions.** A measured figure cannot exist without conditions and a source (typed); charts start at zero, say which direction is better, and write the difference (`06 §2`, `09 P4`).
7. **Pills and hairlines, not boxes and shadows.** Controls are 999px pills with a 1px `--line` border; selected state = **ink fill with bg-coloured text** (`02 §5.1` `.tabs`, `.chip`, `.lang`). Big soft shadows are reserved for "windows" (framed app surfaces) only (`globals:2359, 2514`).
8. **Swiss/editorial type.** Inter Variable at 600 with strongly negative tracking for headings (−0.025 to −0.05em), mono (JetBrains Mono 0.75rem, +0.02em) as the caption/label voice, generous 1.6 body leading (`02 §2.4`; `00 §0.3` "Modern Swiss grid and hierarchy, editorial pacing").
9. **Browser scroll is sacred.** No scroll hijacking, no wheel capture; pinned sections are driven by native scroll and controls call `scrollTo` (`00 §0.3` non-goals; D11, D13 in `10 §10.1`).
10. **Positive, plain, honest voice.** Present positively but never claim without evidence: "planned ≠ shipped", no testimonials or user counts, unmeasured things are written as "not measured" (`00 §0.3`; D18; `06 §2` "Claims not made without evidence").

**Forbidden** (explicit in the docs): sound/autoplay audio and gyroscope (D21); scroll hijacking (D11); numbers without conditions; analytics/third-party scripts/cookies (D22); content hidden behind an animation that fails without JS; hover-lift effects that stick on touch (`02 §7.3` lists this as a bug to fix with `@media (hover:hover)`); downloading heavy media while the user scrolls past (D24).

---

## 2. Color tokens

### 2.1 Base tokens — the only five that flip **[source]** (`02 §2.1`, `globals:5-57`)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `#0b0b0d` | page background; also text-on-ink (primary button label, pressed chip) |
| `--surface` | `#ffffff` | `#151518` | raised: cards, buttons, inputs, windows, menus |
| `--ink` | `#131316` | `#f1f1f3` | primary text; fill of the active pill / primary button |
| `--accent` | `#0a62d6` | `#5aa2ff` | links, focus, slider fill, switch on, "ours" chart series |
| `--ok` | `#1a8a4a` | `#4cc380` | "shipped"/success |

### 2.2 Derived tokens — computed from ink **[source]**

| Token | Formula | Role |
|---|---|---|
| `--ink-2` | `color-mix(in srgb, var(--ink) 66%, var(--bg))` | secondary text, captions, ledes, inactive tab text |
| `--ink-3` | `color-mix(in srgb, var(--ink) 42%, var(--bg))` | tertiary text, hover border, inactive dots, link underline, axis labels |
| `--line` | `color-mix(in srgb, var(--ink) 12%, transparent)` | every hairline and border |
| `--fill` | `color-mix(in srgb, var(--ink) 6%, transparent)` | hover fill, bar track, window chrome bar |

**Caveat (`02 §2.1` "Important mechanics", `§11.1`):** derived tokens are computed on `:root` and inherited as computed colours; they do **not** re-derive when a descendant redefines `--ink`. Any always-dark island must re-declare them as literals. The system's island (`.section--deep`, `globals:1250-1262`) uses:
`--surface:#151518; --accent:#5aa2ff; --ok:#4cc380; --ink-2:#a8a8b2; --ink-3:#6f6f7a; --line:rgb(255 255 255 / .14); --fill:rgb(255 255 255 / .07)`.

### 2.3 Elevation (surfaces)
Only two planes: `--bg` (page) and `--surface` (anything raised). Elevation is expressed by **border + surface colour**, not shadow; in dark mode the step is `#0b0b0d → #151518`. A third, always-dark "deep" plane exists (`--deep: #0b0b0d`, `--deep-ink: #f1f1f3`) for feature bands (`02 §3.4`).

### 2.4 Component-level mixes worth reusing **[source]** (`02 §3.5`)
- Selection: `color-mix(in srgb, var(--accent) 28%, transparent)` (`globals:105`)
- Nav glass: `color-mix(in srgb, var(--bg) 86%, transparent)` + `backdrop-filter: blur(12px) saturate(1.2)` (`globals:272-275`)
- Primary button hover: `color-mix(in srgb, var(--ink) 88%, var(--accent))` (`globals:457`)
- Badge tint: border `color-mix(<status> 55%, transparent)`, text `color-mix(<status> 80%, var(--ink))` (`globals:529-535`)
- Chart "theirs" series: `color-mix(in srgb, var(--ink) 26%, var(--surface))`; delta pill bg `accent 14%` (`effects:418, 450`)
- Switch track off: `color-mix(in srgb, var(--ink) 30%, transparent)` (`globals:1461`)
- Slider track: `color-mix(in srgb, var(--ink) 14%, transparent)`
- Highlighter: `--hl` = accent 26 % (`02 §8`)

### 2.5 Semantic colours
Strata-xeno defines only `--ok`. Status vocabulary is closed (shipped / opt-in / off-by-default) and maps to: ok-tint, accent-tint, dashed `--ink-3` border (`02 §5.1` `.badge`). Code blocks use a fixed Monokai Classic palette (`--mk-*`, same in both themes, `02 §2.1`).

**[Narze addition]** A dashboard needs warn/danger. Follow the same pattern (one hex per theme, used only as badge/border tints via the 55 %/80 % mix, never as large fills):
`--warn: #b26a00 / #f0a640` (the product's "auto" mode tint is `color-mix(in srgb, #d98a00 80%, var(--a-ink))`, `04` modes scene, `TINT` constants) and `--danger: #c4302b / #ff6b62`. Check contrast (≥ 4.5:1 for text) before shipping; these are not from the source.

### 2.6 Accent usage rules (ratios/restrictions)
- No explicit 60-30-10 ratio is stated. In practice: ink/bg greys carry ~everything; accent appears on interactive state and one data series only (`02 §2.1` purpose list).
- Accent is never a section background or a large fill except: chart "mine" bars, switch-on track, slider fill (`effects:410-413`, `globals:1464`).
- "Ours vs theirs" in data = accent vs ink-26 % grey. Single-series = accent (`05 §12.3`).
- The "mood" colour (`--glow`, a registered `@property <color>`, initial `#8a8a96`) is a per-state tint used only in glows and dots, transitioned over 800-900 ms (`02 §2.1`). For Narze this maps naturally to **now-playing / track artwork accent** — keep it in glows only.

### 2.7 Theme mechanism **[source]** (`02 §3`, `01 §1.2`)
- Three states: system (no attribute, `prefers-color-scheme`), forced dark `:root[data-theme="dark"]`, forced light `:root[data-theme="light"]`. Guard the media query with `:root:not([data-theme="light"])`.
- Inline `<head>` script before paint: adds class `js` to `<html>` and restores `localStorage` theme; `<html suppressHydrationWarning>`. Toggle cycles system → light → dark → system; glyphs `◐ ○ ●`.
- `color-scheme: light dark` on `:root`; `theme-color` meta `#f5f5f7` / `#0b0b0d`.
- Theme change transitions `background-color, color, border-color` at `--t2` on body, nav, cards (`globals:2261-2270`).
- Canvas code reads `--bg/--ink/--accent` via `getComputedStyle` (hex only) and re-reads on a `MutationObserver` on `data-theme` (`02 §3.2`).

---

## 3. Typography

### 3.1 Families **[source]** (`02 §2.4`, `00 §0.5`; self-hosted via Fontsource)
| Role | Stack |
|---|---|
| Sans (body + display) | `"Inter Variable", "Anuphan Variable", -apple-system, "Segoe UI", system-ui, sans-serif` |
| Mono (labels, captions, badges, numbers-in-UI) | `"JetBrains Mono Variable", ui-monospace, "Cascadia Mono", Consolas, monospace` |
| Serif (one decorative word only) | `"Instrument Serif", Georgia, "Anuphan Variable", serif` (weight 400) |
| **Thai** | **Anuphan Variable** sits second in the sans stack, so Thai glyphs fall through automatically. For Thai display words the serif is swapped for Anuphan 600 (`05 §2.4`) |

npm: `@fontsource-variable/inter`, `@fontsource-variable/anuphan`, `@fontsource-variable/jetbrains-mono`, `@fontsource/instrument-serif`. (In Next.js you may use `next/font` instead; keep the same family names in the CSS variables.)

### 3.2 Body **[source]** (`globals:69-83`)
`font-size: 1.0625rem` (17px) · `line-height: 1.6` · `font-feature-settings: "ss01", "cv11"` (Inter alternates) · `text-rendering: optimizeLegibility` · `-webkit-font-smoothing: antialiased`.
**Thai** (`html[lang="th"]`): `line-height: 1.75`, `font-feature-settings: normal`; every heading gets `letter-spacing: 0` and taller leading (display 1.14, h2-h4 1.2, ledes 1.7-1.75) (`02 §2.4`).

### 3.3 Scale **[source]** (`02 §2.4`) — fluid, hand-tuned (not a fixed ratio)
| Class | Size | LH | Tracking | Weight |
|---|---|---|---|---|
| `.display` | `clamp(2.3rem, 4.1vw, 3.9rem)` | 1 | −0.045em | 600, `text-wrap: balance` |
| hero display | `clamp(2.6rem, 5.4vw, 5rem)` | 0.98 | −0.045em | 600 |
| `.h2` | `clamp(2rem, 4.2vw, 3.6rem)` | 1.02 | −0.035em | 600 |
| `.h3` | `clamp(1.5rem, 2.4vw, 2.05rem)` | 1.1 | −0.025em | 600 |
| `.h4` | `1.0625rem` | — | −0.01em | 600 |
| `.lede` | `clamp(1.1rem, 1.5vw, 1.3rem)` | 1.5 | — | 400, `--ink-2`, max 40em, `text-wrap: pretty` |
| section lede | `clamp(1.05rem, 1.35vw, 1.2rem)` | 1.55 | — | `--ink-2`, max 44em |
| stat number | `clamp(2.8rem, 5.6vw, 4.8rem)` | 1 | −0.05em | 600 |
| count number | `clamp(2.2rem, 4vw, 3.4rem)` | 1 | −0.04em | 600 |
| quote | `clamp(1.4rem, 2.6vw, 2.1rem)` | 1.2 | −0.025em | 500 |
| `.mono` (label voice) | `0.75rem` | 1.5 | +0.02em | 400 |
| uppercase label | mono + `text-transform: uppercase; letter-spacing: 0.1em` (stat label), `0.06em` (dt), `0.08em` (subhead 0.8125rem/500) |

UI fixed sizes in use: `0.6875rem` (badge), `0.75rem`, `0.8125rem` (13px: nav tools, tabs small, labels), `0.875rem` (nav links, chips), `0.9rem` (tabs), `0.9375rem` (button), `1.05rem` (list title, 500), `1.25rem` (empty-state title, 600) (`02 §2.4`).
Brand wordmark: weight 600, tracking −0.02em (`globals:291`).

### 3.4 Numeric features **[source]**
`.num { font-variant-numeric: tabular-nums; white-space: nowrap; }` on every stat, count, chip count and readout (`globals:141`). `.mono` resets `font-feature-settings: normal` so Inter's ss01/cv11 don't leak in. Numbers never wrap mid-value (`02 §7.2`).
**Dashboard use:** apply `.num` to durations (3:42), queue counts, volume %, latency, listener counts. Digits that change may animate with the product's `EASE_DIGIT` (§5.3).

---

## 4. Space, layout, shape

### 4.1 Layout tokens **[source]** (`02 §2.3`)
- `--gutter: clamp(16px, 3vw, 32px)` (wrap padding, grid gaps)
- `--max: 1320px` (container max-width); `.wrap { max-width: var(--max); margin-inline: auto; padding-inline: var(--gutter) }`
- `--nav-h: 60px` (sticky nav; `scroll-padding-top: calc(var(--nav-h) + 16px)`)
- Other widths in use: demo window 1240px, compare window 1180px, film 1040px, readable text 62-70ch (`02 §5.4, §5.5`).

### 4.2 Spacing
No spacing token exists; the scale in use is the 4/8 family **4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 36, 40 px** plus repeated fluid clamps (`02 §2.3`):
- Section padding: `clamp(72px, 10vw, 148px)`; tight: `clamp(40px, 6vw, 88px)`
- Section head margin-bottom: `clamp(32px, 5vw, 64px)`
- Major grid gap: `clamp(24px, 4vw, 64px)`; sidebar/panel gap `clamp(28px, 6vw, 96px)`
- Card padding: `clamp(24px, 4vw, 48px)` (large), `clamp(20px, 3vw, 36px)` (medium), `24px` (controls panel), `20px 22px 18px` (chart)
The docs themselves recommend adding a spacing scale when porting (`02 §11.1`, `§11.3`). **[Narze addition]** `--s-1:4px … --s-10:40px` in §10.

### 4.3 Grid
- No 12-column page grid in practice (the `.shead` 12-col grid is dormant). Real grids are two-column asymmetric splits: `minmax(0,7fr) minmax(0,5fr)`, `minmax(240px,5fr) minmax(0,7fr)`, sidebar `minmax(210px, 250px) minmax(0, 1fr)`, 2-up stats, 3-up credits, auto-fit counts `repeat(auto-fit, minmax(190px, 1fr))` (`02 §5.2`).
- Always `minmax(0, …)` tracks and `min-width: 0` on grid children so content cannot widen tracks (`02 §7.2`).
- **The Settings layout is the dashboard template**: sticky sidebar (`top: calc(var(--nav-h) + 24px)`, own scroll, hidden scrollbar) + one panel at a time; at ≤ 900px the sidebar becomes a sticky glass `<details>` accordion (`surface 92%` + `blur(12px)`, `--r2`, 48px summary, list `max-height: 60dvh`) (`02 §5.1` item 9; `globals:2058-2196`).

### 4.4 Radii **[source]** (`02 §2.3`)
`--r1: 8px` (small: skip link, menu items, code box) · `--r2: 12px` (dropdowns, step buttons, accordion) · `--r3: 16px` (cards, charts, windows, controls panel) · `20px` (framed app window, video) · `28px` (stat cards, story stage) · `999px` (all pills: buttons, tabs, chips, inputs, badges, lang toggle) · `50%` circles · `4px` focus ring · `5px` chart bar end · `3px` legend swatch.

### 4.5 Borders
Always `1px solid var(--line)`. Hover raises border to `--ink-3` (soft controls) or `--ink` (buttons, step cards). Sections separate with `border-top: 1px solid var(--line)`. Dashed `--ink-3` = "off by default". Lists are hairline-ruled (`border-top` on list, `border-bottom` on each row) with no card around them (`globals:1903-1909`).

### 4.6 Shadow / elevation **[source]** (no token in source — `02 §2.1` lists "no `--shadow` token")
| Use | Value |
|---|---|
| Dropdown menu | `0 18px 40px -16px rgb(0 0 0 / .3)` |
| Framed app window (largest) | `0 50px 90px -50px rgb(0 0 0 / .45)` |
| Tilted window | `0 40px 80px -48px rgb(0 0 0 / .4)` |
| Floating label pill | `0 8px 22px -8px rgb(0 0 0 / .5)` |
| Slider thumb | `0 0.5px 4px rgb(0 0 0 / .12), 0 6px 13px rgb(0 0 0 / .12)`; active `0 0.5px 4px rgb(0 0 0 / .14), 0 10px 20px rgb(0 0 0 / .18)` |
| Switch knob | `0 1px 2px rgb(0 0 0 / .1)` |
| Glow behind hero/window | radial accent, `filter: blur(34px)`, `inset: -10% -6%` |
Pattern: large negative spread so the shadow sits **below** the object, never a halo. Cards and controls have no shadow.

### 4.7 Density and hit targets
- Button 44px, ghost 40px, large 56px; tabs/chips 40px; search input 48px; nav tools 36px; lang buttons 32px inside a 2px-padded pill (`02 §5.1`).
- Small controls get an invisible `::after` with negative inset to reach ~44px (e.g. 8px dot → 36×16 target with `inset: -14px -4px`) (`02 §5.1` "Hit-target pattern").
- Density is airy: list rows `padding: 18px 0`, definition rows `11px 0`.

### 4.8 z-index
Small and local: 0-6 inside components, 20 sticky sidebar, 50 nav, 100 skip link. Nothing above 100 (`02 §2.5`). **[Narze addition]** dialogs/toasts at 60/70 to stay above nav.

### 4.9 Breakpoints
Source uses an ad-hoc set (520…1020, `max-width` only); the docs recommend consolidating to **520 / 700 / 900 / 1020** (`02 §11.3`). Nav collapses to a `<details>` menu at ≤ 1020; sidebar → accordion at ≤ 900; tables/rows reflow ≤ 720; phone at ≤ 520.

---

## 5. Motion

### 5.1 Site tokens **[source]** (`02 §2.2`)
| Token | Value | Use |
|---|---|---|
| `--ease` | `cubic-bezier(0.23, 1, 0.32, 1)` | everything ("fast out, soft settle") |
| `--t1` | `160ms` | hover colour/border, chips, tabs, buttons, links |
| `--t2` | `320ms` | arrow slide, chevrons, panel swap, list-row body, theme change |
| `--t3` | `600ms` | reveal, page enter, bar widths, iframe fade |
| `--stagger` | `38ms` | per-index reveal delay (`calc(var(--i) * var(--stagger))`) |
| word stagger | `46ms` | per-word slide-up (`760ms`) |
| glide | `420ms cubic-bezier(.4,0,.2,1)` | boxes that grow in height (`ROUTER §2`) |

Documented exceptions in source: switch `200ms ease`, slider thumb 220ms, pin move 260ms, crossfade 420ms, pointer lean 500ms, avatar pop 700ms, chart bars 900ms, mood glow 800-900ms (`02 §2.2`). Treat these as the allowed "named literals"; don't invent new ones.

### 5.2 Product motion table (for app-like UI) **[source]** (`04 §2.2-2.3, §3.1`)
Curves: `EASE 0.23,1,0.32,1` · `EASE_SOFT 0.4,0,0.2,1` (big sections, height glides) · `EASE_DIGIT 0.34,1.45,0.64,1` (digit pop, overshoots) · `EASE_REEL 0.16,1,0.3,1` (number reels) · `EASE_MORPH 0.34,1.25,0.64,1` / close `0.22,1,0.36,1` · `EASE_LATTICE 0.77,0,0.175,1` · classic `0.2,0.7,0.2,1`.

Enter recipes (`Enter` table, duration / y-offset / blur / start-scale):
| Kind | ms | y | blur | scale | Use in Narze |
|---|---|---|---|---|---|
| msg | 300 | 8 | 0 | 1 | new log line / chat message |
| rise | 420 (+50ms stagger) | 8 | 0 | 1 | page content |
| row | 360 | −6 | 0 | 1 | track added to queue (drops in from above) |
| page | 260 | 0 | 6px | 0.985 | route change: sharpen in from blur |
| swap | 280 | 0 | 6px | 0.985 | label whose text changes (now-playing title) |
| toast | 240 | 8 | 0 | 0.98 | toast |
| panel | 220 | 4 | 0 | 1 | side panel content |
| tip | 150 | −3 | 0 | 1 | tooltip |
| orb | 450 | 0 | 3px | 0.82 | status indicator swap |
Other product numbers: collapse rows 320 / opacity 240 (soft 520/360); line text swap 250; handover in 380 after 90 / out 300; digit pop 320 with 38ms between digits; reel 450; dialog enter 200ms (`translateY 8→0`, `scale .98→1`, veil black 0.45); side sheet 300ms from the right with 40 % black veil; button press `scale(0.98)` 150ms; switch knob 200ms (`04 §2.3, §3`).

### 5.3 Springs
**None.** No spring physics anywhere. Overshoot is achieved with `EASE_DIGIT` (y1 = 1.45) and `EASE_MORPH` (y1 = 1.25) (`04 §2.2`). If you use Framer Motion, express these as `ease: [0.34, 1.45, 0.64, 1]` rather than `type: "spring"`.

### 5.4 Enter/exit patterns **[source]**
- **Reveal on scroll** (`02 §4.1`): `html.js .reveal { opacity:0; transform: translateY(18px); transition: opacity/transform var(--t3) var(--ease); transition-delay: calc(var(--i,0)*var(--stagger)) }` → `.is-in` sets final state; one-shot IntersectionObserver, `rootMargin "0px 0px -8% 0px"`, threshold 0.01, never reversed.
- **Keyframes**: `page` 8px fade-up 600ms on each route mount; `swap` 10px fade-up 320ms when a panel's key changes; `rise` 14px for disclosure bodies; `pop` translateY 16px + scale .86→1, 700ms for a hero object (`02 §4.3`). (Docs flag these three distances as one pattern to consolidate.)
- **Height animation** without `height:auto`: animate `grid-template-rows: 0fr → 1fr` with a `min-height:0; overflow:hidden` child (`02 §5.6`; `04 §3` Collapse/Glide).
- **Two transform channels**: entrance on `transform`, pointer lean on individual `translate:` so they don't fight (`02` verification fact 4).
- Exits are mostly crossfades (opacity 420ms) rather than slide-outs.

### 5.5 What animates / what never does
Animates: opacity, transform, colour/border on hover, bar widths, grid rows, custom properties written from rAF (`--f`, `--px`, `--py`) — written with `style.setProperty`, **not** React state (`01 §1.3`).
Never: scroll position by hijack; layout properties per frame; anything while off-screen (loops stop via IntersectionObserver); scenes redraw only while something moves (~28ms throttle) (`08 §8.1`). Pointer lean only for `pointerType === "mouse"` (`02 §4.4`).

### 5.6 Reduced motion **[source]** (`02 §4.5`, `globals:2271-2289`)
```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  html.js .reveal { opacity: 1; transform: none; }
}
```
Plus: effects render their final state; looping marquees become a scrollable static row; canvases don't mount; scenes show their last frame; pinned sections unpin; video waits for Play. The docs recommend doing the unpinning CSS-first (not via a JS hook that is `false` on first render) (`02 §11.1` item 11).

---

## 6. Component patterns

All exact values below are **[source]** from `globals.css`/`effects.css` unless marked.

**Buttons** (`globals:423-473`): `.btn` = inline-flex, `min-height:44px`, `padding:0 1.25em`, `gap:.5em`, `border:1px solid var(--line)`, `radius:999px`, `bg:var(--surface)`, `0.9375rem/500`; hover border → `--ink`; active `translateY(1px)`; disabled `opacity:.45; cursor:not-allowed`; transition transform/border/bg/colour at `--t1`.
`--primary`: bg/border `--ink`, text `--bg`, hover `color-mix(ink 88%, accent)`. `--ghost`: transparent, 40px, `padding:0 1em`, pressed = `--fill` + `--ink-3` border. `--link`: transparent border, underlined with `--ink-3`. `--lg`: 56px, 1.0625rem. Trailing `.arrow` slides 4px on hover (`--t2`). Icon-only tool: 36px circle, `--ink-2` text.

**Inputs** (`globals:1878-1893`): search = full width, `min-height:48px`, `padding:0 18px`, **pill radius**, `--surface` bg, `--line` border, hover `--ink-3`, focus-visible offset 2px. **Switch**: 38×22 pill, off `ink 30%`, on `--accent`, 18px white knob slides 16px in 200ms, `role="switch"`, `aria-checked`. **Slider**: native range, 28px hit area, 4px track (`ink 14%`), fill via `--p` gradient (WebKit) / `::-moz-range-progress`, 24px white thumb with two-layer shadow, scale 1.06 hover / 1.16 active (220ms), focus ring on the thumb, `touch-action: pan-y`. **Segmented** (`.lang`): pill with 2px padding, 32px buttons, pressed = ink fill. Perfect for Narze volume, loop/shuffle toggles and filter controls.

**Cards / panels**: `border:1px solid var(--line); border-radius: var(--r3) (16px); background: var(--surface); padding: clamp(20px,3vw,36px)` (`.mcard`). Big stat card radius 28px, padding `clamp(24px,4vw,48px)`, hover border `--ink-3`. No shadow. A chart inside a card loses its frame and becomes `border-top: 1px solid var(--line)` (`effects:523-531`). **Window** (framed app surface): radius 20px, 40px chrome bar with `--fill` bg, three 11px dots (`--ink-3` at .55), mono URL, big below-shadow (`globals:2349-2400`).

**Lists / tables**: hairline-ruled list (`.reg` / `.row`) on native `<details>`: summary `padding:18px 0`, flex between, title 1.05rem/500 with `min-width:0`, meta on the right, a 28px round `+`/`–` toggle (mono, `--line` border, opened = `--fill`), hover underlines the title, body animates `rise` 320ms, wraps at ≤ 720px (`globals:1903-1994`). Definition grid `.conds`: `minmax(110px,.7fr) minmax(0,3fr)`, uppercase mono `dt` at 0.06em, `dd` 0.925rem/1.5, ruled rows `11px 0`. **For the queue**: use this row pattern with `.num` durations and the `row` enter (360ms, −6px).

**Nav** (`globals:267-420`): sticky, 60px, glass (`bg 86%` + `blur(12px) saturate(1.2)`), bottom hairline; links 0.875rem `--ink-2`, hover → ink with 1px bottom border; tools on the right (36px pills); ≤ 1020px collapses into a native `<details>` with a 44×36 pill summary `≡` and a dropdown (`--surface`, `--r2`, padding 8, items `12px` with `--r1`, hover `--fill`, `min-width:220px`, anchored right). Active page link gets `aria-current="page"`.

**Tabs** (`globals:1220-1246`): flex row, gap 8px; each tab a 40px pill, `padding:0 18px`, `0.9rem`, `--line` border, `--ink-2` text; hover ink + `--ink-3` border; selected (`aria-selected`/`aria-pressed`) = **ink fill, `--bg` text**. Wrap on phones. The docs note five near-identical pill implementations — **build one `.pill` with size modifiers** (`02 §10.2`, `§11.1` item 5).

**Badges** (`globals:517-536`): mono `0.6875rem`, `padding:1px 8px`, pill, `--line` border, `--ink-2`, nowrap; status via `color-mix` border 55 % / text 80 %; "off" state = dashed `--ink-3` border. Status set must be closed (a new status value would render unstyled).

**Toasts** [product table, not in site shell]: enter 240ms, `translateY(8px)`, `scale(.98)`, `--ease` (`04 §3.1`). **[Narze addition]** surface `--surface`, `--line` border, `--r2`, dropdown shadow `0 18px 40px -16px rgb(0 0 0/.3)`, mono meta line, `role="status"`/`aria-live="polite"`.

**Dialogs** [product table]: enter 200ms `translateY(8→0)` + `scale(.98→1)`, veil `rgb(0 0 0 / .45)`; side sheet slides from the right in 300ms over a 40 % black veil, width `min(92vw, 380px)` (`04 §3`, panels/settings notes). Use `<dialog>`, `--surface`, `--r3`, window shadow.

**Empty / loading / error states** (`06 §3.8`, `08 §8.6`, `02 §5.4`):
- No spinners and no skeletons by policy: content is static/prerendered; scenes show their **final frame** before they play ("what a reader without scripts gets").
- Empty: plain `--ink-2` line, `padding:40px 0`, with an `aria-live` result count (`.empty`, `.count`).
- Loading a heavy/remote surface: centred status text ("Starting the demo…") in `--ink-2`, then the content fades in (opacity `--t3`) when `.is-loaded`.
- Error/offline: centred panel — title `1.25rem/600 --ink`, explanation `--ink-2`, and a copyable command in a Monokai code box with `user-select: all`. Busy → plain-language 429 message. "A fallback that is useful, not a spinner" (`09 P9`).
- **[Narze addition]** for live bot data (queue, now-playing) where a short wait is real, use a static `--fill` placeholder at final size (no shimmer), then `swap`/`page` sharpen-in; reserve layout to keep CLS 0.

**Charts**: see §7.

---

## 7. Effects & charts

### 7.1 When canvas/WebGL/WebGPU is allowed (`05 §2, §16`; `09 P9`; `08 §8.1`)
- Only as **decoration behind content** (`aria-hidden`, `pointer-events:none`, `z-index:0`, content at z 1) or as a labelled `role="img"` for display words. Never as the only carrier of information.
- Load client-only (`next/dynamic(..., { ssr:false })`), **after a capability probe** (WebGL2 context, `"gpu" in navigator`), with a manual kill switch `?webgl=0` and `deviceMemory ≤ 2` fallback.
- Two observers: *near* (rootMargin 80-600px) arms/creates, *seen* runs/pauses. Destroy on leave with `WEBGL_lose_context`.
- Never under reduced motion (don't mount). Always a styled static fallback (e.g. a dot-grid still, a serif word).
- Third-party effects (React Bits) are "MIT with Commons Clause" — check licence; keep a provenance header and credit (`09 P10`).

### 7.2 Budgets (as implemented; the docs set no formal numeric budget)
- DPR cap: 1.5 for three.js and particle fields; 2 for small orbs/WebGPU (`08 §8.1`, `05 §2.6, §7.2`).
- Text scramble effects throttled to ~24 fps; scenes redraw at most every ~28ms and only while something moves (`05 §1.11`; `08 §8.1`).
- Particle counts used: 60-120 particles, size 90-260, speed 0.06-0.08, opacity .55-.85 (`05 §2.6`).
- Heavy media: poster only; fetch after the element has been ≥ 50 % on screen for **0.7 s**; blob, muted, paused off-screen; skipped on reduced motion / data saver (`08 §8.1`, D24).
- Measured result of these rules (one run, not a budget): first load JS 339 KB transferred, CSS 31 KB, fonts 129 KB, CLS 0 (`08 §8.1`).
- **For Narze:** one decorative canvas max per view (e.g. a mood-coloured aurora behind now-playing), off by default on low-memory devices.

### 7.3 Chart style **[source]** (`05 §12`, `effects:357-535`)
- **HTML/CSS bars, no canvas or SVG**: horizontal grouped bars; grid `minmax(64px,96px) minmax(0,1fr) auto` (label / bars / delta); 24px bar rows, 6px gap; bar end radius `0 5px 5px 0`.
- Frame: `--surface`, `--line` border, `--r3`, padding `20px 22px 18px`; compact variant inside cards = top rule only.
- Grid lines drawn with `repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px calc(100% / var(--n)))` + right border for the scale end.
- Colours: "ours" = `--accent`; "theirs" = `color-mix(ink 26%, surface)`; one series = accent. Delta = pill with `accent 14%` bg, accent text, 600.
- Value labels 0.8rem/600, unit in `<small>` at 0.75 opacity; label goes **inside** the bar (white, or ink for grey) when the bar > 68 %.
- Header: mono title `--ink-2` + direction "↓ lower is better / ↑ higher is better" in `--ink-3`; legend 10px swatches radius 3px; caption 0.8rem `--ink-3` with the conditions.
- Animate once on view: width 900ms `--ease`, delays `group*160 + series*90` ms, values fade +450ms; reduced motion = final state immediately.
- Rules: scale starts at **zero**; every bar is a written figure; differences are plain subtraction; a visually-hidden `<table>` repeats the data; plot and legend are `aria-hidden`.
- Known fix to apply when porting: initial zero widths are inline, so no-JS users see empty bars — render final widths in SSR (`05 §12.3`, `§12.5`).
- **For Narze** (listening stats, top tracks, latency): reuse as-is; sparklines may follow the product's classic monitor line (100×32 viewBox, non-scaling stroke) (`04` legacy notes).

---

## 8. Craft checklist

- [ ] Focus: global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px }`; components with their own radius re-assert it; range inputs ring the thumb (`02 §5.1`, verification fact 5).
- [ ] Skip link: off-screen at `top:-64px`, `top:12px` on focus, ink pill, z 100.
- [ ] Hover: border step `--line → --ink-3` (soft) or `→ --ink` (buttons); press `translateY(1px)`; step cards lift `translateY(-2px)` at `--t2`. Guard lifts with `@media (hover: hover)` (missing in source — recommended fix, `02 §7.3, §11.3`).
- [ ] Links: `text-decoration-color: var(--ink-3)`, `text-underline-offset: 0.2em`, → `currentColor` on hover.
- [ ] Tabular numbers + `nowrap` on every figure; badges and chips `nowrap`.
- [ ] Hairlines are `1px` `--line` (ink 12 %); fills `--fill` (ink 6 %).
- [ ] Mono for metadata (timestamps, ids, counts, captions), uppercase + 0.06-0.1em tracking for labels.
- [ ] `text-wrap: balance` on headings, `pretty` on ledes/paragraphs; measure capped at 40-70ch/em.
- [ ] Selection `accent 28%`.
- [ ] Hit targets ≥ 44px via `::after` negative inset on small controls.
- [ ] Fixed boxes for anything that loads late (avatars, artwork) so CLS stays 0.
- [ ] `overflow-x: clip` (not `hidden`) next to sticky elements; `minmax(0,…)` tracks; check `scrollWidth === clientWidth` at 390px.
- [ ] Spaces outside animated inline-blocks (pitfall: words ran together) (`10 §10.2` #1).
- [ ] Glass only on sticky chrome (nav, mobile sidebar): `bg/surface 86-92%` + `blur(12px)`.
- [ ] Thai: `lang` attribute switches leading/tracking; `L = { en, th }` typed strings so a missing translation is a compile error (`09 P3`).
- [ ] Storage in try/catch; only theme + language stored.
- [ ] Anything that auto-advances (rotating moods, carousels; for Narze: a rotating "recently played" strip) pauses while hovered or focused and only runs while ≥ 25 % visible (`03 §4`, §23 `held` pause, IO threshold 0.25).
- [ ] Changing figures ease to their new value instead of jumping (`useEased` 450 ms, `useCountUp`) (`09 P13`, `03 §23`).
- [ ] Grain/noise texture: **not part of this system** (none in the CSS). Don't add one.

---

## 9. Quality attributes

**Performance** (`08 §8.1`, `09 P9`):
- Intent: nothing heavy loads, runs or draws unless visible; nothing animates that isn't changing; no layout shift after first paint.
- Measured (one run, desktop, unthrottled; not a budget): HTML 24 KB, JS 339 KB in 15 files, CSS 31 KB, fonts 129 KB (4 woff2), 26 requests, DCL 75 ms, load 539 ms, **CLS 0** (also 0 under mobile emulation + 4× CPU).
- **Not measured anywhere: LCP, INP, Lighthouse, 60 fps, real phones.** The system sets no numeric LCP/JS/FPS budget. **[Narze addition]** adopt: LCP < 2.5 s, INP < 200 ms, CLS < 0.05, initial JS < 180 KB gz on the dashboard route, 60 fps for transitions; measure them instead of claiming them.
- Known debt not to copy: all CSS on every route (F-01), 3,465 DOM nodes / 24 canvases (F-02), lifetime scroll listeners (F-03).

**Accessibility** (`08 §8.2`):
- Real text always in the DOM; animated copies `aria-hidden`; canvases `aria-hidden` or `role="img"` + label; charts have a hidden table.
- Semantic landmarks, skip link, visible focus, keyboard for everything (arrow keys on carousels, Enter/Space on toggles).
- State via ARIA (`aria-pressed`, `aria-selected`, `aria-checked`, `aria-current`) — these double as styling hooks (F-09: be aware changing ARIA changes visuals).
- Reduced motion: CSS block + JS hook; no-JS: hidden states only under `html.js`.
- Verified: axe-core 0 violations once; screen-reader pass, forced-colours, 400 % zoom, touch-target audit **not done**. Gaps to avoid: focus lost when a keyed panel remounts (`06 §3.9`), multiple `<h1>` (F-04), English-only skip link (F-07).
- Pre-release checklist (`09`): JS off / reduced motion / WebGL off works; 390/1024/1440px × light/dark × both languages with no horizontal overflow; axe 0.

---

## 10. Ready-to-paste tokens

### 10.1 CSS `:root` (light + dark + forced themes)

```css
/* Strata-xeno tokens for Narze. [source] values from Strata-xeno app/globals.css:5-57.
   Lines marked [narze] are additions the source does not have. */
:root {
  /* five base colours — the only ones that flip */
  --bg: #f5f5f7;
  --surface: #ffffff;
  --ink: #131316;
  --accent: #0a62d6;
  --ok: #1a8a4a;
  --warn: #b26a00;   /* [narze] */
  --danger: #c4302b; /* [narze] */

  /* derived from ink (re-declare inside any always-dark island) */
  --ink-2: color-mix(in srgb, var(--ink) 66%, var(--bg));
  --ink-3: color-mix(in srgb, var(--ink) 42%, var(--bg));
  --line: color-mix(in srgb, var(--ink) 12%, transparent);
  --fill: color-mix(in srgb, var(--ink) 6%, transparent);

  /* always-dark band */
  --deep: #0b0b0d;
  --deep-ink: #f1f1f3;

  /* motion */
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);       /* glide / big sections */
  --ease-digit: cubic-bezier(0.34, 1.45, 0.64, 1); /* overshoot pop */
  --ease-reel: cubic-bezier(0.16, 1, 0.3, 1);
  --t1: 160ms;
  --t2: 320ms;
  --t3: 600ms;
  --t-glide: 420ms;
  --stagger: 38ms;

  /* shape */
  --r1: 8px;
  --r2: 12px;
  --r3: 16px;
  --r-window: 20px;  /* [narze] token for a source literal */
  --r-stage: 28px;   /* [narze] token for a source literal */
  --r-pill: 999px;

  /* layout */
  --gutter: clamp(16px, 3vw, 32px);
  --max: 1320px;
  --nav-h: 60px;
  --section-y: clamp(72px, 10vw, 148px);
  --section-y-tight: clamp(40px, 6vw, 88px);
  --head-gap: clamp(32px, 5vw, 64px);

  /* spacing [narze] — names for the 4/8 family the source uses as literals */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px;
  --s-6: 24px; --s-7: 28px; --s-8: 32px; --s-9: 36px; --s-10: 40px;

  /* elevation [narze] — names for the source's literal shadows */
  --shadow-menu: 0 18px 40px -16px rgb(0 0 0 / 0.3);
  --shadow-window: 0 50px 90px -50px rgb(0 0 0 / 0.45);
  --shadow-float: 0 8px 22px -8px rgb(0 0 0 / 0.5);
  --shadow-knob: 0 0.5px 4px rgb(0 0 0 / 0.12), 0 6px 13px rgb(0 0 0 / 0.12);

  /* type */
  --font-sans: "Inter Variable", "Anuphan Variable", -apple-system, "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --font-serif: "Instrument Serif", Georgia, "Anuphan Variable", serif;

  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b0b0d;
    --surface: #151518;
    --ink: #f1f1f3;
    --accent: #5aa2ff;
    --ok: #4cc380;
    --warn: #f0a640;   /* [narze] */
    --danger: #ff6b62; /* [narze] */
  }
}
:root[data-theme="dark"] {
  --bg: #0b0b0d;
  --surface: #151518;
  --ink: #f1f1f3;
  --accent: #5aa2ff;
  --ok: #4cc380;
  --warn: #f0a640;   /* [narze] */
  --danger: #ff6b62; /* [narze] */
  color-scheme: dark;
}
:root[data-theme="light"] { color-scheme: light; }

/* always-dark island: derived tokens must be literals here (they don't re-derive) */
.deep {
  --bg: var(--deep); --ink: var(--deep-ink);
  --surface: #151518; --accent: #5aa2ff; --ok: #4cc380;
  --ink-2: #a8a8b2; --ink-3: #6f6f7a;
  --line: rgb(255 255 255 / 0.14); --fill: rgb(255 255 255 / 0.07);
  background: var(--deep); color: var(--deep-ink);
}

html { scroll-behavior: smooth; scroll-padding-top: calc(var(--nav-h) + 16px); -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--font-sans); font-size: 1.0625rem; line-height: 1.6;
  font-feature-settings: "ss01", "cv11";
  text-rendering: optimizeLegibility; -webkit-font-smoothing: antialiased;
  transition: background-color var(--t2) var(--ease), color var(--t2) var(--ease);
}
html[lang="th"] body { line-height: 1.75; font-feature-settings: normal; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
::selection { background: color-mix(in srgb, var(--accent) 28%, transparent); }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.mono { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.02em; line-height: 1.5; font-feature-settings: normal; }

html.js .reveal {
  opacity: 0; transform: translateY(18px);
  transition: opacity var(--t3) var(--ease), transform var(--t3) var(--ease);
  transition-delay: calc(var(--i, 0) * var(--stagger));
}
html.js .reveal.is-in { opacity: 1; transform: none; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  html.js .reveal { opacity: 1; transform: none; }
}
```

Pre-paint script for `app/layout.tsx` `<head>` (from `02 §3.2`; rename the key):
```html
<script>document.documentElement.classList.add("js");try{var t=localStorage.getItem("narze.theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
```

### 10.2 Tailwind mapping

**Tailwind v4** (CSS-first; put after the `:root` block). `inline` makes utilities reference the variables so theme switching works:
```css
@import "tailwindcss";
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
/* WARNING: `dark:` fires ONLY under forced dark (data-theme="dark"), not for system-dark users.
   Rely on the tokens (which flip by themselves) for anything that must follow the OS; avoid `dark:`. */

/* keep `inline`: several lines below map a theme var to a same-named CSS var
   (--font-sans, --ease-soft, --shadow-*); without `inline` they become circular references. */
@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-line: var(--line);
  --color-fill: var(--fill);
  --color-accent: var(--accent);
  --color-ok: var(--ok);
  --color-warn: var(--warn);
  --color-danger: var(--danger);
  --color-deep: var(--deep);
  --color-deep-ink: var(--deep-ink);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-r1: var(--r1);
  --radius-r2: var(--r2);
  --radius-r3: var(--r3);
  --radius-window: var(--r-window);
  --radius-stage: var(--r-stage);
  --radius-pill: var(--r-pill);

  --ease-strata: var(--ease);
  --ease-soft: var(--ease-soft);
  --ease-digit: var(--ease-digit);

  --shadow-menu: var(--shadow-menu);
  --shadow-window: var(--shadow-window);
  --shadow-float: var(--shadow-float);

  --container-site: var(--max);

  --text-display: clamp(2.3rem, 4.1vw, 3.9rem);
  --text-display--line-height: 1;
  --text-display--letter-spacing: -0.045em;
  --text-display--font-weight: 600;
  --text-h2: clamp(2rem, 4.2vw, 3.6rem);
  --text-h2--line-height: 1.02;
  --text-h2--letter-spacing: -0.035em;
  --text-h2--font-weight: 600;
  --text-h3: clamp(1.5rem, 2.4vw, 2.05rem);
  --text-h3--line-height: 1.1;
  --text-h3--letter-spacing: -0.025em;
  --text-h3--font-weight: 600;
  --text-lede: clamp(1.1rem, 1.5vw, 1.3rem);
  --text-lede--line-height: 1.5;
  --text-body: 1.0625rem;
  --text-body--line-height: 1.6;
  --text-btn: 0.9375rem;
  --text-label: 0.8125rem;
  --text-mono: 0.75rem;
  --text-mono--letter-spacing: 0.02em;
  --text-badge: 0.6875rem;
}
```
Durations: use arbitrary values bound to tokens, e.g. `duration-[var(--t1)] ease-[var(--ease)]`, or add `@utility` helpers:
```css
@utility t1 { transition-duration: var(--t1); transition-timing-function: var(--ease); }
@utility t2 { transition-duration: var(--t2); transition-timing-function: var(--ease); }
@utility t3 { transition-duration: var(--t3); transition-timing-function: var(--ease); }
```

**Tailwind v3** equivalent (`tailwind.config.ts` → `theme.extend`):
```ts
extend: {
  colors: {
    bg: "var(--bg)", surface: "var(--surface)", ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)", 3: "var(--ink-3)" },
    line: "var(--line)", fill: "var(--fill)", accent: "var(--accent)", ok: "var(--ok)",
    warn: "var(--warn)", danger: "var(--danger)", deep: { DEFAULT: "var(--deep)", ink: "var(--deep-ink)" },
  },
  fontFamily: { sans: ["var(--font-sans)"], mono: ["var(--font-mono)"], serif: ["var(--font-serif)"] },
  borderRadius: { r1: "8px", r2: "12px", r3: "16px", window: "20px", stage: "28px", pill: "999px" },
  transitionTimingFunction: { strata: "cubic-bezier(0.23, 1, 0.32, 1)", soft: "cubic-bezier(0.4, 0, 0.2, 1)", digit: "cubic-bezier(0.34, 1.45, 0.64, 1)" },
  transitionDuration: { t1: "160ms", t2: "320ms", t3: "600ms", glide: "420ms" },
  boxShadow: { menu: "var(--shadow-menu)", window: "var(--shadow-window)", float: "var(--shadow-float)" },
  maxWidth: { site: "1320px" },
  height: { nav: "60px" },
  fontSize: {
    display: ["clamp(2.3rem, 4.1vw, 3.9rem)", { lineHeight: "1", letterSpacing: "-0.045em", fontWeight: "600" }],
    h2: ["clamp(2rem, 4.2vw, 3.6rem)", { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "600" }],
    h3: ["clamp(1.5rem, 2.4vw, 2.05rem)", { lineHeight: "1.1", letterSpacing: "-0.025em", fontWeight: "600" }],
    lede: ["clamp(1.1rem, 1.5vw, 1.3rem)", { lineHeight: "1.5" }],
    body: ["1.0625rem", { lineHeight: "1.6" }],
    btn: "0.9375rem", label: "0.8125rem", mono: ["0.75rem", { letterSpacing: "0.02em", lineHeight: "1.5" }], badge: "0.6875rem",
  },
},
```

Example class recipes (Tailwind v4 names):
- Button: `inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-pill border border-line bg-surface text-ink text-btn font-medium transition-[transform,border-color,background-color,color] t1 hover:border-ink active:translate-y-px disabled:opacity-45`
- Primary: `bg-ink text-bg border-ink hover:bg-[color-mix(in_srgb,var(--ink)_88%,var(--accent))]`
- Tab (selected via ARIA): `min-h-10 px-[18px] rounded-pill border border-line text-ink-2 text-[0.9rem] hover:text-ink hover:border-ink-3 aria-selected:bg-ink aria-selected:text-bg aria-selected:border-ink`
- Card: `rounded-r3 border border-line bg-surface p-[clamp(20px,3vw,36px)]`
- Badge: `inline-block px-2 py-px rounded-pill border border-line font-mono text-badge tracking-[0.02em] text-ink-2 whitespace-nowrap`

---

## Applying it to Narze (short mapping)

| Narze surface | Strata-xeno pattern |
|---|---|
| App shell | sticky glass nav (60px) + Settings layout (sticky sidebar 210-250px → accordion ≤ 900px) |
| Server list / queue | hairline-ruled rows on `<details>`, `.num` durations, `row` enter 360ms −6px |
| Now playing | `--surface` stage card radius 28px; artwork colour as `--glow`-style tint only in a glow; title changes with `swap` (280ms, 6px blur sharpen) |
| Playback controls | 44px round buttons, segmented pill for loop/shuffle, native slider for seek/volume |
| Feature toggles per guild | `switch-row` (label + small description + 38×22 switch) |
| Stats | Chart component; stat cards with mono uppercase label and tabular number |
| Status (online, latency, shard) | mono badges with ok/warn/danger tint |
| Errors (bot offline, missing perms) | centred panel: title, plain explanation, copyable command/invite in a code box |
