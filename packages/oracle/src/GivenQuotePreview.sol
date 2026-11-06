// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";

/// @title Fee-core preview for a quote gathered off this chain
/// @notice Sepolia pools do not trade, so the UI passes a mainnet Uniswap v3 output in.
///         The fee is still `CompetitiveFee.compute`. `maxQuoteAge` is one hour so a
///         few seconds of clock skew between mainnet and Sepolia does not force the fallback.
contract GivenQuotePreview {
    function preview(uint256 amountIn, uint256 reserveIn, uint256 reserveOut, uint256 bestOut, uint64 updatedAt)
        external
        view
        returns (uint24 feePips, uint256 ourOut)
    {
        CompetitiveFee.Config memory cfg = CompetitiveFee.Config({
            feeFloor: 500,
            feeCap: 10_000,
            fallbackFee: 3000,
            undercutBps: 1,
            maxQuoteAge: 3600
        });
        feePips = CompetitiveFee.compute(amountIn, reserveIn, reserveOut, bestOut, updatedAt, cfg);
        ourOut = CompetitiveFee.outAfterFee(amountIn, reserveIn, reserveOut, feePips);
    }
}
