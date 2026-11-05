// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "forge-std/interfaces/IERC165.sol";

/// @title IReceiver — CRE / Keystone report consumer
/// @dev Matches Chainlink KeystoneForwarder callback. See docs.chain.link/cre
///      "Building Consumer Contracts".
interface IReceiver is IERC165 {
    /// @notice Handles a verified report from KeystoneForwarder.
    /// @param metadata 64 bytes in production: packed (workflowId, workflowName, owner) + reportId.
    /// @param report ABI-encoded workflow payload.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
