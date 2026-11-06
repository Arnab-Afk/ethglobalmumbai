// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {FeeLastHook} from "../src/FeeLastHook.sol";
import {FeeLastRouter} from "../src/FeeLastRouter.sol";
import {FeeLastPosition} from "../src/FeeLastPosition.sol";
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

/// @notice One Base-fork swap: read our pool, beat the four Uniswap v3 quotes, then withdraw.
contract ForkDemoTest is Test {
    using PoolIdLibrary for PoolKey;

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
    uint128 internal constant SELL = 0.01 ether;
    int24 internal constant SPACING = 60;
    int24 internal constant BAND = 10;
    uint24[4] internal FEES = [uint24(100), 500, 3000, 10_000];

    IPoolManager internal manager;
    FeeLastHook internal hook;
    FeeLastRouter internal router;
    FeeLastPosition internal positions;
    PoolKey internal pool;
    address internal lp;
    address internal trader;
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

        lp = makeAddr("lp");
        trader = makeAddr("trader");
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
        positions = new FeeLastPosition(manager, hook);

        pool = PoolKey({
            currency0: Currency.wrap(WETH),
            currency1: Currency.wrap(USDC),
            fee: 0,
            tickSpacing: SPACING,
            hooks: IHooks(address(hook))
        });
        forked = true;
    }

    function test_demoWalletSwapThenWithdraw() public {
        if (!forked) {
            vm.skip(true);
            return;
        }
        vm.writeFile("benchmark/demo.txt", "");
        _log(string.concat("fork block ", vm.toString(block.number)));
        _log(string.concat("lp wallet ", vm.toString(lp)));
        _log(string.concat("trader wallet ", vm.toString(trader)));

        uint256[4] memory rivals;
        uint256 best;
        uint256 bestFee;
        for (uint256 i; i < 4; ++i) {
            rivals[i] = _v3(SELL, FEES[i]);
            _log(string.concat("uniswap v3 ", _pips(FEES[i]), "  ", _fmt(rivals[i], 6), " USDC"));
            if (rivals[i] > best) {
                best = rivals[i];
                bestFee = FEES[i];
            }
        }
        _log(string.concat("best rival ", _fmt(best, 6), " USDC at ", _pips(uint24(bestFee))));
        assertGt(best, 0, "no rival quote");

        _fund();
        _openPool();

        uint256 lpWethBefore = IERC20(WETH).balanceOf(lp);
        uint256 lpUsdcBefore = IERC20(USDC).balanceOf(lp);
        vm.startPrank(lp);
        IERC20(WETH).approve(address(positions), type(uint256).max);
        IERC20(USDC).approve(address(positions), type(uint256).max);
        positions.deposit(pool, lower, upper, IV3Pool(V3_5_BPS).liquidity());
        vm.stopPrank();
        uint256 lpWethDeposited = lpWethBefore - IERC20(WETH).balanceOf(lp);
        uint256 lpUsdcDeposited = lpUsdcBefore - IERC20(USDC).balanceOf(lp);
        _log(string.concat("lp deposited ", _fmt(lpWethDeposited, 18), " WETH and ", _fmt(lpUsdcDeposited, 6), " USDC"));
        _log(string.concat("lp wallet after deposit ", _fmt(IERC20(WETH).balanceOf(lp), 18), " WETH and ", _fmt(IERC20(USDC).balanceOf(lp), 6), " USDC"));

        vm.prank(trader);
        IERC20(WETH).approve(address(router), type(uint256).max);

        uint256 gross = _readGross();
        _log(string.concat("pool zero-fee output, read from the pool ", _fmt(gross, 6), " USDC"));
        uint256 minOut = FeeMath.minOutToBeat(best, EDGE);
        assertGt(gross, minOut, "pool cannot beat the rival");
        uint24 feePips = FeeMath.feeFromSurplus(gross, minOut);
        uint256 expectOut = gross - FeeMath.feeTaken(gross, feePips);

        uint256 traderBefore = IERC20(USDC).balanceOf(trader);
        uint256 filled = _swap(feePips, minOut, gross);
        assertEq(filled, expectOut, "fill");
        assertGt(filled, best, "fill is not above the best v3 quote");
        assertEq(IERC20(USDC).balanceOf(trader) - traderBefore, filled);
        _log(string.concat("trader receives ", _fmt(filled, 6), " USDC at ", _pips(feePips)));
        _log(string.concat("advantage over best rival ", _fmt(filled - best, 6), " USDC"));

        vm.warp(block.timestamp + 1);
        vm.prank(lp);
        (uint256 back0, uint256 back1) = positions.withdraw(pool, lower, upper);
        assertGt(back0, 0);
        assertGt(back1, 0);
        uint256 lpWethAfter = IERC20(WETH).balanceOf(lp);
        uint256 lpUsdcAfter = IERC20(USDC).balanceOf(lp);
        _log(string.concat("lp withdrew ", _fmt(back0, 18), " WETH and ", _fmt(back1, 6), " USDC"));
        _log(string.concat("lp wallet after withdraw ", _fmt(lpWethAfter, 18), " WETH and ", _fmt(lpUsdcAfter, 6), " USDC"));
        assertGe(lpWethAfter, lpWethBefore);
        assertGt(lpUsdcBefore, lpUsdcAfter);
        assertLt(lpUsdcBefore - lpUsdcAfter, filled + 1e6);
    }

    /// @notice Simulate a zero-fee swap. The state is restored, so the number is a quote, not a trade.
    function _readGross() internal returns (uint256 gross) {
        uint256 id = vm.snapshotState();
        gross = _swap(0, 0, type(uint256).max);
        require(vm.revertToState(id), "snapshot");
    }

    function _swap(uint24 feePips, uint256 minOut, uint256 maxGross) internal returns (uint256) {
        FeeLastHook.Quote memory quote = FeeLastHook.Quote({
            poolId: PoolId.unwrap(pool.toId()),
            swapper: trader,
            zeroForOne: true,
            amountIn: SELL,
            feePips: feePips,
            minOut: minOut,
            maxGrossOut: maxGross,
            nonce: 1,
            deadline: block.timestamp + 60
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(PK, hook.hashQuote(quote));
        vm.prank(trader);
        return router.swapExactInput(pool, quote, abi.encodePacked(r, s, v));
    }

    function _fund() internal {
        _pull(WETH, lp, 5_000 ether);
        _pull(USDC, lp, 15_000_000 * 1e6);
        _pull(WETH, trader, 1 ether);
    }

    function _pull(address token, address to, uint256 amount) internal {
        vm.prank(V3_30_BPS);
        require(IERC20(token).transfer(to, amount), "pull");
    }

    function _openPool() internal {
        (uint160 sqrtPrice,,,,,,) = IV3Pool(V3_1_BPS).slot0();
        int24 tick = manager.initialize(pool, sqrtPrice);
        int24 floorTick = _floor(tick, SPACING);
        lower = floorTick - BAND * SPACING;
        upper = floorTick + SPACING + BAND * SPACING;
    }

    function _v3(uint256 amountIn, uint24 fee) internal returns (uint256 amountOut) {
        try IQuoterV2(QUOTER).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: USDC,
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
        vm.writeLine("benchmark/demo.txt", line);
    }
}
