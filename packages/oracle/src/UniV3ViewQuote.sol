// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title View quote of a Uniswap v3 pool
/// @notice Exact-in output from pool storage. No quoter call: those quoters swap and then revert,
///         which `staticcall` (and therefore `IQuoteOracle.getBestOut`) cannot observe.
/// @dev Price factors are Q128.128 values of (1/sqrt(1.0001))^(2^i), so the result matches the pool's own sqrt price.
library UniV3ViewQuote {
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = 887272;

    /// @notice Exact-in output. Returns 0 if the pool does not contain `tokenIn` or the read fails.
    function quoteExactInput(address pool, address tokenIn, uint256 amountIn) internal view returns (uint256 amountOut) {
        if (pool == address(0) || amountIn == 0) return 0;
        State memory s = _state(pool, tokenIn, amountIn);
        if (s.liq == 0 || s.spacing == 0 || s.fee >= 1e6 || s.sqrtP == 0) return 0;
        for (uint256 i = 0; i < 8 && s.remaining != 0 && s.liq != 0; ++i) {
            if (!_advance(pool, s)) break;
        }
        amountOut = s.amountOut;
    }

    struct State {
        uint160 sqrtP;
        int24 tick;
        uint128 liq;
        int24 spacing;
        uint24 fee;
        bool zeroForOne;
        uint256 remaining;
        uint256 amountOut;
    }

    function _state(address pool, address tokenIn, uint256 amountIn) private view returns (State memory s) {
        (uint256 word0, uint256 word1) = _slot0(pool);
        s.sqrtP = uint160(word0);
        s.tick = int24(int256(word1));
        s.liq = uint128(_word(pool, bytes4(keccak256("liquidity()"))));
        s.spacing = int24(int256(_word(pool, bytes4(keccak256("tickSpacing()")))));
        s.fee = uint24(_word(pool, bytes4(keccak256("fee()"))));
        address token0 = address(uint160(_word(pool, bytes4(keccak256("token0()")))));
        address token1 = address(uint160(_word(pool, bytes4(keccak256("token1()")))));
        s.zeroForOne = tokenIn == token0;
        if (!s.zeroForOne && tokenIn != token1) {
            s.liq = 0;
            return s;
        }
        s.remaining = amountIn;
    }

    function _advance(address pool, State memory s) private view returns (bool) {
        (int24 nextTick, bool initialized) = _nextTick(pool, s.tick, s.spacing, s.zeroForOne);
        if (nextTick < MIN_TICK) nextTick = MIN_TICK;
        if (nextTick > MAX_TICK) nextTick = MAX_TICK;

        uint160 sqrtTarget = _sqrtAtTick(nextTick);
        if (s.zeroForOne) {
            if (sqrtTarget < MIN_SQRT_RATIO + 1) sqrtTarget = MIN_SQRT_RATIO + 1;
            if (sqrtTarget >= s.sqrtP) return false;
        } else {
            if (sqrtTarget > MAX_SQRT_RATIO - 1) sqrtTarget = MAX_SQRT_RATIO - 1;
            if (sqrtTarget <= s.sqrtP) return false;
        }

        (uint160 sqrtNext, uint256 stepIn, uint256 stepOut, uint256 feeAmt) =
            _step(s.sqrtP, sqrtTarget, s.liq, s.remaining, s.fee);
        if (stepIn > s.remaining || feeAmt > s.remaining - stepIn) return false;
        if (stepIn + feeAmt == 0) return false;

        s.remaining -= stepIn + feeAmt;
        s.amountOut += stepOut;
        if (sqrtNext != sqrtTarget) return false;

        if (initialized) {
            (uint128 nextLiq, bool liqOk) = _addDelta(s.liq, _liquidityNet(pool, nextTick), s.zeroForOne);
            if (!liqOk) return false;
            s.liq = nextLiq;
        }
        s.tick = s.zeroForOne ? nextTick - 1 : nextTick;
        s.sqrtP = sqrtNext;
        return true;
    }

    function _slot0(address pool) private view returns (uint256 word0, uint256 word1) {
        (bool ok, bytes memory ret) = pool.staticcall(abi.encodeWithSelector(bytes4(keccak256("slot0()"))));
        if (!ok || ret.length < 64) return (0, 0);
        assembly ("memory-safe") {
            word0 := mload(add(ret, 32))
            word1 := mload(add(ret, 64))
        }
    }

    function _word(address pool, bytes4 sel) private view returns (uint256 word) {
        (bool ok, bytes memory ret) = pool.staticcall(abi.encodeWithSelector(sel));
        if (!ok || ret.length < 32) return 0;
        assembly ("memory-safe") {
            word := mload(add(ret, 32))
        }
    }

    function _liquidityNet(address pool, int24 tick) private view returns (int128 net) {
        (bool ok, bytes memory ret) = pool.staticcall(abi.encodeWithSelector(bytes4(keccak256("ticks(int24)")), tick));
        if (!ok || ret.length < 64) return 0;
        assembly ("memory-safe") {
            net := mload(add(ret, 64))
        }
    }

    function _bitmap(address pool, int16 word) private view returns (uint256 bits) {
        (bool ok, bytes memory ret) = pool.staticcall(abi.encodeWithSelector(bytes4(keccak256("tickBitmap(int16)")), word));
        if (!ok || ret.length < 32) return 0;
        assembly ("memory-safe") {
            bits := mload(add(ret, 32))
        }
    }

    function _nextTick(address pool, int24 tick, int24 spacing, bool lte) private view returns (int24 next, bool initialized) {
        int24 compressed = tick / spacing;
        if (tick < 0 && tick % spacing != 0) compressed--;

        if (lte) {
            (int16 wordPos, uint8 bitPos) = _position(compressed);
            uint256 mask = (uint256(1) << bitPos) - 1 + (uint256(1) << bitPos);
            uint256 masked = _bitmap(pool, wordPos) & mask;
            initialized = masked != 0;
            next = initialized
                ? (compressed - int24(uint24(bitPos - _msb(masked)))) * spacing
                : (compressed - int24(uint24(bitPos))) * spacing;
        } else {
            (int16 wordPos, uint8 bitPos) = _position(compressed + 1);
            uint256 mask = ~((uint256(1) << bitPos) - 1);
            uint256 masked = _bitmap(pool, wordPos) & mask;
            initialized = masked != 0;
            next = initialized
                ? (compressed + 1 + int24(uint24(_lsb(masked) - bitPos))) * spacing
                : (compressed + 1 + int24(uint24(255 - bitPos))) * spacing;
        }
    }

    function _position(int24 tick) private pure returns (int16 wordPos, uint8 bitPos) {
        wordPos = int16(tick >> 8);
        bitPos = uint8(int8(tick % 256));
    }

    function _msb(uint256 x) private pure returns (uint8 r) {
        if (x >= 1 << 128) { x >>= 128; r += 128; }
        if (x >= 1 << 64) { x >>= 64; r += 64; }
        if (x >= 1 << 32) { x >>= 32; r += 32; }
        if (x >= 1 << 16) { x >>= 16; r += 16; }
        if (x >= 1 << 8) { x >>= 8; r += 8; }
        if (x >= 1 << 4) { x >>= 4; r += 4; }
        if (x >= 1 << 2) { x >>= 2; r += 2; }
        if (x >= 1 << 1) r += 1;
    }

    function _lsb(uint256 x) private pure returns (uint8) {
        return _msb(x & (~x + 1));
    }

    function _addDelta(uint128 liquidity, int128 net, bool zeroForOne) private pure returns (uint128, bool) {
        if (zeroForOne) net = -net;
        if (net < 0) {
            uint128 sub = uint128(-net);
            if (sub > liquidity) return (liquidity, false);
            return (liquidity - sub, true);
        }
        uint128 add = uint128(net);
        if (liquidity > type(uint128).max - add) return (liquidity, false);
        return (liquidity + add, true);
    }

    function _step(uint160 sqrtCurrent, uint160 sqrtTarget, uint128 liquidity, uint256 amountRemaining, uint24 feePips)
        private
        pure
        returns (uint160 sqrtNext, uint256 amountIn, uint256 amountOut, uint256 feeAmount)
    {
        bool zeroForOne = sqrtTarget < sqrtCurrent;
        uint256 lessFee = _mulDiv(amountRemaining, 1e6 - feePips, 1e6);
        amountIn = zeroForOne
            ? _amount0Delta(sqrtTarget, sqrtCurrent, liquidity, true)
            : _amount1Delta(sqrtCurrent, sqrtTarget, liquidity, true);

        if (lessFee >= amountIn) sqrtNext = sqrtTarget;
        else sqrtNext = _nextSqrtFromInput(sqrtCurrent, liquidity, lessFee, zeroForOne);

        bool max = sqrtTarget == sqrtNext;
        if (zeroForOne) {
            if (!max) amountIn = _amount0Delta(sqrtNext, sqrtCurrent, liquidity, true);
            amountOut = _amount1Delta(sqrtNext, sqrtCurrent, liquidity, false);
        } else {
            if (!max) amountIn = _amount1Delta(sqrtCurrent, sqrtNext, liquidity, true);
            amountOut = _amount0Delta(sqrtCurrent, sqrtNext, liquidity, false);
        }

        if (!max) {
            if (amountIn > amountRemaining) amountIn = amountRemaining;
            feeAmount = amountRemaining - amountIn;
        } else {
            feeAmount = _mulDivUp(amountIn, feePips, 1e6 - feePips);
            if (amountIn + feeAmount < amountIn) feeAmount = type(uint256).max - amountIn;
        }
    }

    function _nextSqrtFromInput(uint160 sqrtP, uint128 liquidity, uint256 amount, bool zeroForOne) private pure returns (uint160) {
        if (amount == 0 || liquidity == 0 || sqrtP == 0) return sqrtP;
        if (zeroForOne) return _nextSqrtFromAmount0(sqrtP, liquidity, amount);
        uint256 quotient = amount <= type(uint160).max
            ? (amount << 96) / liquidity
            : _mulDiv(amount, 1 << 96, liquidity);
        if (uint256(sqrtP) + quotient > type(uint160).max) return type(uint160).max;
        return uint160(uint256(sqrtP) + quotient);
    }

    function _nextSqrtFromAmount0(uint160 sqrtP, uint128 liquidity, uint256 amount) private pure returns (uint160) {
        uint256 numerator1 = uint256(liquidity) << 96;
        uint256 product = amount * sqrtP;
        if (amount == 0 || product / amount == sqrtP) {
            uint256 denominator = numerator1 + product;
            if (denominator >= numerator1) return uint160(_mulDivUp(numerator1, sqrtP, denominator));
        }
        return uint160(_divUp(numerator1, (numerator1 / sqrtP) + amount));
    }

    function _amount0Delta(uint160 sqrtA, uint160 sqrtB, uint128 liquidity, bool roundUp) private pure returns (uint256) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        if (sqrtA == 0) return 0;
        uint256 numerator1 = uint256(liquidity) << 96;
        uint256 numerator2 = sqrtB - sqrtA;
        if (roundUp) return _divUp(_mulDivUp(numerator1, numerator2, sqrtB), sqrtA);
        return _mulDiv(numerator1, numerator2, sqrtB) / sqrtA;
    }

    function _amount1Delta(uint160 sqrtA, uint160 sqrtB, uint128 liquidity, bool roundUp) private pure returns (uint256) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        if (roundUp) return _mulDivUp(liquidity, sqrtB - sqrtA, 1 << 96);
        return _mulDiv(liquidity, sqrtB - sqrtA, 1 << 96);
    }

    /// @dev Q64.96 sqrt price at `tick`. Factors are (1/sqrt(1.0001))^(2^i) in Q128.128.
    function _sqrtAtTick(int24 tick) private pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
        if (absTick > uint256(uint24(MAX_TICK))) return tick < 0 ? MIN_SQRT_RATIO : MAX_SQRT_RATIO;

        uint256 ratio = (absTick & 0x1) != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        unchecked {
            if ((absTick & 0x2) != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if ((absTick & 0x4) != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if ((absTick & 0x8) != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if ((absTick & 0x10) != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if ((absTick & 0x20) != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if ((absTick & 0x40) != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if ((absTick & 0x80) != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if ((absTick & 0x100) != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if ((absTick & 0x200) != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if ((absTick & 0x400) != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if ((absTick & 0x800) != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if ((absTick & 0x1000) != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if ((absTick & 0x2000) != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if ((absTick & 0x4000) != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if ((absTick & 0x8000) != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if ((absTick & 0x10000) != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if ((absTick & 0x20000) != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if ((absTick & 0x40000) != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if ((absTick & 0x80000) != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
        }

        if (tick > 0) ratio = type(uint256).max / ratio;
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }

    function _mulDiv(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256 result) {
        uint256 prod0;
        uint256 prod1;
        assembly ("memory-safe") {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }
        if (prod1 == 0) {
            if (denominator == 0) return 0;
            return prod0 / denominator;
        }
        if (denominator <= prod1) return 0;

        uint256 remainder;
        assembly ("memory-safe") {
            remainder := mulmod(a, b, denominator)
            prod1 := sub(prod1, gt(remainder, prod0))
            prod0 := sub(prod0, remainder)
        }
        uint256 twos = denominator & (~denominator + 1);
        assembly ("memory-safe") {
            denominator := div(denominator, twos)
            prod0 := div(prod0, twos)
            twos := add(div(sub(0, twos), twos), 1)
        }
        unchecked {
            prod0 |= prod1 * twos;
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            result = prod0 * inv;
        }
    }

    function _mulDivUp(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256 result) {
        result = _mulDiv(a, b, denominator);
        if (mulmod(a, b, denominator) > 0 && result < type(uint256).max) result++;
    }

    function _divUp(uint256 x, uint256 y) private pure returns (uint256 z) {
        assembly ("memory-safe") {
            z := add(div(x, y), gt(mod(x, y), 0))
        }
    }
}
