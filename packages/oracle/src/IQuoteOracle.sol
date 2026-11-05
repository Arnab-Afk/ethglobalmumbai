// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Competing-venue quote oracle (frozen interface)
/// @notice Surfaces (SwapVM / private quoter) read best competing output for an exact-in trade.
/// @dev Fee-core treats `bestOut == 0` or stale `updatedAt` as missing → fallbackFee.
interface IQuoteOracle {
    /// @notice Best competing output for `amountIn` on (tokenIn → tokenOut).
    /// @return bestOut  Competing output amount (0 if no usable quote).
    /// @return updatedAt Unix timestamp of the curve used (0 if missing).
    function getBestOut(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 bestOut, uint64 updatedAt);
}
