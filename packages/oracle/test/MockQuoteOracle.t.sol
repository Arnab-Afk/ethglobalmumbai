// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockQuoteOracle} from "../src/MockQuoteOracle.sol";
import {QuoteCurveLib} from "../src/QuoteCurveLib.sol";

contract MockQuoteOracleTest is Test {
    MockQuoteOracle internal oracle;
    address internal alice = address(0xA11CE);
    address internal tokenA = address(0xA);
    address internal tokenB = address(0xB);

    function setUp() public {
        oracle = new MockQuoteOracle(address(this));
        vm.warp(1_700_000_000);
    }

    function test_setCurve_andInterpolateMidpoint() public {
        uint256[] memory amounts = new uint256[](2);
        uint256[] memory outs = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 3 ether;
        outs[0] = 1000e6;
        outs[1] = 3000e6;

        oracle.setCurve(tokenA, tokenB, amounts, outs, 0);

        (uint256 mid, uint64 ts) = oracle.getBestOut(tokenA, tokenB, 2 ether);
        assertEq(ts, uint64(block.timestamp));
        assertEq(mid, 2000e6);
    }

    function test_belowFirst_scalesFromOrigin() public {
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory outs = new uint256[](1);
        amounts[0] = 10 ether;
        outs[0] = 1000e6;
        oracle.setCurve(tokenA, tokenB, amounts, outs, 0);

        (uint256 out,) = oracle.getBestOut(tokenA, tokenB, 5 ether);
        assertEq(out, 500e6);
    }

    function test_aboveLast_returnsZero() public {
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory outs = new uint256[](1);
        amounts[0] = 1 ether;
        outs[0] = 100e6;
        oracle.setCurve(tokenA, tokenB, amounts, outs, 0);

        (uint256 out, uint64 ts) = oracle.getBestOut(tokenA, tokenB, 2 ether);
        // OOB size → (0,0) so fee-core treats quote as missing → fallbackFee
        assertEq(out, 0);
        assertEq(ts, 0);
    }

    function test_missingCurve_returnsZero() public view {
        (uint256 out, uint64 ts) = oracle.getBestOut(tokenA, tokenB, 1 ether);
        assertEq(out, 0);
        assertEq(ts, 0);
    }

    function test_onlyOwner() public {
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory outs = new uint256[](1);
        amounts[0] = 1;
        outs[0] = 1;
        vm.prank(alice);
        vm.expectRevert(MockQuoteOracle.NotOwner.selector);
        oracle.setCurve(tokenA, tokenB, amounts, outs, 0);
    }

    function test_rejectsNonIncreasingAmounts() public {
        uint256[] memory amounts = new uint256[](2);
        uint256[] memory outs = new uint256[](2);
        amounts[0] = 2 ether;
        amounts[1] = 1 ether;
        outs[0] = 1;
        outs[1] = 2;
        vm.expectRevert(QuoteCurveLib.AmountsNotStrictlyIncreasing.selector);
        oracle.setCurve(tokenA, tokenB, amounts, outs, 0);
    }
}
