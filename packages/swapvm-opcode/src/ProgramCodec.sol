// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Minimal Aqua SwapVM program encoding helpers
/// @dev Opcode layout: [opcode:u8][argsLen:u8][args…] — docs/04 / Aqua opcode gallery.
library ProgramCodec {
    /// @notice Deployed AquaOpcodes index for Extruction.
    uint8 internal constant OPCODE_EXTRUCTION = 32;
    /// @notice Deployed AquaOpcodes index for flat LP fee.
    uint8 internal constant OPCODE_FLAT_FEE = 21;
    /// @notice Deployed AquaOpcodes index for XYC constant-product.
    uint8 internal constant OPCODE_XYC_SWAP = 17;

    /// @notice Program that prices entirely inside CompetitiveFeeExtruction (Path B).
    function competitiveExtructionProgram(address target) internal pure returns (bytes memory) {
        return abi.encodePacked(OPCODE_EXTRUCTION, uint8(20), target);
    }

    /// @notice Flat-fee + XYC program for LP-revenue comparison baselines.
    /// @param feeBps SwapVM scale (1e9 = 100%). Example: 0.30% → 3_000_000.
    function flatFeeXycProgram(uint32 feeBps) internal pure returns (bytes memory) {
        return abi.encodePacked(
            OPCODE_FLAT_FEE,
            uint8(4),
            feeBps,
            OPCODE_XYC_SWAP,
            uint8(0)
        );
    }
}
