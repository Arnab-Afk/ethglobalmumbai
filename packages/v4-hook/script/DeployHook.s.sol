// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";
import {CompetitiveFeeHook, IStateView, PoolKey} from "../src/CompetitiveFeeHook.sol";

interface IPoolManager {
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}

interface IUniV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);
}

/// @notice Mines a beforeSwap-only address and deploys CompetitiveFeeHook on Sepolia v4.
contract DeployHook is Script {
    uint160 internal constant ALL_HOOK_MASK = (1 << 14) - 1;
    uint160 internal constant BEFORE_SWAP_FLAG = 1 << 7;
    uint24 internal constant DYNAMIC_FEE_FLAG = 0x800000;

    // CREATE2_FACTORY is the Arachnid deployer in forge-std. Forge broadcasts `new {salt}` through it.
    address constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address constant STATE_VIEW = 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C;
    address constant VENUE_READER = 0x95B96FeE7EBfDfdCaa400B28EFb0D008cCeA7c8F;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address constant V3_POOL_500 = 0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        CompetitiveFee.Config memory cfg = CompetitiveFee.Config({
            feeFloor: 500,
            feeCap: 10_000,
            fallbackFee: 3000,
            undercutBps: 1,
            maxQuoteAge: 120
        });

        bytes memory args = abi.encode(POOL_MANAGER, VENUE_READER, STATE_VIEW, cfg);
        bytes memory init = abi.encodePacked(type(CompetitiveFeeHook).creationCode, args);
        bytes32 initHash = keccak256(init);

        // Salt is mined off-chain (scripts/deploy-hook.mjs). A loop here blows the script gas limit.
        bytes32 salt = vm.envBytes32("HOOK_SALT");
        address predicted = vm.computeCreate2Address(salt, initHash, CREATE2_FACTORY);
        if ((uint160(predicted) & ALL_HOOK_MASK) != BEFORE_SWAP_FLAG) revert("salt flags");

        vm.startBroadcast(pk);
        CompetitiveFeeHook hook = new CompetitiveFeeHook{salt: salt}(
            POOL_MANAGER, IQuoteOracle(VENUE_READER), IStateView(STATE_VIEW), cfg
        );
        require(address(hook) == predicted, "address mismatch");

        (uint160 sqrtPriceX96,,,,,,) = IUniV3Pool(V3_POOL_500).slot0();
        int24 tick = IPoolManager(POOL_MANAGER).initialize(
            PoolKey({
                currency0: USDC,
                currency1: WETH,
                fee: DYNAMIC_FEE_FLAG,
                tickSpacing: 60,
                hooks: address(hook)
            }),
            sqrtPriceX96
        );
        vm.stopBroadcast();

        console2.log("CompetitiveFeeHook", address(hook));
        console2.log("initialized tick", tick);
    }
}
