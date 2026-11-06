# 01 — Concept & Positioning

## The problem with flat fees

Most AMM pools charge one fee for every trade (e.g. 0.30%). That fee is wrong almost all the time:

- **Too high** → the trade routes to a cheaper venue and LPs earn nothing.
- **Too low** → the trade would have come anyway at a higher fee; LPs leave the difference on the table, and it goes to the trader, the aggregator, or a searcher.

Aggregators (1inch, CoW, 0x, Paraswap…) already compare venues on every order. The pool that wins is the one that gives the best output, and the margin it wins by is pure LP opportunity cost.

## The idea: set the fee last

On every swap, right before execution:

1. Look up what the **best competing venue** would return for this exact trade (same pair, same direction, same size).
2. Compute what *our* pool would return at **zero fee**.
3. If we're better, charge the **largest fee that still keeps us just ahead** of the competitor (by a small undercut margin).
4. If we're not better, fall back to a floor fee. We don't win this trade, and that's fine.

So:

- **Traders** always get output ≥ the best alternative they could have found.
- **LPs** capture the full surplus between our price and the next-best price, trade by trade, without guessing a static tier.
- **Aggregators** keep routing to us, since we're always (marginally) best when we can be.

## One engine, three surfaces

The fee rule is a small, pure function (see [02-fee-algorithm.md](02-fee-algorithm.md)). We implement it once as a Solidity library and plug it into:

| Surface | Role in the story |
|---|---|
| **1inch SwapVM opcode on Aqua** | *Core.* A new instruction makers can drop into any SwapVM program, so any Aqua liquidity strategy can price competitively. |
| **Private & competitive quoting (EF)** | Quotes via Anon-RPC and swaps via the Frame mempool, so the quote request doesn't leak intent, and a front-run makes the atomic frame batch revert (`minOut`) instead of filling worse. The alt mempool itself is public. |
| **Chainlink CRE workflow** | Supplies the "best competing venue" input: fetches quotes off-chain, reaches DON consensus, and writes a quote curve on-chain. |

## What's novel vs. what's borrowed

- **Borrowed (concept):** PropellerHeads' Fynd AMM explored competitive / solver-aware fee setting. We credit it as inspiration.
- **Ours (built at the hackathon):**
  - the fee rule and its closed-form solution for constant-product curves
  - a reusable SwapVM instruction (a primitive, not a single pool)
  - a private quote + submission path that keeps the "best price" promise intact against front-running
  - an oracle-fed quote *curve* (size-aware) delivered by CRE rather than a single spot price

## One-line pitches

- **General:** "An AMM that charges the most it can while always being the best price."
- **1inch/Aqua:** "A SwapVM opcode that lets any Aqua strategy price its fee against the market, live, per trade."
- **Ethereum Foundation:** "We price every trade against the whole market. Private quoting and private submission make sure only the trader sees that price before it executes."
- **Chainlink:** "CRE as the cross-venue price-discovery layer that on-chain AMMs can't do themselves."
