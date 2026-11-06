// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FeeLastHook} from "./FeeLastHook.sol";

/// @notice Exact-input router for FeeLastHook pools.
/// @dev The signed quote names the swapper. Only that address can submit it, and the
///      hook accepts swaps only from this router. Send the transaction through a private
///      relay so the signed fee is not visible to the public mempool before inclusion.
contract FeeLastRouter is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    FeeLastHook public immutable hook;

    error NotPoolManager();
    error NotSwapper();
    error WrongPool();
    error TransferFailed();

    constructor(IPoolManager _poolManager, FeeLastHook _hook) {
        poolManager = _poolManager;
        hook = _hook;
    }

    function swapExactInput(PoolKey calldata key, FeeLastHook.Quote calldata quote, bytes calldata signature)
        external
        returns (uint256 amountOut)
    {
        if (msg.sender != quote.swapper) revert NotSwapper();
        if (address(key.hooks) != address(hook)) revert WrongPool();
        if (quote.poolId != PoolId.unwrap(key.toId())) revert WrongPool();

        bytes memory result = poolManager.unlock(abi.encode(msg.sender, key, quote, signature));
        amountOut = abi.decode(result, (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (address swapper, PoolKey memory key, FeeLastHook.Quote memory quote, bytes memory signature) =
            abi.decode(data, (address, PoolKey, FeeLastHook.Quote, bytes));

        Currency input = quote.zeroForOne ? key.currency0 : key.currency1;
        Currency output = quote.zeroForOne ? key.currency1 : key.currency0;

        poolManager.sync(input);
        _transferFrom(input, swapper, address(poolManager), quote.amountIn);
        poolManager.settle();

        BalanceDelta delta = poolManager.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: quote.zeroForOne,
                amountSpecified: -int256(uint256(quote.amountIn)),
                sqrtPriceLimitX96: quote.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            abi.encode(quote, signature)
        );

        int128 specified = quote.zeroForOne ? delta.amount0() : delta.amount1();
        int128 unspecified = quote.zeroForOne ? delta.amount1() : delta.amount0();
        uint256 usedIn = uint256(uint128(-specified));
        uint256 amountOut = uint256(uint128(unspecified));

        if (quote.amountIn > usedIn) {
            poolManager.take(input, swapper, quote.amountIn - usedIn);
        }
        if (amountOut != 0) poolManager.take(output, swapper, amountOut);
        return abi.encode(amountOut);
    }

    function _transferFrom(Currency currency, address from, address to, uint256 amount) internal {
        (bool success, bytes memory ret) = Currency.unwrap(currency)
            .call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!success || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
