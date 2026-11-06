// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CompetitiveFee} from "fee-core/CompetitiveFee.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";

/// @title Constant-product pool priced by fee-core, for the EIP-8141 frame devnet (chain 1337)
/// @notice The SwapVM/Aqua router is not deployed on the frame devnet, so the EF track swaps against this
///         stand-in. Fee math is fee-core's `CompetitiveFee`; nothing is re-implemented here.
/// @dev Reserves are the pool's token balances. Exact-in only (docs/02 MVP).
contract DevnetCompetitivePool {
    using SafeERC20 for IERC20;

    error BadToken(address token);
    error InsufficientOutput(uint256 amountOut, uint256 minOut);
    error Expired(uint256 deadline);
    /// @dev Live recheck: we do not fill a trade we no longer beat. Trader keeps their tokens.
    error CannotBeatVenue(uint256 amountOut, uint256 bestOut);

    IERC20 public immutable token0;
    IERC20 public immutable token1;
    IQuoteOracle public immutable oracle;

    uint24 public immutable feeFloor;
    uint24 public immutable feeCap;
    uint24 public immutable fallbackFee;
    uint16 public immutable undercutBps;
    uint32 public immutable maxQuoteAge;

    /// @dev Same fields as docs/03 so the dashboard can chart fee vs bestOut vs our output.
    event Swap(
        address indexed trader,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 amountOut,
        uint24 feePips,
        uint256 bestOut,
        uint256 q0
    );

    constructor(
        IERC20 token0_,
        IERC20 token1_,
        IQuoteOracle oracle_,
        CompetitiveFee.Config memory cfg
    ) {
        token0 = token0_;
        token1 = token1_;
        oracle = oracle_;
        feeFloor = cfg.feeFloor;
        feeCap = cfg.feeCap;
        fallbackFee = cfg.fallbackFee;
        undercutBps = cfg.undercutBps;
        maxQuoteAge = cfg.maxQuoteAge;
    }

    /// @notice What `swap` would pay right now. Same code path as `swap`, so quote == swap in the same block.
    function quote(address tokenIn, uint256 amountIn)
        public
        view
        returns (uint256 amountOut, uint24 feePips, uint256 bestOut, uint256 q0)
    {
        (IERC20 tIn, IERC20 tOut) = _pair(tokenIn);
        uint256 reserveIn = tIn.balanceOf(address(this));
        uint256 reserveOut = tOut.balanceOf(address(this));

        uint64 updatedAt;
        // Oracle failure must not block swaps (CLAUDE.md fail-safe): treat as missing → fallbackFee.
        try oracle.getBestOut(address(tIn), address(tOut), amountIn) returns (uint256 b, uint64 u) {
            (bestOut, updatedAt) = (b, u);
        } catch {}
        feePips = CompetitiveFee.compute(amountIn, reserveIn, reserveOut, bestOut, updatedAt, _config());
        q0 = CompetitiveFee.zeroFeeOut(amountIn, reserveIn, reserveOut);
        amountOut = CompetitiveFee.outAfterFee(amountIn, reserveIn, reserveOut, feePips);
    }

    /// @notice Exact-in swap. Deadline defaults to this block so existing callers keep working.
    function swap(address tokenIn, uint256 amountIn, uint256 minOut) external returns (uint256 amountOut) {
        return swap(tokenIn, amountIn, minOut, block.timestamp);
    }

    /// @notice Exact-in swap. Rechecks `bestOut` in this transaction.
    ///         Reverts if we cannot beat it, if `amountOut < minOut`, or if `deadline` has passed.
    function swap(address tokenIn, uint256 amountIn, uint256 minOut, uint256 deadline) public returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert Expired(deadline);

        uint24 feePips;
        uint256 bestOut;
        uint256 q0;
        (amountOut, feePips, bestOut, q0) = quote(tokenIn, amountIn);
        if (bestOut != 0 && amountOut < bestOut) revert CannotBeatVenue(amountOut, bestOut);
        if (amountOut < minOut) revert InsufficientOutput(amountOut, minOut);

        (IERC20 tIn, IERC20 tOut) = _pair(tokenIn);
        tIn.safeTransferFrom(msg.sender, address(this), amountIn);
        tOut.safeTransfer(msg.sender, amountOut);

        emit Swap(msg.sender, tokenIn, amountIn, amountOut, feePips, bestOut, q0);
    }

    function _pair(address tokenIn) private view returns (IERC20, IERC20) {
        if (tokenIn == address(token0)) return (token0, token1);
        if (tokenIn == address(token1)) return (token1, token0);
        revert BadToken(tokenIn);
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
