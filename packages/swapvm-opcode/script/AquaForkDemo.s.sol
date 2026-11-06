// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockQuoteOracle} from "oracle/MockQuoteOracle.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {ProgramCodec} from "../src/ProgramCodec.sol";
import {
    AQUA, AQUA_SWAPVM_ROUTER, AquaOrder, AquaEncoding, IAqua, IAquaSwapVMRouter
} from "../src/swapvm/Aqua.sol";

interface IWETH {
    function deposit() external payable;
}

/// @notice Broadcast demo for an Anvil mainnet fork (run via scripts/aqua-fork.sh):
///         deploy oracle + CompetitiveFeeExtruction, ship the strategy to the live Aqua registry,
///         then swap 1 WETH -> USDC through the deployed AquaSwapVMRouter. Every step is a real tx.
/// @dev Env: MAKER_KEY, TAKER_KEY (Anvil dev keys). The maker must already hold MAKER_USDC.
contract AquaForkDemo is Script {
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    uint256 internal constant MAKER_WETH = 100 ether;
    uint256 internal constant MAKER_USDC = 300_000e6;
    uint256 internal constant AMOUNT_IN = 1 ether;
    uint256 internal constant COMPETITOR_OUT_1 = 2_965e6;

    function run() external {
        uint256 makerKey = vm.envUint("MAKER_KEY");
        uint256 takerKey = vm.envUint("TAKER_KEY");
        address maker = vm.addr(makerKey);
        address taker = vm.addr(takerKey);
        IAquaSwapVMRouter router = IAquaSwapVMRouter(AQUA_SWAPVM_ROUTER);

        // ---- maker: price feed, fee contract, inventory, strategy ----
        vm.startBroadcast(makerKey);
        MockQuoteOracle oracle = new MockQuoteOracle(maker);
        uint256[] memory amounts = new uint256[](3);
        uint256[] memory outs = new uint256[](3);
        (amounts[0], amounts[1], amounts[2]) = (1 ether, 10 ether, 50 ether);
        (outs[0], outs[1], outs[2]) = (COMPETITOR_OUT_1, 29_650e6, 145_000e6);
        oracle.setCurve(WETH, USDC, amounts, outs, 0);

        CompetitiveFeeExtruction extruction = new CompetitiveFeeExtruction(oracle, 500, 10_000, 3_000, 1, 300);
        AquaOrder memory order =
            AquaEncoding.order(maker, ProgramCodec.competitiveExtructionProgram(address(extruction)));

        IWETH(WETH).deposit{value: MAKER_WETH}();
        IERC20(WETH).approve(AQUA, type(uint256).max);
        IERC20(USDC).approve(AQUA, type(uint256).max);

        address[] memory tokens = new address[](2);
        uint256[] memory amts = new uint256[](2);
        (tokens[0], tokens[1]) = (WETH, USDC);
        (amts[0], amts[1]) = (MAKER_WETH, MAKER_USDC);
        bytes32 strategyHash = IAqua(AQUA).ship(AQUA_SWAPVM_ROUTER, AquaEncoding.strategy(order), tokens, amts);
        vm.stopBroadcast();

        // ---- taker: quote, then swap with minOut = quote ----
        (, uint256 quoted,) = router.quote(order, WETH, USDC, AMOUNT_IN, AquaEncoding.exactInTakerData(0));
        (uint24 feePips,,) = extruction.previewFeePips(WETH, USDC, AMOUNT_IN, MAKER_WETH, MAKER_USDC);

        vm.startBroadcast(takerKey);
        IWETH(WETH).deposit{value: AMOUNT_IN}();
        IERC20(WETH).approve(AQUA_SWAPVM_ROUTER, AMOUNT_IN);
        (, uint256 amountOut,) = router.swap(order, WETH, USDC, AMOUNT_IN, AquaEncoding.exactInTakerData(quoted));
        vm.stopBroadcast();

        require(amountOut == quoted && amountOut > COMPETITOR_OUT_1, "demo: did not beat the venue");

        console2.log("maker                   ", maker);
        console2.log("taker                   ", taker);
        console2.log("MockQuoteOracle         ", address(oracle));
        console2.log("CompetitiveFeeExtruction", address(extruction));
        console2.log("strategy hash");
        console2.logBytes32(strategyHash);
        console2.log("competitor out (USDC 6d)", COMPETITOR_OUT_1);
        console2.log("neat out       (USDC 6d)", amountOut);
        console2.log("fee (pips, 1e6 = 100%)  ", feePips);
    }
}
