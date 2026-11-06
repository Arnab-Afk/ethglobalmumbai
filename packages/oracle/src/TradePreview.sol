// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {VenueReader} from "./VenueReader.sol";

/// @title View-only competitor vs our output
/// @notice Uses fee-core. Reserves are arguments so this can price a trade before a pool is funded.
contract TradePreview {
    VenueReader public immutable reader;

    constructor(VenueReader reader_) {
        reader = reader_;
    }

    /// @notice `ourOut` is what fee-core would pay from `reserveIn` / `reserveOut`.
    ///         If `bestOut != 0` and `ourOut < bestOut`, a live swap must revert.
    function preview(address tokenIn, address tokenOut, uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external
        view
        returns (uint256 bestOut, uint256 ourOut, uint24 feePips, uint64 updatedAt)
    {
        (bestOut, updatedAt) = reader.getBestOut(tokenIn, tokenOut, amountIn);
        CompetitiveFee.Config memory cfg = CompetitiveFee.Config({
            feeFloor: 500,
            feeCap: 10_000,
            fallbackFee: 3000,
            undercutBps: 1,
            maxQuoteAge: 120
        });
        feePips = CompetitiveFee.compute(amountIn, reserveIn, reserveOut, bestOut, updatedAt, cfg);
        ourOut = CompetitiveFee.outAfterFee(amountIn, reserveIn, reserveOut, feePips);
    }
}
