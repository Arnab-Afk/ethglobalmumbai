// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FeeLastHook} from "../src/FeeLastHook.sol";
import {FeeLastPosition} from "../src/FeeLastPosition.sol";

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IQuoterV2 {
    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

struct QuoteExactInputSingleParams {
    address tokenIn;
    address tokenOut;
    uint256 amountIn;
    uint24 fee;
    uint160 sqrtPriceLimitX96;
}

interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);

    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1);
}

/// @notice Buys AXIS with USDC directly from the Uniswap v3 0.05% pool.
contract AxisBuyer {
    address internal constant POOL = 0xE1bfc5ADa1125718B53B2affC638Ba9981f6070F;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function buy(uint256 amountIn, uint256 amountOutMin) external returns (uint256 amountOut) {
        (int256 amount0,) = IUniswapV3Pool(POOL).swap(
            msg.sender, false, int256(amountIn), TickMath.MAX_SQRT_PRICE - 1, abi.encode(msg.sender)
        );
        require(amount0 < 0, "no AXIS");
        amountOut = uint256(-amount0);
        require(amountOut >= amountOutMin, "slippage");
    }

    function uniswapV3SwapCallback(int256, int256 amount1Delta, bytes calldata data) external {
        require(msg.sender == POOL, "pool");
        require(amount1Delta > 0, "delta");
        address payer = abi.decode(data, (address));
        require(IERC20(USDC).transferFrom(payer, POOL, uint256(amount1Delta)), "pay");
    }
}

/// @notice Spend 10.5 USDC on AXIS, then open a narrow fee-0 pool on the deployed hook.
contract OpenAxisPool is Script {
    address internal constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address internal constant HOOK = 0x8efBdAed7Da3dB6250d4cD66b47aF20596C9aAC4;
    address internal constant QUOTER = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;
    address internal constant V3_POOL = 0xE1bfc5ADa1125718B53B2affC638Ba9981f6070F;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant AXIS = 0x5bE75e3b0aFf5D1A042A5363Ae36AcB1d6d755ea;

    uint256 internal constant SPEND = 10_500_000;
    uint256 internal constant Q96 = 2 ** 96;
    int24 internal constant WIDTH = 60;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);

        (uint256 quoted,,,) = IQuoterV2(QUOTER).quoteExactInputSingle(
            QuoteExactInputSingleParams({
                tokenIn: USDC, tokenOut: AXIS, amountIn: SPEND, fee: 500, sqrtPriceLimitX96: 0
            })
        );
        uint256 minOut = quoted * 97 / 100;

        vm.startBroadcast(pk);
        AxisBuyer buyer = new AxisBuyer();
        FeeLastPosition position = new FeeLastPosition(IPoolManager(POOL_MANAGER), FeeLastHook(HOOK));
        require(IERC20(USDC).approve(address(buyer), SPEND), "approve buyer");
        uint256 axisBought = buyer.buy(SPEND, minOut);

        (uint160 sqrtPrice, int24 tick,,,,,) = IUniswapV3Pool(V3_POOL).slot0();
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(AXIS),
            currency1: Currency.wrap(USDC),
            fee: 0,
            tickSpacing: 1,
            hooks: IHooks(HOOK)
        });
        IPoolManager(POOL_MANAGER).initialize(key, sqrtPrice);

        int24 lower = tick;
        int24 upper = tick + WIDTH;
        uint256 axisAmount = IERC20(AXIS).balanceOf(me) * 98 / 100;
        uint256 usdcAmount = IERC20(USDC).balanceOf(me) * 98 / 100;
        uint128 liquidity = _liquidity(sqrtPrice, lower, upper, axisAmount, usdcAmount);

        require(IERC20(AXIS).approve(address(position), type(uint256).max), "approve axis");
        require(IERC20(USDC).approve(address(position), type(uint256).max), "approve usdc");
        position.deposit(key, lower, upper, liquidity);
        vm.stopBroadcast();

        console2.log("buyer", address(buyer));
        console2.log("position", address(position));
        console2.log("axisBought", axisBought);
        console2.log("liquidity", liquidity);
        console2.log("lower", vm.toString(lower));
        console2.log("upper", vm.toString(upper));
        console2.log("axisLeft", IERC20(AXIS).balanceOf(me));
        console2.log("usdcLeft", IERC20(USDC).balanceOf(me));
    }

    function _liquidity(uint160 sqrtPrice, int24 lower, int24 upper, uint256 axisAmount, uint256 usdcAmount)
        internal
        pure
        returns (uint128)
    {
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(lower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(upper);
        require(sqrtPrice > sqrtLower && sqrtPrice < sqrtUpper, "price outside");

        uint256 l0 = FullMath.mulDiv(axisAmount, sqrtPrice, Q96);
        l0 = FullMath.mulDiv(l0, sqrtUpper, uint256(sqrtUpper) - uint256(sqrtPrice));
        uint256 l1 = FullMath.mulDiv(usdcAmount, Q96, uint256(sqrtPrice) - uint256(sqrtLower));
        uint256 liquidity = l0 < l1 ? l0 : l1;
        require(liquidity > 0 && liquidity <= type(uint128).max, "liquidity");
        return uint128(liquidity);
    }
}
