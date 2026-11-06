// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {VenueReader} from "oracle/VenueReader.sol";
import {IQuoteOracle} from "oracle/IQuoteOracle.sol";
import {AQUA_SWAPVM_ROUTER, IAqua, IAquaSwapVMRouter} from "../src/swapvm/Aqua.sol";

interface IUniV3Factory {
    function getPool(address a, address b, uint24 fee) external view returns (address);
}

interface IUniV2Factory {
    function getPair(address a, address b) external view returns (address);
}

interface IUniV3Pool {
    function token0() external view returns (address);
    function liquidity() external view returns (uint128);
    function slot0() external view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool);
}

interface IAquaRouterInfo {
    function AQUA() external view returns (address);
}

/// @notice Everything the Aqua fork demo and fork tests need, read from the forked chain or the env.
///         No market data is written here: the competitor price comes from live Uniswap pools found
///         through the factories, and the maker prices its pool off the live mid price.
/// @dev Env (all optional): AQUA_ROUTER, AQUA_TOKEN_IN, AQUA_TOKEN_OUT, AQUA_UNI_V3_FACTORY,
///      AQUA_UNI_V2_FACTORY, AQUA_AMOUNT_IN (raw units), AQUA_DEPTH_MULTIPLE, AQUA_MAKER_EDGE_BPS,
///      and the fee config names Deploy.s.sol uses: FEE_FLOOR, FEE_CAP, FALLBACK_FEE, UNDERCUT_BPS, MAX_QUOTE_AGE.
abstract contract AquaForkConfig is CommonBase {
    struct Cfg {
        IAquaSwapVMRouter router;
        IAqua aqua;
        address tokenIn;
        address tokenOut;
        address v3Factory;
        address v2Factory;
        uint256 amountIn;
        uint256 depthMultiple; // our pool holds depthMultiple × amountIn of tokenIn
        uint256 makerEdgeBps; // maker prices tokenIn this many bp above the live mid
        uint24 feeFloor;
        uint24 feeCap;
        uint24 fallbackFee;
        uint16 undercutBps;
        uint32 maxQuoteAge;
    }

    /// @dev Uniswap v3's enabled fee tiers (protocol constants, not prices).
    function _v3FeeTiers() internal pure returns (uint24[4] memory) {
        return [uint24(100), 500, 3000, 10_000];
    }

    function _loadCfg() internal view returns (Cfg memory c) {
        (address dIn, address dOut, address dV3, address dV2) = _chainDefaults();
        c.router = IAquaSwapVMRouter(vm.envOr("AQUA_ROUTER", AQUA_SWAPVM_ROUTER));
        c.aqua = IAqua(IAquaRouterInfo(address(c.router)).AQUA()); // read from the router, not configured
        c.tokenIn = vm.envOr("AQUA_TOKEN_IN", dIn);
        c.tokenOut = vm.envOr("AQUA_TOKEN_OUT", dOut);
        c.v3Factory = vm.envOr("AQUA_UNI_V3_FACTORY", dV3);
        c.v2Factory = vm.envOr("AQUA_UNI_V2_FACTORY", dV2);
        require(c.tokenIn != address(0) && c.tokenOut != address(0), "AquaForkConfig: set AQUA_TOKEN_IN/OUT");
        c.amountIn = vm.envOr("AQUA_AMOUNT_IN", 10 ** IERC20Metadata(c.tokenIn).decimals());
        c.depthMultiple = vm.envOr("AQUA_DEPTH_MULTIPLE", uint256(10_000));
        c.makerEdgeBps = vm.envOr("AQUA_MAKER_EDGE_BPS", uint256(10));
        c.feeFloor = uint24(vm.envOr("FEE_FLOOR", uint256(500)));
        c.feeCap = uint24(vm.envOr("FEE_CAP", uint256(10_000)));
        c.fallbackFee = uint24(vm.envOr("FALLBACK_FEE", uint256(3_000)));
        c.undercutBps = uint16(vm.envOr("UNDERCUT_BPS", uint256(1)));
        c.maxQuoteAge = uint32(vm.envOr("MAX_QUOTE_AGE", uint256(120)));
    }

    /// @dev Canonical WETH / USDC and Uniswap factories for chains that have the Aqua router.
    ///      Any other chain: pass them through the env.
    function _chainDefaults() internal view returns (address tokenIn, address tokenOut, address v3, address v2) {
        if (block.chainid == 1) {
            return (
                0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,
                0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,
                0x1F98431c8aD98523631AE4a59f267346ea31F984,
                0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f
            );
        }
        if (block.chainid == 8453) {
            return (
                0x4200000000000000000000000000000000000006,
                0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,
                0x33128a8fC17869897dcE68Ed026d694621f6FDfD,
                0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6
            );
        }
    }

    /// @notice VenueReader over every Uniswap v3 pool and the v2 pair that exist for the pair. Caller must be `owner`.
    function _deployVenueReader(Cfg memory c, address owner) internal returns (VenueReader venue) {
        venue = new VenueReader(owner, IQuoteOracle(address(0)));
        uint24[4] memory tiers = _v3FeeTiers();
        address[] memory found = new address[](tiers.length);
        uint256 n;
        for (uint256 i; i < tiers.length; ++i) {
            address pool = IUniV3Factory(c.v3Factory).getPool(c.tokenIn, c.tokenOut, tiers[i]);
            if (pool != address(0)) found[n++] = pool;
        }
        VenueReader.V3Venue[] memory v3 = new VenueReader.V3Venue[](n);
        for (uint256 i; i < n; ++i) {
            v3[i] = VenueReader.V3Venue({pool: found[i]});
        }
        venue.setV3Venues(c.tokenIn, c.tokenOut, v3);

        if (c.v2Factory != address(0)) {
            address pair = IUniV2Factory(c.v2Factory).getPair(c.tokenIn, c.tokenOut);
            if (pair != address(0)) {
                VenueReader.V2Venue[] memory v2 = new VenueReader.V2Venue[](1);
                v2[0] = VenueReader.V2Venue({pair: pair});
                venue.setV2Venues(c.tokenIn, c.tokenOut, v2);
            }
        }
    }

    /// @notice The v3 pool with the most in-range liquidity: its price is the market mid.
    function _deepestV3Pool(Cfg memory c) internal view returns (address best) {
        uint24[4] memory tiers = _v3FeeTiers();
        uint128 bestLiq;
        for (uint256 i; i < tiers.length; ++i) {
            address pool = IUniV3Factory(c.v3Factory).getPool(c.tokenIn, c.tokenOut, tiers[i]);
            if (pool == address(0)) continue;
            uint128 liq = IUniV3Pool(pool).liquidity();
            if (liq > bestLiq) (best, bestLiq) = (pool, liq);
        }
        require(best != address(0), "AquaForkConfig: no Uniswap v3 pool for this pair");
    }

    /// @notice `amount` of tokenIn valued in tokenOut at the live mid price (no fee, no price impact).
    function _midValue(Cfg memory c, uint256 amount) internal view returns (uint256) {
        IUniV3Pool pool = IUniV3Pool(_deepestV3Pool(c));
        (uint160 sqrtP,,,,,,) = pool.slot0();
        uint256 q96 = 1 << 96;
        if (pool.token0() == c.tokenIn) {
            return Math.mulDiv(Math.mulDiv(amount, sqrtP, q96), sqrtP, q96);
        }
        return Math.mulDiv(Math.mulDiv(amount, q96, sqrtP), q96, sqrtP);
    }

    /// @notice Maker inventory: depthMultiple × amountIn of tokenIn, and tokenOut worth that at mid + makerEdgeBps.
    function _inventory(Cfg memory c) internal view returns (uint256 reserveIn, uint256 reserveOut) {
        reserveIn = c.amountIn * c.depthMultiple;
        reserveOut = _midValue(c, reserveIn) * (10_000 + c.makerEdgeBps) / 10_000;
    }
}
