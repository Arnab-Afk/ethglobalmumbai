// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {FeeLastHook} from "./FeeLastHook.sol";

/// @notice Deposit and withdraw a FeeLast position.
/// @dev The PoolManager records this contract as the position owner. The depositing wallet
///      is recorded here and is the only address that can pull that liquidity back out.
contract FeeLastPosition is IUnlockCallback {
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;
    FeeLastHook public immutable hook;

    mapping(bytes32 positionId => uint128 liquidity) public liquidityOf;

    error NotPoolManager();
    error WrongPool();
    error ZeroLiquidity();
    error TransferFailed();

    event Deposited(address indexed lp, bytes32 indexed positionId, uint128 liquidity);
    event Withdrawn(address indexed lp, bytes32 indexed positionId, uint256 amount0, uint256 amount1);

    constructor(IPoolManager _poolManager, FeeLastHook _hook) {
        poolManager = _poolManager;
        hook = _hook;
    }

    function positionId(address lp, PoolKey calldata key, int24 tickLower, int24 tickUpper) public pure returns (bytes32) {
        return keccak256(abi.encode(lp, key.toId(), tickLower, tickUpper));
    }

    /// @notice Pull WETH and USDC from the caller and add liquidity. The caller can withdraw it.
    function deposit(PoolKey calldata key, int24 tickLower, int24 tickUpper, uint128 liquidity) external {
        if (address(key.hooks) != address(hook)) revert WrongPool();
        if (liquidity == 0) revert ZeroLiquidity();
        poolManager.unlock(abi.encode(uint8(1), msg.sender, key, tickLower, tickUpper, liquidity));
        bytes32 id = positionId(msg.sender, key, tickLower, tickUpper);
        liquidityOf[id] += liquidity;
        emit Deposited(msg.sender, id, liquidity);
    }

    /// @notice Remove the caller's liquidity and send both tokens back to that wallet.
    function withdraw(PoolKey calldata key, int24 tickLower, int24 tickUpper)
        external
        returns (uint256 amount0, uint256 amount1)
    {
        if (address(key.hooks) != address(hook)) revert WrongPool();
        bytes32 id = positionId(msg.sender, key, tickLower, tickUpper);
        uint128 liquidity = liquidityOf[id];
        if (liquidity == 0) revert ZeroLiquidity();
        liquidityOf[id] = 0;
        bytes memory result = poolManager.unlock(abi.encode(uint8(2), msg.sender, key, tickLower, tickUpper, liquidity));
        (amount0, amount1) = abi.decode(result, (uint256, uint256));
        emit Withdrawn(msg.sender, id, amount0, amount1);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint8 action, address lp, PoolKey memory key, int24 tickLower, int24 tickUpper, uint128 liquidity) =
            abi.decode(data, (uint8, address, PoolKey, int24, int24, uint128));

        int256 liquidityDelta = action == 1 ? int256(uint256(liquidity)) : -int256(uint256(liquidity));
        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: liquidityDelta,
                salt: bytes32(uint256(uint160(lp)))
            }),
            ""
        );
        _settle(key.currency0, delta.amount0(), lp);
        _settle(key.currency1, delta.amount1(), lp);

        uint256 amount0 = delta.amount0() > 0 ? uint256(uint128(delta.amount0())) : 0;
        uint256 amount1 = delta.amount1() > 0 ? uint256(uint128(delta.amount1())) : 0;
        return abi.encode(amount0, amount1);
    }

    function _settle(Currency currency, int128 amount, address lp) internal {
        if (amount < 0) {
            poolManager.sync(currency);
            _transferFrom(currency, lp, address(poolManager), uint256(uint128(-amount)));
            poolManager.settle();
        } else if (amount > 0) {
            poolManager.take(currency, lp, uint256(uint128(amount)));
        }
    }

    function _transferFrom(Currency currency, address from, address to, uint256 amount) internal {
        (bool success, bytes memory ret) = Currency.unwrap(currency)
            .call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!success || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
