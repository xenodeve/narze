## Model Delegation (Claude + Gemini)

Claude เป็น orchestrator — มองภาพรวม, ตัดสินใจ, แก้ code จริง
Gemini CLI (`scripts/ask-gemini.ps1`) เป็น sub-agent — รับงานหนักที่กิน token

### Delegation rules

| งานประเภทนี้ | ใครทำ |
|---|---|
| Code review (non-security) | Gemini ทำทั้งหมด |
| Design audit / UX critique | Gemini ทำทั้งหมด |
| Refactoring suggestions | Gemini วิเคราะห์, Claude apply |
| Test writing (non-auth) | Gemini draft, Claude verify |
| Performance / a11y analysis | Gemini ทำทั้งหมด |
| Documentation / explanation | Gemini ทำทั้งหมด |
| Auth / OAuth / token changes | Claude ทำ, Gemini review ทีหลัง |
| Security-sensitive code | Claude ทำ, Gemini review ทีหลัง |
| Database migrations | Claude ทำ, Gemini review ทีหลัง |
| Architecture decisions | Claude ทำ, Gemini review ทีหลัง |
| Bug fixes (exact edits) | Claude ทำเอง (ไม่ต้อง delegate) |
| Build errors / config | Claude ทำเอง (ไม่ต้อง delegate) |

### Skill mapping — Claude สั่ง skill ให้ Gemini ทุกครั้ง

| งานประเภทนี้ | Skill ที่ต้องสั่ง | ตัวอย่าง |
|---|---|---|
| Code review | `scrutinize` | `-Skill scrutinize` |
| UI/UX review/audit | `impeccable` | `-Skill impeccable` |
| Debug / diagnose | `debug-mantra` หรือ `diagnose` | `-Skill debug-mantra` |
| Architecture review | `improve-codebase-architecture` | `-Skill improve-codebase-architecture` |
| Post-incident analysis | `post-mortem` | `-Skill post-mortem` |
| QA / test planning | `qa` | `-Skill qa` |
| Explore unfamiliar code | `zoom-out` | `-Skill zoom-out` |
| Stress-test a plan | `grill-with-docs` | `-Skill grill-with-docs` |
| Break into GitHub Issues | `to-issues` | `-Skill to-issues` |
| Write PRD | `to-prd` | `-Skill to-prd` |
| Refactor planning | `request-refactor-plan` | `-Skill request-refactor-plan` |

### วิธีเรียก Gemini จาก Claude

```powershell
# พร้อม skill (วิธีปกติ — ใช้ทุกครั้ง)
pwsh scripts/ask-gemini.ps1 -Skill scrutinize "อ่าน AGENTS.md, DESIGN.md, CONTEXT.md และ codebase ก่อน จากนั้น review..."

# ไม่มี skill (เฉพาะงานที่ไม่มี skill ตรง)
pwsh scripts/ask-gemini.ps1 "Prompt ที่ต้องการ"
```

### หลักการ

- **Claude's opinion is final** — Gemini ไม่เก่งเท่า Claude และมักมั่วบ่อย ความเห็นของ Claude เป็นที่สุดเสมอ
- **Claude ใช้ Gemini เพื่อแบ่งเบา token เท่านั้น** — ไม่ใช่เพราะ Gemini ดีกว่า
- **Claude ตรวจสอบ output จาก Gemini ทุกครั้ง** — อย่า apply งาน Gemini โดยไม่ verify
- **Coding: Claude ทำเองเสมอ** → Gemini review → Claude พิจารณา review แล้วตัดสินใจเองว่ารับหรือไม่
- **ก่อนส่งงานให้ Gemini ทุกครั้ง** — สั่งให้ Gemini อ่าน MD files ทั้งหมดและทำความเข้าใจ codebase ก่อนเริ่มงานเสมอ ด้วย prompt เช่น: `"อ่าน AGENTS.md, DESIGN.md, CONTEXT.md, PRD.md และ codebase ใน nextjs/src/ และ nestjs/src/ ให้ครบก่อน จากนั้นค่อย [งานจริง]"`
- **ถ้า Gemini ช้าหรือ error**: Claude ทำเองได้เสมอ ไม่ต้องรอ

---

## Coding guidelines

Derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

1. **Think Before Coding** — State assumptions explicitly. If uncertain, ask. Surface tradeoffs.
2. **Simplicity First** — Minimum code that solves the problem. No speculative features or abstractions.
3. **Surgical Changes** — Touch only what's needed. Don't refactor adjacent code. Match existing style.
4. **Goal-Driven Execution** — Define verifiable success criteria before starting. Loop until verified.

## Development workflow

เมื่อต้องวางแผนหรือ implement feature ให้ทำตามลำดับนี้:

1. **`/grill-me`** — ถ้าต้องการวางแผน: interview เพื่อ stress-test แนวคิดก่อน
2. **`/grill-with-docs`** — ถ้าต้องการรายละเอียดมากขึ้น: challenge plan กับ domain model และ ADR ที่มีอยู่
3. **`/to-prd`** — สร้าง PRD จากแผนที่ผ่านการ grill แล้ว
4. **`/to-issues`** — แตก PRD เป็น GitHub Issues พร้อม triage labels
5. **`/tdd`** — implement โดยเขียน test ก่อน แล้วทำให้ผ่าน

## Auto-triggered skills

Skills ที่ควร invoke อัตโนมัติตาม context โดยไม่ต้องรอให้ user สั่ง:

| Trigger | Skill | เงื่อนไข |
|---|---|---|
| มี bug / error / stack trace | `/debug-mantra` | เริ่ม debug session ทุกครั้ง |
| debug ซับซ้อน / performance regression | `/diagnose` | reproduce → minimise → hypothesise → fix |
| แก้ bug เสร็จแล้ว | `/post-mortem` | บันทึก root cause + fix + validation |
| เขียนหรือแก้ code เสร็จ | `/simplify` | ก่อน commit — ตรวจ over-engineering |
| แก้ไข UI / frontend | `/impeccable` | ทุกครั้งที่แตะ component หรือ CSS — ดู command reference ด้านล่าง |
| UI ใหม่ต้องการ design brief | `/impeccable shape` | วาง UX ก่อน implement |
| UI พร้อม ship | `/impeccable audit` + `/impeccable harden` | ตรวจ a11y/perf/responsive + edge cases |
| ก่อน merge / ship | `/code-review` + `/scrutinize` | ตรวจ correctness และ outsider perspective |
| แตะ auth, token, payment, secret | `/security-review` | ทุกครั้งที่ code กระทบ security boundary |
| implement เสร็จ | `/verify` | ยืนยันว่า feature ทำงานจริงใน app |
| explore code ที่ไม่คุ้นเคย | `/zoom-out` | ขอ high-level context ก่อนแก้ |
| codebase ซับซ้อนขึ้นเรื่อยๆ | `/improve-codebase-architecture` | รันทุก 2-3 วัน หรือหลัง feature ใหญ่ |
| user ถามว่า "มี skill ไหนทำ X ได้บ้าง" | `/find-skills` | ค้นหา skill ก่อนเขียน code เอง |

### impeccable — 23 commands

All commands via `/impeccable <command>`. Use `/impeccable pin <command>` to create standalone shortcuts.

**Build**

| Command | What it does |
|---|---|
| `craft` | Full shape-then-build flow with visual iteration |
| `init` | One-time setup: PRODUCT.md, DESIGN.md, live mode |
| `document` | Generate DESIGN.md from existing project code |
| `extract` | Pull reusable components and tokens into design system |
| `shape` | Plan UX/UI before writing code |

**Evaluate**

| Command | What it does |
|---|---|
| `critique` | UX design review: hierarchy, clarity, emotional resonance |
| `audit` | Technical quality checks (a11y, performance, responsive) |

**Refine**

| Command | What it does |
|---|---|
| `polish` | Final pass, design system alignment, shipping readiness |
| `bolder` | Amplify boring designs |
| `quieter` | Tone down overly bold designs |
| `distill` | Strip to essence |
| `harden` | Error handling, i18n, text overflow, edge cases |
| `onboard` | First-run flows, empty states, activation paths |
| `animate` | Add purposeful motion |
| `colorize` | Introduce strategic color |
| `typeset` | Fix font choices, hierarchy, sizing |
| `layout` | Fix layout, spacing, visual rhythm |
| `delight` | Add moments of joy |
| `overdrive` | Add technically extraordinary effects |
| `clarify` | Improve unclear UX copy |
| `adapt` | Adapt for different devices |
| `optimize` | Performance improvements |
| `live` | Visual variant mode: iterate on elements in the browser |

**7 domain references** loaded on every command: `typography`, `color-and-contrast`, `spatial-design`, `motion-design`, `interaction-design`, `responsive-design`, `ux-writing`

## Skill libraries

| Library | Install | Skills หลัก |
|---|---|---|
| **[mattpocock/skills](https://github.com/mattpocock/skills)** | `npx skills@latest add mattpocock/skills` | grill-me, grill-with-docs, tdd, to-prd, to-issues, diagnose, improve-codebase-architecture, zoom-out, prototype |
| **[thananon/9arm-skills](https://github.com/thananon/9arm-skills)** | `npx skills add thananon/9arm-skills` | debug-mantra, post-mortem, scrutinize, management-talk |
| **[pbakaus/impeccable](https://github.com/pbakaus/impeccable)** ([docs](https://impeccable.style/docs/)) | `npx impeccable skills install` | 23 commands — ดู Auto-triggered skills |

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `github.com/xenodeve/narze`. Use GitHub MCP tools for all operations. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
