// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {QuoteOracle} from "../src/QuoteOracle.sol";
import {QuoteCurveLib} from "../src/QuoteCurveLib.sol";
import {IReceiver} from "../src/cre/IReceiver.sol";
import {IERC165} from "forge-std/interfaces/IERC165.sol";

contract QuoteOracleTest is Test {
    QuoteOracle internal oracle;
    address internal forwarder = address(0xF0);
    address internal stranger = address(0xBAD);
    address internal tokenA = address(0xA);
    address internal tokenB = address(0xB);

    function setUp() public {
        oracle = new QuoteOracle(address(this), forwarder);
        vm.warp(1_700_000_100);
    }

    function _encodeSingle(
        address tokenIn,
        address tokenOut,
        uint64 observedAt,
        uint256[] memory amounts,
        uint256[] memory outs
    ) internal pure returns (bytes memory) {
        QuoteOracle.CurveUpdate[] memory updates = new QuoteOracle.CurveUpdate[](1);
        updates[0] = QuoteOracle.CurveUpdate({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            observedAt: observedAt,
            amountsIn: amounts,
            bestOuts: outs,
            venueIds: bytes32(uint256(1))
        });
        return abi.encode(updates);
    }

    function _twoPointCurve()
        internal
        pure
        returns (uint256[] memory amounts, uint256[] memory outs)
    {
        amounts = new uint256[](2);
        outs = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 3 ether;
        outs[0] = 1000e6;
        outs[1] = 3000e6;
    }

    function test_onReport_fromForwarder_storesAndInterpolates() public {
        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        bytes memory report = _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs);

        vm.prank(forwarder);
        oracle.onReport(hex"", report);

        (uint256 mid, uint64 ts) = oracle.getBestOut(tokenA, tokenB, 2 ether);
        assertEq(ts, 1_700_000_050);
        assertEq(mid, 2000e6);
        assertEq(oracle.observedAt(tokenA, tokenB), 1_700_000_050);
    }

    function test_onReport_rejectsNonForwarder() public {
        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        bytes memory report = _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(QuoteOracle.InvalidSender.selector, stranger, forwarder));
        oracle.onReport(hex"", report);
    }

    function test_rejectsStaleOrEqualObservedAt() public {
        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        bytes memory report1 = _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs);
        vm.prank(forwarder);
        oracle.onReport(hex"", report1);

        bytes memory report2 = _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs);
        vm.prank(forwarder);
        vm.expectRevert(
            abi.encodeWithSelector(QuoteOracle.StaleReport.selector, uint64(1_700_000_050), uint64(1_700_000_050))
        );
        oracle.onReport(hex"", report2);

        bytes memory report3 = _encodeSingle(tokenA, tokenB, 1_700_000_049, amounts, outs);
        vm.prank(forwarder);
        vm.expectRevert(
            abi.encodeWithSelector(QuoteOracle.StaleReport.selector, uint64(1_700_000_049), uint64(1_700_000_050))
        );
        oracle.onReport(hex"", report3);
    }

    function test_acceptsNewerObservedAt() public {
        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        vm.prank(forwarder);
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs));

        outs[0] = 1100e6;
        outs[1] = 3100e6;
        vm.prank(forwarder);
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1_700_000_060, amounts, outs));

        (uint256 mid, uint64 ts) = oracle.getBestOut(tokenA, tokenB, 2 ether);
        assertEq(ts, 1_700_000_060);
        assertEq(mid, 2100e6);
    }

    function test_rejectsMalformedCurve() public {
        uint256[] memory amounts = new uint256[](2);
        uint256[] memory outs = new uint256[](2);
        amounts[0] = 2 ether;
        amounts[1] = 1 ether;
        outs[0] = 1;
        outs[1] = 2;

        vm.prank(forwarder);
        vm.expectRevert(QuoteCurveLib.AmountsNotStrictlyIncreasing.selector);
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1, amounts, outs));
    }

    function test_rejectsTooManyPoints() public {
        uint256 n = QuoteCurveLib.MAX_POINTS + 1;
        uint256[] memory amounts = new uint256[](n);
        uint256[] memory outs = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            amounts[i] = (i + 1) * 1 ether;
            outs[i] = (i + 1) * 100e6;
        }
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(QuoteCurveLib.TooManyPoints.selector, n));
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1, amounts, outs));
    }

    function test_aboveLast_returnsZeroZero() public {
        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        vm.prank(forwarder);
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs));

        (uint256 out, uint64 ts) = oracle.getBestOut(tokenA, tokenB, 10 ether);
        assertEq(out, 0);
        assertEq(ts, 0);
    }

    function test_applyReport_ownerOnly() public {
        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        bytes memory report = _encodeSingle(tokenA, tokenB, 1_700_000_050, amounts, outs);
        oracle.applyReport(report);
        (uint256 mid,) = oracle.getBestOut(tokenA, tokenB, 2 ether);
        assertEq(mid, 2000e6);

        vm.prank(stranger);
        vm.expectRevert(QuoteOracle.NotOwner.selector);
        oracle.applyReport(report);
    }

    function test_supportsIReceiverInterface() public view {
        assertTrue(oracle.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(oracle.supportsInterface(type(IERC165).interfaceId));
    }

    function test_setForwarder() public {
        address next = address(0xF1);
        oracle.setForwarder(next);
        assertEq(oracle.forwarder(), next);

        (uint256[] memory amounts, uint256[] memory outs) = _twoPointCurve();
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(QuoteOracle.InvalidSender.selector, forwarder, next));
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1, amounts, outs));

        vm.prank(next);
        oracle.onReport(hex"", _encodeSingle(tokenA, tokenB, 1, amounts, outs));
    }
}
