// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockQuoteOracle} from "../src/MockQuoteOracle.sol";
import {QuoteOracle} from "../src/QuoteOracle.sol";

/// @notice Deploys MockQuoteOracle + QuoteOracle. Forwarder defaults to deployer until CRE address is known.
contract DeployOracle is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        // Optional: KEYSTONE_FORWARDER=0x... ; else deployer (demo / applyReport path)
        address forwarder = vm.envOr("KEYSTONE_FORWARDER", deployer);

        vm.startBroadcast(pk);

        MockQuoteOracle mock = new MockQuoteOracle(deployer);
        QuoteOracle oracle = new QuoteOracle(deployer, forwarder);

        vm.stopBroadcast();

        console2.log("DEPLOYER", deployer);
        console2.log("MockQuoteOracle", address(mock));
        console2.log("QuoteOracle", address(oracle));
        console2.log("forwarder", forwarder);
    }
}
