// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {FeeLastHook} from "../src/FeeLastHook.sol";
import {FeeLastRouter} from "../src/FeeLastRouter.sol";
import {HookMiner} from "../src/HookMiner.sol";

/// @notice Deploys the hook and router against Base's existing Uniswap v4 PoolManager.
///         The broadcaster becomes the owner. Set the controller to the quote signer.
contract Deploy is Script {
    address internal constant BASE_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address controller = vm.envAddress("CONTROLLER");
        address protocol = vm.envAddress("PROTOCOL_RECIPIENT");
        uint16 protocolShareBps = uint16(vm.envOr("PROTOCOL_SHARE_BPS", uint256(2_000)));
        address broadcaster = vm.addr(pk);

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(BASE_POOL_MANAGER, broadcaster, controller, protocol, protocolShareBps);
        // forge script deploys salted contracts through the canonical CREATE2 factory,
        // not from the broadcaster. The hook permission bits have to match that deployer.
        (, bytes32 salt) = HookMiner.find(CREATE2_FACTORY, flags, type(FeeLastHook).creationCode, args);

        vm.startBroadcast(pk);
        FeeLastHook hook = new FeeLastHook{salt: salt}(
            IPoolManager(BASE_POOL_MANAGER), broadcaster, controller, protocol, protocolShareBps
        );
        FeeLastRouter router = new FeeLastRouter(IPoolManager(BASE_POOL_MANAGER), hook);
        hook.setRouter(address(router));
        vm.stopBroadcast();

        console2.log("hook", address(hook));
        console2.log("router", address(router));
    }
}
