<!-- SEED: re-run /impeccable document once there's code to capture actual component tokens and generate the .impeccable/design.json sidecar. Palette and typography are locked design decisions, not extracted values. -->

---
name: Narze V6
description: Real-time Discord Music Bot dashboard — control music, manage queues, and monitor your bot through a purpose-built dark interface
colors:
  bg: "oklch(0.08 0.000 0)"
  panel: "oklch(0.13 0.000 0)"
  card: "oklch(0.18 0.000 0)"
  elevated: "oklch(0.24 0.000 0)"
  ink: "oklch(0.95 0.000 0)"
  muted: "oklch(0.72 0.000 0)"
  border: "oklch(0.22 0.000 0)"
  accent: "oklch(0.66 0.180 195)"
typography:
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.005em"
  caption:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "oklch(0.72 0.180 195)"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  queue-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  queue-item-active:
    backgroundColor: "oklch(0.66 0.180 195 / 0.12)"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  sidebar-guild:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px"
  sidebar-guild-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px"
---

# Design System: Narze V6

## 1. Overview

**Creative North Star: "The Live Desk"**

Narze V6 is a control surface, not a content platform. The visual language borrows from live sound mixing desks and broadcast monitoring rooms: dark, purposeful, every readout visible at a glance, nothing decorative. The interface disappears into the music. Album art fills the hero zone. Status pulses where it matters. Controls are immediately reachable without navigation.

The palette is near-black with a single cyan-teal accent (`oklch(0.66 0.180 195)`) that communicates state and action. Restrained in the Spotify sense: darkness is the canvas, album art provides supplementary color, and the accent earns attention through rarity. Motion is alive but disciplined — state changes respond immediately, track transitions feel cinematic, queue reorders have weight. Nothing animates without a reason the user will feel.

This system explicitly rejects: glassmorphism stacked on glassmorphism (v5.0.2's own anti-pattern, forbidden here), the generic dark SaaS palette where every gray is just dark enough, cluttered gaming-dashboard chrome, and the legacy bot dashboard aesthetic of Hydra and MEE6 where UI density hides the music. If this could be mistaken for a 2020 Discord bot panel, something went wrong.

**Key Characteristics:**
- Album art is architecturally primary — the only true hero element on the Now Playing surface
- Sidebar (240px fixed) + two-column main content (Now Playing ~55% / Queue+Search ~45%), Spotify-style
- Real-time state expressed through motion and live indicators, not static badges
- Permission tiers shape what's visible, not what's grayed out
- One accent, used sparingly: cyan-teal marks action and live state only
- Depth through four tonal steps: bg → panel → card → elevated

## 2. Colors: The Live Desk Palette

A Restrained palette anchored in near-black, with one cyan-teal signal color and four tonal steps for depth. Album art provides all supplementary color.

### Primary
- **Cyan-Teal Signal** (`oklch(0.66 0.180 195)`): The sole brand color. Used on: primary action buttons, progress bar fill, seek bar thumb, active queue item highlight, live status indicator, focus rings. White text on all filled uses. Present on ≤10% of any screen.

### Neutral
- **Near-Black Body** (`oklch(0.08 0.000 0)`): Application background. Pure architectural darkness, zero hue tint. Album art luminance depends on this being genuinely near-black.
- **Panel Surface** (`oklch(0.13 0.000 0)`): Sidebar, toolbar backgrounds, secondary panels.
- **Card Surface** (`oklch(0.18 0.000 0)`): Now Playing container, queue item backgrounds, input fields, active sidebar guild.
- **Elevated Surface** (`oklch(0.24 0.000 0)`): Hover states, dropdown backgrounds, modal surfaces.
- **Primary Ink** (`oklch(0.95 0.000 0)`): Track titles, primary labels, active text. ≥7:1 contrast vs bg.
- **Muted Ink** (`oklch(0.72 0.000 0)`): Queue position numbers, timestamps, metadata, placeholder text. ≥4.5:1 contrast vs bg. (Updated from 0.58 — WCAG AA compliance on card surface)
- **Subtle Border** (`oklch(0.22 0.000 0)`): Zone separators. Used only to separate content areas, never to decorate.

**The One Accent Rule.** Cyan-teal appears on ≤10% of any screen. It signals: interactive and live. On a resting, non-interactive element, it is forbidden. Its absence communicates "not primary action, not live state."

**The Album Art Rule.** Never place colored backgrounds, tinted surfaces, borders, or glows near album art. The art carries its own color. The system makes space — near-black behind it, nothing competing.

**The Tonal Step Rule.** The full depth range is exactly four steps: bg (0.08), panel (0.13), card (0.18), elevated (0.24). Each step is ~5–6 L points at chroma 0. Adding a fifth step collapses the range's legibility on a dark palette.

## 3. Typography

**Body Font:** Inter (system-ui, sans-serif as fallback)

**Character:** One geometric sans family carries the entire interface — headings, controls, labels, metadata, data. Four weights (400/500/600/700) create all hierarchy. No display font in a dashboard. A decorative typeface in buttons or labels looks wrong and breaks the "control surface that disappears" principle.

**Scale:** Fixed rem, ratio 1.125 between steps. No fluid clamp — users view at consistent DPI, and a fluid heading that collapses in a sidebar reads as broken.

### Hierarchy
- **Title** (600, 22px / 1.375rem, lh 1.3, ls −0.01em): Track title in Now Playing, section headings, dialog titles
- **Body** (400, 14px / 0.875rem, lh 1.5, max 65ch): Queue item titles, search results, descriptions
- **Label** (500, 13px / 0.8125rem, lh 1.2, ls 0.005em): Button text, badge labels, status chips, column headers, source badges
- **Caption** (400, 11px / 0.6875rem, lh 1.4): Timestamps, duration, uptime, queue position numbers, secondary metadata

**The No-Display-Font Rule.** No decorative typefaces anywhere in the dashboard. Inter at 4 weights is the full vocabulary. Personality comes from weight contrast, spacing, and color — not from a headline face.

## 4. Elevation

Tonal layering only. Depth is communicated by surface lightness stepping from bg → panel → card → elevated. Four discrete steps, no more.

Shadows serve state responses only: a focused control gains a teal glow (`0 0 0 2px oklch(0.66 0.180 195 / 0.5)`), a modal lifts with a directional shadow, a tooltip reads clearly above content. No shadows on resting, non-interactive surfaces.

### Shadow Vocabulary
- **Focus ring**: `0 0 0 2px oklch(0.66 0.180 195 / 0.5)` — keyboard focus on any interactive element
- **Modal lift**: `0 24px 48px oklch(0 0 0 / 0.6)` — dialog/modal above backdrop
- **Tooltip**: `0 4px 12px oklch(0 0 0 / 0.4)` — tooltip above content

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows and glows emerge only as responses to state: focus, hover (glow, not shadow), or elevated layer. A shadow on a resting card is decoration — forbidden.

## 5. Components

### Playback Controls (Now Playing)
- **Layout:** Centered row — previous, play/pause (primary), skip, with volume and loop/shuffle flanking
- **Play/Pause:** Circular, `oklch(0.66 0.180 195)` fill, white icon, 48px diameter, `rounded-full`. Hover: L +0.06. Focus: teal ring.
- **Skip/Previous:** Ghost icon buttons, 36px, muted ink at rest, primary ink on hover. `rounded-md`.
- **Progress bar:** Full-width, 3px track at `oklch(0.22 0.000 0)`, fill in accent. Thumb: 12px circle, accent. Hover reveals thumb. Drag supported.
- **Volume:** Compact slider (80px), same pattern as progress bar.

### Queue Items
- **Default:** Transparent bg, track number (caption/muted), thumbnail (32px rounded-sm), title (body), duration (caption/muted). Hover: card surface bg.
- **Active (now playing):** `oklch(0.66 0.180 195 / 0.12)` bg tint, title in accent color, small animated bars icon instead of track number.
- **Drag handle:** Appears on hover, left edge, muted. Drag to reorder.
- **Actions:** Trash icon appears on row hover, right edge.

### Search Bar (inside Queue zone)
- **Style:** Full-width input, card surface bg, subtle border, rounded-md, label size text.
- **Focus:** Border shifts to accent, teal focus ring.
- **Results:** Overlay dropdown below input, elevated surface bg, max-height scrollable. Each result: thumbnail + title + artist + source badge + duration. Click: add to queue. Hold/secondary: view album/artist.

### Sidebar Guild List
- **Guild items:** 40px avatar (rounded-md), guild name truncated, arranged vertically with 4px gaps.
- **Active guild:** card surface bg, primary ink name.
- **Offline bot indicator:** Small red dot on avatar corner.
- **Bot status footer:** Pinned to sidebar bottom — green/red dot, "Online" / "Offline", uptime caption.

### Source Badges
- **Style:** Pill shape (rounded-full), label size, 11px. Colored bg at 15% opacity with matching text — YouTube: red, Spotify: green, SoundCloud: orange.
- **Placement:** Trailing inline in queue items and search results.

### Navigation (Sidebar)
- **Width:** 240px fixed, panel surface bg, right border at subtle border color.
- **Logo/brand:** Top of sidebar, 48px height zone.
- **Guild list:** Scrollable middle zone.
- **Footer:** Bot status + Settings icon + Admin link (if admin) + Dev Control link (if developer). Fixed at sidebar bottom.

## 6. Do's and Don'ts

### Do:
- **Do** let album art dominate the Now Playing zone — size it generously (min 200px), give it zero visual competition from colored surfaces or borders
- **Do** use `oklch(0.66 0.180 195)` for primary actions, active queue items, progress fill, live indicators, and focus rings — nowhere else
- **Do** use the four tonal steps (bg → panel → card → elevated) as the sole depth mechanism at rest
- **Do** animate track changes with a crossfade on the album art zone; animate queue reorders with per-item stagger (150ms stagger, 200ms duration); use `@media (prefers-reduced-motion: reduce)` fallbacks on both
- **Do** keep playback controls always visible — never inside a scroll container, never hidden behind interaction
- **Do** show/hide UI zones by permission level rather than rendering disabled states for unpermissioned actions
- **Do** use `position: fixed` or the Popover API for dropdowns (voice channel picker, search results) — never `position: absolute` inside an `overflow: hidden` container

### Don't:
- **Don't** use `backdrop-filter: blur` as a default surface treatment — v5.0.2's core anti-pattern, explicitly rejected. One purposeful blur maximum per screen, never stacked.
- **Don't** use gradient fills on text (`background-clip: text` with a gradient background) — accent is a single solid `oklch(0.66 0.180 195)`
- **Don't** use `border-left` wider than 1px as a colored accent stripe on queue items, cards, or callouts
- **Don't** put the accent on decorative, inactive, or non-interactive elements — rarity is what makes it signal
- **Don't** use legacy bot dashboard patterns (Hydra/MEE6): busy icon rows, neon-tinted borders, identical card grids
- **Don't** add page-load entrance sequences — the dashboard loads into a live task, not an editorial experience
- **Don't** use display or decorative fonts anywhere — Inter at 4 weights is the complete type vocabulary
- **Don't** add a fifth tonal step between the four defined ones — it collapses depth legibility on a dark palette
