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
import {FeeLastHook} from "../src/FeeLastHook.sol";
import {FeeLastRouter} from "../src/FeeLastRouter.sol";
import {FeeMath} from "../src/FeeMath.sol";
import {HookMiner} from "../src/HookMiner.sol";

contract TestERC20 {
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

/// @notice Proves the hook charges the largest pip fee that still beats a rival pool.
contract FeeLastTest is Test, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    uint256 internal constant PK = 1;
    uint16 internal constant PROTOCOL_BPS = 2_000;
    int24 internal constant SPACING = 60;
    uint128 internal constant LIQUIDITY = 1e21;
    uint128 internal constant AMOUNT_IN = 1e18;

    PoolManager internal manager;
    FeeLastHook internal hook;
    FeeLastRouter internal router;
    TestERC20 internal token0;
    TestERC20 internal token1;
    address internal controller;
    address internal protocol;

    PoolKey internal pool;
    PoolKey internal mirror;
    PoolKey internal rival;

    function setUp() public {
        controller = vm.addr(PK);
        protocol = makeAddr("protocol");
        manager = new PoolManager(address(this));

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(manager, address(this), controller, protocol, PROTOCOL_BPS);
        (, bytes32 salt) = HookMiner.find(address(this), flags, type(FeeLastHook).creationCode, args);
        hook = new FeeLastHook{salt: salt}(IPoolManager(address(manager)), address(this), controller, protocol, PROTOCOL_BPS);
        router = new FeeLastRouter(manager, hook);
        hook.setRouter(address(router));

        TestERC20 a = new TestERC20();
        TestERC20 b = new TestERC20();
        if (address(a) < address(b)) {
            token0 = a;
            token1 = b;
        } else {
            token0 = b;
            token1 = a;
        }

        pool = _key(address(hook), 0);
        mirror = _key(address(0), 0);
        rival = _key(address(0), 3000);

        uint160 price = TickMath.getSqrtPriceAtTick(0);
        manager.initialize(pool, price);
        manager.initialize(mirror, price);
        manager.initialize(rival, price);

        int24 lower = -600;
        int24 upper = 600;
        _mint(address(this), 1e30);
        _modify(pool, lower, upper, int256(uint256(LIQUIDITY)));
        _modify(mirror, lower, upper, int256(uint256(LIQUIDITY)));
        _modify(rival, lower, upper, int256(uint256(LIQUIDITY)));
        token0.approve(address(router), type(uint256).max);
        token1.approve(address(router), type(uint256).max);
    }

    function test_chargesTheLargestFeeThatStillBeatsTheRival() public {
        uint256 gross = _vanillaOut(mirror);
        uint256 rivalOut = _vanillaOut(rival);
        assertGt(gross, rivalOut, "zero-fee curve must be able to win");

        uint256 minOut = FeeMath.minOutToBeat(rivalOut, 0);
        uint24 feePips = FeeMath.feeFromSurplus(gross, minOut);
        assertGt(feePips, 0);

        uint256 before = token1.balanceOf(address(this));
        uint256 received = _swapSigned(feePips, minOut, gross, 1, block.timestamp + 60);
        assertEq(token1.balanceOf(address(this)) - before, received);
        assertGe(received, minOut);
        assertLt(received, gross);

        uint256 charged = gross - received;
        assertEq(charged, FeeMath.feeTaken(gross, feePips));
        assertLt(gross - FeeMath.feeTaken(gross, feePips + 1), minOut);

        uint256 protocolFee = (charged * PROTOCOL_BPS) / 10_000;
        assertEq(token1.balanceOf(protocol), protocolFee);
        assertEq(token1.balanceOf(address(hook)), charged - protocolFee);
    }

    function test_aTighterRivalLeavesASmallerFee() public {
        uint256 gross = _vanillaOut(mirror);
        uint256 easyRival = gross - (gross / 100);
        uint256 tightRival = gross - (gross / 1000);
        uint24 easyFee = FeeMath.feeFromSurplus(gross, FeeMath.minOutToBeat(easyRival, 0));
        uint24 tightFee = FeeMath.feeFromSurplus(gross, FeeMath.minOutToBeat(tightRival, 0));
        assertGt(easyFee, tightFee);

        uint256 received = _swapSigned(tightFee, FeeMath.minOutToBeat(tightRival, 0), gross, 7, block.timestamp + 30);
        assertGe(received, tightRival + 1);
    }

    function test_unsignedSwapReverts() public {
        vm.expectRevert();
        this.swapDirect(pool, "");
    }

    function test_replayReverts() public {
        (uint24 feePips, uint256 minOut, uint256 gross) = _winningQuote();
        bytes memory sig = _sign(_quote(feePips, minOut, gross, 4, block.timestamp + 60));
        router.swapExactInput(pool, _quote(feePips, minOut, gross, 4, block.timestamp + 60), sig);
        _expectHookRevert(_quote(feePips, minOut, gross, 4, block.timestamp + 60), sig, FeeLastHook.NonceUsed.selector);
    }

    function test_expiredQuoteReverts() public {
        (uint24 feePips, uint256 minOut, uint256 gross) = _winningQuote();
        FeeLastHook.Quote memory quote = _quote(feePips, minOut, gross, 5, block.timestamp + 10);
        bytes memory sig = _sign(quote);
        vm.warp(block.timestamp + 11);
        _expectHookRevert(quote, sig, FeeLastHook.Deadline.selector);
    }

    function test_wrongSignerReverts() public {
        (uint24 feePips, uint256 minOut, uint256 gross) = _winningQuote();
        FeeLastHook.Quote memory quote = _quote(feePips, minOut, gross, 6, block.timestamp + 60);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, hook.hashQuote(quote));
        _expectHookRevert(quote, abi.encodePacked(r, s, v), FeeLastHook.BadSignature.selector);
    }

    function test_strangerCannotSubmitSomeoneElsesQuote() public {
        (uint24 feePips, uint256 minOut, uint256 gross) = _winningQuote();
        FeeLastHook.Quote memory quote = _quote(feePips, minOut, gross, 8, block.timestamp + 60);
        bytes memory sig = _sign(quote);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(FeeLastRouter.NotSwapper.selector);
        router.swapExactInput(pool, quote, sig);
    }

    function test_feeAboveTheSurplusReverts() public {
        (uint24 feePips, uint256 minOut, uint256 gross) = _winningQuote();
        uint24 tooHigh = feePips;
        while (tooHigh < 1_000_000 && FeeMath.feeTaken(gross, tooHigh) == FeeMath.feeTaken(gross, feePips)) {
            tooHigh += 1;
        }
        FeeLastHook.Quote memory quote = _quote(tooHigh, minOut, gross, 9, block.timestamp + 60);
        _expectHookRevert(quote, _sign(quote), FeeLastHook.NotBetterThanRival.selector);
    }

    function _expectHookRevert(FeeLastHook.Quote memory quote, bytes memory sig, bytes4 inner) internal {
        (bool ok, bytes memory ret) = address(router).call(abi.encodeCall(router.swapExactInput, (pool, quote, sig)));
        assertFalse(ok);
        bool found;
        for (uint256 i; i + 32 <= ret.length; ++i) {
            bytes4 word;
            assembly {
                word := mload(add(add(ret, 32), i))
            }
            if (word == inner) found = true;
        }
        assertTrue(found);
    }

    function test_lpFeesDonateOnTheNextTimestamp() public {
        (uint24 feePips, uint256 minOut, uint256 gross) = _winningQuote();
        _swapSigned(feePips, minOut, gross, 11, block.timestamp + 60);
        uint256 lpFee = token1.balanceOf(address(hook));
        assertGt(lpFee, 0);

        vm.warp(block.timestamp + 1);
        uint256 before = token1.balanceOf(address(this));
        _modify(pool, -600, 600, -int256(uint256(LIQUIDITY)));
        assertEq(token1.balanceOf(address(hook)), 0);
        assertGt(token1.balanceOf(address(this)), before);
    }

    function swapDirect(PoolKey calldata key, bytes calldata hookData) external {
        manager.unlock(abi.encode(uint8(2), key, hookData));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager));
        uint8 action;
        PoolKey memory key;
        (action, key) = abi.decode(data, (uint8, PoolKey));
        if (action == 1) {
            int24 lower;
            int24 upper;
            int256 liquidityDelta;
            (, , lower, upper, liquidityDelta) = abi.decode(data, (uint8, PoolKey, int24, int24, int256));
            (BalanceDelta delta,) = manager.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({tickLower: lower, tickUpper: upper, liquidityDelta: liquidityDelta, salt: 0}),
                ""
            );
            _settle(key.currency0, delta.amount0());
            _settle(key.currency1, delta.amount1());
            return "";
        }
        if (action == 2) {
            bytes memory hookData;
            (, , hookData) = abi.decode(data, (uint8, PoolKey, bytes));
            return _settleSwap(key, hookData);
        }
        return _settleSwap(key, "");
    }

    function _settleSwap(PoolKey memory key, bytes memory hookData) internal returns (bytes memory) {
        manager.sync(key.currency0);
        token0.transfer(address(manager), AMOUNT_IN);
        manager.settle();
        BalanceDelta delta = manager.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(uint256(AMOUNT_IN)),
                sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
            }),
            hookData
        );
        uint256 out = uint256(uint128(delta.amount1()));
        manager.take(key.currency1, address(this), out);
        return abi.encode(out);
    }

    function _winningQuote() internal returns (uint24 feePips, uint256 minOut, uint256 gross) {
        gross = _vanillaOut(mirror);
        uint256 rivalOut = _vanillaOut(rival);
        minOut = FeeMath.minOutToBeat(rivalOut, 0);
        feePips = FeeMath.feeFromSurplus(gross, minOut);
    }

    function _vanillaOut(PoolKey memory key) internal returns (uint256 out) {
        bytes memory ret = manager.unlock(abi.encode(uint8(3), key));
        out = abi.decode(ret, (uint256));
    }

    function _swapSigned(uint24 feePips, uint256 minOut, uint256 maxGross, uint64 nonce, uint256 deadline)
        internal
        returns (uint256)
    {
        FeeLastHook.Quote memory quote = _quote(feePips, minOut, maxGross, nonce, deadline);
        return router.swapExactInput(pool, quote, _sign(quote));
    }

    function _quote(uint24 feePips, uint256 minOut, uint256 maxGross, uint64 nonce, uint256 deadline)
        internal
        view
        returns (FeeLastHook.Quote memory)
    {
        return FeeLastHook.Quote({
            poolId: PoolId.unwrap(pool.toId()),
            swapper: address(this),
            zeroForOne: true,
            amountIn: AMOUNT_IN,
            feePips: feePips,
            minOut: minOut,
            maxGrossOut: maxGross,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _sign(FeeLastHook.Quote memory quote) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, hook.hashQuote(quote));
        return abi.encodePacked(r, s, v);
    }

    function _key(address hooks, uint24 fee) internal view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: fee,
            tickSpacing: SPACING,
            hooks: IHooks(hooks)
        });
    }

    function _modify(PoolKey memory key, int24 lower, int24 upper, int256 liquidityDelta) internal {
        manager.unlock(abi.encode(uint8(1), key, lower, upper, liquidityDelta));
    }

    function _mint(address to, uint256 amount) internal {
        token0.mint(to, amount);
        token1.mint(to, amount);
    }

    function _settle(Currency currency, int128 amount) internal {
        if (amount < 0) {
            manager.sync(currency);
            TestERC20(Currency.unwrap(currency)).transfer(address(manager), uint256(uint128(-amount)));
            manager.settle();
        } else if (amount > 0) {
            manager.take(currency, address(this), uint256(uint128(amount)));
        }
    }
}
