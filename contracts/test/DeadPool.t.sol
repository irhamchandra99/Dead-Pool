// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DeadPool} from "../src/DeadPool.sol";

contract Rejecter {
    receive() external payable {
        revert("no");
    }
}

contract DeadPoolTest is Test {
    DeadPool dp;

    address organizer = makeAddr("organizer");
    address judge = makeAddr("judge");
    address treasury = makeAddr("treasury");
    address sponsor = makeAddr("sponsor");
    address challenger = makeAddr("challenger");
    address[5] teamOwners;

    uint256 constant STAKE = 10 ether;
    uint256 constant BOND = 1 ether;
    uint64 constant WINDOW = 60;

    uint64 joinDeadline;
    uint64 endTime;

    function setUp() public {
        dp = new DeadPool();
        joinDeadline = uint64(block.timestamp + 1 days);
        endTime = uint64(block.timestamp + 90 days);
        for (uint256 i = 0; i < 5; i++) {
            teamOwners[i] = makeAddr(string(abi.encodePacked("team", vm.toString(i))));
            vm.deal(teamOwners[i], 100 ether);
        }
        vm.deal(sponsor, 100 ether);
        vm.deal(challenger, 100 ether);
    }

    // ------------------------------------------------------------- helpers

    function _config() internal view returns (DeadPool.PoolConfig memory) {
        return DeadPool.PoolConfig({
            name: "Monad Blitz Jogja",
            judge: judge,
            treasury: treasury,
            stakeAmount: STAKE,
            challengeBond: BOND,
            joinDeadline: joinDeadline,
            endTime: endTime,
            challengeWindow: WINDOW,
            feeBps: 1000
        });
    }

    function _create() internal returns (uint256 id) {
        vm.prank(organizer);
        id = dp.createPool(_config());
    }

    function _join(uint256 id, uint256 n) internal {
        for (uint256 i = 0; i < n; i++) {
            vm.prank(teamOwners[i]);
            dp.join{value: STAKE}(id, string(abi.encodePacked("https://github.com/t/", vm.toString(i))));
        }
    }

    function _judge(uint256 id, uint256 teamId, bool alive) internal {
        vm.prank(judge);
        dp.submitVerdict(id, teamId, alive, keccak256("json"), alive ? "ALIVE: ok" : "DEAD: no commits");
    }

    /// 5 teams, 2 alive (0,1), 3 dead, 20 MON bonus, all verdicts past the window.
    function _scenario() internal returns (uint256 id) {
        id = _create();
        _join(id, 5);
        vm.prank(sponsor);
        dp.fundBonus{value: 20 ether}(id);
        vm.warp(endTime);
        _judge(id, 0, true);
        _judge(id, 1, true);
        _judge(id, 2, false);
        _judge(id, 3, false);
        _judge(id, 4, false);
        vm.warp(endTime + WINDOW + 1);
    }

    // ----------------------------------------------------------- createPool

    function test_createPool_storesConfig() public {
        uint256 id = _create();
        DeadPool.Pool memory p = dp.getPool(id);
        assertEq(p.organizer, organizer);
        assertEq(p.stakeAmount, STAKE);
        assertEq(p.feeBps, 1000);
        assertEq(dp.poolCount(), 1);
    }

    function test_createPool_rejectsBadTimes() public {
        DeadPool.PoolConfig memory c = _config();
        c.joinDeadline = uint64(block.timestamp);
        vm.expectRevert(DeadPool.InvalidConfig.selector);
        dp.createPool(c);

        c = _config();
        c.endTime = c.joinDeadline;
        vm.expectRevert(DeadPool.InvalidConfig.selector);
        dp.createPool(c);
    }

    function test_createPool_rejectsHighFeeAndZeroes() public {
        DeadPool.PoolConfig memory c = _config();
        c.feeBps = 2001;
        vm.expectRevert(DeadPool.InvalidConfig.selector);
        dp.createPool(c);

        c = _config();
        c.stakeAmount = 0;
        vm.expectRevert(DeadPool.InvalidConfig.selector);
        dp.createPool(c);

        c = _config();
        c.judge = address(0);
        vm.expectRevert(DeadPool.InvalidConfig.selector);
        dp.createPool(c);
    }

    function test_unknownPool_reverts() public {
        vm.expectRevert(DeadPool.UnknownPool.selector);
        dp.getPool(0);
    }

    // ----------------------------------------------------------------- join

    function test_join_succeedsWithExactStake() public {
        uint256 id = _create();
        _join(id, 1);
        DeadPool.Team memory t = dp.getTeam(id, 0);
        assertEq(t.owner, teamOwners[0]);
        assertEq(dp.poolBalance(id), STAKE);
    }

    function test_join_rejectsWrongStake() public {
        uint256 id = _create();
        vm.prank(teamOwners[0]);
        vm.expectRevert(DeadPool.WrongStake.selector);
        dp.join{value: STAKE - 1}(id, "https://github.com/a/b");
    }

    function test_join_rejectsAfterDeadline() public {
        uint256 id = _create();
        vm.warp(joinDeadline);
        vm.prank(teamOwners[0]);
        vm.expectRevert(DeadPool.JoinClosed.selector);
        dp.join{value: STAKE}(id, "https://github.com/a/b");
    }

    function test_join_rejectsEmptyRepo() public {
        uint256 id = _create();
        vm.prank(teamOwners[0]);
        vm.expectRevert(DeadPool.EmptyRepo.selector);
        dp.join{value: STAKE}(id, "");
    }

    // ------------------------------------------------------------ fundBonus

    function test_fundBonus_tracksSponsor() public {
        uint256 id = _create();
        vm.prank(sponsor);
        dp.fundBonus{value: 3 ether}(id);
        assertEq(dp.getPool(id).bonusTotal, 3 ether);
        assertEq(dp.bonusOf(id, sponsor), 3 ether);
        assertEq(dp.poolBalance(id), 3 ether);
    }

    function test_fundBonus_rejectsZeroAndAfterFinalize() public {
        uint256 id = _scenario();
        vm.prank(sponsor);
        vm.expectRevert(DeadPool.ZeroAmount.selector);
        dp.fundBonus{value: 0}(id);

        dp.finalize(id);
        vm.prank(sponsor);
        vm.expectRevert(DeadPool.AlreadyFinalized.selector);
        dp.fundBonus{value: 1 ether}(id);
    }

    // -------------------------------------------------------- submitVerdict

    function test_submitVerdict_onlyJudge() public {
        uint256 id = _create();
        _join(id, 1);
        vm.warp(endTime);
        vm.expectRevert(DeadPool.NotJudge.selector);
        dp.submitVerdict(id, 0, true, bytes32(0), "ALIVE: x");
    }

    function test_submitVerdict_notBeforeEnd() public {
        uint256 id = _create();
        _join(id, 1);
        vm.prank(judge);
        vm.expectRevert(DeadPool.TooEarly.selector);
        dp.submitVerdict(id, 0, true, bytes32(0), "ALIVE: x");
    }

    function test_submitVerdict_onlyOnce_andStoresReason() public {
        uint256 id = _create();
        _join(id, 1);
        vm.warp(endTime);

        vm.expectEmit(true, true, false, true);
        emit DeadPool.VerdictSubmitted(id, 0, false, keccak256("json"), "DEAD: no commits");
        _judge(id, 0, false);

        DeadPool.Team memory t = dp.getTeam(id, 0);
        assertEq(uint256(t.verdict), uint256(DeadPool.Verdict.Dead));
        assertEq(t.reason, "DEAD: no commits");
        assertEq(t.reasonHash, keccak256("json"));

        vm.prank(judge);
        vm.expectRevert(DeadPool.AlreadyJudged.selector);
        dp.submitVerdict(id, 0, true, bytes32(0), "ALIVE: x");
    }

    function test_submitVerdict_unknownTeam() public {
        uint256 id = _create();
        vm.warp(endTime);
        vm.prank(judge);
        vm.expectRevert(DeadPool.UnknownTeam.selector);
        dp.submitVerdict(id, 0, true, bytes32(0), "ALIVE: x");
    }

    // ------------------------------------------------------------ challenge

    function _judgedPool() internal returns (uint256 id) {
        id = _create();
        _join(id, 2);
        vm.warp(endTime);
        _judge(id, 0, true);
        _judge(id, 1, false);
    }

    function test_challenge_requiresVerdictAndBond() public {
        uint256 id = _create();
        _join(id, 1);
        vm.warp(endTime);
        vm.prank(challenger);
        vm.expectRevert(DeadPool.NotJudged.selector);
        dp.challenge{value: BOND}(id, 0, "x");

        _judge(id, 0, true);
        vm.prank(challenger);
        vm.expectRevert(DeadPool.WrongBond.selector);
        dp.challenge{value: BOND - 1}(id, 0, "x");
    }

    function test_challenge_rejectsAfterWindow() public {
        uint256 id = _judgedPool();
        vm.warp(endTime + WINDOW + 1);
        vm.prank(challenger);
        vm.expectRevert(DeadPool.ChallengeWindowOver.selector);
        dp.challenge{value: BOND}(id, 0, "x");
    }

    function test_challenge_onlyOncePerTeam() public {
        uint256 id = _judgedPool();
        vm.prank(challenger);
        dp.challenge{value: BOND}(id, 0, "fake commits");

        vm.prank(challenger);
        vm.expectRevert(DeadPool.AlreadyChallenged.selector);
        dp.challenge{value: BOND}(id, 0, "again");

        vm.prank(organizer);
        dp.resolveChallenge(id, 0, false);

        vm.prank(challenger);
        vm.expectRevert(DeadPool.AlreadyChallenged.selector);
        dp.challenge{value: BOND}(id, 0, "third time");
    }

    // ----------------------------------------------------- resolveChallenge

    function test_resolveChallenge_upheldFlipsAndRefundsBond() public {
        uint256 id = _judgedPool();
        vm.prank(challenger);
        dp.challenge{value: BOND}(id, 0, "zombie");
        uint256 before = challenger.balance;

        vm.prank(organizer);
        dp.resolveChallenge(id, 0, true);

        assertEq(uint256(dp.getTeam(id, 0).verdict), uint256(DeadPool.Verdict.Dead));
        assertEq(challenger.balance, before + BOND);
        assertEq(dp.forfeitedBonds(id), 0);
    }

    function test_resolveChallenge_rejectedForfeitsBond() public {
        uint256 id = _judgedPool();
        vm.prank(challenger);
        dp.challenge{value: BOND}(id, 1, "actually alive");

        vm.prank(organizer);
        dp.resolveChallenge(id, 1, false);

        assertEq(uint256(dp.getTeam(id, 1).verdict), uint256(DeadPool.Verdict.Dead));
        assertEq(dp.forfeitedBonds(id), BOND);
        assertEq(dp.poolBalance(id), 2 * STAKE + BOND);
    }

    function test_resolveChallenge_onlyOrganizerAndOpen() public {
        uint256 id = _judgedPool();
        vm.prank(organizer);
        vm.expectRevert(DeadPool.NoOpenChallenge.selector);
        dp.resolveChallenge(id, 0, true);

        vm.prank(challenger);
        dp.challenge{value: BOND}(id, 0, "x");
        vm.expectRevert(DeadPool.NotOrganizer.selector);
        dp.resolveChallenge(id, 0, true);
    }

    // ------------------------------------------------------------- finalize

    function test_finalize_blockedByPendingChallengeOrWindow() public {
        uint256 id = _create();
        _join(id, 2);
        vm.warp(endTime);
        _judge(id, 0, true);

        vm.expectRevert(DeadPool.NotFinalizable.selector); // team 1 still pending
        dp.finalize(id);

        _judge(id, 1, false);
        vm.expectRevert(DeadPool.NotFinalizable.selector); // window still open
        dp.finalize(id);

        vm.prank(challenger);
        dp.challenge{value: BOND}(id, 1, "x");
        vm.warp(endTime + WINDOW + 1);
        vm.expectRevert(DeadPool.NotFinalizable.selector); // challenge still open
        dp.finalize(id);

        vm.prank(organizer);
        dp.resolveChallenge(id, 1, false);
        dp.finalize(id);
        assertTrue(dp.getPool(id).finalized);
    }

    function test_finalize_onlyOnce() public {
        uint256 id = _scenario();
        dp.finalize(id);
        vm.expectRevert(DeadPool.AlreadyFinalized.selector);
        dp.finalize(id);
    }

    /// Spec example: stake 10, 5 teams, 2 alive, 3 dead, fee 10%, bonus 20 → 33.5 each, 3 to treasury.
    function test_payout_specExample() public {
        uint256 id = _scenario();
        dp.finalize(id);

        DeadPool.Pool memory p = dp.getPool(id);
        assertEq(p.aliveCount, 2);
        assertEq(p.payoutPerAlive, 23.5 ether);
        assertEq(dp.treasuryBalance(treasury), 3 ether);

        uint256 before = teamOwners[0].balance;
        vm.prank(teamOwners[0]);
        dp.claim(id, 0);
        assertEq(teamOwners[0].balance, before + 33.5 ether);

        vm.prank(teamOwners[1]);
        dp.claim(id, 1);

        vm.prank(treasury);
        dp.withdrawTreasury();
        assertEq(treasury.balance, 3 ether);

        assertEq(dp.poolBalance(id), 0);
        assertEq(address(dp).balance, 0);
    }

    /// Example used in the pitch: 8 teams × 50, bonus 300, 4 alive → 170 each.
    function test_payout_pitchExample() public {
        DeadPool.PoolConfig memory c = _config();
        c.stakeAmount = 50 ether;
        vm.prank(organizer);
        uint256 id = dp.createPool(c);
        for (uint256 i = 0; i < 8; i++) {
            address o = makeAddr(string(abi.encodePacked("p", vm.toString(i))));
            vm.deal(o, 50 ether);
            vm.prank(o);
            dp.join{value: 50 ether}(id, "https://github.com/x/y");
        }
        vm.deal(sponsor, 300 ether);
        vm.prank(sponsor);
        dp.fundBonus{value: 300 ether}(id);
        assertEq(dp.poolBalance(id), 700 ether);

        vm.warp(endTime);
        for (uint256 i = 0; i < 8; i++) {
            _judge(id, i, i < 4);
        }
        vm.warp(endTime + WINDOW + 1);
        dp.finalize(id);

        assertEq(dp.getPool(id).payoutPerAlive, 120 ether); // + 50 stake = 170
        assertEq(dp.treasuryBalance(treasury), 20 ether);
    }

    function test_payout_dustGoesToTreasury() public {
        DeadPool.PoolConfig memory c = _config();
        c.feeBps = 0;
        vm.prank(organizer);
        uint256 id = dp.createPool(c);
        _join(id, 4); // 3 alive, 1 dead → 10 / 3
        vm.warp(endTime);
        _judge(id, 0, true);
        _judge(id, 1, true);
        _judge(id, 2, true);
        _judge(id, 3, false);
        vm.warp(endTime + WINDOW + 1);
        dp.finalize(id);

        uint256 share = uint256(10 ether) / 3;
        assertEq(dp.getPool(id).payoutPerAlive, share);
        assertEq(dp.treasuryBalance(treasury), 10 ether - share * 3);

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(teamOwners[i]);
            dp.claim(id, i);
        }
        vm.prank(treasury);
        dp.withdrawTreasury();
        assertEq(address(dp).balance, 0);
    }

    function test_payout_nobodyAlive_refundsSponsor() public {
        uint256 id = _create();
        _join(id, 2);
        vm.prank(sponsor);
        dp.fundBonus{value: 5 ether}(id);
        vm.warp(endTime);
        _judge(id, 0, false);
        _judge(id, 1, false);
        vm.warp(endTime + WINDOW + 1);
        dp.finalize(id);

        assertEq(dp.treasuryBalance(treasury), 2 * STAKE);
        uint256 before = sponsor.balance;
        vm.prank(sponsor);
        dp.refundBonus(id);
        assertEq(sponsor.balance, before + 5 ether);

        vm.prank(sponsor);
        vm.expectRevert(DeadPool.NothingToRefund.selector);
        dp.refundBonus(id);
    }

    function test_refundBonus_notWhenSomeoneAlive() public {
        uint256 id = _scenario();
        vm.prank(sponsor);
        vm.expectRevert(DeadPool.NotFinalized.selector);
        dp.refundBonus(id);

        dp.finalize(id);
        vm.prank(sponsor);
        vm.expectRevert(DeadPool.NothingToRefund.selector);
        dp.refundBonus(id);
    }

    function test_emptyPool_finalizes() public {
        uint256 id = _create();
        vm.prank(sponsor);
        dp.fundBonus{value: 1 ether}(id);
        vm.warp(endTime);
        dp.finalize(id);
        vm.prank(sponsor);
        dp.refundBonus(id);
        assertEq(address(dp).balance, 0);
    }

    // ---------------------------------------------------------------- claim

    function test_claim_rules() public {
        uint256 id = _scenario();

        vm.prank(teamOwners[0]);
        vm.expectRevert(DeadPool.NotFinalized.selector);
        dp.claim(id, 0);

        dp.finalize(id);

        vm.prank(teamOwners[2]);
        vm.expectRevert(DeadPool.NotAlive.selector);
        dp.claim(id, 2);

        vm.prank(teamOwners[1]);
        vm.expectRevert(DeadPool.NotOwner.selector);
        dp.claim(id, 0);

        vm.prank(teamOwners[0]);
        dp.claim(id, 0);
        vm.prank(teamOwners[0]);
        vm.expectRevert(DeadPool.AlreadyClaimed.selector);
        dp.claim(id, 0);
    }

    function test_withdrawTreasury_nothing() public {
        vm.expectRevert(DeadPool.NothingToWithdraw.selector);
        dp.withdrawTreasury();
    }

    /// A team owner that rejects ETH only blocks its own claim, never finalize.
    function test_rejectingOwner_doesNotBlockFinalize() public {
        Rejecter r = new Rejecter();
        vm.deal(address(r), STAKE);
        uint256 id = _create();
        vm.prank(address(r));
        dp.join{value: STAKE}(id, "https://github.com/r/r");
        _join(id, 1);
        vm.warp(endTime);
        _judge(id, 0, true);
        _judge(id, 1, false);
        vm.warp(endTime + WINDOW + 1);
        dp.finalize(id);

        vm.prank(address(r));
        vm.expectRevert(DeadPool.TransferFailed.selector);
        dp.claim(id, 0);
    }

    function test_getTeams_returnsAll() public {
        uint256 id = _create();
        _join(id, 3);
        DeadPool.Team[] memory list = dp.getTeams(id);
        assertEq(list.length, 3);
        assertEq(list[2].owner, teamOwners[2]);
    }
}
