// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {MockQuoteOracle} from "oracle/MockQuoteOracle.sol";
import {CompetitiveFeeHook, IStateView, PoolKey, SwapParams} from "../src/CompetitiveFeeHook.sol";

contract MockStateView {
    uint160 public sqrtP = uint160(1 << 96);
    uint128 public liq = 1e24;

    function getSlot0(bytes32) external view returns (uint160, int24, uint24, uint24) {
        return (sqrtP, 0, 0, 0);
    }

    function getLiquidity(bytes32) external view returns (uint128) {
        return liq;
    }
}

contract CompetitiveFeeHookTest is Test {
    uint160 internal constant BEFORE_SWAP_FLAG = 1 << 7;
    uint160 internal constant ALL_HOOK_MASK = (1 << 14) - 1;
    uint24 internal constant OVERRIDE_FEE_FLAG = 0x400000;

    MockQuoteOracle internal oracle;
    MockStateView internal stateView;
    CompetitiveFeeHook internal hook;
    CompetitiveFee.Config internal cfg;

    address internal token0 = address(0xA11);
    address internal token1 = address(0xB22);

    function setUp() public {
        vm.warp(1_700_000_000);
        oracle = new MockQuoteOracle(address(this));
        stateView = new MockStateView();
        cfg = CompetitiveFee.Config({feeFloor: 500, feeCap: 10_000, fallbackFee: 3000, undercutBps: 1, maxQuoteAge: 300});
        hook = _deploy();
    }

    function test_beforeSwap_overridesFeeFromFeeCore() public {
        uint256 amountIn = 1e18;
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory outs = new uint256[](1);
        amounts[0] = amountIn;
        outs[0] = 0.99e18;
        oracle.setCurve(token0, token1, amounts, outs, 0);

        (bytes4 sel, int256 delta, uint24 returned) = hook.beforeSwap(
            address(this),
            _key(),
            SwapParams({zeroForOne: true, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: 0}),
            ""
        );

        uint24 fee = returned & ~OVERRIDE_FEE_FLAG;
        uint24 expected = CompetitiveFee.compute(amountIn, 1e24, 1e24, 0.99e18, uint64(block.timestamp), cfg);
        assertEq(sel, CompetitiveFeeHook.beforeSwap.selector);
        assertEq(delta, 0);
        assertEq(returned & OVERRIDE_FEE_FLAG, OVERRIDE_FEE_FLAG);
        assertEq(fee, expected);
        assertGt(fee, cfg.feeFloor);
        assertLt(fee, cfg.feeCap);
    }

    function test_exactOut_usesFallback() public {
        (,, uint24 returned) = hook.beforeSwap(
            address(this),
            _key(),
            SwapParams({zeroForOne: true, amountSpecified: int256(1e18), sqrtPriceLimitX96: 0}),
            ""
        );
        assertEq(returned & ~OVERRIDE_FEE_FLAG, cfg.fallbackFee);
    }

    function test_oracleDown_usesFallback() public {
        (,, uint24 returned) = hook.beforeSwap(
            address(this),
            _key(),
            SwapParams({zeroForOne: true, amountSpecified: -int256(1e18), sqrtPriceLimitX96: 0}),
            ""
        );
        assertEq(returned & ~OVERRIDE_FEE_FLAG, cfg.fallbackFee);
    }

    function test_strangerCannotCall() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(CompetitiveFeeHook.NotPoolManager.selector);
        hook.beforeSwap(address(this), _key(), SwapParams({zeroForOne: true, amountSpecified: -1, sqrtPriceLimitX96: 0}), "");
    }

    function _key() private view returns (PoolKey memory) {
        return PoolKey({currency0: token0, currency1: token1, fee: 0x800000, tickSpacing: 60, hooks: address(hook)});
    }

    function _deploy() private returns (CompetitiveFeeHook deployed) {
        bytes memory args = abi.encode(address(this), address(oracle), address(stateView), cfg);
        bytes memory init = abi.encodePacked(type(CompetitiveFeeHook).creationCode, args);
        bytes32 initHash = keccak256(init);
        for (uint256 i; i < 200_000; ++i) {
            bytes32 salt = bytes32(i);
            address predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initHash)))));
            if ((uint160(predicted) & ALL_HOOK_MASK) == BEFORE_SWAP_FLAG) {
                deployed = new CompetitiveFeeHook{salt: salt}(address(this), oracle, IStateView(address(stateView)), cfg);
                return deployed;
            }
        }
        revert("salt not found");
    }
}
