// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Dead Pool
/// @notice Per-hackathon commitment pools. Teams stake on their project staying
///         alive; an off-chain AI judge records alive/dead verdicts (with the full
///         reason stored on-chain); survivors split the stakes of dead teams plus
///         any sponsor bonus.
contract DeadPool {
    enum Verdict {
        Pending,
        Alive,
        Dead
    }

    struct PoolConfig {
        string name;
        address judge;
        address treasury;
        uint256 stakeAmount;
        uint256 challengeBond;
        uint64 joinDeadline;
        uint64 endTime;
        uint64 challengeWindow;
        uint16 feeBps;
    }

    struct Pool {
        string name;
        address organizer; // also the challenge arbiter in this MVP
        address judge;
        address treasury;
        uint256 stakeAmount;
        uint256 challengeBond;
        uint64 joinDeadline;
        uint64 endTime;
        uint64 challengeWindow;
        uint16 feeBps;
        uint256 bonusTotal;
        uint256 teamCount;
        uint256 aliveCount; // set at finalize
        uint256 payoutPerAlive; // extra share per alive team, set at finalize
        bool finalized;
    }

    struct Team {
        address owner;
        string repoUrl;
        Verdict verdict;
        uint64 verdictAt;
        bytes32 reasonHash; // keccak256 of the judge's full JSON verdict file
        string reason; // short reason, prefixed "ALIVE:", "DEAD:" or "ZOMBIE:"
        bool challenged; // a challenge is open
        bool challengeUsed; // one challenge per team
        address challenger;
        bool claimed;
    }

    uint16 public constant MAX_FEE_BPS = 2000;

    uint256 public poolCount;
    mapping(uint256 => Pool) internal pools;
    mapping(uint256 => mapping(uint256 => Team)) internal teams;
    mapping(uint256 => mapping(address => uint256)) public bonusOf;
    mapping(uint256 => uint256) public forfeitedBonds;
    /// @notice Funds still owed out of each pool (stakes, bonus, forfeited bonds). Used as the pool's TVL.
    mapping(uint256 => uint256) public escrow;
    /// @notice Fees and leftovers owed to treasuries, withdrawn with `withdrawTreasury` (pull pattern).
    mapping(address => uint256) public treasuryBalance;

    uint256 private _lock = 1;

    event PoolCreated(uint256 indexed poolId, address indexed organizer, string name);
    event TeamJoined(uint256 indexed poolId, uint256 indexed teamId, address indexed owner, string repoUrl);
    event BonusFunded(uint256 indexed poolId, address indexed sponsor, uint256 amount);
    event VerdictSubmitted(uint256 indexed poolId, uint256 indexed teamId, bool alive, bytes32 reasonHash, string reason);
    event Challenged(uint256 indexed poolId, uint256 indexed teamId, address indexed challenger, string evidence);
    event ChallengeResolved(uint256 indexed poolId, uint256 indexed teamId, bool upheld, bool aliveNow);
    event PoolFinalized(uint256 indexed poolId, uint256 aliveCount, uint256 payoutPerAlive, uint256 fee);
    event Claimed(uint256 indexed poolId, uint256 indexed teamId, address indexed owner, uint256 amount);
    event BonusRefunded(uint256 indexed poolId, address indexed sponsor, uint256 amount);
    event TreasuryWithdrawn(address indexed treasury, uint256 amount);

    error InvalidConfig();
    error UnknownPool();
    error UnknownTeam();
    error JoinClosed();
    error WrongStake();
    error EmptyRepo();
    error ZeroAmount();
    error AlreadyFinalized();
    error NotFinalized();
    error NotJudge();
    error NotOrganizer();
    error NotOwner();
    error TooEarly();
    error AlreadyJudged();
    error NotJudged();
    error ChallengeWindowOver();
    error AlreadyChallenged();
    error WrongBond();
    error NoOpenChallenge();
    error NotFinalizable();
    error NotAlive();
    error AlreadyClaimed();
    error NothingToRefund();
    error NothingToWithdraw();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier poolExists(uint256 poolId) {
        if (poolId >= poolCount) revert UnknownPool();
        _;
    }

    // ---------------------------------------------------------------- writes

    function createPool(PoolConfig calldata c) external returns (uint256 poolId) {
        if (
            c.stakeAmount == 0 || c.judge == address(0) || c.treasury == address(0) || c.feeBps > MAX_FEE_BPS
                || block.timestamp >= c.joinDeadline || c.joinDeadline >= c.endTime
        ) revert InvalidConfig();

        poolId = poolCount++;
        Pool storage p = pools[poolId];
        p.name = c.name;
        p.organizer = msg.sender;
        p.judge = c.judge;
        p.treasury = c.treasury;
        p.stakeAmount = c.stakeAmount;
        p.challengeBond = c.challengeBond;
        p.joinDeadline = c.joinDeadline;
        p.endTime = c.endTime;
        p.challengeWindow = c.challengeWindow;
        p.feeBps = c.feeBps;

        emit PoolCreated(poolId, msg.sender, c.name);
    }

    function join(uint256 poolId, string calldata repoUrl)
        external
        payable
        poolExists(poolId)
        returns (uint256 teamId)
    {
        Pool storage p = pools[poolId];
        if (block.timestamp >= p.joinDeadline) revert JoinClosed();
        if (msg.value != p.stakeAmount) revert WrongStake();
        if (bytes(repoUrl).length == 0) revert EmptyRepo();

        teamId = p.teamCount++;
        Team storage t = teams[poolId][teamId];
        t.owner = msg.sender;
        t.repoUrl = repoUrl;
        escrow[poolId] += msg.value;

        emit TeamJoined(poolId, teamId, msg.sender, repoUrl);
    }

    function fundBonus(uint256 poolId) external payable poolExists(poolId) {
        Pool storage p = pools[poolId];
        if (p.finalized) revert AlreadyFinalized();
        if (msg.value == 0) revert ZeroAmount();

        p.bonusTotal += msg.value;
        bonusOf[poolId][msg.sender] += msg.value;
        escrow[poolId] += msg.value;

        emit BonusFunded(poolId, msg.sender, msg.value);
    }

    function submitVerdict(uint256 poolId, uint256 teamId, bool alive, bytes32 reasonHash, string calldata reason)
        external
        poolExists(poolId)
    {
        Pool storage p = pools[poolId];
        if (msg.sender != p.judge) revert NotJudge();
        if (p.finalized) revert AlreadyFinalized();
        if (block.timestamp < p.endTime) revert TooEarly();
        Team storage t = _team(poolId, teamId);
        if (t.verdict != Verdict.Pending) revert AlreadyJudged();

        t.verdict = alive ? Verdict.Alive : Verdict.Dead;
        t.verdictAt = uint64(block.timestamp);
        t.reasonHash = reasonHash;
        t.reason = reason;

        emit VerdictSubmitted(poolId, teamId, alive, reasonHash, reason);
    }

    function challenge(uint256 poolId, uint256 teamId, string calldata evidence)
        external
        payable
        poolExists(poolId)
    {
        Pool storage p = pools[poolId];
        if (p.finalized) revert AlreadyFinalized();
        Team storage t = _team(poolId, teamId);
        if (t.verdict == Verdict.Pending) revert NotJudged();
        if (block.timestamp > uint256(t.verdictAt) + p.challengeWindow) revert ChallengeWindowOver();
        if (t.challengeUsed) revert AlreadyChallenged();
        if (msg.value != p.challengeBond) revert WrongBond();

        t.challenged = true;
        t.challengeUsed = true;
        t.challenger = msg.sender;

        emit Challenged(poolId, teamId, msg.sender, evidence);
    }

    function resolveChallenge(uint256 poolId, uint256 teamId, bool upheld)
        external
        nonReentrant
        poolExists(poolId)
    {
        Pool storage p = pools[poolId];
        if (msg.sender != p.organizer) revert NotOrganizer();
        if (p.finalized) revert AlreadyFinalized();
        Team storage t = _team(poolId, teamId);
        if (!t.challenged) revert NoOpenChallenge();

        t.challenged = false;
        address challenger = t.challenger;
        uint256 bond = p.challengeBond;

        if (upheld) {
            t.verdict = t.verdict == Verdict.Alive ? Verdict.Dead : Verdict.Alive;
            emit ChallengeResolved(poolId, teamId, true, t.verdict == Verdict.Alive);
            _send(challenger, bond);
        } else {
            forfeitedBonds[poolId] += bond;
            escrow[poolId] += bond;
            emit ChallengeResolved(poolId, teamId, false, t.verdict == Verdict.Alive);
        }
    }

    function finalize(uint256 poolId) external nonReentrant poolExists(poolId) {
        Pool storage p = pools[poolId];
        if (p.finalized) revert AlreadyFinalized();
        if (block.timestamp < p.endTime) revert NotFinalizable();

        uint256 alive;
        uint256 n = p.teamCount;
        for (uint256 i = 0; i < n; i++) {
            Team storage t = teams[poolId][i];
            if (t.verdict == Verdict.Pending || t.challenged) revert NotFinalizable();
            if (block.timestamp <= uint256(t.verdictAt) + p.challengeWindow) revert NotFinalizable();
            if (t.verdict == Verdict.Alive) alive++;
        }

        uint256 forfeited = (n - alive) * p.stakeAmount;
        uint256 fee = forfeited * p.feeBps / 10_000;
        uint256 toTreasury;

        if (alive > 0) {
            uint256 distributable = forfeited - fee + p.bonusTotal + forfeitedBonds[poolId];
            uint256 share = distributable / alive;
            p.payoutPerAlive = share;
            toTreasury = fee + (distributable - share * alive);
        } else {
            // Nobody survived: dead stakes and forfeited bonds go to the treasury,
            // sponsors take their bonus back with refundBonus.
            toTreasury = forfeited + forfeitedBonds[poolId];
        }

        p.aliveCount = alive;
        p.finalized = true;
        escrow[poolId] -= toTreasury;
        treasuryBalance[p.treasury] += toTreasury;

        emit PoolFinalized(poolId, alive, p.payoutPerAlive, fee);
    }

    function claim(uint256 poolId, uint256 teamId) external nonReentrant poolExists(poolId) {
        Pool storage p = pools[poolId];
        if (!p.finalized) revert NotFinalized();
        Team storage t = _team(poolId, teamId);
        if (msg.sender != t.owner) revert NotOwner();
        if (t.verdict != Verdict.Alive) revert NotAlive();
        if (t.claimed) revert AlreadyClaimed();

        t.claimed = true;
        uint256 amount = p.stakeAmount + p.payoutPerAlive;
        escrow[poolId] -= amount;
        emit Claimed(poolId, teamId, msg.sender, amount);
        _send(msg.sender, amount);
    }

    function refundBonus(uint256 poolId) external nonReentrant poolExists(poolId) {
        Pool storage p = pools[poolId];
        if (!p.finalized) revert NotFinalized();
        uint256 amount = bonusOf[poolId][msg.sender];
        if (p.aliveCount != 0 || amount == 0) revert NothingToRefund();

        bonusOf[poolId][msg.sender] = 0;
        escrow[poolId] -= amount;
        emit BonusRefunded(poolId, msg.sender, amount);
        _send(msg.sender, amount);
    }

    function withdrawTreasury() external nonReentrant {
        uint256 amount = treasuryBalance[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        treasuryBalance[msg.sender] = 0;
        emit TreasuryWithdrawn(msg.sender, amount);
        _send(msg.sender, amount);
    }

    // ----------------------------------------------------------------- reads

    function getPool(uint256 poolId) external view poolExists(poolId) returns (Pool memory) {
        return pools[poolId];
    }

    function getTeams(uint256 poolId) external view poolExists(poolId) returns (Team[] memory list) {
        uint256 n = pools[poolId].teamCount;
        list = new Team[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = teams[poolId][i];
        }
    }

    function getTeam(uint256 poolId, uint256 teamId) external view poolExists(poolId) returns (Team memory) {
        return _team(poolId, teamId);
    }

    /// @notice Total value still locked in a pool (stakes + bonus + forfeited bonds not yet paid out).
    function poolBalance(uint256 poolId) external view poolExists(poolId) returns (uint256) {
        return escrow[poolId];
    }

    // -------------------------------------------------------------- internal

    function _team(uint256 poolId, uint256 teamId) internal view returns (Team storage t) {
        if (teamId >= pools[poolId].teamCount) revert UnknownTeam();
        t = teams[poolId][teamId];
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
