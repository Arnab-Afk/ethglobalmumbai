"""Build neat pitch deck from docs-site narrative. Run: python pitch/build_deck.py"""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

# DESIGN.md tokens
INK = RGBColor(0x15, 0x16, 0x19)
INK_LAV = RGBColor(0x1C, 0x1C, 0x1C)
BODY = RGBColor(0x6B, 0x65, 0x60)
MUTED = RGBColor(0x8A, 0x84, 0x7E)
RULE = RGBColor(0xE7, 0xE4, 0xDF)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
WARM = RGBColor(0xF7, 0xF5, 0xF2)
LAVENDER = RGBColor(0xAB, 0x9F, 0xF2)
PURPLE = RGBColor(0x5B, 0x46, 0xC7)
WIN = RGBColor(0x1F, 0x8A, 0x5B)

W, H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.7)


def set_run(run, *, size=18, bold=False, color=INK, name="Calibri"):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = name


def add_text(tf, text, *, size=18, bold=False, color=INK, align=PP_ALIGN.LEFT, space_after=6):
    p = tf.paragraphs[0] if not tf.paragraphs[0].text else tf.add_paragraph()
    if not tf.paragraphs[0].text and p is tf.paragraphs[0]:
        pass
    else:
        if tf.paragraphs[0].text == "" and len(tf.paragraphs) == 1:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
    p.alignment = align
    p.space_after = Pt(space_after)
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color)
    return p


def clear_tf(tf):
    tf.clear()
    tf.word_wrap = True


def fill(shape, color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()


def rect(slide, left, top, width, height, color):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    fill(s, color)
    return s


def hairline(slide, left, top, width):
    s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, Pt(1.25))
    fill(s, RULE)
    return s


def textbox(slide, left, top, width, height):
    return slide.shapes.add_textbox(left, top, width, height)


def eyebrow(slide, text, left=MARGIN, top=Inches(0.45)):
    box = textbox(slide, left, top, Inches(10), Inches(0.35))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = text.upper()
    set_run(run, size=11, bold=False, color=MUTED, name="Consolas")
    return box


def title(slide, text, left=MARGIN, top=Inches(0.85), width=Inches(11.5), size=40, color=INK):
    box = textbox(slide, left, top, width, Inches(1.4))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=True, color=color)
    return box


def body_lines(slide, lines, left=MARGIN, top=Inches(2.4), width=Inches(11.8), size=20, color=BODY, gap=10):
    box = textbox(slide, left, top, width, Inches(4.5))
    tf = box.text_frame
    clear_tf(tf)
    first = True
    for line in lines:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(gap)
        run = p.add_run()
        run.text = line
        set_run(run, size=size, color=color)
    return box


def blank(prs, bg=WHITE):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    rect(slide, 0, 0, W, H, bg)
    return slide


def build():
    prs = Presentation()
    prs.slide_width = W
    prs.slide_height = H

    # ── 1. Title ──
    s = blank(prs, LAVENDER)
    rect(s, Inches(11.8), Inches(0.6), Inches(0.9), Inches(0.18), RGBColor(0xCD, 0xC6, 0xF9))
    rect(s, Inches(11.8), Inches(0.95), Inches(0.65), Inches(0.18), RGBColor(0xCD, 0xC6, 0xF9))
    rect(s, Inches(11.8), Inches(1.3), Inches(0.4), Inches(0.18), RGBColor(0xCD, 0xC6, 0xF9))
    box = textbox(s, MARGIN, Inches(2.0), Inches(11), Inches(2.2))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "neat"
    set_run(run, size=72, bold=True, color=INK_LAV)
    p2 = tf.add_paragraph()
    p2.space_before = Pt(12)
    run = p2.add_run()
    run.text = "Best price. Served neat."
    set_run(run, size=32, bold=False, color=INK_LAV)
    box = textbox(s, MARGIN, Inches(5.4), Inches(11), Inches(1.2))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "An AMM that sets its swap fee last, on every trade."
    set_run(run, size=20, color=RGBColor(0x1C, 0x1C, 0x1C))
    p = tf.add_paragraph()
    p.space_before = Pt(10)
    run = p.add_run()
    run.text = "ETHGlobal Mumbai  ·  docs for neat3-sdk"
    set_run(run, size=14, color=MUTED, name="Consolas")

    # ── 2. Problem ──
    s = blank(prs, WHITE)
    eyebrow(s, "Problem")
    title(s, "A flat fee is wrong\nmost of the time.")
    hairline(s, MARGIN, Inches(2.5), Inches(12))
    # two columns
    for i, (h, b) in enumerate(
        [
            ("Too high", "The trade routes to a cheaper venue.\nLPs earn nothing."),
            ("Too low", "The trade would have paid more.\nLPs leave surplus on the table."),
        ]
    ):
        left = MARGIN + Inches(i * 6.1)
        box = textbox(s, left, Inches(2.9), Inches(5.6), Inches(3))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = h
        set_run(run, size=28, bold=True, color=PURPLE)
        for line in b.split("\n"):
            p = tf.add_paragraph()
            p.space_before = Pt(10)
            run = p.add_run()
            run.text = line
            set_run(run, size=20, color=BODY)
    box = textbox(s, MARGIN, Inches(6.4), Inches(12), Inches(0.6))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Aggregators already pick the best output. The margin you win by is LP opportunity cost."
    set_run(run, size=16, color=MUTED)

    # ── 3. Idea ──
    s = blank(prs, LAVENDER)
    box = textbox(s, MARGIN, Inches(0.45), Inches(10), Inches(0.35))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "IDEA"
    set_run(run, size=11, color=MUTED, name="Consolas")
    title(s, "Set the fee last.", size=48, color=INK_LAV)
    body_lines(
        s,
        [
            "Before each swap, check what the best competing venue would pay",
            "for that exact trade. Charge the largest fee that still leaves",
            "the trader slightly ahead.",
            "",
            "Traders get at least the best price elsewhere.",
            "LPs keep the surplus a flat fee would have given away.",
        ],
        top=Inches(2.6),
        size=22,
        color=INK_LAV,
        gap=6,
    )

    # ── 4. How fees work ──
    s = blank(prs, WHITE)
    eyebrow(s, "How fees are set")
    title(s, "The last-look rule.", size=36)
    hairline(s, MARGIN, Inches(2.35), Inches(12))
    steps = [
        ("01", "Read bestOut", "Best output elsewhere for same pair, direction, size."),
        ("02", "Zero-fee out", "What this pool pays with no fee."),
        ("03", "Win → max fee", "Largest fee that stays just above bestOut."),
        ("04", "Else floor", "Can't win → floor fee. Missing quote → fallback."),
    ]
    for i, (n, h, d) in enumerate(steps):
        top = Inches(2.7) + Inches(i * 1.05)
        box = textbox(s, MARGIN, top, Inches(0.7), Inches(0.9))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = n
        set_run(run, size=18, color=MUTED, name="Consolas")
        box = textbox(s, Inches(1.5), top, Inches(10.5), Inches(0.9))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = h
        set_run(run, size=22, bold=True, color=INK)
        p = tf.add_paragraph()
        run = p.add_run()
        run.text = d
        set_run(run, size=16, color=BODY)

    # ── 5. Worked example ──
    s = blank(prs, WARM)
    eyebrow(s, "Worked example  ·  docs/02")
    title(s, "Sell 10 ETH. Beat the venue.\nKeep the gap for LPs.", size=32)
    hairline(s, MARGIN, Inches(2.55), Inches(12))
    rows = [
        ("Zero-fee out", "~29,702.97 USDC"),
        ("Best competitor", "29,610 USDC"),
        ("neat fee", "~3,060 pips (0.306%)"),
        ("Trader receives", "~29,613 USDC"),
        ("Beats venue by", "~3 USDC"),
        ("LPs keep", "~90 USDC of the gap"),
    ]
    for i, (k, v) in enumerate(rows):
        col = i % 3
        row = i // 3
        left = MARGIN + Inches(col * 4.1)
        top = Inches(2.9) + Inches(row * 1.7)
        box = textbox(s, left, top, Inches(3.8), Inches(1.4))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = k.upper()
        set_run(run, size=11, color=MUTED, name="Consolas")
        p = tf.add_paragraph()
        p.space_before = Pt(8)
        run = p.add_run()
        run.text = v
        set_run(run, size=22, bold=True, color=PURPLE if "Beat" in k or "LP" in k else INK)

    # ── 6. Surfaces ──
    s = blank(prs, WHITE)
    eyebrow(s, "Surfaces")
    title(s, "One fee engine.\nFour integrations.", size=36)
    hairline(s, MARGIN, Inches(2.55), Inches(12))
    cards = [
        ("1inch Aqua", "CompetitiveFee Extruction\non SwapVM (opcode 32)"),
        ("Uniswap v4", "FeeLast hook + AXIS/USDC\nlive on Base"),
        ("EF / Anon-RPC", "Private reads by default.\nFrame swaps on EIP-8141"),
        ("Chainlink CRE", "Off-chain venue quotes\n→ on-chain quote curve"),
    ]
    for i, (h, d) in enumerate(cards):
        left = MARGIN + Inches(i * 3.1)
        r = rect(s, left, Inches(3.0), Inches(2.9), Inches(3.2), WARM)
        box = textbox(s, left + Inches(0.2), Inches(3.25), Inches(2.5), Inches(2.7))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = h
        set_run(run, size=18, bold=True, color=PURPLE)
        for line in d.split("\n"):
            p = tf.add_paragraph()
            p.space_before = Pt(8)
            run = p.add_run()
            run.text = line
            set_run(run, size=14, color=BODY)

    # ── 7. Uniswap Base ──
    s = blank(prs, LAVENDER)
    box = textbox(s, MARGIN, Inches(0.45), Inches(10), Inches(0.35))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "UNISWAP V4  ·  BASE"
    set_run(run, size=11, color=MUTED, name="Consolas")
    title(s, "Live fee-last pool\non Base.", size=40, color=INK_LAV)
    rows = [
        ("Hook", "0x8efB…aAC4"),
        ("Router", "0xE127…ef07"),
        ("Pool", "AXIS / USDC, fee 0"),
        ("Ticks", "-296999 … -296939"),
        ("Bid", "Signed fee after rival quotes"),
        ("App", "frontend/lib/base-axis.ts"),
    ]
    for i, (k, v) in enumerate(rows):
        col = i % 3
        row = i // 3
        left = MARGIN + Inches(col * 4.1)
        top = Inches(3.1) + Inches(row * 1.5)
        box = textbox(s, left, top, Inches(3.8), Inches(1.3))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = k.upper()
        set_run(run, size=11, color=MUTED, name="Consolas")
        p = tf.add_paragraph()
        p.space_before = Pt(6)
        run = p.add_run()
        run.text = v
        set_run(run, size=18, bold=True, color=INK_LAV)

    # ── 8. Private ──
    s = blank(prs, WHITE)
    eyebrow(s, "Private quotes")
    title(s, "Reads go through\nAnon-RPC by default.", size=36)
    hairline(s, MARGIN, Inches(2.55), Inches(12))
    body_lines(
        s,
        [
            "Sepolia quotes, mainnet competitor prices, and Base AXIS reads",
            "route through Nox (with Nym and Tor as fallbacks).",
            "",
            "The RPC never learns who asked, for which pair, or how much.",
            "If every mixnet is down, reads fail closed — no silent fallback.",
            "",
            "Swaps can submit as one atomic EIP-8141 frame batch.",
            "minOut makes a front-run revert the whole batch.",
            "(The alt mempool itself is public.)",
        ],
        top=Inches(2.85),
        size=18,
        gap=4,
    )

    # ── 9. SDK ──
    s = blank(prs, WARM)
    eyebrow(s, "neat3-sdk")
    title(s, "Three calls.\nFrom quote to swap.", size=36)
    hairline(s, MARGIN, Inches(2.55), Inches(12))
    code = rect(s, MARGIN, Inches(2.9), Inches(12), Inches(3.6), WHITE)
    box = textbox(s, Inches(1.0), Inches(3.2), Inches(11.2), Inches(3.1))
    tf = box.text_frame
    clear_tf(tf)
    lines = [
        ("// 1. what will this trade get me?", MUTED),
        ("const q = await client.quote({ tokenIn, amountIn });", INK),
        ("", INK),
        ("// 2. approve + swap, minOut = quote, deadline = 10 min", MUTED),
        ("const calls = client.encodeSwap(q);", INK),
        ("", INK),
        ("// 3. or one atomic EIP-8141 frame transaction", MUTED),
        ("const hash = await client.submit(q);", INK),
    ]
    first = True
    for text, color in lines:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(4)
        run = p.add_run()
        run.text = text if text else " "
        set_run(run, size=16, color=color, name="Consolas")

    # ── 10. Status ──
    s = blank(prs, WHITE)
    eyebrow(s, "Where it works today")
    title(s, "Live pieces.", size=36)
    hairline(s, MARGIN, Inches(2.35), Inches(12))
    status = [
        ("Base Uniswap", "FeeLast hook + AXIS/USDC pool — mainnet"),
        ("EIP-8141 devnet", "DevnetCompetitivePool + frame swaps (chain 1337)"),
        ("Sepolia", "VenueReader, TradePreview, demo pool, CRE writes"),
        ("Aqua / SwapVM", "CompetitiveFeeExtruction + Foundry tests; fork demo next"),
        ("App", "neat frontend: Anon-RPC quotes, AXIS mark, 12s refresh"),
        ("Docs", "apps/docs — quickstart, Uniswap guide, networks"),
    ]
    for i, (h, d) in enumerate(status):
        top = Inches(2.6) + Inches(i * 0.7)
        box = textbox(s, MARGIN, top, Inches(3.2), Inches(0.6))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = h
        set_run(run, size=16, bold=True, color=PURPLE)
        box = textbox(s, Inches(4.0), top, Inches(8.5), Inches(0.6))
        tf = box.text_frame
        clear_tf(tf)
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = d
        set_run(run, size=16, color=BODY)

    # ── 11. Honest ──
    s = blank(prs, WARM)
    eyebrow(s, "Honest about the build")
    title(s, "What we claim —\nand what we don't.", size=34)
    hairline(s, MARGIN, Inches(2.55), Inches(12))
    body_lines(
        s,
        [
            "Inspired by PropellerHeads' Fynd. All code written fresh for the hackathon.",
            "",
            "Base AXIS liquidity is real and narrow — wins when the curve can beat rivals.",
            "neat3-sdk wraps the EIP-8141 / Sepolia demo pools, not Base FeeLast yet.",
            "Aqua settlement on a mainnet fork is the remaining 1inch demo gap.",
            "PRIVATE_RPC for signed Base swaps is still the public Base RPC.",
            "",
            "Rounding always favors the trader. Missing quotes use a fallback fee.",
        ],
        top=Inches(2.85),
        size=18,
        gap=4,
    )

    # ── 12. Close ──
    s = blank(prs, INK)
    box = textbox(s, MARGIN, Inches(2.2), Inches(11.5), Inches(3))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Best price.\nServed neat."
    set_run(run, size=48, bold=True, color=WHITE)
    box = textbox(s, MARGIN, Inches(5.3), Inches(11.5), Inches(1.2))
    tf = box.text_frame
    clear_tf(tf)
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "github.com/Arnab-Afk/ethglobalmumbai"
    set_run(run, size=18, color=LAVENDER, name="Consolas")
    p = tf.add_paragraph()
    p.space_before = Pt(8)
    run = p.add_run()
    run.text = "npm i neat3-sdk   ·   apps/docs on :3001   ·   frontend on :3000"
    set_run(run, size=14, color=MUTED, name="Consolas")

    out = Path(__file__).resolve().parent / "neat-pitch.pptx"
    prs.save(out)
    print(out)


if __name__ == "__main__":
    build()
