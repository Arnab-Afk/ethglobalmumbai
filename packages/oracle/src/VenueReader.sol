// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IQuoteOracle} from "./IQuoteOracle.sol";
import {UniV3ViewQuote} from "./UniV3ViewQuote.sol";

interface IQuoterV4 {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct QuoteExactSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 exactAmount;
        bytes hookData;
    }

    function quoteExactInputSingle(QuoteExactSingleParams calldata params) external returns (uint256, uint256);
}

/// @title On-chain competing-venue reader
/// @notice `getBestOut` is the max exact-in output across configured Uniswap v3 pools
///         (read in-place, no quoter), v2 pairs, and optional v4 quoters. No HTTP.
///         A configured fallback oracle (mock or CRE) is used only when every live venue returns 0.
/// @dev Live quotes use `block.timestamp`, so they are never stale. Failed venues are skipped.
contract VenueReader is IQuoteOracle {
    error NotOwner();
    error TooManyVenues();

    uint256 public constant MAX_VENUES = 4;

    struct V3Venue {
        address pool;
    }

    struct V2Venue {
        address pair;
    }

    struct V4Venue {
        address quoter;
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    address public owner;
    /// @notice Used only when live venues quote 0 (devnet has no Uniswap).
    IQuoteOracle public fallbackOracle;

    mapping(bytes32 => V3Venue[]) internal v3Venues;
    mapping(bytes32 => V2Venue[]) internal v2Venues;
    mapping(bytes32 => V4Venue[]) internal v4Venues;

    event FallbackOracleSet(address indexed oracle);
    event V3VenueSet(address indexed tokenA, address indexed tokenB, uint256 count);
    event V2VenueSet(address indexed tokenA, address indexed tokenB, uint256 count);
    event V4VenueSet(address indexed tokenA, address indexed tokenB, uint256 count);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, IQuoteOracle fallbackOracle_) {
        owner = owner_;
        fallbackOracle = fallbackOracle_;
        emit FallbackOracleSet(address(fallbackOracle_));
    }

    function setFallbackOracle(IQuoteOracle fallbackOracle_) external onlyOwner {
        fallbackOracle = fallbackOracle_;
        emit FallbackOracleSet(address(fallbackOracle_));
    }

    /// @notice Replace v3 pools for a pair. Direction does not matter; the pool is quoted with tokenIn.
    function setV3Venues(address tokenA, address tokenB, V3Venue[] calldata venues) external onlyOwner {
        if (venues.length > MAX_VENUES) revert TooManyVenues();
        bytes32 key = _pairKey(tokenA, tokenB);
        delete v3Venues[key];
        for (uint256 i = 0; i < venues.length; ++i) {
            v3Venues[key].push(venues[i]);
        }
        emit V3VenueSet(tokenA, tokenB, venues.length);
    }

    function setV2Venues(address tokenA, address tokenB, V2Venue[] calldata venues) external onlyOwner {
        if (venues.length > MAX_VENUES) revert TooManyVenues();
        bytes32 key = _pairKey(tokenA, tokenB);
        delete v2Venues[key];
        for (uint256 i = 0; i < venues.length; ++i) {
            v2Venues[key].push(venues[i]);
        }
        emit V2VenueSet(tokenA, tokenB, venues.length);
    }

    function setV4Venues(address tokenA, address tokenB, V4Venue[] calldata venues) external onlyOwner {
        if (venues.length > MAX_VENUES) revert TooManyVenues();
        bytes32 key = _pairKey(tokenA, tokenB);
        delete v4Venues[key];
        for (uint256 i = 0; i < venues.length; ++i) {
            v4Venues[key].push(venues[i]);
        }
        emit V4VenueSet(tokenA, tokenB, venues.length);
    }

    /// @inheritdoc IQuoteOracle
    function getBestOut(address tokenIn, address tokenOut, uint256 amountIn)
        external
        view
        returns (uint256 bestOut, uint64 updatedAt)
    {
        if (amountIn == 0 || tokenIn == tokenOut) return (0, 0);

        bytes32 key = _pairKey(tokenIn, tokenOut);
        bestOut = _max(bestOut, _bestV3(key, tokenIn, amountIn));
        bestOut = _max(bestOut, _bestV2(key, tokenIn, amountIn));
        bestOut = _max(bestOut, _bestV4(key, tokenIn, amountIn));

        if (bestOut != 0) return (bestOut, uint64(block.timestamp));

        if (address(fallbackOracle) != address(0)) {
            try fallbackOracle.getBestOut(tokenIn, tokenOut, amountIn) returns (uint256 b, uint64 t) {
                return (b, t);
            } catch {}
        }
        return (0, 0);
    }

    function _bestV3(bytes32 key, address tokenIn, uint256 amountIn) private view returns (uint256 best) {
        V3Venue[] storage venues = v3Venues[key];
        for (uint256 i = 0; i < venues.length; ++i) {
            best = _max(best, _quoteV3(venues[i].pool, tokenIn, amountIn));
        }
    }

    function _bestV2(bytes32 key, address tokenIn, uint256 amountIn) private view returns (uint256 best) {
        V2Venue[] storage venues = v2Venues[key];
        for (uint256 i = 0; i < venues.length; ++i) {
            best = _max(best, _quoteV2(venues[i].pair, tokenIn, amountIn));
        }
    }

    function _bestV4(bytes32 key, address tokenIn, uint256 amountIn) private view returns (uint256 best) {
        V4Venue[] storage venues = v4Venues[key];
        for (uint256 i = 0; i < venues.length; ++i) {
            best = _max(best, _quoteV4(venues[i], tokenIn, amountIn));
        }
    }

    function _quoteV3(address pool, address tokenIn, uint256 amountIn) private view returns (uint256) {
        return UniV3ViewQuote.quoteExactInput(pool, tokenIn, amountIn);
    }

    /// @dev Uniswap v2 getAmountOut: 0.30% fee, constant product. This is the competitor's quote, not our fee.
    function _quoteV2(address pair, address tokenIn, uint256 amountIn) private view returns (uint256) {
        if (pair == address(0) || amountIn == 0) return 0;
        (bool ok0, bytes memory t0) = pair.staticcall(abi.encodeWithSelector(bytes4(keccak256("token0()"))));
        (bool ok1, bytes memory t1) = pair.staticcall(abi.encodeWithSelector(bytes4(keccak256("token1()"))));
        (bool okr, bytes memory reserves) = pair.staticcall(abi.encodeWithSelector(bytes4(keccak256("getReserves()"))));
        if (!ok0 || !ok1 || !okr || t0.length < 32 || t1.length < 32 || reserves.length < 64) return 0;

        address token0 = abi.decode(t0, (address));
        address token1 = abi.decode(t1, (address));
        (uint112 r0, uint112 r1) = abi.decode(reserves, (uint112, uint112));
        uint256 reserveIn;
        uint256 reserveOut;
        if (tokenIn == token0) {
            reserveIn = r0;
            reserveOut = r1;
        } else if (tokenIn == token1) {
            reserveIn = r1;
            reserveOut = r0;
        } else {
            return 0;
        }
        if (reserveIn == 0 || reserveOut == 0) return 0;
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1000 + amountInWithFee);
    }

    function _quoteV4(V4Venue storage venue, address tokenIn, uint256 amountIn) private view returns (uint256 amountOut) {
        if (venue.quoter == address(0) || amountIn == 0 || amountIn > type(uint128).max) return 0;
        bool zeroForOne = tokenIn == venue.currency0;
        if (!zeroForOne && tokenIn != venue.currency1) return 0;
        bytes memory data = abi.encodeCall(
            IQuoterV4.quoteExactInputSingle,
            (
                IQuoterV4.QuoteExactSingleParams({
                    poolKey: IQuoterV4.PoolKey({
                        currency0: venue.currency0,
                        currency1: venue.currency1,
                        fee: venue.fee,
                        tickSpacing: venue.tickSpacing,
                        hooks: venue.hooks
                    }),
                    zeroForOne: zeroForOne,
                    exactAmount: uint128(amountIn),
                    hookData: ""
                })
            )
        );
        (bool ok, bytes memory ret) = venue.quoter.staticcall(data);
        if (ok && ret.length >= 32) amountOut = abi.decode(ret, (uint256));
    }

    function _pairKey(address a, address b) private pure returns (bytes32) {
        (address lo, address hi) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encode(lo, hi));
    }

    function _max(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a : b;
    }
}
