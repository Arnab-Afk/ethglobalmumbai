// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Competitive fee engine (canonical implementation)
/// @notice Largest fee (pips) that still keeps our exact-in output ≥ best competitor
///         by `undercutBps`. Spec: docs/02-fee-algorithm.md.
/// @dev Surfaces call this library; never re-implement the formula.
library CompetitiveFee {
    /// @dev 1e6 pips = 100% (Uniswap v4-style). 3000 pips = 0.30%.
    uint256 internal constant PIP_SCALE = 1e6;
    uint256 internal constant BPS_DENOM = 10_000;

    /// @notice Frozen config shared by every surface.
    struct Config {
        uint24 feeFloor; // pips
        uint24 feeCap; // pips
        uint24 fallbackFee; // pips — used when quote missing/stale
        uint16 undercutBps; // undercut vs competitor (1e4 = 100%)
        uint32 maxQuoteAge; // seconds
    }

    /// @notice Exact-in competitive fee in pips. Rounding favors the trader (fee rounds down).
    /// @param amountIn Trade size (tokenIn).
    /// @param reserveIn Our tokenIn reserve (x).
    /// @param reserveOut Our tokenOut reserve (y).
    /// @param bestOut Competing output for `amountIn` (0 = missing).
    /// @param updatedAt Oracle curve timestamp (0 = missing).
    /// @param cfg Fee bounds and staleness.
    /// @return feePips Fee to charge on input, in pips.
    function compute(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 bestOut,
        uint64 updatedAt,
        Config memory cfg
    ) internal view returns (uint24 feePips) {
        if (!_quoteUsable(bestOut, updatedAt, cfg.maxQuoteAge)) {
            return cfg.fallbackFee;
        }
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) {
            return cfg.fallbackFee;
        }

        // Q0 = y * amountIn / (x + amountIn)  — zero-fee constant product
        uint256 q0 = (reserveOut * amountIn) / (reserveIn + amountIn);

        // Q_target = bestOut * (1 + undercutBps/10_000); ceil so we never undershoot the undercut
        uint256 qTarget =
            Math.mulDiv(bestOut, BPS_DENOM + cfg.undercutBps, BPS_DENOM, Math.Rounding.Ceil);

        if (q0 <= qTarget) {
            return cfg.feeFloor;
        }
        // Need qTarget < y or the trade would drain the pool
        if (qTarget >= reserveOut) {
            return cfg.feeCap;
        }

        // a* = Q_target * x / (y - Q_target)  — round UP (trader-favorable: smaller fee)
        // f  = 1 - a*/amountIn               — round DOWN
        uint256 aStar =
            Math.mulDiv(qTarget, reserveIn, reserveOut - qTarget, Math.Rounding.Ceil);
        if (aStar >= amountIn) {
            // Would require zero or negative fee to hit target; floor is the safe choice
            return cfg.feeFloor;
        }

        // feePips = (amountIn - a*) * 1e6 / amountIn, floored
        uint256 raw = Math.mulDiv(amountIn - aStar, PIP_SCALE, amountIn);
        if (raw > type(uint24).max) raw = type(uint24).max;
        feePips = uint24(raw);

        return _clamp(feePips, cfg.feeFloor, cfg.feeCap);
    }

    /// @notice Zero-fee constant-product output (exact-in). Exposed for tests / surfaces.
    function zeroFeeOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256)
    {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) return 0;
        return (reserveOut * amountIn) / (reserveIn + amountIn);
    }

    /// @notice Exact-in output after an input fee in pips (floor fee amount → favors trader slightly less
    ///         than SwapVM's floor on fee; surfaces that need SwapVM parity convert at the boundary).
    function outAfterFee(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint24 feePips)
        internal
        pure
        returns (uint256)
    {
        if (amountIn == 0) return 0;
        uint256 feeAmount = (amountIn * uint256(feePips)) / PIP_SCALE; // floor
        uint256 amountInAfterFee = amountIn - feeAmount;
        return zeroFeeOut(amountInAfterFee, reserveIn, reserveOut);
    }

    function _quoteUsable(uint256 bestOut, uint64 updatedAt, uint32 maxQuoteAge)
        internal
        view
        returns (bool)
    {
        if (bestOut == 0 || updatedAt == 0) return false;
        if (block.timestamp < updatedAt) return false; // future timestamp → treat as bad
        return (block.timestamp - updatedAt) <= maxQuoteAge;
    }

    function _clamp(uint24 fee, uint24 floor_, uint24 cap_) private pure returns (uint24) {
        if (fee < floor_) return floor_;
        if (fee > cap_) return cap_;
        return fee;
    }
}
