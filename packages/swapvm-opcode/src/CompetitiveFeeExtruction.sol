// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {FeeUnits} from "fee-core/FeeUnits.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";
import {IExtruction, IStaticExtruction, SwapQuery, SwapRegisters} from "./swapvm/Types.sol";

/// @title Competitive-fee XYC pricing via SwapVM Extruction (Path B, docs/04)
/// @notice Non-upgradeable target: immutable oracle + fee config. Single `view` `extruction`
///         satisfies both IExtruction and IStaticExtruction → quote == swap by construction.
/// @dev Program embeds opcode 32 with args = abi.encodePacked(this) (+ optional empty extructionArgs).
contract CompetitiveFeeExtruction is IExtruction, IStaticExtruction {
    using FeeUnits for uint24;

    error RecomputeDetected();
    error BothBalancesRequired(uint256 balanceIn, uint256 balanceOut);
    error ExactOutNotSupported();

    /// @dev SwapVM Fee.sol scale: 1e9 = 100%.
    uint256 internal constant SWAPVM_BPS = 1e9;

    IQuoteOracle public immutable oracle;
    uint24 public immutable feeFloor;
    uint24 public immutable feeCap;
    uint24 public immutable fallbackFee;
    uint16 public immutable undercutBps;
    uint32 public immutable maxQuoteAge;

    constructor(
        IQuoteOracle oracle_,
        uint24 feeFloor_,
        uint24 feeCap_,
        uint24 fallbackFee_,
        uint16 undercutBps_,
        uint32 maxQuoteAge_
    ) {
        oracle = oracle_;
        feeFloor = feeFloor_;
        feeCap = feeCap_;
        fallbackFee = fallbackFee_;
        undercutBps = undercutBps_;
        maxQuoteAge = maxQuoteAge_;
    }

    /// @inheritdoc IStaticExtruction
    /// @dev Also serves IExtruction (same selector); view → identical quote/swap amounts.
    function extruction(
        bool, /* isStaticContext */
        uint256 nextPC,
        SwapQuery calldata query,
        SwapRegisters calldata swap,
        bytes calldata, /* args */
        bytes calldata /* takerData */
    )
        external
        view
        override(IExtruction, IStaticExtruction)
        returns (uint256 updatedNextPC, uint256 choppedLength, SwapRegisters memory updatedSwap)
    {
        if (swap.balanceIn == 0 || swap.balanceOut == 0) {
            revert BothBalancesRequired(swap.balanceIn, swap.balanceOut);
        }

        updatedSwap = swap;
        choppedLength = 0;
        updatedNextPC = nextPC;

        if (!query.isExactIn) {
            // MVP: exact-out competitive path deferred (docs/02). Use fallback fee.
            revert ExactOutNotSupported();
        }

        if (swap.amountOut != 0) revert RecomputeDetected();

        (uint256 bestOut, uint64 updatedAt) = oracle.getBestOut(query.tokenIn, query.tokenOut, swap.amountIn);

        CompetitiveFee.Config memory cfg = CompetitiveFee.Config({
            feeFloor: feeFloor,
            feeCap: feeCap,
            fallbackFee: fallbackFee,
            undercutBps: undercutBps,
            maxQuoteAge: maxQuoteAge
        });

        uint24 feePips = CompetitiveFee.compute(
            swap.amountIn, swap.balanceIn, swap.balanceOut, bestOut, updatedAt, cfg
        );

        // Mirror SwapVM `_flatFeeAmountInXD` exact-in: floor fee, then XYC on net input
        uint32 feeBps = feePips.pipsToSwapVmBps();
        uint256 feeAmountIn = (swap.amountIn * uint256(feeBps)) / SWAPVM_BPS;
        uint256 amountInAfterFee = swap.amountIn - feeAmountIn;

        updatedSwap.amountOut =
            (amountInAfterFee * swap.balanceOut) / (swap.balanceIn + amountInAfterFee);
    }

    /// @notice Helper for demos/tests: compute fee pips the extruction would use.
    function previewFeePips(address tokenIn, address tokenOut, uint256 amountIn, uint256 balanceIn, uint256 balanceOut)
        external
        view
        returns (uint24 feePips, uint256 bestOut, uint64 updatedAt)
    {
        (bestOut, updatedAt) = oracle.getBestOut(tokenIn, tokenOut, amountIn);
        CompetitiveFee.Config memory cfg = CompetitiveFee.Config({
            feeFloor: feeFloor,
            feeCap: feeCap,
            fallbackFee: fallbackFee,
            undercutBps: undercutBps,
            maxQuoteAge: maxQuoteAge
        });
        feePips = CompetitiveFee.compute(amountIn, balanceIn, balanceOut, bestOut, updatedAt, cfg);
    }
}
