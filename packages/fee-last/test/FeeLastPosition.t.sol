// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FeeLastHook} from "../src/FeeLastHook.sol";
import {FeeLastRouter} from "../src/FeeLastRouter.sol";
import {FeeLastPosition} from "../src/FeeLastPosition.sol";
import {HookMiner} from "../src/HookMiner.sol";

contract MintableERC20 {
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

/// @notice The depositing wallet can pull the same position back out.
contract FeeLastPositionTest is Test {
    uint256 internal constant PK = 1;
    int24 internal constant LOWER = -600;
    int24 internal constant UPPER = 600;
    uint128 internal constant LIQUIDITY = 1e18;

    PoolManager internal manager;
    FeeLastPosition internal positions;
    PoolKey internal pool;
    MintableERC20 internal token0;
    MintableERC20 internal token1;
    address internal lp;

    function setUp() public {
        lp = makeAddr("lp");
        address controller = vm.addr(PK);
        address protocol = makeAddr("protocol");
        manager = new PoolManager(address(this));

        uint160 flags = uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
        bytes memory args = abi.encode(manager, address(this), controller, protocol, uint16(2_000));
        (, bytes32 salt) = HookMiner.find(address(this), flags, type(FeeLastHook).creationCode, args);
        FeeLastHook hook = new FeeLastHook{salt: salt}(IPoolManager(address(manager)), address(this), controller, protocol, 2_000);
        FeeLastRouter router = new FeeLastRouter(manager, hook);
        hook.setRouter(address(router));
        positions = new FeeLastPosition(manager, hook);

        MintableERC20 a = new MintableERC20();
        MintableERC20 b = new MintableERC20();
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
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        manager.initialize(pool, TickMath.getSqrtPriceAtTick(0));
        token0.mint(lp, 1e30);
        token1.mint(lp, 1e30);
        vm.startPrank(lp);
        token0.approve(address(positions), type(uint256).max);
        token1.approve(address(positions), type(uint256).max);
        vm.stopPrank();
    }

    function test_depositorWithdrawsThePosition() public {
        uint256 before0 = token0.balanceOf(lp);
        uint256 before1 = token1.balanceOf(lp);

        vm.prank(lp);
        positions.deposit(pool, LOWER, UPPER, LIQUIDITY);
        assertLt(token0.balanceOf(lp), before0);
        assertLt(token1.balanceOf(lp), before1);
        assertEq(positions.liquidityOf(positions.positionId(lp, pool, LOWER, UPPER)), LIQUIDITY);

        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(FeeLastPosition.ZeroLiquidity.selector);
        positions.withdraw(pool, LOWER, UPPER);

        vm.prank(lp);
        (uint256 back0, uint256 back1) = positions.withdraw(pool, LOWER, UPPER);
        assertGt(back0, 0);
        assertGt(back1, 0);
        assertApproxEqAbs(token0.balanceOf(lp), before0, 1);
        assertApproxEqAbs(token1.balanceOf(lp), before1, 1);
        assertEq(positions.liquidityOf(positions.positionId(lp, pool, LOWER, UPPER)), 0);
    }
}
