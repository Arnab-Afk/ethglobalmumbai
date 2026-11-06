// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VenueReader} from "oracle/VenueReader.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";
import {FeeUnits} from "fee-core/FeeUnits.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {ProgramCodec} from "../src/ProgramCodec.sol";
import {AquaOrder, AquaEncoding} from "../src/swapvm/Aqua.sol";
import {AquaForkConfig} from "../script/AquaForkConfig.sol";

/// @notice End-to-end on a fork against the *deployed* 1inch Aqua + AquaSwapVMRouter, priced against
///         *live* Uniswap pools (VenueReader over every v3 tier + v2). No prices are written in this file:
///         every assertion is an invariant checked against the live venue.
/// @dev Skipped unless FORK_RPC is set: `npm run test:fork`. Tune with the env in AquaForkConfig.
contract AquaForkTest is Test, AquaForkConfig {
    using FeeUnits for uint24;

    uint256 internal constant MAX_SWAPS = 64; // bound for the swap-until-we-lose loop

    Cfg internal c;
    VenueReader internal venue;
    CompetitiveFeeExtruction internal extruction;
    uint256 internal reserveIn;
    uint256 internal reserveOut;

    address internal maker = makeAddr("maker");
    address internal taker = makeAddr("taker");

    AquaOrder internal competitive;
    AquaOrder internal flatFallback; // flat fee = the configured fallback fee
    AquaOrder internal flatFloor; // flat fee = the configured floor fee

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        c = _loadCfg();
        assertGt(address(c.router).code.length, 0, "AquaSwapVMRouter not on this chain");
        assertGt(address(c.aqua).code.length, 0, "Aqua not on this chain");

        venue = _deployVenueReader(c, address(this));
        extruction =
            new CompetitiveFeeExtruction(venue, c.feeFloor, c.feeCap, c.fallbackFee, c.undercutBps, c.maxQuoteAge);
        (reserveIn, reserveOut) = _inventory(c);

        deal(c.tokenIn, maker, reserveIn);
        deal(c.tokenOut, maker, reserveOut);
        deal(c.tokenIn, taker, c.amountIn * MAX_SWAPS);

        competitive = AquaEncoding.order(maker, ProgramCodec.competitiveExtructionProgram(address(extruction)));
        flatFallback = AquaEncoding.order(maker, ProgramCodec.flatFeeXycProgram(c.fallbackFee.pipsToSwapVmBps()));
        flatFloor = AquaEncoding.order(maker, ProgramCodec.flatFeeXycProgram(c.feeFloor.pipsToSwapVmBps()));

        // Same capital backs every strategy: Aqua balances are virtual, tokens stay in the maker wallet.
        _approveAndShip(maker, competitive, reserveIn, reserveOut);
        _ship(maker, flatFallback, reserveIn, reserveOut);
        _ship(maker, flatFloor, reserveIn, reserveOut);

        vm.prank(taker);
        IERC20(c.tokenIn).approve(address(c.router), type(uint256).max);
    }

    // ---------------------------------------------------------------- helpers

    function _approveAndShip(address who, AquaOrder memory o, uint256 rIn, uint256 rOut) internal {
        vm.startPrank(who);
        IERC20(c.tokenIn).approve(address(c.aqua), type(uint256).max);
        IERC20(c.tokenOut).approve(address(c.aqua), type(uint256).max);
        vm.stopPrank();
        _ship(who, o, rIn, rOut);
    }

    function _ship(address who, AquaOrder memory o, uint256 rIn, uint256 rOut) internal {
        address[] memory tokens = new address[](2);
        uint256[] memory amts = new uint256[](2);
        (tokens[0], tokens[1]) = (c.tokenIn, c.tokenOut);
        (amts[0], amts[1]) = (rIn, rOut);
        vm.prank(who);
        bytes32 h = c.aqua.ship(address(c.router), AquaEncoding.strategy(o), tokens, amts);
        assertEq(h, c.router.hash(o), "strategy hash != order hash");
    }

    function _quote(AquaOrder memory o) internal view returns (uint256 out) {
        (, out,) = c.router.quote(o, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(0));
    }

    function _liveBestOut() internal view returns (uint256 bestOut) {
        (bestOut,) = venue.getBestOut(c.tokenIn, c.tokenOut, c.amountIn);
        assertGt(bestOut, 0, "no live venue quote");
    }

    /// @dev True when `out` beats `bestOut` by the configured undercut (what fee-core requires to win).
    function _winsBy(uint256 out, uint256 bestOut) internal view returns (bool) {
        return out * 10_000 >= bestOut * (10_000 + c.undercutBps);
    }

    // ---------------------------------------------------------------- tests

    function test_Fork_shipQuoteSwap_movesTokensThroughAqua() public {
        uint256 bestOut = _liveBestOut();
        (uint256 qIn, uint256 qOut, bytes32 orderHash) =
            c.router.quote(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(0));
        assertEq(qIn, c.amountIn);
        assertGt(qOut, bestOut, "must beat the live venue (raise AQUA_MAKER_EDGE_BPS or AQUA_DEPTH_MULTIPLE)");

        (uint24 feePips,,) = extruction.previewFeePips(c.tokenIn, c.tokenOut, c.amountIn, reserveIn, reserveOut);
        assertGe(feePips, c.feeFloor);
        assertLe(feePips, c.feeCap);

        uint256 takerIn0 = IERC20(c.tokenIn).balanceOf(taker);
        uint256 takerOut0 = IERC20(c.tokenOut).balanceOf(taker);
        uint256 makerIn0 = IERC20(c.tokenIn).balanceOf(maker);
        uint256 makerOut0 = IERC20(c.tokenOut).balanceOf(maker);

        // minOut = the quote: any move between quote and swap reverts instead of filling worse.
        vm.prank(taker);
        (uint256 sIn, uint256 sOut,) =
            c.router.swap(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(qOut));

        assertEq(sIn, c.amountIn);
        assertEq(sOut, qOut, "swap == quote");
        assertEq(IERC20(c.tokenIn).balanceOf(taker), takerIn0 - sIn);
        assertEq(IERC20(c.tokenOut).balanceOf(taker), takerOut0 + sOut);
        assertEq(IERC20(c.tokenIn).balanceOf(maker), makerIn0 + sIn);
        assertEq(IERC20(c.tokenOut).balanceOf(maker), makerOut0 - sOut);

        (uint256 aquaIn, uint256 aquaOut) =
            c.aqua.safeBalances(maker, address(c.router), orderHash, c.tokenIn, c.tokenOut);
        assertEq(aquaIn, reserveIn + sIn);
        assertEq(aquaOut, reserveOut - sOut);

        console2.log("live venue out ", bestOut);
        console2.log("neat out       ", sOut);
        console2.log("fee pips       ", feePips);
    }

    /// @dev Whenever a flat fee would also win the trade, the competitive fee keeps at least as much for the LP.
    function test_Fork_competitiveVsFlat_sameCapital() public view {
        uint256 bestOut = _liveBestOut();
        uint256 outCompetitive = _quote(competitive);
        uint256 outFallback = _quote(flatFallback);
        uint256 outFloor = _quote(flatFloor);

        assertTrue(_winsBy(outCompetitive, bestOut), "competitive must win");
        if (_winsBy(outFallback, bestOut)) assertLe(outCompetitive, outFallback, "keeps less than flat fallback");
        if (_winsBy(outFloor, bestOut)) assertLe(outCompetitive, outFloor, "keeps less than flat floor");

        console2.log("live venue out   ", bestOut);
        console2.log("flat fallback out", outFallback, _winsBy(outFallback, bestOut) ? "wins" : "loses");
        console2.log("flat floor out   ", outFloor, _winsBy(outFloor, bestOut) ? "wins" : "loses");
        console2.log("competitive out  ", outCompetitive);
    }

    /// @dev A pool that pays 1 unit less than the live venue even at zero fee: we lose, so nothing fills.
    function test_Fork_cannotBeatVenue_reverts() public {
        uint256 bestOut = _liveBestOut();
        address poorMaker = makeAddr("poorMaker");
        uint256 poorOut = (bestOut - 1) * (reserveIn + c.amountIn) / c.amountIn;
        deal(c.tokenIn, poorMaker, reserveIn);
        deal(c.tokenOut, poorMaker, poorOut);
        AquaOrder memory poor =
            AquaEncoding.order(poorMaker, ProgramCodec.competitiveExtructionProgram(address(extruction)));
        _approveAndShip(poorMaker, poor, reserveIn, poorOut);

        bytes memory data = AquaEncoding.exactInTakerData(0);
        vm.expectRevert();
        c.router.quote(poor, c.tokenIn, c.tokenOut, c.amountIn, data);

        uint256 takerIn0 = IERC20(c.tokenIn).balanceOf(taker);
        vm.prank(taker);
        vm.expectRevert();
        c.router.swap(poor, c.tokenIn, c.tokenOut, c.amountIn, data);
        assertEq(IERC20(c.tokenIn).balanceOf(taker), takerIn0, "no tokens moved");
    }

    function test_Fork_swapRevertsBelowMinOut() public {
        uint256 qOut = _quote(competitive);
        vm.prank(taker);
        vm.expectRevert();
        c.router.swap(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(qOut + 1));
    }

    /// @dev Keep swapping: every fill beats the live venue; the first trade we can't win reverts and moves nothing.
    function test_Fork_swapUntilWeLose_everyFillBeatsVenue() public {
        uint256 fills;
        for (uint256 i; i < MAX_SWAPS; ++i) {
            uint256 bestOut = _liveBestOut();
            try c.router.quote(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(0))
            returns (uint256, uint256 q, bytes32) {
                vm.prank(taker);
                (, uint256 out,) =
                    c.router.swap(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(q));
                assertGt(out, bestOut, "a fill paid less than the live venue");
                ++fills;
            } catch {
                uint256 bal = IERC20(c.tokenIn).balanceOf(taker);
                vm.prank(taker);
                vm.expectRevert();
                c.router.swap(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(0));
                assertEq(IERC20(c.tokenIn).balanceOf(taker), bal);
                break;
            }
        }
        assertGt(fills, 0, "never won a trade");
        console2.log("fills before losing to the venue", fills);
    }

    /// @dev Oracle down: no revert, the fallback fee applies (same output as the flat-fallback strategy).
    function test_Fork_oracleDown_fillsAtFallback() public {
        vm.mockCallRevert(address(venue), abi.encodeWithSelector(IQuoteOracle.getBestOut.selector), "down");
        uint256 out = _quote(competitive);
        assertEq(out, _quote(flatFallback));
        vm.prank(taker);
        c.router.swap(competitive, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(out));
    }
}
