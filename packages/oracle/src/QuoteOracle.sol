// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IQuoteOracle} from "./IQuoteOracle.sol";
import {QuoteCurveLib} from "./QuoteCurveLib.sol";
import {IReceiver} from "./cre/IReceiver.sol";
import {IERC165} from "forge-std/interfaces/IERC165.sol";

/// @title CRE-fed competing-venue quote oracle
/// @notice Accepts KeystoneForwarder reports and serves interpolated bestOut to fee surfaces.
/// @dev Report encoding (frozen — docs/03):
///      abi.encode(CurveUpdate[]) where
///      CurveUpdate = (address tokenIn, address tokenOut, uint64 observedAt,
///                     uint256[] amountsIn, uint256[] bestOuts, bytes32 venueIds)
contract QuoteOracle is IQuoteOracle, IReceiver {
    using QuoteCurveLib for uint256[];

    error NotOwner();
    error InvalidForwarderAddress();
    error InvalidSender(address sender, address expected);
    error StaleReport(uint64 observedAt, uint64 storedAt);
    error EmptyReport();

    struct Curve {
        uint256[] amountsIn;
        uint256[] bestOuts;
        uint64 updatedAt;
        bytes32 venueIds;
    }

    /// @notice One pair/direction update inside a CRE report.
    struct CurveUpdate {
        address tokenIn;
        address tokenOut;
        uint64 observedAt;
        uint256[] amountsIn;
        uint256[] bestOuts;
        bytes32 venueIds;
    }

    address public owner;
    /// @notice KeystoneForwarder (or test harness). Only this address may call onReport.
    address public forwarder;

    mapping(bytes32 => Curve) internal curves;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event CurveUpdated(
        address indexed tokenIn,
        address indexed tokenOut,
        uint64 observedAt,
        uint256 points,
        bytes32 venueIds
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @param owner_ Admin for forwarder updates.
    /// @param forwarder_ KeystoneForwarder on the target chain. Use a mock address in tests.
    constructor(address owner_, address forwarder_) {
        if (forwarder_ == address(0)) revert InvalidForwarderAddress();
        owner = owner_;
        forwarder = forwarder_;
        emit OwnershipTransferred(address(0), owner_);
        emit ForwarderUpdated(address(0), forwarder_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Update the trusted forwarder (e.g. after chain/DON change). Cannot be zero.
    function setForwarder(address forwarder_) external onlyOwner {
        if (forwarder_ == address(0)) revert InvalidForwarderAddress();
        emit ForwarderUpdated(forwarder, forwarder_);
        forwarder = forwarder_;
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata, /* metadata */ bytes calldata report) external override {
        if (msg.sender != forwarder) revert InvalidSender(msg.sender, forwarder);
        _processReport(report);
    }

    /// @dev Owner escape hatch for demos / CRE simulation without a live forwarder.
    ///      Prefer onReport via forwarder in production.
    function applyReport(bytes calldata report) external onlyOwner {
        _processReport(report);
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
        // Above last bucket → bestOut 0 but updatedAt still set; fee-core treats bestOut==0 as missing.
        if (bestOut == 0 && amountIn > c.amountsIn[c.amountsIn.length - 1]) {
            return (0, 0);
        }
    }

    /// @notice Latest stored observation time for a pair (0 if none).
    function observedAt(address tokenIn, address tokenOut) external view returns (uint64) {
        return curves[QuoteCurveLib.pairKey(tokenIn, tokenOut)].updatedAt;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _processReport(bytes calldata report) internal {
        CurveUpdate[] memory updates = abi.decode(report, (CurveUpdate[]));
        if (updates.length == 0) revert EmptyReport();

        for (uint256 i = 0; i < updates.length; ++i) {
            _applyUpdate(updates[i]);
        }
    }

    function _applyUpdate(CurveUpdate memory u) internal {
        QuoteCurveLib.validate(u.amountsIn, u.bestOuts);

        bytes32 key = QuoteCurveLib.pairKey(u.tokenIn, u.tokenOut);
        Curve storage c = curves[key];

        // No rollback / replay: observedAt must be strictly newer
        if (c.updatedAt != 0 && u.observedAt <= c.updatedAt) {
            revert StaleReport(u.observedAt, c.updatedAt);
        }

        delete c.amountsIn;
        delete c.bestOuts;
        for (uint256 i = 0; i < u.amountsIn.length; ++i) {
            c.amountsIn.push(u.amountsIn[i]);
            c.bestOuts.push(u.bestOuts[i]);
        }
        c.updatedAt = u.observedAt;
        c.venueIds = u.venueIds;

        emit CurveUpdated(u.tokenIn, u.tokenOut, u.observedAt, u.amountsIn.length, u.venueIds);
    }
}
