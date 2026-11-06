// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FeeLastHook} from "../../src/FeeLastHook.sol";
import {FeeLastRouter} from "../../src/FeeLastRouter.sol";
import {HookMiner} from "../../src/HookMiner.sol";

contract BrickERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// @notice Fees waiting to be paid must not freeze a pool that has no in-range liquidity.
contract FlushBrickTest is Test, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    uint256 internal constant PK = 1;
    int24 internal constant SPACING = 60;
    uint128 internal constant AMOUNT_IN = 1e18;

    PoolManager internal manager;
    FeeLastHook internal hook;
    FeeLastRouter internal router;
    BrickERC20 internal token0;
    BrickERC20 internal token1;
    PoolKey internal pool;

    function setUp() public {
        address controller = vm.addr(PK);
        address protocol = makeAddr("protocol");
        manager = new PoolManager(address(this));

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(manager, address(this), controller, protocol, uint16(2_000));
        (, bytes32 salt) = HookMiner.find(address(this), flags, type(FeeLastHook).creationCode, args);
        hook = new FeeLastHook{salt: salt}(IPoolManager(address(manager)), address(this), controller, protocol, 2_000);
        router = new FeeLastRouter(manager, hook);
        hook.setRouter(address(router));

        BrickERC20 a = new BrickERC20();
        BrickERC20 b = new BrickERC20();
        if (address(a) < address(b)) {
            token0 = a;
            token1 = b;
        } else {
            token0 = b;
            token1 = a;
        }
        pool = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: 0,
            tickSpacing: SPACING,
            hooks: IHooks(address(hook))
        });
        manager.initialize(pool, TickMath.getSqrtPriceAtTick(0));
        token0.mint(address(this), 1e30);
        token1.mint(address(this), 1e30);
        token0.approve(address(router), type(uint256).max);
        token1.approve(address(router), type(uint256).max);

        _modify(-600, 600, int256(1e21), 0);
        _modify(6_000, 6_600, int256(1e18), bytes32(uint256(1)));
    }

    function test_emptyRangeDoesNotLockThePool() public {
        uint256 gross = _swap(50_000, 1, type(uint256).max, 1);
        assertGt(gross, 1);
        uint256 pending = hook.pending1(pool.toId());
        assertGt(pending, 0);

        // Same timestamp: the in-range LP leaves. The fee payout is deferred.
        _modify(-600, 600, -int256(1e21), 0);

        vm.warp(block.timestamp + 1);

        // The parked LP can still leave, and the fees stay on the hook.
        uint256 parkedBefore = token0.balanceOf(address(this));
        _modify(6_000, 6_600, -int256(1e18), bytes32(uint256(1)));
        assertGt(token0.balanceOf(address(this)), parkedBefore);
        assertEq(hook.pending1(pool.toId()), pending);
        assertEq(token1.balanceOf(address(hook)), pending);

        // Liquidity can be added at the current price again.
        _modify(-600, 600, int256(1e21), bytes32(uint256(2)));

        hook.flush(pool);
        assertEq(hook.pending1(pool.toId()), 0);
        assertEq(token1.balanceOf(address(hook)), 0);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        (int24 lower, int24 upper, int256 liquidityDelta, bytes32 salt) =
            abi.decode(data, (int24, int24, int256, bytes32));
        (BalanceDelta delta,) = manager.modifyLiquidity(
            pool,
            IPoolManager.ModifyLiquidityParams({
                tickLower: lower, tickUpper: upper, liquidityDelta: liquidityDelta, salt: salt
            }),
            ""
        );
        _settle(pool.currency0, delta.amount0());
        _settle(pool.currency1, delta.amount1());
        return "";
    }

    function _swap(uint24 feePips, uint256 minOut, uint256 maxGross, uint64 nonce) internal returns (uint256) {
        FeeLastHook.Quote memory quote = FeeLastHook.Quote({
            poolId: PoolId.unwrap(pool.toId()),
            swapper: address(this),
            zeroForOne: true,
            amountIn: AMOUNT_IN,
            feePips: feePips,
            minOut: minOut,
            maxGrossOut: maxGross,
            nonce: nonce,
            deadline: block.timestamp + 60
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, hook.hashQuote(quote));
        return router.swapExactInput(pool, quote, abi.encodePacked(r, s, v));
    }

    function _modify(int24 lower, int24 upper, int256 liquidityDelta, bytes32 salt) internal {
        manager.unlock(abi.encode(lower, upper, liquidityDelta, salt));
    }

    function _settle(Currency currency, int128 amount) internal {
        if (amount < 0) {
            manager.sync(currency);
            BrickERC20(Currency.unwrap(currency)).transfer(address(manager), uint256(uint128(-amount)));
            manager.settle();
        } else if (amount > 0) {
            manager.take(currency, address(this), uint256(uint128(amount)));
        }
    }
}
