// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Integer fee rule for a last-mover pool.
/// @dev Uniswap v4 counts fees in pips: 1_000_000 pips = 100%. The fee is rounded down so the
///      trader receives at least `minOut`. One extra pip is enough to lose that guarantee.
library FeeMath {
    uint256 internal constant PIPS = 1_000_000;

    /// @notice Smallest output that still beats `competitorOut`.
    /// @dev `edgePips` is an extra improvement over the rival quote (100 pips = 1 bps). The
    ///      result is always at least one unit above the rival, so a tie cannot win the route.
    function minOutToBeat(uint256 competitorOut, uint256 edgePips) internal pure returns (uint256 minOut) {
        uint256 edged = competitorOut + (competitorOut * edgePips) / PIPS;
        minOut = edged > competitorOut ? edged : competitorOut + 1;
    }

    /// @notice Largest pip fee such that `gross - floor(gross * fee / PIPS) >= minOut`.
    /// @dev The closed form can be one pip short because the fee rounds down. One bump closes that gap.
    function feeFromSurplus(uint256 gross, uint256 minOut) internal pure returns (uint24 feePips) {
        if (gross <= minOut || gross == 0) return 0;
        uint256 pips = ((gross - minOut) * PIPS) / gross;
        if (pips < PIPS) {
            uint256 bumpedFee = (gross * (pips + 1)) / PIPS;
            if (bumpedFee < gross && gross - bumpedFee >= minOut) pips += 1;
        }
        if (pips > PIPS) pips = PIPS;
        feePips = uint24(pips);
    }

    /// @notice Output fee, rounded down. Matches `feeFromSurplus`.
    function feeTaken(uint256 gross, uint24 feePips) internal pure returns (uint256) {
        return (gross * uint256(feePips)) / PIPS;
    }
}
