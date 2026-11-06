// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";
import {MockQuoteOracle} from "oracle/MockQuoteOracle.sol";
import {DemoToken} from "../src/DemoToken.sol";
import {DevnetCompetitivePool} from "../src/DevnetCompetitivePool.sol";

contract RevertingOracle is IQuoteOracle {
    function getBestOut(address, address, uint256) external pure returns (uint256, uint64) {
        revert("down");
    }
}

contract DevnetCompetitivePoolTest is Test {
    DemoToken weth;
    DemoToken usdc;
    MockQuoteOracle oracle;
    DevnetCompetitivePool pool;
    address trader = address(0xBEEF);

    CompetitiveFee.Config cfg =
        CompetitiveFee.Config({feeFloor: 500, feeCap: 10_000, fallbackFee: 3000, undercutBps: 1, maxQuoteAge: 300});

    function setUp() public {
        vm.warp(1_000_000);
        weth = new DemoToken("Demo WETH", "dWETH", 18);
        usdc = new DemoToken("Demo USDC", "dUSDC", 6);
        oracle = new MockQuoteOracle(address(this));
        pool = new DevnetCompetitivePool(weth, usdc, oracle, cfg);
        // docs/02 worked example: x = 1,000 ETH, y = 3,000,000 USDC
        weth.mint(address(pool), 1_000e18);
        usdc.mint(address(pool), 3_000_000e6);
        _setCurve(29_610e6);
    }

    function _setCurve(uint256 bestOutAt10) internal {
        uint256[] memory a = new uint256[](2);
        uint256[] memory b = new uint256[](2);
        (a[0], a[1]) = (1e18, 10e18);
        (b[0], b[1]) = (bestOutAt10 / 10, bestOutAt10);
        oracle.setCurve(address(weth), address(usdc), a, b, 0);
    }

    function _swap(uint256 amountIn, uint256 minOut) internal returns (uint256) {
        weth.mint(trader, amountIn);
        vm.startPrank(trader);
        weth.approve(address(pool), amountIn);
        uint256 out = pool.swap(address(weth), amountIn, minOut);
        vm.stopPrank();
        return out;
    }

    function test_workedExample_feeNear3060Pips_andTraderBeatsBestVenue() public {
        (uint256 quoted, uint24 fee, uint256 bestOut,) = pool.quote(address(weth), 10e18);
        assertApproxEqAbs(fee, 3060, 5);
        uint256 out = _swap(10e18, 0);
        assertEq(out, quoted, "quote == swap");
        assertGe(out, bestOut, "trader >= best venue");
        assertEq(usdc.balanceOf(trader), out);
    }

    function test_deadline_reverts() public {
        weth.mint(trader, 10e18);
        vm.prank(trader);
        weth.approve(address(pool), 10e18);
        vm.prank(trader);
        vm.expectRevert(abi.encodeWithSelector(DevnetCompetitivePool.Expired.selector, block.timestamp - 1));
        pool.swap(address(weth), 10e18, 0, block.timestamp - 1);
    }

    function test_priceMoves_cannotBeatVenue_reverts() public {
        (uint256 quoted,,,) = pool.quote(address(weth), 10e18);
        // Competitor suddenly pays more than our whole reserve can beat.
        _setCurve(quoted + 1_000_000e6);
        (uint256 nowOut,, uint256 bestNow,) = pool.quote(address(weth), 10e18);
        weth.mint(trader, 10e18);
        vm.startPrank(trader);
        weth.approve(address(pool), 10e18);
        vm.expectRevert(abi.encodeWithSelector(DevnetCompetitivePool.CannotBeatVenue.selector, nowOut, bestNow));
        pool.swap(address(weth), 10e18, 0);
        vm.stopPrank();
    }

    function test_minOutGuard_reverts() public {
        (uint256 quoted,,,) = pool.quote(address(weth), 10e18);
        weth.mint(trader, 10e18);
        vm.startPrank(trader);
        weth.approve(address(pool), 10e18);
        vm.expectRevert(abi.encodeWithSelector(DevnetCompetitivePool.InsufficientOutput.selector, quoted, quoted + 1));
        pool.swap(address(weth), 10e18, quoted + 1);
        vm.stopPrank();
    }

    function test_frontRunMovesPrice_minOutProtectsTrader() public {
        (uint256 quoted,,,) = pool.quote(address(weth), 10e18);
        // attacker front-runs in the same direction
        address attacker = address(0xBAD);
        weth.mint(attacker, 50e18);
        vm.startPrank(attacker);
        weth.approve(address(pool), 50e18);
        pool.swap(address(weth), 50e18, 0);
        vm.stopPrank();

        weth.mint(trader, 10e18);
        vm.startPrank(trader);
        weth.approve(address(pool), 10e18);
        vm.expectRevert();
        pool.swap(address(weth), 10e18, quoted);
        vm.stopPrank();
    }

    function test_staleQuote_usesFallback() public {
        vm.warp(block.timestamp + 301);
        (, uint24 fee,,) = pool.quote(address(weth), 10e18);
        assertEq(fee, cfg.fallbackFee);
    }

    function test_oracleDown_usesFallback_noRevert() public {
        DevnetCompetitivePool p2 = new DevnetCompetitivePool(weth, usdc, new RevertingOracle(), cfg);
        weth.mint(address(p2), 1_000e18);
        usdc.mint(address(p2), 3_000_000e6);
        (, uint24 fee,,) = p2.quote(address(weth), 10e18);
        assertEq(fee, cfg.fallbackFee);
    }

    function test_badToken_reverts() public {
        vm.expectRevert(abi.encodeWithSelector(DevnetCompetitivePool.BadToken.selector, address(0x1)));
        pool.quote(address(0x1), 1e18);
    }

    /// Whenever we can win (fee not clamped at cap), the trader gets >= the competitor's output.
    function testFuzz_traderNeverWorseThanBestVenue(uint256 amountIn, uint256 bestAt10) public {
        amountIn = bound(amountIn, 1e15, 10e18);
        bestAt10 = bound(bestAt10, 20_000e6, 29_700e6);
        _setCurve(bestAt10);
        (uint256 out, uint24 fee, uint256 bestOut, uint256 q0) = pool.quote(address(weth), amountIn);
        uint256 target = bestOut + (bestOut * cfg.undercutBps + 9_999) / 10_000;
        if (q0 > target && fee < cfg.feeCap && fee > cfg.feeFloor) {
            assertGe(out, bestOut);
        }
        assertGe(fee, cfg.feeFloor);
        assertLe(fee, cfg.feeCap);
    }
}
