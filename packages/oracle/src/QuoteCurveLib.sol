// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Shared quote-curve validation + interpolation (docs/02)
library QuoteCurveLib {
    uint256 internal constant MAX_POINTS = 16;

    error LengthMismatch();
    error EmptyCurve();
    error TooManyPoints(uint256 n);
    error AmountsNotStrictlyIncreasing();
    error BestOutsNotNonDecreasing();

    function validate(uint256[] memory amountsIn, uint256[] memory bestOuts) internal pure {
        uint256 n = amountsIn.length;
        if (n == 0) revert EmptyCurve();
        if (n > MAX_POINTS) revert TooManyPoints(n);
        if (n != bestOuts.length) revert LengthMismatch();

        for (uint256 i = 0; i < n; ++i) {
            if (i > 0 && amountsIn[i] <= amountsIn[i - 1]) revert AmountsNotStrictlyIncreasing();
            if (i > 0 && bestOuts[i] < bestOuts[i - 1]) revert BestOutsNotNonDecreasing();
        }
    }

    /// @dev Below first: scale from (0,0). Inside: linear on output. Above last: 0 (→ fallbackFee).
    function interpolate(uint256[] storage amountsIn, uint256[] storage bestOuts, uint256 amountIn)
        internal
        view
        returns (uint256)
    {
        uint256 n = amountsIn.length;
        if (n == 0 || amountIn == 0) return 0;

        if (amountIn < amountsIn[0]) {
            return (bestOuts[0] * amountIn) / amountsIn[0];
        }
        if (amountIn == amountsIn[0]) return bestOuts[0];
        if (amountIn > amountsIn[n - 1]) return 0;
        if (amountIn == amountsIn[n - 1]) return bestOuts[n - 1];

        uint256 lo = 0;
        uint256 hi = n - 1;
        while (hi > lo + 1) {
            uint256 mid = (lo + hi) >> 1;
            if (amountsIn[mid] <= amountIn) lo = mid;
            else hi = mid;
        }

        uint256 a0 = amountsIn[lo];
        uint256 a1 = amountsIn[hi];
        uint256 b0 = bestOuts[lo];
        uint256 b1 = bestOuts[hi];
        return b0 + ((b1 - b0) * (amountIn - a0)) / (a1 - a0);
    }

    function pairKey(address tokenIn, address tokenOut) internal pure returns (bytes32) {
        return keccak256(abi.encode(tokenIn, tokenOut));
    }
}
