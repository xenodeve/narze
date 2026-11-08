# ADR-0010: Charts come from Apple Music's public RSS, never a made-up list

- **Status:** Accepted — 2026-11-08 (implemented in #109)
- **Area:** backend · dashboard
- **Related:** ADR-0006 (Hot Cache). The chart lives in Redis only, with no in-process layer: it changes every 3 days.

<!-- lang:en -->
## Context

v5 showed a Billboard chart from a RapidAPI endpoint whose URL contains `SUSPENDED` (inventory item 72), and its "top charts" section always fell back to four hardcoded tracks (item 117). #109 asks for a chart that is real, cached for 3 days, enriched from Spotify, and honest when its source is down. The provider had to be verified live before anything was built.

## Decision

- **Source:** Apple Music's public RSS, "Top Songs" (`https://rss.marketingtools.apple.com/api/v2/<country>/music/most-played/50/songs.json`). It needs no key. It was verified live on 2026-11-08 at 11:28 UTC, when Thailand answered 200 with a feed updated that minute (the request is recorded on #109).
- **Charts:** Thailand (`th`) and the United States (`us`), labelled as such. Apple has no global chart, so spec #117's "global" becomes the US chart rather than a list that claims to be global.
- **Rank movement:** Apple gives none. The Backend compares each fetch with the previous one for the same chart, matching songs like Play History (`trackKey`). The result is `up` / `down` / `same` / `new`, or none on the first fetch. Billboard's weeks on chart, peak and last week are dropped.
- **Cache:** Redis key `chart:<country>`, refreshed every 3 days (`apps/backend/src/charts/chart-service.ts:17`) by an hourly check and by any read that finds the copy older (`:93`). When Apple fails, the last good copy is served marked `stale`, with its date on the Dashboard, and Apple is not asked again for 15 minutes (`:23`), so a public route cannot make the Backend poll it. With no copy at all, `GET /api/charts/:region` answers 503 and the Dashboard says the chart cannot load. There is no hardcoded fallback.
- **Spotify enrichment** (link, artist picture) covers the 10 songs shown, and only when the Backend has Spotify credentials (`:166`, `enrich`). A Spotify match counts only if it has the same title. A matched song plays by its Spotify link; any other plays as the words `title artist`.
- **Not carried over from v5:** `limit`/`offset`, a public `refresh` (anyone could make the Backend fetch on demand) and `/recommendations` (it only re-sliced the same chart).

## Alternatives considered

- **Spotify's Top 50 playlists.** These are editorial playlists: they need Web API credentials, and Spotify restricted them for new apps. Not verified here, so not chosen.
- **Billboard through RapidAPI** (v5). The endpoint is suspended, it was paid, and it needs a key.
- **A hardcoded list** (v5's fallback). It shows data that is not true.

## Consequences

- The Thai chart reflects Apple Music listeners, not Spotify's. The block says "Apple Music · Top Songs".
- Apple can change or drop the feed; then the block says the chart cannot load, which is the honest outcome.
- Playing a chart song searches `title artist` like any other text play, so the Bot's Track Resolution decides the source.

<!-- lang:th -->
## บริบท

v5 แสดงชาร์ต Billboard จาก endpoint ของ RapidAPI ที่ URL มีคำว่า `SUSPENDED` (inventory ข้อ 72) ส่วน "top charts" ก็ถอยไปแสดงเพลงที่เขียนตายตัว 4 เพลงทุกครั้ง (ข้อ 117) #109 ต้องการชาร์ตที่เป็นข้อมูลจริง เก็บ cache 3 วัน เติมข้อมูลจาก Spotify และบอกตรง ๆ เมื่อแหล่งข้อมูลล่ม ก่อนลงมือสร้างต้องตรวจผู้ให้ข้อมูลแบบสดก่อน

## สิ่งที่ตัดสินใจ

- **แหล่งข้อมูล:** RSS สาธารณะของ Apple Music ชื่อ "Top Songs" (`https://rss.marketingtools.apple.com/api/v2/<country>/music/most-played/50/songs.json`) ไม่ต้องใช้คีย์ ตรวจแบบสดเมื่อ 2026-11-08 เวลา 11:28 UTC ประเทศไทยตอบ 200 และ feed อัปเดตในนาทีนั้นเอง (บันทึกคำขอไว้ใน #109)
- **ชาร์ต:** ไทย (`th`) และสหรัฐฯ (`us`) ติดป้ายตามจริง Apple ไม่มีชาร์ตระดับโลก "global" ในสเปก #117 จึงกลายเป็นชาร์ตสหรัฐฯ แทนที่จะเป็นรายการที่อ้างว่าเป็นของโลก
- **การขยับอันดับ:** Apple ไม่ได้ให้มา Backend จึงเทียบแต่ละรอบที่ดึงกับรอบก่อนของชาร์ตเดียวกัน จับคู่เพลงแบบเดียวกับ Play History (`trackKey`) ผลคือ `up` / `down` / `same` / `new` หรือไม่มีเลยในรอบแรก ส่วนจำนวนสัปดาห์บนชาร์ต อันดับสูงสุด และอันดับสัปดาห์ก่อนแบบ Billboard ตัดออก
- **Cache:** เก็บใน Redis ที่คีย์ `chart:<country>` รีเฟรชทุก 3 วัน (`apps/backend/src/charts/chart-service.ts:17`) ผ่านการตรวจทุกชั่วโมง และตอนอ่านแล้วพบว่า copy เก่ากว่านั้น (`:93`) ถ้า Apple ล่มจะส่ง copy ล่าสุดที่ดีพร้อมป้าย `stale` และ Dashboard แสดงวันที่ของ copy นั้นด้วย จากนั้นจะไม่ถาม Apple อีก 15 นาที (`:23`) route สาธารณะจึงทำให้ Backend ยิงไปถาม Apple รัว ๆ ไม่ได้ ถ้าไม่มี copy เลย `GET /api/charts/:region` จะตอบ 503 และ Dashboard บอกว่าชาร์ตโหลดไม่ได้ ไม่มีรายการสำรองที่เขียนตายตัว
- **เติมข้อมูลจาก Spotify** (ลิงก์, ภาพศิลปิน) ทำกับ 10 เพลงที่แสดง และเฉพาะตอนที่ Backend มี credentials ของ Spotify (`:166`, `enrich`) ผลที่ Spotify หาเจอต้องมีชื่อเพลงตรงกันถึงจะนับ เพลงที่จับคู่ได้จะเล่นจากลิงก์ Spotify ส่วนเพลงอื่นเล่นด้วยคำค้น `title artist`
- **สิ่งที่ไม่ได้ยกมาจาก v5:** `limit`/`offset`, `refresh` แบบสาธารณะ (ใครก็สั่งให้ Backend ไปดึงข้อมูลได้ทุกเมื่อ) และ `/recommendations` (แค่ตัดชาร์ตเดิมมาแสดงใหม่)

## ทางเลือกที่พิจารณาแล้ว

- **Playlist Top 50 ของ Spotify:** เป็น playlist ที่ Spotify คัดเอง ต้องใช้ credentials ของ Web API และ Spotify จำกัดการเข้าถึงสำหรับแอปใหม่ ยังไม่ได้ตรวจในรอบนี้จึงไม่เลือก
- **Billboard ผ่าน RapidAPI** (v5): endpoint ถูกระงับ เป็นบริการเสียเงิน และต้องใช้คีย์
- **รายการที่เขียนตายตัว** (ตัวสำรองของ v5): แสดงข้อมูลที่ไม่จริง

## ผลที่ตามมา

- ชาร์ตไทยสะท้อนผู้ฟังของ Apple Music ไม่ใช่ของ Spotify บล็อกจึงเขียนว่า "Apple Music · Top Songs"
- Apple อาจเปลี่ยนหรือเลิก feed นี้ได้ ถ้าเป็นแบบนั้น บล็อกจะบอกว่าชาร์ตโหลดไม่ได้ ซึ่งเป็นผลที่ตรงไปตรงมา
- การกดเล่นเพลงในชาร์ตจะค้น `title artist` เหมือนการเล่นด้วยข้อความทั่วไป Track Resolution ของ Bot จึงเป็นตัวเลือกแหล่งเพลง
<!-- lang:end -->
