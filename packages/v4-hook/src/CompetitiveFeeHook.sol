// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";

/// @dev Minimal Uniswap v4 types so `beforeSwap` matches PoolManager's call.
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

interface IStateView {
    function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
    function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity);
}

/// @title v4 hook that sets the LP fee from fee-core on every swap
/// @notice `beforeSwap` reads the best Uniswap v3 output from `VenueReader` and returns the largest
///         fee that still beats it. The pool must be initialized with the dynamic-fee flag (`0x800000`).
/// @dev Address must have only the BEFORE_SWAP bit set (bit 7). Exact-output swaps get `fallbackFee`.
contract CompetitiveFeeHook {
    error NotPoolManager();
    error HookAddressNotValid(address hook);

    uint160 internal constant ALL_HOOK_MASK = (1 << 14) - 1;
    uint160 internal constant BEFORE_SWAP_FLAG = 1 << 7;
    /// @dev Second-highest bit of the returned fee. PoolManager applies the fee only when this is set.
    uint24 internal constant OVERRIDE_FEE_FLAG = 0x400000;
    uint256 internal constant Q96 = 1 << 96;

    address public immutable poolManager;
    IQuoteOracle public immutable venueReader;
    IStateView public immutable stateView;
    uint24 public immutable feeFloor;
    uint24 public immutable feeCap;
    uint24 public immutable fallbackFee;
    uint16 public immutable undercutBps;
    uint32 public immutable maxQuoteAge;

    constructor(
        address poolManager_,
        IQuoteOracle venueReader_,
        IStateView stateView_,
        CompetitiveFee.Config memory cfg
    ) {
        if ((uint160(address(this)) & ALL_HOOK_MASK) != BEFORE_SWAP_FLAG) revert HookAddressNotValid(address(this));
        poolManager = poolManager_;
        venueReader = venueReader_;
        stateView = stateView_;
        feeFloor = cfg.feeFloor;
        feeCap = cfg.feeCap;
        fallbackFee = cfg.fallbackFee;
        undercutBps = cfg.undercutBps;
        maxQuoteAge = cfg.maxQuoteAge;
    }

    /// @notice PoolManager calls this before the swap. Return value is `(selector, 0 delta, fee | OVERRIDE_FEE_FLAG)`.
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        view
        returns (bytes4, int256, uint24)
    {
        if (msg.sender != poolManager) revert NotPoolManager();
        uint24 feePips = _feePips(key, params);
        return (CompetitiveFeeHook.beforeSwap.selector, 0, feePips | OVERRIDE_FEE_FLAG);
    }

    function _feePips(PoolKey calldata key, SwapParams calldata params) private view returns (uint24) {
        // v4: a negative amountSpecified is exact input.
        if (params.amountSpecified >= 0) return fallbackFee;
        uint256 amountIn = uint256(-params.amountSpecified);
        address tokenIn = params.zeroForOne ? key.currency0 : key.currency1;
        address tokenOut = params.zeroForOne ? key.currency1 : key.currency0;

        (uint256 reserveIn, uint256 reserveOut) = _reserves(key, params.zeroForOne);
        (uint256 bestOut, uint64 updatedAt) = _bestOut(tokenIn, tokenOut, amountIn);

        return CompetitiveFee.compute(amountIn, reserveIn, reserveOut, bestOut, updatedAt, _config());
    }

    function _bestOut(address tokenIn, address tokenOut, uint256 amountIn) private view returns (uint256 bestOut, uint64 updatedAt) {
        try venueReader.getBestOut(tokenIn, tokenOut, amountIn) returns (uint256 b, uint64 t) {
            return (b, t);
        } catch {
            return (0, 0);
        }
    }

    /// @dev Active-liquidity virtual reserves, the constant-product inputs fee-core expects.
    function _reserves(PoolKey calldata key, bool zeroForOne) private view returns (uint256 reserveIn, uint256 reserveOut) {
        bytes32 id = keccak256(abi.encode(key));
        (uint160 sqrtPriceX96,,,) = stateView.getSlot0(id);
        uint128 liquidity = stateView.getLiquidity(id);
        if (sqrtPriceX96 == 0 || liquidity == 0) return (0, 0);
        uint256 reserve0 = Math.mulDiv(liquidity, Q96, sqrtPriceX96);
        uint256 reserve1 = Math.mulDiv(liquidity, sqrtPriceX96, Q96);
        (reserveIn, reserveOut) = zeroForOne ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    function _config() private view returns (CompetitiveFee.Config memory) {
        return CompetitiveFee.Config({
            feeFloor: feeFloor,
            feeCap: feeCap,
            fallbackFee: fallbackFee,
            undercutBps: undercutBps,
            maxQuoteAge: maxQuoteAge
        });
    }
}
