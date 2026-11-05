// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";
import {CompetitiveFeeExtruction} from "../src/CompetitiveFeeExtruction.sol";
import {ProgramCodec} from "../src/ProgramCodec.sol";

/// @notice Deploys CompetitiveFeeExtruction against an existing IQuoteOracle.
/// @dev Env: PRIVATE_KEY, QUOTE_ORACLE (Mock or QuoteOracle address)
contract DeployExtruction is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address quoteOracle = vm.envAddress("QUOTE_ORACLE");

        uint24 feeFloor = uint24(vm.envOr("FEE_FLOOR", uint256(500)));
        uint24 feeCap = uint24(vm.envOr("FEE_CAP", uint256(10_000)));
        uint24 fallbackFee = uint24(vm.envOr("FALLBACK_FEE", uint256(3_000)));
        uint16 undercutBps = uint16(vm.envOr("UNDERCUT_BPS", uint256(1)));
        uint32 maxQuoteAge = uint32(vm.envOr("MAX_QUOTE_AGE", uint256(120)));

        vm.startBroadcast(pk);

        CompetitiveFeeExtruction target = new CompetitiveFeeExtruction(
            IQuoteOracle(quoteOracle), feeFloor, feeCap, fallbackFee, undercutBps, maxQuoteAge
        );

        vm.stopBroadcast();

        bytes memory program = ProgramCodec.competitiveExtructionProgram(address(target));

        console2.log("DEPLOYER", deployer);
        console2.log("QUOTE_ORACLE", quoteOracle);
        console2.log("CompetitiveFeeExtruction", address(target));
        console2.logBytes(program);
    }
}
