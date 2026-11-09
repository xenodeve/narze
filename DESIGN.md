<!-- lang:en -->
# Design System — Narze v7

Narze v7 speaks the **Strata-xeno** design language (source: `D:\Github\Strata-xeno-System-Design`, condensed in `docs/research/strata-xeno-brief.md`). This file is the *how*; `PRODUCT.md` is the *why*. Where v6's "Live Desk" system (cyan accent, no mono) disagrees with Strata-xeno, **Strata-xeno wins** — developer decision, 2026-11-08.

## 1. North star

**"A quiet instrument that comes alive."** The dashboard is a Swiss-editorial control surface: ink on paper, hairlines instead of boxes, one blue signal. Life comes from two places only — the music itself (artwork, live progress, the Aurora mood glow) and the **bot avatar**, a small plush character that reacts to what the player is doing. Everything else stays still until the user or the player changes something.

## 2. Rules

1. **One ink, many opacities.** Five base colours flip with the theme (`--bg --surface --ink --accent --ok`, plus Narze's `--warn --danger`). Secondary text, tertiary text, hairlines and fills are ink mixed at 66 / 42 / 12 / 6 %.
2. **Accent is a signal.** Blue marks focus, links, slider/progress fill, an active switch, and live state. Primary buttons are **ink-filled**, not blue. Accent never fills a section.
3. **Pills and hairlines.** Controls are 999px pills with a 1px `--line` border. Selected = ink fill with `--bg` text. Lists are hairline-ruled rows, not cards. Cards have no shadow; only floating layers (menu, dialog, framed window) cast one, and it sits *below* the object.
4. **Swiss type.** Inter Variable 600 with negative tracking for headings; JetBrains Mono 0.75rem for labels, timestamps, ids and counts; Anuphan for Thai with zero tracking and taller leading. Every figure is `.num` (tabular, no wrap).
5. **One motion language.** `--ease` = `cubic-bezier(0.23, 1, 0.32, 1)`; durations 160 / 320 / 600 ms; stagger 38 ms; height glide 420 ms on `--ease-soft`. Our own code uses bezier curves only; overshoot uses `--ease-digit`. The vendored interaction components (`components/vendor/*`) keep their tuned springs.
6. **Content first.** Hidden start states exist only under `html.js`; reduced motion shows final states; the dashboard reads correctly with WebGL off and with the API down (it says so, plainly).
7. **Music is the hero; the avatar is the guide.** Artwork gets the biggest box on the page and nothing tinted next to it. The avatar appears where a person would otherwise face an empty, waiting, or failed screen.
8. **Permission shapes the interface.** Controls a user cannot use are not rendered greyed out; the space says why and what would grant control ("Join #Lounge to control playback").
9. **Every number carries its conditions.** Stats say the window ("last 7 days"), charts start at zero and state which direction is better.
10. **Never forbidden-by-default:** scroll hijacking, autoplaying sound, page-load entrance choreography on app routes, glass on anything but sticky chrome, gradient text, accent stripes wider than 1px.

## 3. Tokens

The full `:root` block is in the appendix and lives in code at `apps/dashboard/src/styles/tokens.css`. Summary:

| Group | Values |
|---|---|
| Light | bg `#f5f5f7` · surface `#ffffff` · ink `#131316` · accent `#0a62d6` · ok `#1a8a4a` · warn `#b26a00` · danger `#c4302b` |
| Dark | bg `#0b0b0d` · surface `#151518` · ink `#f1f1f3` · accent `#5aa2ff` · ok `#4cc380` · warn `#f0a640` · danger `#ff6b62` |
| Radius | r0 5 (20px icons) · r1 8 · r2 12 · r3 16 · window 20 · stage 28 · pill 999 |
| Motion | t1 160 · t2 320 · t3 600 · glide 420 · stagger 38 (ms) |
| Layout | gutter `clamp(16px,3vw,32px)` · nav 60px · sidebar 240px · max 1320px |
| Breakpoints | 520 · 700 · 900 · 1020 |

`--warn` and `--danger` are Narze additions; their text contrast must be measured ≥ 4.5:1 before use as text.

**Styling technology:** plain CSS — global `tokens.css` + CSS Modules per component. No Tailwind (Strata-xeno ships none, and every vendored component is plain CSS).

**Islands:** derived tokens (`--ink-2 --ink-3 --line --fill`) are computed on `:root` and do not re-derive when a descendant redefines `--ink`. Any always-dark surface must re-declare them as literals (see `.deep` in `tokens.css`).

Theme: system / light / dark, stored under `narze.theme`, applied by a pre-paint script. **`--mood`** is a registered `<color>` property set from the current track's artwork; it is used only inside the Aurora glow and the avatar's `color`, transitioned over 800 ms.

## 4. Layout

- **App shell:** 60px sticky glass top bar (guild switcher, voice-command pill, bot status, theme, account) + 240px sticky sidebar (`BranchedMenu`) + content. At ≤ 900px the sidebar becomes a sticky `<details>` accordion; at ≤ 700px the **mini player** docks to the bottom edge.
- **Guild player page:** two columns `minmax(0,7fr) minmax(0,5fr)` — left: Now Playing stage (radius 28, artwork ≥ 240px, Aurora behind); right: Queue / Search / History tabs. Playback controls never sit inside a scroll container.
- Grids always use `minmax(0, …)` tracks; children get `min-width: 0`. Overflow next to sticky elements is `clip`, never `hidden`.

## 5. Component map

House components (built here, Strata-styled):

| Component | Treatment |
|---|---|
| `Button` | pill, 44px (ghost 40, large 56, icon 36 circle); primary = ink fill; press `translateY(1px)` |
| `Pill` | one implementation for tabs, chips, segmented, filters; sizes sm/md; selected via `aria-selected`/`aria-pressed` → ink fill |
| `Field` | 48px pill input, surface bg, hover `--ink-3` border |
| `Slider` | native range, 4px track, accent fill via `--p`, 24px knob (seek, volume) |
| `Row` | hairline-ruled list row; queue, history, search results; enter = `row` (360 ms, −6px) |
| `Badge` | mono 0.6875rem pill; status tint via 55 % border / 80 % text; closed set: `live idle offline ok warn danger` |
| `Card` | r3, surface, 1px line, no shadow |
| `Dialog` / `Sheet` | `<dialog>`; enter 200 ms y 8→0, scale .98→1; veil black 45 %; sheet from right 300 ms, `min(92vw, 380px)` |
| `Toast` | 240 ms y 8, scale .98; surface, r2, menu shadow, `aria-live="polite"` |
| `Chart` | HTML/CSS bars, zero-based, written values, hidden `<table>` |

Supplied components — `bot-avatars` and `thinking-orbs` are npm packages; the rest are vendored into `apps/dashboard/src/components/vendor/`. All are kept as supplied and re-tokenised to Strata colours through their CSS variables:

| Component | Where it lives in Narze |
|---|---|
| `BotAvatar` (`bot-avatars`) | Bot identity everywhere: sidebar status, now-playing corner, empty/error/offline screens, login, admin node roster. State map: playing → `working`; paused/idle/24-7 hold → `default`; offline/disconnected → `sleeping`. Each guild can dress its avatar (type, hat, glasses, headphones, bow tie, accessory colour) in Guild Settings. |
| `ThinkingOrb` (`thinking-orbs`) | Replaces every spinner for an in-flight AI-ish/remote step: `searching` (search), `connecting` (joining voice / resolving a URL), `weaving` (importing a playlist), `listening` (voice command capture), `composing` (building autoplay suggestions). 20px inline, 64px in sheets. |
| `LatticeLoader` | Timed operations with an outcome: playlist import, queue restore, reconnect — shows elapsed time then done/error mark. |
| `BranchedMenu` | Sidebar navigation (Player · Library · History · Settings · Admin sections). |
| `BellToggle` | "Notify me" for now-playing announcements per guild (browser notifications). |
| `PulseHeart` | Like a track (feeds the Liked playlist); count shows server-wide likes. |
| `SquishSwitch` | Guild setting toggles (24/7, autoplay, announce), sized 38×22 to match Strata. |
| `SwipeRow` | Queue rows on touch: swipe left → Remove (commit) / Play next. Keyboard path stays (row menu). |
| `VoicePill` | Voice commands in the top bar ("เล่นเพลง …", "ข้าม", "หยุด", "เสียง 40"). |
| `SloshGauge` | Expanded-player volume (interactive) and admin CPU / memory meters (read-only). |
| `Aurora` | The one ambient canvas on the player page, coloured from `--mood`. |
| `Strands` | Inside the voice-command sheet while listening (Aurora pauses). |
| `CursorGrid` | Login / landing background only. |
| `HalftoneReveal` | Artist and album headers (hover to reveal the photo). |

## 6. Effects budget

- **At most one continuously animating canvas per view.** Opening the voice sheet pauses Aurora; leaving the viewport pauses everything (all vendored canvases already observe visibility).
- Canvases mount client-only via `next/dynamic({ ssr: false })`. **WebGL** canvases (Aurora, Strands, CursorGrid, HalftoneReveal) also wait for a WebGL2 probe, and `?fx=0`, `prefers-reduced-motion`, `deviceMemory ≤ 2` and Save-Data render the static fallback (a flat `--mood` wash). `BotAvatar` and `ThinkingOrb` draw on a 2D canvas, need no probe, and honour reduced motion themselves.
- DPR capped at 2 for orbs/avatars and 1.5 for full-bleed canvases.
- BotAvatar instances: at most 6 animating at once; roster views pass `seed` so blinks never sync, and off-screen ones pause themselves.

## 7. Motion recipes

| Moment | Recipe |
|---|---|
| Route change | `page`: 260 ms, blur 6px → 0, scale .985 → 1 |
| Track title changes | `swap`: 280 ms, blur sharpen |
| Artwork changes | crossfade 420 ms |
| Track added to queue | `row`: 360 ms from −6px |
| Queue reorder | layout move 320 ms `--ease` |
| Counter changes (queue length, listeners) | digits pop 320 ms on `--ease-digit`, 38 ms apart |
| Collapse / expand | `grid-template-rows 0fr → 1fr`, 420 ms `--ease-soft` |
| Status indicator swap | `orb`: 450 ms, blur 3px, scale .82 → 1 |

## 8. Craft checklist (per PR touching UI)

- [ ] `:focus-visible` ring 2px accent, offset 3px; range inputs ring the thumb.
- [ ] Hit targets ≥ 44px (negative-inset `::after` on small controls).
- [ ] `.num` on every duration, count, percentage; mono for metadata.
- [ ] Hover effects guarded by `@media (hover: hover)`.
- [ ] Late-loading boxes (artwork, avatars) reserve size — CLS 0.
- [ ] 390 / 1024 / 1440px × light / dark × th / en: no horizontal overflow.
- [ ] Reduced motion and WebGL-off both render a complete page.
- [ ] Thai copy reviewed with the `kien-thai` rules; English copy plain.

## 9. Performance targets (Narze additions — measure, don't claim)

LCP < 2.5 s · INP < 200 ms · CLS < 0.05 · player route initial JS < 180 KB gz · 60 fps on transitions. Vendored WebGL components load lazily and never on the critical path.
<!-- lang:end -->

<!-- lang:th -->
# Design System — Narze v7

Narze v7 ใช้ภาษาดีไซน์แบบ **Strata-xeno** (ต้นทางอยู่ที่ `D:\Github\Strata-xeno-System-Design` สรุปไว้ใน `docs/research/strata-xeno-brief.md`) ไฟล์นี้ตอบว่า *ทำยังไง* ส่วน `PRODUCT.md` ตอบว่า *ทำไปทำไม* ตรงไหนที่ระบบ "Live Desk" ของ v6 (สีเน้น cyan, ไม่ใช้ mono) ขัดกับ Strata-xeno ให้ **ยึด Strata-xeno** ตามที่ developer ตัดสินใจเมื่อ 2026-11-08

## 1. ทิศหลัก

**"เครื่องดนตรีเงียบ ๆ ที่มีชีวิตขึ้นมาเมื่อเล่น"** dashboard คือแผงควบคุมแนว Swiss-editorial หมึกบนกระดาษ ใช้เส้นบางแทนกล่อง มีสีน้ำเงินเป็นสัญญาณอยู่สีเดียว ความมีชีวิตมาจากสองที่เท่านั้น คือตัวเพลงเอง (ปกอัลบั้ม, progress ที่วิ่งจริง, แสง Aurora ตามอารมณ์เพลง) กับ **bot avatar** ตัวละครขนนุ่มตัวเล็กที่ตอบสนองตามสิ่งที่ player กำลังทำ ที่เหลือทั้งหมดอยู่นิ่ง จนกว่าผู้ใช้หรือ player จะเปลี่ยนอะไรบางอย่าง

## 2. กติกา

1. **หมึกเดียว หลายความเข้ม** สีฐานห้าสีสลับตามธีม (`--bg --surface --ink --accent --ok` บวก `--warn --danger` ที่ Narze เพิ่ม) ส่วนตัวอักษรรอง, ตัวอักษรระดับสาม, เส้นบาง และพื้นจาง ได้จากการผสมหมึกที่ 66 / 42 / 12 / 6 %
2. **สีเน้นคือสัญญาณ** น้ำเงินใช้กับ focus, ลิงก์, แถบเติมของ slider/progress, switch ที่เปิดอยู่ และสถานะ live ปุ่มหลัก **เติมสีหมึก** ไม่ใช่น้ำเงิน และห้ามใช้สีเน้นเป็นพื้นทั้ง section
3. **pill กับเส้นบาง** ตัวควบคุมเป็น pill รัศมี 999px ขอบ 1px สี `--line` สถานะที่ถูกเลือกคือเติมหมึกแล้วตัวอักษรเป็นสี `--bg` รายการใช้แถวคั่นเส้นบาง ไม่ใช่การ์ด การ์ดไม่มีเงา มีแต่ชั้นที่ลอยอยู่ (เมนู, dialog, หน้าต่างแอป) ที่มีเงา และเงาอยู่ *ใต้* วัตถุ
4. **ตัวอักษรแบบ Swiss** หัวเรื่องใช้ Inter Variable น้ำหนัก 600 ระยะตัวอักษรติดลบ ใช้ JetBrains Mono 0.75rem กับ label, เวลา, id และตัวนับ ภาษาไทยใช้ Anuphan ระยะตัวอักษรเป็นศูนย์และบรรทัดสูงขึ้น ตัวเลขทุกตัวใส่ `.num` (ความกว้างเท่ากัน, ไม่ตัดบรรทัด)
5. **ภาษาการเคลื่อนไหวเดียว** `--ease` = `cubic-bezier(0.23, 1, 0.32, 1)` ระยะเวลา 160 / 320 / 600 ms ห่างกันทีละ 38 ms การยืดความสูงใช้ 420 ms บน `--ease-soft` โค้ดที่เราเขียนเองใช้ bezier อย่างเดียว ถ้าอยากให้เด้งเกินใช้ `--ease-digit` ส่วน component ที่รับมา (`components/vendor/*`) คงค่า spring เดิมที่จูนไว้แล้ว
6. **เนื้อหามาก่อน** สถานะซ่อนก่อนเข้าฉากมีได้เฉพาะใต้ `html.js` ถ้าเปิดลดการเคลื่อนไหวก็แสดงสถานะสุดท้ายเลย ปิด WebGL หรือ API ล่ม dashboard ก็ยังอ่านได้ถูกต้อง และบอกตรง ๆ ว่าเกิดอะไรขึ้น
7. **เพลงคือพระเอก avatar คือคนนำทาง** ปกอัลบั้มได้กล่องใหญ่ที่สุดในหน้า และห้ามมีอะไรติดสีวางข้าง ๆ avatar โผล่ในจุดที่ปกติผู้ใช้จะเจอหน้าจอว่าง, หน้ารอ หรือหน้าที่พัง
8. **สิทธิ์เป็นตัวกำหนดหน้าตา** ปุ่มที่ผู้ใช้กดไม่ได้จะไม่ถูกแสดงเป็นสีเทา ตรงนั้นจะบอกแทนว่าทำไม และต้องทำอะไรถึงจะได้สิทธิ์ ("เข้าห้อง #Lounge เพื่อควบคุมเพลง")
9. **ตัวเลขทุกตัวต้องบอกเงื่อนไข** สถิติบอกช่วงเวลา ("7 วันล่าสุด") กราฟเริ่มที่ศูนย์ และบอกว่าทิศไหนดีกว่า
10. **ห้ามเด็ดขาด** ยึดการ scroll, เสียงที่เล่นเอง, ท่าเปิดตัวตอนโหลดหน้าในหน้าแอป, glass บนอะไรก็ตามที่ไม่ใช่แถบ sticky, ตัวอักษรไล่สี และแถบสีเน้นที่กว้างเกิน 1px

## 3. Token

บล็อก `:root` เต็มอยู่ในภาคผนวก และอยู่ในโค้ดที่ `apps/dashboard/src/styles/tokens.css` สรุป:

| กลุ่ม | ค่า |
|---|---|
| สว่าง | bg `#f5f5f7` · surface `#ffffff` · ink `#131316` · accent `#0a62d6` · ok `#1a8a4a` · warn `#b26a00` · danger `#c4302b` |
| มืด | bg `#0b0b0d` · surface `#151518` · ink `#f1f1f3` · accent `#5aa2ff` · ok `#4cc380` · warn `#f0a640` · danger `#ff6b62` |
| รัศมี | r0 5 (ไอคอน 20px) · r1 8 · r2 12 · r3 16 · window 20 · stage 28 · pill 999 |
| การเคลื่อนไหว | t1 160 · t2 320 · t3 600 · glide 420 · stagger 38 (ms) |
| เลย์เอาต์ | gutter `clamp(16px,3vw,32px)` · nav 60px · sidebar 240px · max 1320px |
| จุดเปลี่ยนจอ | 520 · 700 · 900 · 1020 |

`--warn` กับ `--danger` เป็นของที่ Narze เพิ่มเอง ก่อนเอาไปใช้เป็นสีตัวอักษรต้องวัด contrast ให้ได้ ≥ 4.5:1 ก่อน

**เทคโนโลยีที่ใช้จัดสไตล์:** CSS ธรรมดา มี `tokens.css` กลางหนึ่งไฟล์ และ CSS Modules แยกตาม component ไม่ใช้ Tailwind (Strata-xeno ไม่มี และ component ที่รับมาทุกตัวก็เป็น CSS ธรรมดา)

**เกาะสีมืด:** token ที่คำนวณจากหมึก (`--ink-2 --ink-3 --line --fill`) ถูกคำนวณที่ `:root` ครั้งเดียว ลูกที่ประกาศ `--ink` ใหม่จะไม่ได้ค่าใหม่ตาม พื้นผิวไหนที่มืดตลอดต้องประกาศค่าพวกนี้ใหม่เป็นค่าตายตัว (ดู `.deep` ใน `tokens.css`)

ธีมมีสามแบบ คือตามระบบ / สว่าง / มืด เก็บไว้ใต้คีย์ `narze.theme` แล้วมีสคริปต์รันก่อนวาดหน้าจอเป็นตัวตั้งค่า **`--mood`** เป็น property ชนิด `<color>` ที่ลงทะเบียนไว้ ค่ามาจากปกอัลบั้มของเพลงที่เล่นอยู่ ใช้ได้แค่ในแสง Aurora กับ `color` ของ avatar และเปลี่ยนค่าแบบค่อย ๆ ไล่ใน 800 ms

## 4. เลย์เอาต์

- **โครงแอป:** แถบบนแบบ glass สูง 60px ติดขอบบน (ตัวสลับ guild, pill สั่งงานด้วยเสียง, สถานะบอท, ธีม, บัญชี) + sidebar กว้าง 240px ติดขอบ (`BranchedMenu`) + พื้นที่เนื้อหา พอจอ ≤ 900px sidebar จะกลายเป็น `<details>` แบบพับได้ที่ติดขอบ และพอจอ ≤ 700px **mini player** จะไปเกาะขอบล่าง
- **หน้า player ของ guild:** สองคอลัมน์ `minmax(0,7fr) minmax(0,5fr)` ฝั่งซ้ายเป็นเวที Now Playing (รัศมี 28, ปก ≥ 240px, มี Aurora อยู่ข้างหลัง) ฝั่งขวาเป็นแท็บ Queue / Search / History ปุ่มควบคุมการเล่นห้ามอยู่ในกล่องที่ scroll ได้
- grid ใช้ track แบบ `minmax(0, …)` ทุกครั้ง และลูกของ grid ใส่ `min-width: 0` overflow ที่อยู่ติดกับของ sticky ใช้ `clip` ห้ามใช้ `hidden`

## 5. แผนที่ component

component ที่เราสร้างเอง (สไตล์ Strata):

| Component | รูปแบบ |
|---|---|
| `Button` | pill สูง 44px (ghost 40, ใหญ่ 56, ไอคอนวงกลม 36) ปุ่มหลักเติมหมึก กดแล้ว `translateY(1px)` |
| `Pill` | ตัวเดียวใช้ทั้งแท็บ, chip, segmented, ตัวกรอง มีขนาด sm/md สถานะเลือกดูจาก `aria-selected`/`aria-pressed` แล้วเติมหมึก |
| `Field` | ช่องกรอกแบบ pill สูง 48px พื้น surface ชี้แล้วขอบเป็น `--ink-3` |
| `Slider` | range ของเบราว์เซอร์ ราง 4px แถบเติมสีเน้นผ่าน `--p` ปุ่มจับ 24px (เลื่อนเวลา, เสียง) |
| `Row` | แถวคั่นเส้นบาง ใช้กับคิว, ประวัติ, ผลค้นหา เข้าฉากแบบ `row` (360 ms, จาก −6px) |
| `Badge` | pill ตัว mono 0.6875rem สีสถานะได้จากขอบ 55 % / ตัวอักษร 80 % ชุดสถานะปิดตายไว้ที่ `live idle offline ok warn danger` |
| `Card` | r3, พื้น surface, เส้น 1px, ไม่มีเงา |
| `Dialog` / `Sheet` | ใช้ `<dialog>` เข้าฉาก 200 ms y 8→0, scale .98→1 ม่านดำ 45 % sheet เลื่อนจากขวา 300 ms กว้าง `min(92vw, 380px)` |
| `Toast` | 240 ms y 8, scale .98 พื้น surface, r2, เงาแบบเมนู, `aria-live="polite"` |
| `Chart` | แท่ง HTML/CSS เริ่มที่ศูนย์ เขียนค่ากำกับ มี `<table>` ซ่อนไว้ให้ screen reader |

component ที่รับมา (`bot-avatars` กับ `thinking-orbs` เป็นแพ็กเกจ npm ส่วนที่เหลือคัดลอกมาไว้ใน `apps/dashboard/src/components/vendor/` ทุกตัวคงไว้ตามที่ได้มา แต่ map สีเข้า token ของ Strata ผ่านตัวแปร CSS ของมันเอง):

| Component | ใช้ตรงไหนใน Narze |
|---|---|
| `BotAvatar` (`bot-avatars`) | ตัวตนของบอททุกที่ ทั้งสถานะใน sidebar, มุมของ Now Playing, หน้าว่าง/หน้าพัง/หน้าออฟไลน์, หน้า login และรายชื่อ node ในหน้า admin สถานะ: กำลังเล่น → `working`; หยุด/ว่าง/ค้างห้องแบบ 24/7 → `default`; ออฟไลน์/หลุด → `sleeping` แต่ละ guild แต่งตัว avatar ได้เอง (รูปทรง, หมวก, แว่น, หูฟัง, โบว์, สีเครื่องประดับ) ในหน้า Guild Settings |
| `ThinkingOrb` (`thinking-orbs`) | ใช้แทน spinner ทุกตัวตอนรอขั้นตอนที่ไปคุยกับข้างนอก `searching` (ค้นหา), `connecting` (เข้าห้องเสียง / แปลง URL), `weaving` (นำเข้า playlist), `listening` (กำลังฟังคำสั่งเสียง), `composing` (สร้างเพลงแนะนำ autoplay) ขนาด 20px ในบรรทัด และ 64px ใน sheet |
| `LatticeLoader` | งานที่จับเวลาและมีผลลัพธ์ เช่น นำเข้า playlist, กู้คิว, ต่อใหม่ แสดงเวลาที่ผ่านไปแล้วจบด้วยเครื่องหมายสำเร็จหรือพลาด |
| `BranchedMenu` | เมนูใน sidebar (Player · Library · History · Settings · หมวด Admin) |
| `BellToggle` | ปุ่ม "แจ้งเตือนฉัน" สำหรับประกาศเพลงที่เล่นอยู่ แยกตาม guild (ใช้การแจ้งเตือนของเบราว์เซอร์) |
| `PulseHeart` | กดถูกใจเพลง (ไหลเข้า playlist Liked) ตัวเลขคือยอดถูกใจทั้งเซิร์ฟเวอร์ |
| `SquishSwitch` | สวิตช์ตั้งค่า guild (24/7, autoplay, ประกาศเพลง) ปรับขนาดเป็น 38×22 ให้ตรงกับ Strata |
| `SwipeRow` | แถวคิวบนจอสัมผัส ปัดซ้ายเพื่อลบ / เล่นถัดไป ส่วนทางคีย์บอร์ดยังมีเมนูของแถวให้ใช้ |
| `VoicePill` | สั่งงานด้วยเสียงจากแถบบน ("เล่นเพลง …", "ข้าม", "หยุด", "เสียง 40") |
| `SloshGauge` | ปรับเสียงตอนขยาย player (กดเลื่อนได้) และมาตรวัด CPU / memory ในหน้า admin (ดูอย่างเดียว) |
| `Aurora` | canvas พื้นหลังตัวเดียวของหน้า player สีมาจาก `--mood` |
| `Strands` | อยู่ใน sheet สั่งงานด้วยเสียงตอนกำลังฟัง (Aurora หยุดก่อน) |
| `CursorGrid` | พื้นหลังหน้า login / หน้าแรกเท่านั้น |
| `HalftoneReveal` | ส่วนหัวหน้าศิลปินและอัลบั้ม (ชี้เมาส์เพื่อเผยรูปจริง) |

## 6. งบเอฟเฟกต์

- **หนึ่งหน้าจอมี canvas ที่ขยับต่อเนื่องได้ไม่เกินหนึ่งตัว** เปิด sheet เสียงแล้ว Aurora หยุด เลื่อนพ้นจอแล้วทุกตัวหยุด (component ที่รับมาทุกตัวคอยดูการมองเห็นของตัวเองอยู่แล้ว)
- canvas โหลดฝั่ง client เท่านั้นผ่าน `next/dynamic({ ssr: false })` canvas ที่เป็น **WebGL** (Aurora, Strands, CursorGrid, HalftoneReveal) ต้องรอตรวจว่ามี WebGL2 ก่อนด้วย และถ้าเจอ `?fx=0`, `prefers-reduced-motion`, `deviceMemory ≤ 2` หรือ Save-Data จะแสดงภาพนิ่งแทน (พื้นสี `--mood` เรียบ ๆ) ส่วน `BotAvatar` กับ `ThinkingOrb` วาดบน canvas 2D ไม่ต้องตรวจ WebGL และรองรับการลดการเคลื่อนไหวในตัวเอง
- จำกัด DPR ไว้ที่ 2 สำหรับ orb/avatar และ 1.5 สำหรับ canvas เต็มจอ
- BotAvatar ขยับพร้อมกันได้ไม่เกิน 6 ตัว หน้ารายชื่อส่ง `seed` ให้กะพริบตาไม่พร้อมกัน ตัวที่พ้นจอหยุดเอง

## 7. สูตรการเคลื่อนไหว

| จังหวะ | สูตร |
|---|---|
| เปลี่ยนหน้า | `page`: 260 ms, เบลอ 6px → 0, scale .985 → 1 |
| ชื่อเพลงเปลี่ยน | `swap`: 280 ms, เบลอแล้วคมขึ้น |
| ปกเปลี่ยน | crossfade 420 ms |
| เพิ่มเพลงเข้าคิว | `row`: 360 ms จาก −6px |
| สลับลำดับคิว | ย้ายตำแหน่ง 320 ms `--ease` |
| ตัวนับเปลี่ยน (ความยาวคิว, คนฟัง) | ตัวเลขเด้ง 320 ms บน `--ease-digit` ห่างกันหลักละ 38 ms |
| พับ / กาง | `grid-template-rows 0fr → 1fr`, 420 ms `--ease-soft` |
| สลับไฟสถานะ | `orb`: 450 ms, เบลอ 3px, scale .82 → 1 |

## 8. Checklist ความประณีต (ทุก PR ที่แตะ UI)

- [ ] วง `:focus-visible` สีเน้น 2px เว้นระยะ 3px ช่อง range ให้วงอยู่ที่ปุ่มจับ
- [ ] พื้นที่กด ≥ 44px (ตัวควบคุมเล็กใช้ `::after` ขยายออกด้วยค่าติดลบ)
- [ ] ใส่ `.num` ทุกระยะเวลา, ตัวนับ, เปอร์เซ็นต์ และใช้ mono กับ metadata
- [ ] เอฟเฟกต์ตอนชี้เมาส์ครอบด้วย `@media (hover: hover)`
- [ ] กล่องที่โหลดทีหลัง (ปก, avatar) จองขนาดไว้ก่อน ให้ CLS เป็น 0
- [ ] 390 / 1024 / 1440px × สว่าง / มืด × th / en ต้องไม่มี scroll แนวนอน
- [ ] ลดการเคลื่อนไหว และปิด WebGL ต้องได้หน้าที่ครบทั้งคู่
- [ ] ข้อความภาษาไทยตรวจตามกฎ `kien-thai` ภาษาอังกฤษให้เรียบง่าย

## 9. เป้า performance (Narze เพิ่มเอง วัดจริง ห้ามเคลมลอย ๆ)

LCP < 2.5 s · INP < 200 ms · CLS < 0.05 · JS เริ่มต้นของหน้า player < 180 KB gz · 60 fps ตอนเปลี่ยนฉาก component WebGL ที่รับมาโหลดทีหลังเสมอ และไม่อยู่บนเส้นทางวาดหน้าแรก
<!-- lang:end -->

## Appendix — token source (shared, identifiers only)

<!-- Deliberately outside the lang markers: this block is code identifiers only, so it is shared by both mirrors rather than duplicated. -->

```css
:root {
  --bg: #f5f5f7; --surface: #ffffff; --ink: #131316; --accent: #0a62d6; --ok: #1a8a4a;
  --warn: #b26a00; --danger: #c4302b;
  --ink-2: color-mix(in srgb, var(--ink) 66%, var(--bg));
  --ink-3: color-mix(in srgb, var(--ink) 42%, var(--bg));
  --line: color-mix(in srgb, var(--ink) 12%, transparent);
  --fill: color-mix(in srgb, var(--ink) 6%, transparent);
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-soft: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-digit: cubic-bezier(0.34, 1.45, 0.64, 1);
  --t1: 160ms; --t2: 320ms; --t3: 600ms; --t-glide: 420ms; --stagger: 38ms;
  --r0: 5px; --r1: 8px; --r2: 12px; --r3: 16px; --r-window: 20px; --r-stage: 28px; --r-pill: 999px;
  --gutter: clamp(16px, 3vw, 32px); --nav-h: 60px; --side-w: 240px; --max: 1320px;
  --shadow-menu: 0 18px 40px -16px rgb(0 0 0 / 0.3);
  --shadow-window: 0 50px 90px -50px rgb(0 0 0 / 0.45);
  --font-sans: "Inter Variable", "Anuphan Variable", -apple-system, "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "Cascadia Mono", Consolas, monospace;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0b0b0d; --surface: #151518; --ink: #f1f1f3; --accent: #5aa2ff; --ok: #4cc380;
    --warn: #f0a640; --danger: #ff6b62;
  }
}
:root[data-theme="dark"] {
  --bg: #0b0b0d; --surface: #151518; --ink: #f1f1f3; --accent: #5aa2ff; --ok: #4cc380;
  --warn: #f0a640; --danger: #ff6b62; color-scheme: dark;
}
@property --mood { syntax: "<color>"; inherits: true; initial-value: #8a8a96; }
```
