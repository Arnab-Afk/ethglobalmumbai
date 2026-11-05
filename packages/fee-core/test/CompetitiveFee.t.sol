// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompetitiveFee} from "../src/CompetitiveFee.sol";
import {FeeUnits} from "../src/FeeUnits.sol";

contract CompetitiveFeeTest is Test {
    using CompetitiveFee for CompetitiveFee.Config;

    uint256 internal constant X = 1_000 ether; // 1000 ETH
    uint256 internal constant Y = 3_000_000e6; // 3M USDC (6 decimals)
    uint256 internal constant AMOUNT_IN = 10 ether;

    CompetitiveFee.Config internal cfg;

    function setUp() public {
        cfg = CompetitiveFee.Config({
            feeFloor: 500, // 5 bp
            feeCap: 10_000, // 100 bp
            fallbackFee: 3_000, // 30 bp
            undercutBps: 1, // 1 bp undercut
            maxQuoteAge: 60
        });
        // fresh timestamp for non-stale quotes
        vm.warp(1_700_000_000);
    }

    function _fresh(uint64 age) internal view returns (uint64) {
        return uint64(block.timestamp - age);
    }

    /// @dev docs/02 worked example ≈ 3060 pips
    function test_workedExample_approx3060Pips() public view {
        uint256 bestOut = 29_610e6; // USDC
        uint24 fee = CompetitiveFee.compute(AMOUNT_IN, X, Y, bestOut, _fresh(0), cfg);

        // Allow a few pips of tolerance for integer rounding vs the floating worked example
        assertApproxEqAbs(uint256(fee), 3060, 5, "fee ~ 3060 pips");
        assertGe(fee, cfg.feeFloor);
        assertLe(fee, cfg.feeCap);

        uint256 ourOut = CompetitiveFee.outAfterFee(AMOUNT_IN, X, Y, fee);
        uint256 qTarget = (bestOut * (10_000 + cfg.undercutBps) + 9_999) / 10_000; // ceil
        assertGe(ourOut, qTarget, "trader output >= Q_target");
    }

    function test_staleQuote_returnsFallback() public view {
        uint24 fee = CompetitiveFee.compute(AMOUNT_IN, X, Y, 29_610e6, _fresh(61), cfg);
        assertEq(fee, cfg.fallbackFee);
    }

    function test_missingQuote_returnsFallback() public view {
        assertEq(CompetitiveFee.compute(AMOUNT_IN, X, Y, 0, _fresh(0), cfg), cfg.fallbackFee);
        assertEq(CompetitiveFee.compute(AMOUNT_IN, X, Y, 29_610e6, 0, cfg), cfg.fallbackFee);
    }

    function test_cannotWin_returnsFloor() public view {
        // Competitor better than our zero-fee out
        uint256 q0 = CompetitiveFee.zeroFeeOut(AMOUNT_IN, X, Y);
        uint24 fee = CompetitiveFee.compute(AMOUNT_IN, X, Y, q0 + 1, _fresh(0), cfg);
        assertEq(fee, cfg.feeFloor);
    }

    function test_clampToCap() public view {
        // Large surplus vs competitor → raw fee above cap → clamp
        uint256 q0 = CompetitiveFee.zeroFeeOut(AMOUNT_IN, X, Y);
        uint256 bestOut = q0 / 2;
        CompetitiveFee.Config memory tight = cfg;
        tight.feeCap = 1_000; // 10 bp cap
        uint24 fee = CompetitiveFee.compute(AMOUNT_IN, X, Y, bestOut, _fresh(0), tight);
        assertEq(fee, tight.feeCap);
    }

    function test_betterCompetitor_neverRaisesFee() public view {
        uint256 worseBest = 29_000e6;
        uint256 betterBest = 29_610e6;
        uint24 feeWorse = CompetitiveFee.compute(AMOUNT_IN, X, Y, worseBest, _fresh(0), cfg);
        uint24 feeBetter = CompetitiveFee.compute(AMOUNT_IN, X, Y, betterBest, _fresh(0), cfg);
        assertLe(feeBetter, feeWorse, "better competitor => lower or equal fee");
    }

    function test_feeUnits_roundTrip() public pure {
        assertEq(FeeUnits.pipsToSwapVmBps(3_000), 3_000_000);
        assertEq(FeeUnits.swapVmBpsToPips(3_000_000), 3_000);
        assertEq(FeeUnits.pipsToSwapVmBps(500), 500_000);
    }

    function testFuzz_traderNeverWorseThanTarget(
        uint256 amountIn,
        uint256 bestOut,
        uint16 undercut
    ) public {
        // Keep sizes large enough that constant-product out is non-zero
        amountIn = bound(amountIn, 1e15, X / 10); // 0.001 .. 100 ETH
        uint256 q0 = CompetitiveFee.zeroFeeOut(amountIn, X, Y);
        vm.assume(q0 > 1);
        // competitor strictly below our zero-fee out so we can win
        bestOut = bound(bestOut, q0 / 2, q0 - 1);
        undercut = uint16(bound(undercut, 0, 50));

        CompetitiveFee.Config memory c = cfg;
        c.undercutBps = undercut;

        uint24 fee = CompetitiveFee.compute(amountIn, X, Y, bestOut, _fresh(0), c);
        assertGe(fee, c.feeFloor);
        assertLe(fee, c.feeCap);

        // docs/02 property 1: ourOut >= Q_target when we win and aren't feeCap-clamped.
        // feeFloor clamp-up can intentionally make us miss the target (surplus < floor).
        if (fee > c.feeFloor && fee < c.feeCap) {
            uint256 qTarget = (bestOut * (10_000 + undercut) + 9_999) / 10_000;
            if (q0 > qTarget && qTarget < Y) {
                uint256 ourOut = CompetitiveFee.outAfterFee(amountIn, X, Y, fee);
                assertGe(ourOut, qTarget, "property: ourOut >= Q_target when unclamped");
                assertGe(ourOut, bestOut, "property: ourOut >= bestOut when unclamped");
            }
        }
    }
}
