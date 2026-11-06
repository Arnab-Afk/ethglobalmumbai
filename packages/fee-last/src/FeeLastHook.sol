// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {FeeMath} from "./FeeMath.sol";

/// @title FeeLastHook
/// @notice Uniswap v4 pool that trades only with a controller-signed fee.
///
/// The pool's own LP fee is zero. The swap runs on the raw curve, then this hook
/// takes an output fee chosen off-chain as the largest pip fee that still leaves
/// the trader more tokens than the best rival quote. Unsigned swaps revert.
///
/// LP fees sit in this contract until a later timestamp, then they are donated to
/// in-range liquidity. That keeps a same-timestamp deposit from collecting a fee
/// it did not earn. The protocol share is transferred out immediately.
contract FeeLastHook is IHooks, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;
    using FeeMath for uint256;

    uint256 public constant MAX_DEADLINE_WINDOW = 120;
    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(bytes32 poolId,address swapper,bool zeroForOne,uint128 amountIn,uint24 feePips,uint256 minOut,uint256 maxGrossOut,uint64 nonce,uint256 deadline)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    IPoolManager public immutable poolManager;
    uint16 public immutable protocolShareBps;

    address public owner;
    address public controller;
    address public router;
    address public protocolRecipient;
    uint24 public maxFeePips;

    mapping(uint256 word => uint256 bitmap) public usedNonces;
    mapping(PoolId id => uint256) public pending0;
    mapping(PoolId id => uint256) public pending1;
    mapping(PoolId id => uint256) public pendingTimestamp;

    struct Quote {
        bytes32 poolId;
        address swapper;
        bool zeroForOne;
        uint128 amountIn;
        uint24 feePips;
        uint256 minOut;
        uint256 maxGrossOut;
        uint64 nonce;
        uint256 deadline;
    }

    struct ActiveQuote {
        address swapper;
        uint24 feePips;
        uint256 minOut;
        uint256 maxGrossOut;
        bool live;
    }

    ActiveQuote private active;

    error NotOwner();
    error NotPoolManager();
    error NotRouter();
    error PoolFeeMustBeZero();
    error BadSignature();
    error Deadline();
    error NonceUsed();
    error AmountMismatch();
    error FeeTooHigh();
    error NotBetterThanRival();
    error GrossMoved();
    error ZeroAddress();

    event ControllerUpdated(address indexed controller);
    event RouterUpdated(address indexed router);
    event MaxFeePipsUpdated(uint24 maxFeePips);
    event SwapFeeCharged(
        PoolId indexed id,
        address indexed swapper,
        uint256 grossOut,
        uint256 fee,
        uint256 protocolFee,
        uint24 feePips
    );
    event FeesDonated(PoolId indexed id, uint256 amount0, uint256 amount1);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _owner,
        address _controller,
        address _protocolRecipient,
        uint16 _protocolShareBps
    ) {
        if (_owner == address(0) || _controller == address(0) || _protocolRecipient == address(0)) revert ZeroAddress();
        if (_protocolShareBps > 10_000) revert FeeTooHigh();

        poolManager = _poolManager;
        controller = _controller;
        protocolRecipient = _protocolRecipient;
        protocolShareBps = _protocolShareBps;
        maxFeePips = uint24(FeeMath.PIPS);
        // CREATE2 factory is msg.sender when forge broadcasts a salted deploy, so the owner is explicit.
        owner = _owner;

        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: true,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: true,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: true,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("FeeLastHook"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function setController(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        controller = next;
        emit ControllerUpdated(next);
    }

    function setRouter(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        router = next;
        emit RouterUpdated(next);
    }

    function setProtocolRecipient(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        protocolRecipient = next;
    }

    function setMaxFeePips(uint24 next) external onlyOwner {
        if (next > FeeMath.PIPS) revert FeeTooHigh();
        maxFeePips = next;
        emit MaxFeePipsUpdated(next);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        owner = next;
    }

    /// @notice Donates fees earned at an earlier timestamp. Anyone can call.
    function flush(PoolKey calldata key) external {
        poolManager.unlock(abi.encode(key));
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        PoolKey memory key = abi.decode(data, (PoolKey));
        _flush(key);
        return "";
    }

    function hashQuote(Quote calldata quote) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(QUOTE_TYPEHASH, quote));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function beforeInitialize(address, PoolKey calldata key, uint160) external view onlyPoolManager returns (bytes4) {
        if (key.fee != 0) revert PoolFeeMustBeZero();
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert NotPoolManager();
    }

    function beforeAddLiquidity(address, PoolKey calldata key, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4)
    {
        _flush(key);
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, BalanceDelta)
    {
        revert NotPoolManager();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata key, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4)
    {
        _flush(key);
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, BalanceDelta, BalanceDelta, bytes calldata)
        external
        pure
        returns (bytes4, BalanceDelta)
    {
        revert NotPoolManager();
    }

    function beforeSwap(address sender, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata hookData)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (sender != router) revert NotRouter();
        _flush(key);

        (Quote memory quote, bytes memory signature) = abi.decode(hookData, (Quote, bytes));
        if (quote.poolId != PoolId.unwrap(key.toId())) revert AmountMismatch();
        if (params.zeroForOne != quote.zeroForOne) revert AmountMismatch();
        if (params.amountSpecified != -int256(uint256(quote.amountIn))) revert AmountMismatch();
        if (quote.amountIn == 0) revert AmountMismatch();
        if (block.timestamp > quote.deadline || quote.deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert Deadline();
        if (quote.feePips > maxFeePips) revert FeeTooHigh();
        if (!_validSignature(quote, signature)) revert BadSignature();
        _consumeNonce(quote.nonce);

        active = ActiveQuote({
            swapper: quote.swapper,
            feePips: quote.feePips,
            minOut: quote.minOut,
            maxGrossOut: quote.maxGrossOut,
            live: true
        });
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(address, PoolKey calldata key, IPoolManager.SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        ActiveQuote memory quote = active;
        active.live = false;
        if (!quote.live) revert BadSignature();

        bool outputIsToken1 = params.amountSpecified < 0 == params.zeroForOne;
        int128 rawOut = outputIsToken1 ? delta.amount1() : delta.amount0();
        if (rawOut <= 0) revert NotBetterThanRival();
        uint256 gross = uint256(uint128(rawOut));
        if (gross > quote.maxGrossOut) revert GrossMoved();

        uint256 fee = FeeMath.feeTaken(gross, quote.feePips);
        uint256 userOut = gross - fee;
        if (userOut < quote.minOut) revert NotBetterThanRival();
        if (fee == 0) return (IHooks.afterSwap.selector, 0);

        uint256 protocolFee = (fee * protocolShareBps) / 10_000;
        uint256 lpFee = fee - protocolFee;
        Currency output = outputIsToken1 ? key.currency1 : key.currency0;
        poolManager.take(output, address(this), fee);
        if (protocolFee != 0) output.transfer(protocolRecipient, protocolFee);

        PoolId id = key.toId();
        if (lpFee != 0) {
            if (outputIsToken1) pending1[id] += lpFee;
            else pending0[id] += lpFee;
            pendingTimestamp[id] = block.timestamp;
        }

        emit SwapFeeCharged(id, quote.swapper, gross, fee, protocolFee, quote.feePips);
        return (IHooks.afterSwap.selector, fee.toInt128());
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert NotPoolManager();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert NotPoolManager();
    }

    function _flush(PoolKey memory key) internal {
        PoolId id = key.toId();
        uint256 amount0 = pending0[id];
        uint256 amount1 = pending1[id];
        if (amount0 == 0 && amount1 == 0) return;
        if (block.timestamp <= pendingTimestamp[id]) return;
        // donate reverts when the current price has no liquidity, and that revert
        // would run on every later swap and liquidity change. Keep the fees until
        // some liquidity covers the price again.
        if (StateLibrary.getLiquidity(poolManager, id) == 0) return;

        pending0[id] = 0;
        pending1[id] = 0;
        pendingTimestamp[id] = 0;
        _pay(key.currency0, amount0);
        _pay(key.currency1, amount1);
        poolManager.donate(key, amount0, amount1, "");
        emit FeesDonated(id, amount0, amount1);
    }

    function _pay(Currency currency, uint256 amount) internal {
        if (amount == 0) return;
        poolManager.sync(currency);
        currency.transfer(address(poolManager), amount);
        poolManager.settle();
    }

    function _consumeNonce(uint64 nonce) internal {
        uint256 word = uint256(nonce) >> 8;
        uint256 mask = 1 << (nonce & 0xff);
        uint256 bitmap = usedNonces[word];
        if (bitmap & mask != 0) revert NonceUsed();
        usedNonces[word] = bitmap | mask;
    }

    function _validSignature(Quote memory quote, bytes memory signature) internal view returns (bool) {
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        if (v < 27) v += 27;
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(QUOTE_TYPEHASH, quote))));
        return ecrecover(digest, v, r, s) == controller;
    }
}
