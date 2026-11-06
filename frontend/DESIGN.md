# Hairline landing page: design system

The landing page (`app/page.tsx`, `components/landing/*`) is a **light, editorial** marketing page:
white and warm-grey sections, one lavender brand colour, big quiet headings, thin rules instead of
boxes, live numbers from Sepolia instead of illustrations.

It is deliberately different from the in-app pages (`/swap`, `/market`, `/dashboard`, `/about`),
which are a dark trading UI. Don't mix the two: no dark panels or token pills here, and no
eyebrows or lavender bands inside the app.

Shared building blocks live in `components/landing/section.tsx`. **Change the system there,
not per section.**

---

## 1. Principles

1. **One edge.** Header, hero, every section and the footer start on the same left edge (`CONTAINER`).
2. **One rhythm.** Every full section has the same vertical padding (`SECTION_Y`).
3. **One section opening.** Mono eyebrow → 52px heading → optional note bottom-right (`SectionHead`).
4. **Rules, not cards.** Structure comes from 1px hairlines (`#E7E4DF`). Cards are used only where
   something is interactive or live (hero swap, compare card, integration cards).
5. **Real numbers.** Figures come from the deployed contracts (`priceTrades`, `getLiveQuote`) or the
   docs/02 worked example, labelled as such. Never invent stats.
6. **Honest status.** Say Sepolia / devnet / demo oracle wherever it matters.
7. **No decoration for its own sake.** No gradients on text, no glow, no emoji, no icons in headings,
   no isometric or 3D scenes.

---

## 2. Colour

| Token | Hex | Use |
|---|---|---|
| Ink | `#151619` | Headings, body on white, dark buttons, ticker and final CTA background |
| Ink on lavender | `#1C1C1C` | All text on lavender (7.3:1); secondary at `/80`, `/75`, `/60` |
| Body grey | `#6B6560` | Paragraphs, notes, captions |
| Muted grey | `#8A847E` | Eyebrows, table heads, footer column titles, mono captions |
| Rule | `#E7E4DF` | Every hairline divider on light surfaces (`RULE`) |
| White | `#FFFFFF` | Default section background, cards |
| Warm grey | `#F7F5F2` | Alternate section background (sticky "never too high" panel, "Built for" strip), input wells in the hero card |
| Lavender | `#AB9FF2` | Brand surface: hero and Integrations band, final-CTA blocks, ticker dot |
| Lavender bar | `#CDC6F9` | Hero staircase bars only |
| Lavender soft | `#EEEBFD` / `#EFECFD` | Fee band on the ruler, highlighted "Hairline" row in the compare card |
| Purple ink | `#5B46C7` | Accent text on white (6.7:1): big figures, links in cards, fee value |
| Deep purple | `#3E2FA0` | Number inside the lavender fee band |
| Win green | `#1F8A5B` / `#1F9D57` | "+X over the best venue", winning-row dot |

Rules:
- Lavender is a **surface**, never text on white (fails contrast). For purple text use `#5B46C7`.
- One accent per view. Green is only for "beats the venue", never decoration.
- Section backgrounds alternate: lavender hero → dark ticker → white → white/warm-grey split →
  lavender band → white → warm-grey strip → white → dark CTA → white footer.

---

## 3. Type

Fonts: **Manrope** everywhere (`--font-manrope`, set on the root layout). **Geist Mono** only for
eyebrows, small captions and data labels.

| Role | Classes |
|---|---|
| Hero h1 | `text-[58px] sm:text-[84px] xl:text-[100px] leading-[0.98] font-semibold tracking-[-0.055em]` |
| Sticky-panel display | `text-[72px] leading-none font-medium tracking-[-0.035em]` (desktop only) |
| Section h2 (`H2`) | `text-[40px] sm:text-[52px] leading-[1.05] font-medium tracking-[-0.035em]` |
| Final CTA h2 | `text-[44px] sm:text-[64px] leading-[1.02] font-medium tracking-[-0.04em]` |
| Sub-heading | `text-[26px]`–`[28px] leading-[1.2] font-medium tracking-[-0.02em]` |
| Item title (h3) | `text-[20px] font-medium tracking-[-0.01em]` (FAQ question: `text-[18px]`) |
| Body | `text-[16px] leading-[1.6] text-[#6B6560]` |
| Hero lede | `text-[18px] leading-[1.5] font-medium text-[#1C1C1C]/80` |
| Small / captions | `text-[13px]`–`[14px] text-[#6B6560]` |
| Eyebrow (`Eyebrow`) | `font-mono text-[12px] tracking-[0.14em] uppercase text-[#8A847E]` |
| Data label | `font-mono text-[11px] tracking-[0.12em] uppercase text-[#8A847E]` |
| Big figure | `text-[44px]`–`[64px] font-medium tracking-[-0.04em]`–`[-0.05em]`, `#5B46C7` or ink |

Rules:
- Weights: **medium (500)** for headings and titles; semibold only for the hero h1 and buttons.
  No bold/extra-bold headings.
- Every number uses tabular figures (`[font-variant-numeric:tabular-nums]` or `tnum`).
- Headings get a `max-w-[..ch]` so they break into balanced lines (`18ch` for section h2s).
- Sentence case everywhere except eyebrows (uppercase mono).

---

## 4. Layout and spacing

| Token | Value | Where |
|---|---|---|
| `CONTAINER` | `mx-auto w-full max-w-[1240px] px-5 sm:px-10` | Header, hero, every section, footer |
| `SECTION_Y` | `py-24 lg:py-32` | Every full section and the final CTA |
| Header height | `h-14` (56px), fixed | Sticky offsets use `top-14`, anchors `scroll-mt-14` |
| Head → content | `mt-14` | After `SectionHead` |
| Grid gaps | `gap-6` (cards), `gap-12`–`gap-20` (two-column splits) | |

Exceptions (intentional):
- **"Never too high" split** uses `max-w-[1600px]`: the warm-grey panel bleeds to the left edge and
  sticks (`sticky top-14`, `rounded-b-[240px]`). Its text does not sit on the `CONTAINER` edge.
- **Ticker** is full-bleed.

Breakpoints: design at 1440px, check 1024px and 375px. Every multi-column grid collapses to one
column below `lg` (or `sm` for small grids). No horizontal scroll at 375px.

---

## 5. Components

### SectionHead (`section.tsx`)
Eyebrow + h2 on the left, a ≤40ch note bottom-right on `lg`. Grid
`lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end`. `tone="lavender" | "dark"` for
coloured bands. **Every section starts with it**, except the hero, the sticky split (its own
display type) and FAQ (eyebrow + h2 in a left column).

### Header (`header.tsx` → `LandingHeader`)
Text wordmark "Hairline" (no logo mark), links centered, wallet pill right. Transparent over the
hero, `bg-white/90 backdrop-blur-md` with a 1px shadow once scrolled past 40px. The wallet pill is
white on lavender and ink once solid. The wallet is touched **only on click**.

### Buttons
- **Launch App** (`LaunchButton`): `rounded-xl px-6 py-3 text-[16px] font-bold`, arrow pushed right
  (`ml-10`), arrow nudges on hover. Ink on light/lavender (`dark`), white on the dark CTA.
- **Text links**: `text-[14px] font-medium underline decoration-current/30 underline-offset-4`,
  full underline on hover, `→` for internal and `↗` for external.
- **Segmented pills** (trade-size tabs in the fee ruler and compare card): container
  `rounded-full border border-[#E7E4DF] p-1`, items `rounded-full px-4 py-1.5 text-[14px] font-medium`,
  active `bg-[#151619] text-white`.

### Cards
- Hero swap card: `rounded-[20px] bg-white p-2 shadow-[0_30px_80px_rgb(40_28_96/0.28)]`,
  wells `rounded-[14px] bg-[#F7F5F2] px-5 pt-4 pb-5`, CTA `h-14 rounded-[14px]` ink.
- Compare card: `rounded-2xl bg-white p-5 sm:p-6 ring-1 ring-black/5` with a soft shadow.
- Integration cards: `rounded-2xl bg-white p-6`, equal heights via `grid-rows-subgrid`, the link
  pinned to the bottom (`mt-auto`). Stats as a 2×2 `dl` with hairlines and mono labels.

### Lists and rows
- Numbered items: `grid-cols-[40px_1fr]`, mono `01` in the gutter, `border-b border-[#E7E4DF] py-7`.
- Key/value rows: `flex justify-between border-b border-[#E7E4DF] py-3.5 text-[15px]`, key grey,
  value ink medium.
- FAQ: native `<details>`, rule above and below each item, question `text-[18px] font-medium`, a
  circled `+` (`size-9 border border-[#E7E4DF]`) that rotates 45° when open.

### Data visuals
- **Fee ruler** (`fee-ruler.tsx`): the one explanatory visual. Three marks on a ticked line (best
  venue, Hairline, pool before any fee); the fee is the lavender gap labelled "LPs keep". The
  Hairline mark is the only solid ink line with a dot. Labels never overlap: venue label below/right,
  Hairline label above/right, zero-fee label below/left. Marks animate with
  `transition-all duration-500 ease-out` when the size changes.
- **Compare card**: table, mono heads, a status dot per row (ink = venue, green = wins, grey = loses),
  Hairline row highlighted in lavender soft.
- **Ticker tape**: `h-14 bg-[#151619]`, fixed mono "Live · Sepolia" label with a pinging lavender
  dot, rows scroll with `hairline-ticker`, pause on hover.
- Charts follow the dataviz validator palette: Hairline `#8572e6`, flat 30 bp `#c4862a`, flat 5 bp `#26967b`.

### Decorative shapes (the only ones allowed)
- **Hero staircase** (`HeroBars`): static bars in `#CDC6F9` on lavender, rows `9.5vw` tall, each
  shifted `4.9%` right, starting at 55% of the width. Desktop only.
- **Band arcs** (`BandArcs`): three 900px white/20% circles off the top edge of the Integrations band.
- **CTA blocks** (`BlockPattern`): lavender staircase bleeding off the dark CTA's top-right corner.

---

## 6. Page structure (current order)

| # | Section | Surface | Eyebrow | Content |
|---|---|---|---|---|
| 1 | Hero | Lavender | — | h1, lede, Launch App, two stats, replay link; live swap card right |
| 2 | Ticker | Ink | Live · Sepolia | Hairline quote per size vs best venue |
| 3 | How it works (`#how`) | White | Pricing | `SectionHead` + fee ruler + four numbered steps |
| 4 | Why it wins (`#market`) | White + warm-grey sticky panel | Markets | Display h2 panel; compare card + three principles |
| 5 | Integrations | Lavender | Integrations | `SectionHead` + three contract cards (1inch Aqua, Chainlink CRE, Ethereum Foundation) |
| 6 | Who it's for | White | Liquidity | `SectionHead` + traders / LPs split with live figure, rows, link |
| 7 | Built for | Warm grey | Built at ETHGlobal Mumbai for | Sponsor names as text, divided by hairlines |
| 8 | FAQ | White | FAQ | Left heading, right accordion |
| 9 | Final CTA | Ink | Live on Sepolia | h2 + Launch App, lavender blocks |
| 10 | Footer | White | Column titles as eyebrows | Wordmark + Fynd credit, Product / Learn / Contracts |

---

## 7. Motion

- Only purposeful motion: ticker scroll, ruler marks sliding to new values, header background fade,
  FAQ `+` rotation, button arrow nudge.
- 200–500ms, `ease-out`. Nothing loops except the ticker.
- `prefers-reduced-motion`: the ticker stops (`globals.css`); everything else is a simple transition.

---

## 8. Content rules

- Plain words over jargon. If a term is needed (minOut, CRE, pips), the sentence explains it.
- Figures carry their source: "priced live by the fee contract on Sepolia" or "worked example from docs/02".
- Credit: "Inspired by PropellerHeads' Fynd". Never copy Fynd's code or assets; no third-party logos
  (sponsors appear as text).
- The demo state is stated plainly: the fee contract reads `MockQuoteOracle`, nothing settles on Sepolia yet.

---

## 9. Adding or changing a section

1. Wrap it: `<section className="bg-…"><div className={`${CONTAINER} ${SECTION_Y}`}>…</div></section>`.
2. Open with `<SectionHead eyebrow="…" title="…" note="…" />` (pick `tone` on lavender/dark).
3. Use `RULE` for dividers, the type scale above, and colours from §2 only.
4. Keep the background alternation from §2; never put two lavender sections next to each other.
5. Check at 1440px and 375px: same left edge as the header, no overflow, labels not colliding.
6. `npx tsc --noEmit` and `npx eslint app components` pass, console clean.
