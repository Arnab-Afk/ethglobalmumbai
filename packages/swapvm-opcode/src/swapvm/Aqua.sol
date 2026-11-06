// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal interfaces + encoders for the deployed 1inch Aqua stack, checked against
///      1inch/swap-vm @ v1.0.2 (src/SwapVM.sol, src/libs/MakerTraits.sol, src/libs/TakerTraits.sol)
///      and 1inch/aqua (contracts/Aqua.sol). Same vanity addresses on mainnet and Base.
///      Sepolia has the Aqua registry but no AquaSwapVMRouter, so settle on a mainnet/Base fork.

address constant AQUA = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
address constant AQUA_SWAPVM_ROUTER = 0x111111338c5091E8440b67B168bAe16a668AC0De;

/// @dev `ISwapVM.Order`. `traits` is the `MakerTraits` uint256 value type, so the ABI is identical.
struct AquaOrder {
    address maker;
    uint256 traits;
    bytes data;
}

interface IAquaSwapVMRouter {
    function hash(AquaOrder calldata order) external view returns (bytes32);

    function quote(
        AquaOrder calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bytes calldata takerTraitsAndData
    ) external view returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash);

    function swap(
        AquaOrder calldata order,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        bytes calldata takerTraitsAndData
    ) external returns (uint256 amountIn, uint256 amountOut, bytes32 orderHash);
}

interface IAqua {
    function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts)
        external
        returns (bytes32 strategyHash);

    function safeBalances(address maker, address app, bytes32 strategyHash, address token0, address token1)
        external
        view
        returns (uint256 balance0, uint256 balance1);
}

library AquaEncoding {
    /// @dev MakerTraits: settle through Aqua balances (no EIP-712 signature).
    uint256 internal constant USE_AQUA_INSTEAD_OF_SIGNATURE = 1 << 254;

    /// @dev TakerTraits flags (uint16).
    uint16 internal constant IS_EXACT_IN = 0x0001;
    uint16 internal constant USE_TRANSFER_FROM_AND_AQUA_PUSH = 0x0040;

    /// @notice Aqua order with no hooks, no custom receiver: data is just the program.
    function order(address maker, bytes memory program) internal pure returns (AquaOrder memory) {
        return AquaOrder({maker: maker, traits: USE_AQUA_INSTEAD_OF_SIGNATURE, data: program});
    }

    /// @notice Aqua strategy bytes; `keccak256(strategy) == router.hash(order)` in Aqua mode.
    function strategy(AquaOrder memory o) internal pure returns (bytes memory) {
        return abi.encode(o);
    }

    /// @notice Exact-in taker data for an EOA taker: router pulls tokenIn via transferFrom
    ///         and pushes it to Aqua; swap reverts if amountOut < minOut.
    /// @dev Layout: uint160 slice indexes | uint16 flags | threshold(32). Only the threshold
    ///      slice is used, so all ten end-indexes are 32.
    function exactInTakerData(uint256 minOut) internal pure returns (bytes memory) {
        uint160 indexes;
        for (uint256 i = 0; i < 10; ++i) {
            indexes |= uint160(32 << (16 * i));
        }
        return abi.encodePacked(indexes, IS_EXACT_IN | USE_TRANSFER_FROM_AND_AQUA_PUSH, minOut);
    }
}
