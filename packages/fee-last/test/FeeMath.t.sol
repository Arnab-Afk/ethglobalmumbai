// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {FeeMath} from "../src/FeeMath.sol";

contract FeeMathTest is Test {
    function test_minOutBeatsRivalByAtLeastOne() public pure {
        assertEq(FeeMath.minOutToBeat(1_000_000, 0), 1_000_001);
        assertEq(FeeMath.minOutToBeat(1_000_000, 100), 1_000_100);
    }

    function test_feeIsTheLargestPipThatStillWins() public pure {
        uint256 gross = 1_000_000;
        uint256 rival = 997_000;
        uint256 minOut = FeeMath.minOutToBeat(rival, 0);
        uint24 feePips = FeeMath.feeFromSurplus(gross, minOut);
        uint256 userOut = gross - FeeMath.feeTaken(gross, feePips);

        assertGe(userOut, minOut);
        uint256 tighter = gross - FeeMath.feeTaken(gross, feePips + 1);
        assertLt(tighter, minOut);
    }

    function test_noFeeWhenTheCurveCannotWin() public pure {
        assertEq(FeeMath.feeFromSurplus(100, 100), 0);
        assertEq(FeeMath.feeFromSurplus(99, 100), 0);
    }

    function testFuzz_roundDownNeverMissesMinOut(uint128 gross, uint128 rival) public pure {
        vm.assume(gross > rival);
        vm.assume(rival > 0);
        uint256 minOut = FeeMath.minOutToBeat(rival, 0);
        vm.assume(gross >= minOut);
        uint24 feePips = FeeMath.feeFromSurplus(gross, minOut);
        uint256 userOut = uint256(gross) - FeeMath.feeTaken(gross, feePips);
        assertGe(userOut, minOut);
        if (uint256(feePips) < FeeMath.PIPS) {
            uint256 nextFee = FeeMath.feeTaken(gross, uint24(uint256(feePips) + 1));
            if (nextFee > FeeMath.feeTaken(gross, feePips) && nextFee < uint256(gross)) {
                assertLt(uint256(gross) - nextFee, minOut);
            }
        }
    }
}
