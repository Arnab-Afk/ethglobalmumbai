// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockQuoteOracle} from "oracle/MockQuoteOracle.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {ProgramCodec} from "../src/ProgramCodec.sol";

/// @notice Deploy oracle + CompetitiveFeeExtruction on an Anvil mainnet fork for Aqua demo.
contract DeployFork is Script {
    // Mainnet canonicals
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockQuoteOracle mock = new MockQuoteOracle(deployer);
        CompetitiveFeeExtruction target = new CompetitiveFeeExtruction(
            mock,
            500,
            10_000,
            3_000,
            1,
            300
        );

        // WETH -> USDC curve (~docs/02 competitor levels)
        uint256[] memory amounts = new uint256[](3);
        uint256[] memory outs = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 10 ether;
        amounts[2] = 50 ether;
        outs[0] = 2_961e6;
        outs[1] = 29_610e6;
        outs[2] = 145_000e6;
        mock.setCurve(WETH, USDC, amounts, outs, 0);

        vm.stopBroadcast();

        bytes memory program = ProgramCodec.competitiveExtructionProgram(address(target));
        bytes memory programSdk = abi.encodePacked(uint8(32), uint8(21), address(target), uint8(0));

        console2.log("DEPLOYER", deployer);
        console2.log("MockQuoteOracle", address(mock));
        console2.log("CompetitiveFeeExtruction", address(target));
        console2.log("WETH", WETH);
        console2.log("USDC", USDC);
        console2.logBytes(program);
        console2.logBytes(programSdk);
    }
}
