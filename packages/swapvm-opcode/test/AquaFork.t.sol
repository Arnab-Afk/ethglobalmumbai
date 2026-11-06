// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockQuoteOracle} from "oracle/MockQuoteOracle.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {ProgramCodec} from "../src/ProgramCodec.sol";
import {
    AQUA, AQUA_SWAPVM_ROUTER, AquaOrder, AquaEncoding, IAqua, IAquaSwapVMRouter
} from "../src/swapvm/Aqua.sol";

/// @notice End-to-end on a mainnet fork against the *deployed* 1inch Aqua + AquaSwapVMRouter (v1.0.2):
///         ship a CompetitiveFeeExtruction strategy, quote it, swap real WETH -> USDC through the router.
/// @dev Skipped unless FORK_RPC is set: `FORK_RPC=https://ethereum-rpc.publicnode.com forge test --mt Fork -vv`
contract AquaForkTest is Test {
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // Maker inventory: priced at 3000 USDC/WETH, deep enough that 1 WETH at zero fee beats the competitor.
    uint256 internal constant MAKER_WETH = 100 ether;
    uint256 internal constant MAKER_USDC = 300_000e6;
    uint256 internal constant AMOUNT_IN = 1 ether;
    uint256 internal constant COMPETITOR_OUT_1 = 2_965e6; // best venue for 1 WETH

    IAqua internal aqua = IAqua(AQUA);
    IAquaSwapVMRouter internal router = IAquaSwapVMRouter(AQUA_SWAPVM_ROUTER);

    address internal maker = makeAddr("maker");
    address internal taker = makeAddr("taker");

    MockQuoteOracle internal oracle;
    CompetitiveFeeExtruction internal extruction;
    AquaOrder internal competitive;
    AquaOrder internal flat30;
    AquaOrder internal flat5;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        assertGt(AQUA.code.length, 0, "Aqua not on this chain");
        assertGt(AQUA_SWAPVM_ROUTER.code.length, 0, "AquaSwapVMRouter not on this chain");

        oracle = new MockQuoteOracle(address(this));
        uint256[] memory amounts = new uint256[](3);
        uint256[] memory outs = new uint256[](3);
        (amounts[0], amounts[1], amounts[2]) = (1 ether, 10 ether, 50 ether);
        (outs[0], outs[1], outs[2]) = (COMPETITOR_OUT_1, 29_650e6, 145_000e6);
        oracle.setCurve(WETH, USDC, amounts, outs, 0);

        // floor 5 bp, cap 100 bp, fallback 30 bp, undercut 1 bp, max quote age 300 s
        extruction = new CompetitiveFeeExtruction(oracle, 500, 10_000, 3_000, 1, 300);

        deal(WETH, maker, MAKER_WETH);
        deal(USDC, maker, MAKER_USDC);
        deal(WETH, taker, 10 ether);

        competitive = AquaEncoding.order(maker, ProgramCodec.competitiveExtructionProgram(address(extruction)));
        flat30 = AquaEncoding.order(maker, ProgramCodec.flatFeeXycProgram(3_000_000)); // 0.30%
        flat5 = AquaEncoding.order(maker, ProgramCodec.flatFeeXycProgram(500_000)); // 0.05%

        // Same capital backs both strategies: Aqua balances are virtual, tokens stay in the maker wallet.
        vm.startPrank(maker);
        IERC20(WETH).approve(AQUA, type(uint256).max);
        IERC20(USDC).approve(AQUA, type(uint256).max);
        _ship(competitive);
        _ship(flat30);
        _ship(flat5);
        vm.stopPrank();

        vm.prank(taker);
        IERC20(WETH).approve(AQUA_SWAPVM_ROUTER, type(uint256).max);
    }

    function _ship(AquaOrder memory o) internal returns (bytes32 h) {
        address[] memory tokens = new address[](2);
        uint256[] memory amts = new uint256[](2);
        (tokens[0], tokens[1]) = (WETH, USDC);
        (amts[0], amts[1]) = (MAKER_WETH, MAKER_USDC);
        h = aqua.ship(AQUA_SWAPVM_ROUTER, AquaEncoding.strategy(o), tokens, amts);
        assertEq(h, router.hash(o), "strategy hash != order hash");
    }

    function test_Fork_shipQuoteSwap_movesTokensThroughAqua() public {
        bytes memory quoteData = AquaEncoding.exactInTakerData(0);
        (uint256 qIn, uint256 qOut, bytes32 orderHash) = router.quote(competitive, WETH, USDC, AMOUNT_IN, quoteData);
        assertEq(qIn, AMOUNT_IN);
        assertGt(qOut, COMPETITOR_OUT_1, "trader must beat the best venue");

        (uint24 feePips,,) = extruction.previewFeePips(WETH, USDC, AMOUNT_IN, MAKER_WETH, MAKER_USDC);
        assertGt(feePips, 500, "fee should rise above the floor when we win");

        uint256 takerWeth0 = IERC20(WETH).balanceOf(taker);
        uint256 takerUsdc0 = IERC20(USDC).balanceOf(taker);
        uint256 makerWeth0 = IERC20(WETH).balanceOf(maker);
        uint256 makerUsdc0 = IERC20(USDC).balanceOf(maker);

        // minOut = the quote, so any price move between quote and swap reverts instead of filling worse.
        vm.prank(taker);
        (uint256 sIn, uint256 sOut,) =
            router.swap(competitive, WETH, USDC, AMOUNT_IN, AquaEncoding.exactInTakerData(qOut));

        assertEq(sIn, AMOUNT_IN);
        assertEq(sOut, qOut, "swap == quote");

        // Real ERC-20 transfers: taker -> router -> Aqua push -> maker (WETH), maker -> taker via Aqua pull (USDC).
        assertEq(IERC20(WETH).balanceOf(taker), takerWeth0 - AMOUNT_IN);
        assertEq(IERC20(USDC).balanceOf(taker), takerUsdc0 + sOut);
        assertEq(IERC20(WETH).balanceOf(maker), makerWeth0 + AMOUNT_IN);
        assertEq(IERC20(USDC).balanceOf(maker), makerUsdc0 - sOut);

        (uint256 aquaWeth, uint256 aquaUsdc) = aqua.safeBalances(maker, AQUA_SWAPVM_ROUTER, orderHash, WETH, USDC);
        assertEq(aquaWeth, MAKER_WETH + AMOUNT_IN);
        assertEq(aquaUsdc, MAKER_USDC - sOut);

        console2.log("fee pips          ", feePips);
        console2.log("competitor out    ", COMPETITOR_OUT_1);
        console2.log("neat out (swapped)", sOut);
    }

    function test_Fork_competitiveVsFlat_sameCapital() public view {
        bytes memory data = AquaEncoding.exactInTakerData(0);
        (, uint256 outCompetitive,) = router.quote(competitive, WETH, USDC, AMOUNT_IN, data);
        (, uint256 outFlat30,) = router.quote(flat30, WETH, USDC, AMOUNT_IN, data);
        (, uint256 outFlat5,) = router.quote(flat5, WETH, USDC, AMOUNT_IN, data);
        uint256 outZeroFee = (AMOUNT_IN * MAKER_USDC) / (MAKER_WETH + AMOUNT_IN);

        // Flat 30 bp loses the trade to the venue. Flat 5 bp wins it but gives away the surplus.
        // The competitive fee wins it and keeps more of the surplus than flat 5 bp.
        assertLt(outFlat30, COMPETITOR_OUT_1, "flat 30bp should lose");
        assertGt(outFlat5, COMPETITOR_OUT_1, "flat 5bp should win");
        assertGt(outCompetitive, COMPETITOR_OUT_1, "competitive should win");
        assertLt(outCompetitive, outFlat5, "competitive should keep more than flat 5bp");

        console2.log("zero-fee out     ", outZeroFee);
        console2.log("competitor out   ", COMPETITOR_OUT_1);
        console2.log("flat 30bp out    ", outFlat30);
        console2.log("flat 5bp out     ", outFlat5);
        console2.log("competitive out  ", outCompetitive);
        console2.log("LP extra vs 5bp  ", outFlat5 - outCompetitive);
    }

    function test_Fork_swapRevertsBelowMinOut() public {
        (, uint256 qOut,) = router.quote(competitive, WETH, USDC, AMOUNT_IN, AquaEncoding.exactInTakerData(0));
        vm.prank(taker);
        vm.expectRevert();
        router.swap(competitive, WETH, USDC, AMOUNT_IN, AquaEncoding.exactInTakerData(qOut + 1));
    }
}
