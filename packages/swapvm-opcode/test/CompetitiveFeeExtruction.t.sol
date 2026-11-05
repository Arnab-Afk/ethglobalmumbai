// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockQuoteOracle} from "oracle/MockQuoteOracle.sol";
import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {FeeUnits} from "fee-core/FeeUnits.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {SwapQuery, SwapRegisters} from "../src/swapvm/Types.sol";

contract CompetitiveFeeExtructionTest is Test {
    MockQuoteOracle internal oracle;
    CompetitiveFeeExtruction internal target;

    address internal tokenA = address(0xA);
    address internal tokenB = address(0xB);
    address internal maker = address(0x1111);
    address internal taker = address(0x2222);

    uint256 internal constant X = 1_000 ether;
    uint256 internal constant Y = 3_000_000e6;
    uint256 internal constant AMOUNT_IN = 10 ether;

    function setUp() public {
        oracle = new MockQuoteOracle(address(this));
        target = new CompetitiveFeeExtruction(
            oracle,
            500, // floor 5 bp
            10_000, // cap 100 bp
            3_000, // fallback 30 bp
            1, // 1 bp undercut
            60
        );
        vm.warp(1_700_000_000);

        uint256[] memory amounts = new uint256[](2);
        uint256[] memory outs = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 100 ether;
        // competitor ~29610 USDC at 10 ETH (matches docs/02 scale)
        outs[0] = 2_961e6;
        outs[1] = 296_100e6;
        oracle.setCurve(tokenA, tokenB, amounts, outs, 0);
    }

    function _query(bool exactIn) internal view returns (SwapQuery memory) {
        return SwapQuery({
            orderHash: bytes32(uint256(1)),
            maker: maker,
            taker: taker,
            tokenIn: tokenA,
            tokenOut: tokenB,
            isExactIn: exactIn
        });
    }

    function _swap(uint256 amountIn) internal pure returns (SwapRegisters memory) {
        return SwapRegisters({
            balanceIn: X,
            balanceOut: Y,
            amountIn: amountIn,
            amountOut: 0,
            amountNetPulled: 0
        });
    }

    function test_quoteEqualsSwap_sameRegisters() public {
        SwapQuery memory q = _query(true);
        SwapRegisters memory s = _swap(AMOUNT_IN);

        (uint256 pc1, uint256 chop1, SwapRegisters memory outQuote) =
            target.extruction(true, 42, q, s, hex"", hex"");
        (uint256 pc2, uint256 chop2, SwapRegisters memory outSwap) =
            target.extruction(false, 42, q, s, hex"", hex"");

        assertEq(pc1, 42);
        assertEq(pc2, 42);
        assertEq(chop1, 0);
        assertEq(chop2, 0);
        assertEq(outQuote.amountOut, outSwap.amountOut);
        assertGt(outQuote.amountOut, 0);
    }

    function test_workedExample_beatsCompetitor() public {
        (, , SwapRegisters memory out) =
            target.extruction(true, 0, _query(true), _swap(AMOUNT_IN), hex"", hex"");

        (uint256 bestOut,) = oracle.getBestOut(tokenA, tokenB, AMOUNT_IN);
        assertGe(out.amountOut, bestOut, "trader >= competitor");

        (uint24 feePips,,) = target.previewFeePips(tokenA, tokenB, AMOUNT_IN, X, Y);
        // Should be in competitive band around ~30 bp, not stuck at floor
        assertGt(feePips, 500);
        assertLe(feePips, 10_000);
    }

    function test_staleOracle_usesFallbackFee() public {
        // Age the curve beyond maxQuoteAge
        vm.warp(block.timestamp + 61);

        (uint24 feePips,,) = target.previewFeePips(tokenA, tokenB, AMOUNT_IN, X, Y);
        assertEq(feePips, 3_000);

        (, , SwapRegisters memory out) =
            target.extruction(true, 0, _query(true), _swap(AMOUNT_IN), hex"", hex"");

        // Manual: fallback 3000 pips → SwapVM bps 3e6 → fee = amountIn * 3e6 / 1e9
        uint256 feeAmount = (AMOUNT_IN * FeeUnits.pipsToSwapVmBps(3_000)) / 1e9;
        uint256 afterFee = AMOUNT_IN - feeAmount;
        uint256 expected = (afterFee * Y) / (X + afterFee);
        assertEq(out.amountOut, expected);
    }

    function test_missingCurve_usesFallbackFee() public {
        CompetitiveFeeExtruction fresh = new CompetitiveFeeExtruction(oracle, 500, 10_000, 3_000, 1, 60);
        // no curve for tokenB → tokenA
        (uint24 feePips,,) = fresh.previewFeePips(tokenB, tokenA, AMOUNT_IN, X, Y);
        assertEq(feePips, 3_000);
    }

    function test_recomputeGuard() public {
        SwapRegisters memory s = _swap(AMOUNT_IN);
        s.amountOut = 1; // already priced
        vm.expectRevert(CompetitiveFeeExtruction.RecomputeDetected.selector);
        target.extruction(true, 0, _query(true), s, hex"", hex"");
    }

    function test_exactOut_reverts() public {
        SwapRegisters memory s = SwapRegisters({
            balanceIn: X,
            balanceOut: Y,
            amountIn: 0,
            amountOut: 1e6,
            amountNetPulled: 0
        });
        vm.expectRevert(CompetitiveFeeExtruction.ExactOutNotSupported.selector);
        target.extruction(true, 0, _query(false), s, hex"", hex"");
    }

    function test_zeroBalance_reverts() public {
        SwapRegisters memory s = _swap(AMOUNT_IN);
        s.balanceIn = 0;
        vm.expectRevert(
            abi.encodeWithSelector(CompetitiveFeeExtruction.BothBalancesRequired.selector, uint256(0), Y)
        );
        target.extruction(true, 0, _query(true), s, hex"", hex"");
    }

    function test_feeUnitsBoundary() public pure {
        assertEq(FeeUnits.pipsToSwapVmBps(3_000), 3_000_000);
    }
}
