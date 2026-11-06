// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Finds a CREATE2 salt whose address has the Uniswap v4 hook permission bits.
library HookMiner {
    uint160 internal constant FLAG_MASK = uint160((1 << 14) - 1);

    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs)
        internal
        pure
        returns (address predicted, bytes32 salt)
    {
        bytes32 initCodeHash = keccak256(abi.encodePacked(creationCode, constructorArgs));
        for (uint256 i; i < 200_000; ++i) {
            salt = bytes32(i);
            predicted = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash)))));
            if (uint160(predicted) & FLAG_MASK == flags) return (predicted, salt);
        }
        revert("HookMiner: no salt");
    }
}
