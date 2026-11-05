// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Pip ↔ SwapVM fee-unit conversion (boundary only)
/// @dev fee-core / docs use pips (1e6 = 100%). SwapVM Fee.sol uses BPS = 1e9 (= 100%).
library FeeUnits {
    uint256 internal constant PIP_SCALE = 1e6;
    uint256 internal constant SWAPVM_BPS = 1e9;
    uint256 internal constant PIP_TO_SWAPVM = SWAPVM_BPS / PIP_SCALE; // 1000

    /// @notice Convert Uniswap-v4-style pips to SwapVM `feeBps` (1e9 = 100%).
    function pipsToSwapVmBps(uint24 pips) internal pure returns (uint32) {
        return uint32(uint256(pips) * PIP_TO_SWAPVM);
    }

    /// @notice Convert SwapVM `feeBps` to pips (truncates toward zero; lossy if not divisible by 1000).
    function swapVmBpsToPips(uint32 swapVmBps) internal pure returns (uint24) {
        return uint24(uint256(swapVmBps) / PIP_TO_SWAPVM);
    }
}
