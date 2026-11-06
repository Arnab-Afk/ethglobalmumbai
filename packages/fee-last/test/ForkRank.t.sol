// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {FeeLastHook} from "../src/FeeLastHook.sol";
import {FeeLastRouter} from "../src/FeeLastRouter.sol";
import {FeeMath} from "../src/FeeMath.sol";
import {HookMiner} from "../src/HookMiner.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface IV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);
    function liquidity() external view returns (uint128);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160, uint32, uint256);
}

/// @notice Deploys FeeLast onto a Base fork and ranks both WETH/USDC directions against Uniswap v3.
/// @dev Skipped unless BASE_RPC_URL is set. Quotes are read before any v3 liquidity is touched.
contract ForkRankTest is Test, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    address internal constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant QUOTER = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;
    address internal constant V3_1_BPS = 0xb4CB800910B228ED3d0834cF79D697127BBB00e5;
    address internal constant V3_5_BPS = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address internal constant V3_30_BPS = 0x6c561B446416E1A00E8E93E221854d6eA4171372;

    uint256 internal constant PK = 1;
    uint16 internal constant PROTOCOL_BPS = 2_000;
    uint256 internal constant EDGE = 100;
    int24 internal constant SPACING = 60;
    int24 internal constant BAND = 10;

    IPoolManager internal manager;
    FeeLastHook internal hook;
    FeeLastRouter internal router;
    PoolKey internal pool;
    uint128 internal copiedLiquidity;
    int24 internal lower;
    int24 internal upper;
    bool internal forked;

    function setUp() public {
        string memory rpc;
        try vm.envString("BASE_RPC_URL") returns (string memory configured) {
            rpc = configured;
        } catch {
            vm.skip(true);
            return;
        }
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);

        address controller = vm.addr(PK);
        address protocol = makeAddr("protocol");
        manager = IPoolManager(POOL_MANAGER);

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(manager, address(this), controller, protocol, PROTOCOL_BPS);
        (, bytes32 salt) = HookMiner.find(address(this), flags, type(FeeLastHook).creationCode, args);
        hook = new FeeLastHook{salt: salt}(manager, address(this), controller, protocol, PROTOCOL_BPS);
        router = new FeeLastRouter(manager, hook);
        hook.setRouter(address(router));

        pool = PoolKey({
            currency0: Currency.wrap(WETH),
            currency1: Currency.wrap(USDC),
            fee: 0,
            tickSpacing: SPACING,
            hooks: IHooks(address(hook))
        });
        require(Currency.unwrap(pool.currency0) < Currency.unwrap(pool.currency1), "order");
        forked = true;
    }

    function test_ranksRequestedDirections() public {
        if (!forked) {
            vm.skip(true);
            return;
        }
        vm.writeFile("benchmark/rank.txt", "");
        _log(string.concat("fork block ", vm.toString(block.number)));
        _log(string.concat("hook ", vm.toString(address(hook))));
        _log(string.concat("router ", vm.toString(address(router))));
        _log(string.concat("pool ", vm.toString(PoolId.unwrap(pool.toId()))));

        uint128[4] memory wethIn =
            [uint128(0.01 ether), uint128(0.1 ether), uint128(1 ether), uint128(10 ether)];
        uint128[4] memory usdcIn = [uint128(20e6), uint128(200e6), uint128(2_000e6), uint128(20_000e6)];

        // Rival quotes first. Funding the position afterwards must not change these numbers.
        uint256[4][4] memory sellWeth = _rivals(true, wethIn);
        uint256[4][4] memory sellUsdc = _rivals(false, usdcIn);

        _fund();
        int24 tick = _openPool();
        _log(
            string.concat(
                "price copied from v3 1 bps, tick ",
                vm.toString(int256(tick)),
                ", liquidity ",
                vm.toString(copiedLiquidity),
                " copied from v3 5 bps"
            )
        );
        _log(
            string.concat(
                "range [",
                vm.toString(int256(lower)),
                ", ",
                vm.toString(int256(upper)),
                "], edge ",
                vm.toString(EDGE),
                " pips"
            )
        );
        _log("dir | size | best rival | gross | quote at 1 bps edge | rank | rank if edge is 1 unit");

        uint256 id = vm.snapshotState();
        uint256 wins;
        wins += _score(true, wethIn, sellWeth, id);
        wins += _score(false, usdcIn, sellUsdc, id);
        _log(string.concat("ranked first on ", vm.toString(wins), " of 8 requested swaps"));

        assertGt(_gross(true, wethIn[0], id), 0, "pool did not quote WETH to USDC");
        assertGt(_gross(false, usdcIn[0], id), 0, "pool did not quote USDC to WETH");
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "locker");
        (int24 tickLower, int24 tickUpper, int256 liquidityDelta) = abi.decode(data, (int24, int24, int256));
        (BalanceDelta delta,) = manager.modifyLiquidity(
            pool,
            IPoolManager.ModifyLiquidityParams({
                tickLower: tickLower, tickUpper: tickUpper, liquidityDelta: liquidityDelta, salt: 0
            }),
            ""
        );
        _settle(pool.currency0, delta.amount0());
        _settle(pool.currency1, delta.amount1());
        return "";
    }

    /// @notice External so a reverted quote does not unwind the benchmark.
    function fill(bool zeroForOne, uint128 amountIn, uint24 feePips, uint256 minOut, uint256 maxGross, uint64 nonce)
        external
        returns (uint256)
    {
        require(msg.sender == address(this), "self");
        FeeLastHook.Quote memory quote = FeeLastHook.Quote({
            poolId: PoolId.unwrap(pool.toId()),
            swapper: address(this),
            zeroForOne: zeroForOne,
            amountIn: amountIn,
            feePips: feePips,
            minOut: minOut,
            maxGrossOut: maxGross,
            nonce: nonce,
            deadline: block.timestamp + 60
        });
        return router.swapExactInput(pool, quote, _sign(quote));
    }

    function _rivals(bool zeroForOne, uint128[4] memory amounts) internal returns (uint256[4][4] memory outs) {
        for (uint256 s; s < 4; ++s) {
            for (uint256 f; f < 4; ++f) {
                outs[s][f] = _v3(zeroForOne, amounts[s], _fee(f));
            }
        }
    }

    function _score(bool zeroForOne, uint128[4] memory amounts, uint256[4][4] memory rivals, uint256 id)
        internal
        returns (uint256 wins)
    {
        uint8 inDec = zeroForOne ? 18 : 6;
        uint8 outDec = zeroForOne ? 6 : 18;
        string memory dir = zeroForOne ? "WETH->USDC" : "USDC->WETH";
        string memory inSym = zeroForOne ? " WETH" : " USDC";
        string memory outSym = zeroForOne ? " USDC" : " WETH";

        for (uint256 s; s < 4; ++s) {
            (uint256 best, uint256 bestIx, bool any) = _best(rivals[s]);
            (uint256 gross, bool filled) = _measure(zeroForOne, amounts[s], id);

            string memory quoted = "-";
            string memory rank = "-";
            string memory rankUnit = "-";

            if (filled && any && gross > best) {
                uint256 minUnit = FeeMath.minOutToBeat(best, 0);
                uint24 feeUnit = FeeMath.feeFromSurplus(gross, minUnit);
                uint256 userUnit = gross - FeeMath.feeTaken(gross, feeUnit);
                (uint256 placeUnit, uint256 fieldUnit) = _place(userUnit, rivals[s]);
                rankUnit = string.concat(vm.toString(placeUnit), "/", vm.toString(fieldUnit));

                uint256 minOut = FeeMath.minOutToBeat(best, EDGE);
                if (gross > minOut) {
                    uint24 feePips = FeeMath.feeFromSurplus(gross, minOut);
                    uint256 userOut = gross - FeeMath.feeTaken(gross, feePips);
                    (uint256 place, uint256 field) = _place(userOut, rivals[s]);
                    assertEq(place, 1, "a quote that clears the edge must rank first");
                    assertGt(userOut, best, "quote must beat the best rival");
                    _prove(zeroForOne, amounts[s], feePips, minOut, gross, userOut, id);
                    quoted = string.concat(_fmt(userOut, outDec), outSym, " @ ", _pips(feePips));
                    rank = string.concat(vm.toString(place), "/", vm.toString(field));
                    wins += 1;
                }
            }

            _log(
                string.concat(
                    dir,
                    " | ",
                    _fmt(amounts[s], inDec),
                    inSym,
                    " | ",
                    any ? string.concat(_fmt(best, outDec), outSym, " @ ", _pips(_fee(bestIx))) : "none",
                    " | gross ",
                    filled ? string.concat(_fmt(gross, outDec), outSym) : "no fill",
                    " | ",
                    quoted,
                    " | ",
                    rank,
                    " | ",
                    rankUnit
                )
            );
        }
    }

    function _prove(
        bool zeroForOne,
        uint128 amountIn,
        uint24 feePips,
        uint256 minOut,
        uint256 gross,
        uint256 expectOut,
        uint256 id
    ) internal {
        require(vm.revertToState(id), "snapshot");
        uint256 got = this.fill(zeroForOne, amountIn, feePips, minOut, gross, 2);
        assertEq(got, expectOut, "router fill");
        assertGe(got, minOut, "minOut");
        require(vm.revertToState(id), "snapshot");
    }

    function _measure(bool zeroForOne, uint128 amountIn, uint256 id) internal returns (uint256 gross, bool filled) {
        require(vm.revertToState(id), "snapshot");
        try this.fill(zeroForOne, amountIn, 0, 0, type(uint256).max, 1) returns (uint256 out) {
            gross = out;
            filled = out > 0;
        } catch {
            filled = false;
        }
        require(vm.revertToState(id), "snapshot");
    }

    function _gross(bool zeroForOne, uint128 amountIn, uint256 id) internal returns (uint256 gross) {
        (gross,) = _measure(zeroForOne, amountIn, id);
    }

    function _fund() internal {
        // The 0.30% pool is a wallet here, and only after its quotes were already recorded.
        _pull(WETH, V3_30_BPS, 5_000 ether);
        _pull(USDC, V3_30_BPS, 15_000_000 * 1e6);
        require(IERC20(WETH).approve(address(router), type(uint256).max), "approve");
        require(IERC20(USDC).approve(address(router), type(uint256).max), "approve");
    }

    function _pull(address token, address whale, uint256 amount) internal {
        vm.prank(whale);
        require(IERC20(token).transfer(address(this), amount), "pull");
    }

    function _openPool() internal returns (int24 tick) {
        (uint160 sqrtPrice,,,,,,) = IV3Pool(V3_1_BPS).slot0();
        copiedLiquidity = IV3Pool(V3_5_BPS).liquidity();
        tick = manager.initialize(pool, sqrtPrice);
        int24 floorTick = _floor(tick, SPACING);
        lower = floorTick - BAND * SPACING;
        upper = floorTick + SPACING + BAND * SPACING;
        manager.unlock(abi.encode(lower, upper, int256(uint256(copiedLiquidity))));
    }

    function _v3(bool zeroForOne, uint256 amountIn, uint24 fee) internal returns (uint256 amountOut) {
        try IQuoterV2(QUOTER).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: zeroForOne ? WETH : USDC,
                tokenOut: zeroForOne ? USDC : WETH,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 out, uint160, uint32, uint256) {
            amountOut = out;
        } catch {
            amountOut = 0;
        }
    }

    function _settle(Currency currency, int128 amount) internal {
        if (amount < 0) {
            manager.sync(currency);
            require(
                IERC20(Currency.unwrap(currency)).transfer(address(manager), uint256(uint128(-amount))), "pay"
            );
            manager.settle();
        } else if (amount > 0) {
            manager.take(currency, address(this), uint256(uint128(amount)));
        }
    }

    function _sign(FeeLastHook.Quote memory quote) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, hook.hashQuote(quote));
        return abi.encodePacked(r, s, v);
    }

    function _best(uint256[4] memory rivals) internal pure returns (uint256 out, uint256 index, bool any) {
        for (uint256 i; i < 4; ++i) {
            if (rivals[i] > out) {
                out = rivals[i];
                index = i;
                any = true;
            }
        }
    }

    function _place(uint256 ours, uint256[4] memory rivals) internal pure returns (uint256 rank, uint256 field) {
        uint256 better;
        field = 1;
        for (uint256 i; i < 4; ++i) {
            if (rivals[i] == 0) continue;
            field += 1;
            if (rivals[i] > ours) better += 1;
        }
        rank = better + 1;
    }

    function _fee(uint256 index) internal pure returns (uint24) {
        if (index == 0) return 100;
        if (index == 1) return 500;
        if (index == 2) return 3000;
        return 10_000;
    }

    function _floor(int24 tick, int24 spacing) internal pure returns (int24) {
        int24 compressed = tick / spacing;
        if (tick < 0 && tick % spacing != 0) compressed--;
        return compressed * spacing;
    }

    function _fmt(uint256 amount, uint8 decimals) internal pure returns (string memory) {
        uint256 digits = 6;
        uint256 scaled = decimals > digits ? amount / (10 ** (decimals - digits)) : amount * (10 ** (digits - decimals));
        string memory frac = vm.toString(scaled % 1_000_000);
        while (bytes(frac).length < 6) frac = string.concat("0", frac);
        return string.concat(vm.toString(scaled / 1_000_000), ".", frac);
    }

    function _pips(uint24 pips) internal pure returns (string memory) {
        string memory frac = vm.toString(uint256(pips) % 100);
        if (bytes(frac).length < 2) frac = string.concat("0", frac);
        return string.concat(vm.toString(uint256(pips) / 100), ".", frac, " bps");
    }

    function _log(string memory line) internal {
        console2.log(line);
        vm.writeLine("benchmark/rank.txt", line);
    }
}
