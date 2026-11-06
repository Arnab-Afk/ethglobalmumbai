// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VenueReader} from "oracle/VenueReader.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {ProgramCodec} from "../src/ProgramCodec.sol";
import {AquaOrder, AquaEncoding} from "../src/swapvm/Aqua.sol";
import {AquaForkConfig} from "./AquaForkConfig.sol";

/// @notice Broadcast demo for an Anvil fork (run via scripts/aqua-fork.sh): price against live Uniswap
///         (VenueReader), ship a CompetitiveFeeExtruction strategy to the live Aqua registry, then swap
///         through the deployed AquaSwapVMRouter. Every step is a real tx. Config: see AquaForkConfig.
/// @dev Env: MAKER_KEY, TAKER_KEY. `plan()` prints the balances the runner must fund first.
contract AquaForkDemo is Script, AquaForkConfig {
    /// @notice Prints `FUND <token> <holder> <amount>` lines for the runner. No transactions.
    function plan() external view {
        Cfg memory c = _loadCfg();
        (uint256 reserveIn, uint256 reserveOut) = _inventory(c);
        address maker = vm.addr(vm.envUint("MAKER_KEY"));
        address taker = vm.addr(vm.envUint("TAKER_KEY"));
        console2.log(string.concat("FUND ", vm.toString(c.tokenIn), " ", vm.toString(maker), " ", vm.toString(reserveIn)));
        console2.log(string.concat("FUND ", vm.toString(c.tokenOut), " ", vm.toString(maker), " ", vm.toString(reserveOut)));
        console2.log(string.concat("FUND ", vm.toString(c.tokenIn), " ", vm.toString(taker), " ", vm.toString(c.amountIn)));
    }

    struct Deployed {
        VenueReader venue;
        CompetitiveFeeExtruction extruction;
        AquaOrder order;
        bytes32 strategyHash;
        uint256 reserveIn;
        uint256 reserveOut;
    }

    function run() external {
        Cfg memory c = _loadCfg();
        Deployed memory d = _makerSetup(c, vm.envUint("MAKER_KEY"));
        _takerSwap(c, d, vm.envUint("TAKER_KEY"));
    }

    /// @dev Maker: live venue reader, fee contract, strategy shipped to Aqua.
    function _makerSetup(Cfg memory c, uint256 makerKey) internal returns (Deployed memory d) {
        address maker = vm.addr(makerKey);
        (d.reserveIn, d.reserveOut) = _inventory(c);
        vm.startBroadcast(makerKey);
        d.venue = _deployVenueReader(c, maker);
        d.extruction =
            new CompetitiveFeeExtruction(d.venue, c.feeFloor, c.feeCap, c.fallbackFee, c.undercutBps, c.maxQuoteAge);
        d.order = AquaEncoding.order(maker, ProgramCodec.competitiveExtructionProgram(address(d.extruction)));
        IERC20(c.tokenIn).approve(address(c.aqua), type(uint256).max);
        IERC20(c.tokenOut).approve(address(c.aqua), type(uint256).max);
        address[] memory tokens = new address[](2);
        uint256[] memory amts = new uint256[](2);
        (tokens[0], tokens[1]) = (c.tokenIn, c.tokenOut);
        (amts[0], amts[1]) = (d.reserveIn, d.reserveOut);
        d.strategyHash = c.aqua.ship(address(c.router), AquaEncoding.strategy(d.order), tokens, amts);
        vm.stopBroadcast();
    }

    /// @dev Taker: quote against the live venue, then swap with minOut = quote.
    function _takerSwap(Cfg memory c, Deployed memory d, uint256 takerKey) internal {
        (uint256 bestOut,) = d.venue.getBestOut(c.tokenIn, c.tokenOut, c.amountIn);
        (, uint256 quoted,) =
            c.router.quote(d.order, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(0));
        (uint24 feePips,,) =
            d.extruction.previewFeePips(c.tokenIn, c.tokenOut, c.amountIn, d.reserveIn, d.reserveOut);

        vm.startBroadcast(takerKey);
        IERC20(c.tokenIn).approve(address(c.router), c.amountIn);
        (, uint256 amountOut,) =
            c.router.swap(d.order, c.tokenIn, c.tokenOut, c.amountIn, AquaEncoding.exactInTakerData(quoted));
        vm.stopBroadcast();

        require(amountOut == quoted && amountOut > bestOut, "demo: did not beat the live venue");

        console2.log("VenueReader (live Uniswap) ", address(d.venue));
        console2.log("mid-price pool             ", _deepestV3Pool(c));
        console2.log("CompetitiveFeeExtruction   ", address(d.extruction));
        console2.log("strategy hash");
        console2.logBytes32(d.strategyHash);
        console2.log("amount in (raw)            ", c.amountIn);
        console2.log("live venue out (raw)       ", bestOut);
        console2.log("neat out (raw)             ", amountOut);
        console2.log("fee (pips, 1e6 = 100%)     ", feePips);
    }
}
