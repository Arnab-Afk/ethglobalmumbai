// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VenueReader} from "../src/VenueReader.sol";
import {MockQuoteOracle} from "../src/MockQuoteOracle.sol";

/// @dev Deep pool priced just above 1:1 so a v3 read beats the thin v2 pair.
contract FakeV3Pool {
    address public token0;
    address public token1;

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function slot0() external pure returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (79228162514264337593543950336 + 1e15, 0, 0, 0, 0, 0, true);
    }

    function liquidity() external pure returns (uint128) {
        return 1e24;
    }

    function tickSpacing() external pure returns (int24) {
        return 60;
    }

    function fee() external pure returns (uint24) {
        return 500;
    }

    function tickBitmap(int16) external pure returns (uint256) {
        return 0;
    }

    function ticks(int24) external pure returns (uint128, int128, uint256, uint256, int56, uint160, uint32, bool) {
        return (0, 0, 0, 0, 0, 0, 0, false);
    }
}

contract FakeV2Pair {
    address public token0;
    address public token1;
    uint112 public r0;
    uint112 public r1;

    constructor(address token0_, address token1_, uint112 r0_, uint112 r1_) {
        token0 = token0_;
        token1 = token1_;
        r0 = r0_;
        r1 = r1_;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (r0, r1, 0);
    }
}

contract VenueReaderTest is Test {
    VenueReader reader;
    MockQuoteOracle fallbackOracle;
    address tokenA = address(0xA11);
    address tokenB = address(0xB22);

    function setUp() public {
        vm.warp(1_700_000_000);
        fallbackOracle = new MockQuoteOracle(address(this));
        reader = new VenueReader(address(this), fallbackOracle);
    }

    function test_v3_beats_v2_and_stamps_now() public {
        FakeV3Pool pool = new FakeV3Pool(tokenA, tokenB);
        VenueReader.V3Venue[] memory v3 = new VenueReader.V3Venue[](1);
        v3[0] = VenueReader.V3Venue({pool: address(pool)});
        reader.setV3Venues(tokenA, tokenB, v3);

        FakeV2Pair pair = new FakeV2Pair(tokenA, tokenB, 1_000e18, 2_000e6);
        VenueReader.V2Venue[] memory v2 = new VenueReader.V2Venue[](1);
        v2[0] = VenueReader.V2Venue({pair: address(pair)});
        reader.setV2Venues(tokenA, tokenB, v2);

        (uint256 best, uint64 ts) = reader.getBestOut(tokenA, tokenB, 1e18);
        assertGt(best, 1_990e6);
        assertEq(ts, block.timestamp);
    }

    function test_live_zero_uses_fallback_oracle() public {
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory outs = new uint256[](1);
        amounts[0] = 1e18;
        outs[0] = 123e6;
        fallbackOracle.setCurve(tokenA, tokenB, amounts, outs, 0);

        (uint256 best, uint64 ts) = reader.getBestOut(tokenA, tokenB, 1e18);
        assertEq(best, 123e6);
        assertEq(ts, block.timestamp);
    }
}

