# packages/swapvm-opcode

1inch Aqua / SwapVM competitive-fee surface (core prize deliverable).

## Path B (shipped): `CompetitiveFeeExtruction`

Non-upgradeable Extruction target (opcode **32**) that:

1. Reads `IQuoteOracle.getBestOut`
2. Calls `CompetitiveFee.compute` (fee-core, pips)
3. Converts to SwapVM `feeBps` (`×1000`)
4. Applies FlatFee-equivalent exact-in math + XYC

Quote and swap share one `view` implementation → identical amounts.

```bash
cd packages/swapvm-opcode
forge test -vv
npm run aqua:build          # print Aqua ship calldata
# npm run aqua:fork         # Anvil mainnet fork → deploy → ship (needs FORK_RPC)
```

Sepolia (verified): see `../../deployments/sepolia.json`.

## Program bytecode

```solidity
ProgramCodec.competitiveExtructionProgram(address(extruction));
// → [32][20][20-byte target]
// SDK variant uses argsLen=21 with a trailing 0x00 (ignored by the target)
```

## Path A (optional): forked `AquaOpcodes`

Register a native wrapping `CompetitiveFee` opcode (prize allows redeployed SwapVM). Same fee-core; mirrors `_flatFeeAmountInXD` + `runLoop()`.
