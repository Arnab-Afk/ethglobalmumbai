// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IQuoteOracle} from "./IQuoteOracle.sol";
import {QuoteCurveLib} from "./QuoteCurveLib.sol";

/// @title Owner-settable quote curve for demos and parallel workstream development
/// @notice Linearly interpolates `bestOut` between size buckets (see docs/02).
contract MockQuoteOracle is IQuoteOracle {
    error NotOwner();

    address public owner;

    struct Curve {
        uint256[] amountsIn;
        uint256[] bestOuts;
        uint64 updatedAt;
    }

    mapping(bytes32 => Curve) internal curves;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event CurveSet(address indexed tokenIn, address indexed tokenOut, uint64 updatedAt, uint256 points);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_) {
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Replace the quote curve for a pair/direction. `updatedAt == 0` uses block.timestamp.
    function setCurve(
        address tokenIn,
        address tokenOut,
        uint256[] calldata amountsIn,
        uint256[] calldata bestOuts,
        uint64 updatedAt
    ) external onlyOwner {
        QuoteCurveLib.validate(amountsIn, bestOuts);

        bytes32 key = QuoteCurveLib.pairKey(tokenIn, tokenOut);
        Curve storage c = curves[key];
        delete c.amountsIn;
        delete c.bestOuts;

        for (uint256 i = 0; i < amountsIn.length; ++i) {
            c.amountsIn.push(amountsIn[i]);
            c.bestOuts.push(bestOuts[i]);
        }
        c.updatedAt = updatedAt == 0 ? uint64(block.timestamp) : updatedAt;

        emit CurveSet(tokenIn, tokenOut, c.updatedAt, amountsIn.length);
    }

    function clearCurve(address tokenIn, address tokenOut) external onlyOwner {
        delete curves[QuoteCurveLib.pairKey(tokenIn, tokenOut)];
        emit CurveSet(tokenIn, tokenOut, 0, 0);
    }

    /// @inheritdoc IQuoteOracle
    function getBestOut(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 bestOut, uint64 updatedAt)
    {
        Curve storage c = curves[QuoteCurveLib.pairKey(tokenIn, tokenOut)];
        if (c.amountsIn.length == 0) return (0, 0);

        updatedAt = c.updatedAt;
        bestOut = QuoteCurveLib.interpolate(c.amountsIn, c.bestOuts, amountIn);
        if (bestOut == 0 && amountIn > c.amountsIn[c.amountsIn.length - 1]) {
            return (0, 0);
        }
    }
}
