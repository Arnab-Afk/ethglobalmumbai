// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IQuoteOracle} from "../src/IQuoteOracle.sol";
import {TradePreview} from "../src/TradePreview.sol";
import {VenueReader} from "../src/VenueReader.sol";

/// @notice Deploys VenueReader and registers Sepolia Uniswap v3 WETH/USDC fee tiers.
contract DeployVenueReader is Script {
    address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant POOL_100 = 0xFeEd501c2B21D315F04946F85fC6416B640240b5;
    address constant POOL_500 = 0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1;
    address constant POOL_3000 = 0x6Ce0896eAE6D4BD668fDe41BB784548fb8F59b50;
    address constant POOL_10000 = 0x6418EEC70f50913ff0d756B48d32Ce7C02b47C47;
    address constant QUOTER_V4 = 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address fallbackOracle = vm.envOr("MOCK_QUOTE_ORACLE", address(0));

        vm.startBroadcast(pk);
        VenueReader reader = new VenueReader(deployer, IQuoteOracle(fallbackOracle));

        VenueReader.V3Venue[] memory v3 = new VenueReader.V3Venue[](4);
        v3[0] = VenueReader.V3Venue({pool: POOL_100});
        v3[1] = VenueReader.V3Venue({pool: POOL_500});
        v3[2] = VenueReader.V3Venue({pool: POOL_3000});
        v3[3] = VenueReader.V3Venue({pool: POOL_10000});
        reader.setV3Venues(WETH, USDC, v3);
        TradePreview board = new TradePreview(reader);
        vm.stopBroadcast();

        console2.log("VenueReader", address(reader));
        console2.log("TradePreview", address(board));
        console2.log("v4 quoter (not registered; hook pools need a PoolKey)", QUOTER_V4);

        (uint256 best, uint64 ts) = reader.getBestOut(WETH, USDC, 0.1 ether);
        console2.log("bestOut 0.1 WETH -> USDC", best);
        console2.log("updatedAt", ts);
    }
}
