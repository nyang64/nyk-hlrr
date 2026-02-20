// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title Hash Lierre (HLRR) — ERC20 token with staking, adjustable APR, emergency mode, Merkle airdrop, and presale
/// @author Nyk Labs
/// @notice HLRR is an ERC20 token with 8 decimals that supports staking with auto-compounding rewards,
///         owner-controlled APR, emergency withdrawals, Merkle-proof based airdrops, and USDC presale.
/// @dev
///  - Token uses 8 decimals.
///  - APR is expressed in basis points (1% = 100, 12% = 1200).
///  - Rewards are calculated lazily and auto-compounded on stake/claim.
///  - Rewards are minted when claimed and added to the staked amount.
///  - Total supply is capped by MAX_SUPPLY.
///  - Emergency mode disables rewards and allows principal-only withdrawals.
///  - Lock period is tracked per-user from their FIRST stake, not reset on subsequent stakes.
///  - Presale allows users to purchase HLRR with USDC at a fixed rate.
///  - This contract uses OpenZeppelin ERC20, Ownable, and ReentrancyGuard.
contract HashLierre is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // =============================================================
    //                           CONSTANTS
    // =============================================================

    /// @notice Number of decimals used by the token (8)
    uint8 public constant DECIMALS_8 = 8;

    /// @notice Maximum token supply: 60,000,000 HLRR per chain (120M total across 2 deployments)
    /// @dev Base: 40M, BNB: 40M, Staking Rewards Reserve: 20M on Base and 20M on BNB = 120M total
    uint256 public constant MAX_SUPPLY = 60_000_000 * 1e8;

    /// @notice Minimum lock period for staking before normal unstake is allowed
    uint256 public constant MIN_STAKE_PERIOD = 14 days;

    /// @notice Minimum amount that can be staked to prevent dust and spam
    uint256 public constant MIN_STAKE_AMOUNT = 100 * 1e8; // 100 tokens

    /// @notice Maximum APR in basis points (12%)
    uint256 public constant MAX_APR = 1200;

    /// @notice Minimum interval between APR changes (1 year)
    uint256 public constant MIN_APR_CHANGE_INTERVAL = 365 days;

    /// @notice Presale price: 1 HLRR = 0.075 USDC
    /// @dev Rate calculation: HLRR (8 decimals) per USDC (6 decimals)
    /// @dev 1 USDC = 1/0.075 HLRR = 13.333... HLRR
    /// @dev In base units: hlrrAmount = usdcAmount * 4000 / 3
    uint256 public constant PRESALE_RATE_NUMERATOR = 4000;
    uint256 public constant PRESALE_RATE_DENOMINATOR = 3;

    // =============================================================
    //                           STRUCTS
    // =============================================================

    /// @notice Staking position data for a user
    /// @dev All amounts are in token base units (8 decimals)
    /// @dev Struct is optimized for storage: 2 slots instead of 4
    /// @dev Slot 0: amount (128 bits) + rewardDebt (128 bits)
    /// @dev Slot 1: lastUpdate (64 bits) + initialStakeTime (64 bits) + 128 bits unused
    struct StakeInfo {
        uint128 amount;              // Total staked amount (max 120M tokens = ~1.2e16 base units, fits in uint128)
        uint128 rewardDebt;          // Accumulated rewards not yet restaked
        uint64 lastUpdate;           // Last timestamp when rewards were accounted
        uint64 initialStakeTime;     // Timestamp of the FIRST stake (never reset)
    }

    // =============================================================
    //                           STORAGE
    // =============================================================

    /// @notice Mapping from user address to their staking position
    mapping(address => StakeInfo) public stakes;

    /// @notice Total amount of tokens currently staked in the contract
    uint256 public totalStaked;

    /// @notice Total rewards ever distributed (for analytics)
    uint256 public totalRewardsDistributed;

    /// @notice Whether new staking is paused
    bool public stakingPaused = false;

    /// @notice Whether emergency mode is enabled (disables rewards and enables emergency withdrawals)
    bool public emergencyMode = false;

    /// @notice Annual Percentage Rate in basis points (e.g., 1200 = 12.00%)
    uint256 public apr = 1200;

    /// @notice Last time the APR was changed
    uint256 public lastAPRChange;

    /// @notice Merkle root used for airdrop claims
    bytes32 public merkleRoot;

    /// @notice Tracks whether an address has already claimed its airdrop
    mapping(address => bool) public airdropClaimed;

    // =============================================================
    //                      PRESALE STORAGE
    // =============================================================

    /// @notice Whether presale is currently active
    bool public presaleActive = false;

    /// @notice USDC token contract address (set by owner)
    IERC20 public presalePaymentToken;

    /// @notice Wallet that receives presale USDC payments
    address public presaleWallet;

    /// @notice Minimum USDC amount per purchase (6 decimals)
    uint256 public presaleMinPurchase = 50 * 1e6; // 50 USDC

    /// @notice Maximum USDC amount per purchase (6 decimals)
    uint256 public presaleMaxPurchase = 50_000 * 1e6; // 50,000 USDC

    /// @notice Maximum total USDC that can be raised in presale
    uint256 public presaleHardCap = 1_000_000 * 1e6; // 1M USDC

    /// @notice Total USDC raised in presale so far
    uint256 public presaleTotalRaised;

    /// @notice Total HLRR sold in presale so far
    uint256 public presaleTotalSold;

    /// @notice Tracks total USDC contributed per user
    mapping(address => uint256) public presaleContributions;

    // =============================================================
    //                           EVENTS
    // =============================================================

    event Minted(address indexed to, uint256 amount, string tag);
    event Staked(address indexed user, uint256 amount, uint256 autoCompoundedReward);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event StakingPaused(bool paused);
    event APRUpdated(uint256 oldApr, uint256 newApr);
    event EmergencyMode(bool enabled);
    event EmergencyUnstake(address indexed user, uint256 amount);
    event MerkleRootSet(bytes32 indexed merkleRoot);
    event AirdropClaimed(address indexed user, uint256 amount);
    event PresaleConfigured(address indexed paymentToken, address indexed wallet, uint256 minPurchase, uint256 maxPurchase, uint256 hardCap);
    event PresaleStatusChanged(bool active);
    event PresalePurchase(address indexed buyer, uint256 usdcAmount, uint256 hlrrAmount);

    // =============================================================
    //                           CONSTRUCTOR
    // =============================================================

    /// @notice Deploys the HLRR token contract
    /// @dev Sets token name/symbol and assigns ownership to deployer
    constructor() ERC20("Hashed Lierre", "hlrr") Ownable(msg.sender) {
        lastAPRChange = block.timestamp;
    }

    /// @notice Returns the number of decimals used by the token
    function decimals() public pure override returns (uint8) {
        return DECIMALS_8;
    }

    // =============================================================
    //                           MINTING
    // =============================================================

    /// @notice Mint new tokens (owner only)
    /// @dev Cannot exceed MAX_SUPPLY
    /// @param receiver Address that receives the minted tokens
    /// @param amount Amount to mint (base units, 8 decimals)
    /// @param tag Informational tag for off-chain indexing / accounting
    function mint(address receiver, uint256 amount, string calldata tag) external onlyOwner {
        require(receiver != address(0), "Cannot mint to zero");
        require(amount > 0, "Amount must be > 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "Mint exceeds max supply");

        _mint(receiver, amount);
        emit Minted(receiver, amount, tag);
    }

    // =============================================================
    //                           STAKING
    // =============================================================

    /// @notice Stake tokens to start earning APR-based rewards
    /// @dev
    ///  - Auto-compounds any pending rewards before adding new stake
    ///  - Uses lazy reward accounting
    ///  - Lock period is tracked from FIRST stake and never reset
    ///  - Minimum stake amount enforced
    /// @param amount Amount of tokens to stake
    function stake(uint256 amount) external nonReentrant {
        require(!stakingPaused, "Staking paused");
        require(!emergencyMode, "Staking disabled in emergency mode");
        require(amount >= MIN_STAKE_AMOUNT, "Stake amount too small");

        _updateRewards(msg.sender);

        _transfer(msg.sender, address(this), amount);

        // Auto-restake pending rewards (minting them)
        uint128 pending = stakes[msg.sender].rewardDebt;
        if (pending > 0) {
            require(totalSupply() + pending <= MAX_SUPPLY, "Reward exceeds max supply");
            _mint(address(this), pending);
            stakes[msg.sender].amount += pending;
            stakes[msg.sender].rewardDebt = 0;
            totalStaked += pending; // FIX: Include auto-compounded rewards in totalStaked
            totalRewardsDistributed += pending;
        }

        stakes[msg.sender].amount += uint128(amount);
        
        // Set initial stake time only if this is the first stake
        if (stakes[msg.sender].initialStakeTime == 0) {
            stakes[msg.sender].initialStakeTime = uint64(block.timestamp);
        }
        
        totalStaked += amount;

        emit Staked(msg.sender, amount, pending);
    }

    /// @notice Unstake tokens after the lock period (or immediately in emergency mode)
    /// @dev Lock period is based on initialStakeTime, not reset on subsequent stakes
    /// @param amount Amount of tokens to unstake
    function unstake(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];

        if (!emergencyMode) {
            require(block.timestamp >= s.initialStakeTime + MIN_STAKE_PERIOD, "Stake locked");
        }

        _updateRewards(msg.sender);
        require(amount > 0 && amount <= s.amount, "Invalid unstake");

        s.amount -= uint128(amount);
        totalStaked -= amount;

        // Reset initial stake time if fully unstaked
        if (s.amount == 0) {
            s.initialStakeTime = 0;
        }

        _transfer(address(this), msg.sender, amount);

        emit Unstaked(msg.sender, amount);
    }

    /// @notice Claim accumulated rewards (mints and auto-compounds into stake)
    /// @dev Mints reward tokens and adds them to staked balance
    function claimReward() external nonReentrant {
        require(!emergencyMode, "Claims disabled in emergency mode");

        _updateRewards(msg.sender);

        uint128 reward = stakes[msg.sender].rewardDebt;
        require(reward > 0, "No reward");
        require(totalSupply() + reward <= MAX_SUPPLY, "Reward exceeds max supply");

        // Mint the reward tokens to the contract
        _mint(address(this), reward);
        
        stakes[msg.sender].amount += reward;
        stakes[msg.sender].rewardDebt = 0;
        totalStaked += reward; // FIX: Include claimed rewards in totalStaked
        totalRewardsDistributed += reward;

        emit RewardClaimed(msg.sender, reward);
    }

    /// @notice Emergency unstake: withdraw principal immediately and forfeit all rewards
    /// @dev
    ///  - Only available when emergency mode is enabled
    ///  - Ignores lock period
    ///  - Resets user stake completely
    ///  - Does NOT update rewards (forfeited)
    function emergencyUnstake() external nonReentrant {
        require(emergencyMode, "Emergency mode not enabled");
        StakeInfo storage s = stakes[msg.sender];
        require(s.amount > 0, "No stake to unstake");

        uint256 amount = s.amount;

        s.amount = 0;
        s.rewardDebt = 0;
        s.lastUpdate = uint64(block.timestamp);
        s.initialStakeTime = 0;
        totalStaked -= amount;

        _transfer(address(this), msg.sender, amount);

        emit EmergencyUnstake(msg.sender, amount);
    }

    // =============================================================
    //                     REWARD ACCOUNTING
    // =============================================================

    /// @dev Updates a user's pending rewards using lazy accounting
    /// @dev Uses uint128 for amounts to fit within optimized struct
    /// @param user Address of the staker
    function _updateRewards(address user) internal {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0) {
            s.lastUpdate = uint64(block.timestamp);
            return;
        }

        uint256 elapsed = block.timestamp - s.lastUpdate;

        /// reward = amount * apr * elapsed / (10000 * 365 days)
        uint256 reward = (uint256(s.amount) * apr * elapsed) / (10000 * 365 days);

        s.rewardDebt += uint128(reward);
        s.lastUpdate = uint64(block.timestamp);
    }

    /// @notice Returns the pending rewards for a user if they claimed now
    /// @param user Address of the user
    function pendingReward(address user) public view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0) return s.rewardDebt;

        uint256 elapsed = block.timestamp - s.lastUpdate;
        uint256 reward = (uint256(s.amount) * apr * elapsed) / (10000 * 365 days);
        return uint256(s.rewardDebt) + reward;
    }

    /// @notice Returns the current staked balance of a user (including compounded rewards)
    function stakedBalance(address user) external view returns (uint256) {
        return stakes[user].amount;
    }

    // =============================================================
    //                       OWNER CONTROLS
    // =============================================================

    /// @notice Set a new APR (basis points)
    /// @dev
    ///  - Cannot exceed MAX_APR
    ///  - Cannot be changed more frequently than MIN_APR_CHANGE_INTERVAL
    ///  - Does not retroactively affect already-accrued rewards
    /// @param newApr New APR in basis points
    function setAPR(uint256 newApr) external onlyOwner {
        require(newApr <= MAX_APR, "APR exceeds maximum");
        require(block.timestamp >= lastAPRChange + MIN_APR_CHANGE_INTERVAL, "APR change too soon");
        
        uint256 oldApr = apr;
        apr = newApr;
        lastAPRChange = block.timestamp;
        
        emit APRUpdated(oldApr, newApr);
    }

    /// @notice Pause or unpause staking
    function pauseStaking(bool paused) external onlyOwner {
        stakingPaused = paused;
        emit StakingPaused(paused);
    }

    /// @notice Enable or disable emergency mode
    function enableEmergency(bool enabled) external onlyOwner {
        emergencyMode = enabled;
        emit EmergencyMode(enabled);
    }

    // =============================================================
    //                      MERKLE AIRDROP
    // =============================================================

    /// @notice Set the Merkle root for airdrop claims
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        emit MerkleRootSet(_merkleRoot);
    }

    /// @notice Claim airdrop tokens using a Merkle proof
    /// @param amount Amount to claim
    /// @param merkleProof Proof validating (msg.sender, amount)
    function claimAirdrop(uint256 amount, bytes32[] calldata merkleProof) external nonReentrant {
        require(merkleRoot != bytes32(0), "Airdrop not initialized");
        require(!airdropClaimed[msg.sender], "Already claimed");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid proof");

        airdropClaimed[msg.sender] = true;
        _mint(msg.sender, amount);

        emit AirdropClaimed(msg.sender, amount);
    }

    /// @notice Returns whether a user has already claimed their airdrop
    function hasClaimedAirdrop(address user) external view returns (bool) {
        return airdropClaimed[user];
    }

    // =============================================================
    //                          PRESALE
    // =============================================================

    /// @notice Configure presale parameters (owner only)
    /// @param _paymentToken USDC contract address on BASE
    /// @param _presaleWallet Wallet to receive USDC payments
    /// @param _minPurchase Minimum USDC per transaction (6 decimals)
    /// @param _maxPurchase Maximum USDC per transaction (6 decimals)
    /// @param _hardCap Maximum total USDC to raise
    function configurePresale(
        address _paymentToken,
        address _presaleWallet,
        uint256 _minPurchase,
        uint256 _maxPurchase,
        uint256 _hardCap
    ) external onlyOwner {
        require(_paymentToken != address(0), "Invalid payment token");
        require(_presaleWallet != address(0), "Invalid presale wallet");
        require(_minPurchase > 0, "Min purchase must be > 0");
        require(_maxPurchase >= _minPurchase, "Max must be >= min");
        require(_hardCap > 0, "Hard cap must be > 0");

        presalePaymentToken = IERC20(_paymentToken);
        presaleWallet = _presaleWallet;
        presaleMinPurchase = _minPurchase;
        presaleMaxPurchase = _maxPurchase;
        presaleHardCap = _hardCap;

        emit PresaleConfigured(_paymentToken, _presaleWallet, _minPurchase, _maxPurchase, _hardCap);
    }

    /// @notice Enable or disable presale (owner only)
    /// @param _active Whether presale should be active
    function setPresaleActive(bool _active) external onlyOwner {
        require(address(presalePaymentToken) != address(0), "Presale not configured");
        require(presaleWallet != address(0), "Presale wallet not set");
        presaleActive = _active;
        emit PresaleStatusChanged(_active);
    }

    /// @notice Purchase HLRR tokens with USDC
    /// @dev User must have approved this contract to spend their USDC
    /// @param usdcAmount Amount of USDC to spend (6 decimals)
    function buyPresale(uint256 usdcAmount) external nonReentrant {
        require(presaleActive, "Presale not active");
        require(usdcAmount >= presaleMinPurchase, "Below minimum purchase");
        require(usdcAmount <= presaleMaxPurchase, "Above maximum purchase");
        require(presaleTotalRaised + usdcAmount <= presaleHardCap, "Exceeds hard cap");

        // Calculate HLRR amount: hlrrAmount = usdcAmount * 4000 / 3
        // This gives ~13.33 HLRR per USDC (1 HLRR = $0.075)
        uint256 hlrrAmount = (usdcAmount * PRESALE_RATE_NUMERATOR) / PRESALE_RATE_DENOMINATOR;

        require(totalSupply() + hlrrAmount <= MAX_SUPPLY, "Exceeds max supply");

        // Transfer USDC from buyer to presale wallet
        presalePaymentToken.safeTransferFrom(msg.sender, presaleWallet, usdcAmount);

        // Mint HLRR to buyer
        _mint(msg.sender, hlrrAmount);

        // Update presale stats
        presaleTotalRaised += usdcAmount;
        presaleTotalSold += hlrrAmount;
        presaleContributions[msg.sender] += usdcAmount;

        emit PresalePurchase(msg.sender, usdcAmount, hlrrAmount);
    }

    /// @notice Calculate how much HLRR a user would receive for a given USDC amount
    /// @param usdcAmount Amount of USDC (6 decimals)
    /// @return hlrrAmount Amount of HLRR (8 decimals)
    function calculatePresaleReturn(uint256 usdcAmount) external pure returns (uint256 hlrrAmount) {
        hlrrAmount = (usdcAmount * PRESALE_RATE_NUMERATOR) / PRESALE_RATE_DENOMINATOR;
    }

    /// @notice Get presale statistics
    /// @return isActive Whether presale is currently active
    /// @return totalRaised Total USDC raised
    /// @return totalSold Total HLRR sold
    /// @return hardCap Maximum USDC that can be raised
    /// @return remainingCap How much more USDC can be raised
    function getPresaleStats() external view returns (
        bool isActive,
        uint256 totalRaised,
        uint256 totalSold,
        uint256 hardCap,
        uint256 remainingCap
    ) {
        isActive = presaleActive;
        totalRaised = presaleTotalRaised;
        totalSold = presaleTotalSold;
        hardCap = presaleHardCap;
        remainingCap = presaleHardCap > presaleTotalRaised ? presaleHardCap - presaleTotalRaised : 0;
    }

    /// @notice Get a user's presale contribution
    /// @param user Address to check
    /// @return contribution Total USDC contributed by this user
    function getPresaleContribution(address user) external view returns (uint256 contribution) {
        contribution = presaleContributions[user];
    }

    // =============================================================
    //                    ANALYTICS & HELPERS
    // =============================================================

    /// @notice Returns the total value locked (TVL) in the staking contract
    /// @dev Now accurately includes auto-compounded rewards
    function getTotalValueLocked() external view returns (uint256) {
        return totalStaked;
    }

    /// @notice Returns an approximate APY assuming daily compounding
    /// @dev Approximation: APY ≈ APR + (APR² / 20000)
    /// @dev Note: This is an approximation. Actual APY depends on claim frequency.
    function getAPY() external view returns (uint256) {
        return apr + ((apr * apr) / 20000);
    }

    /// @notice Calculates potential rewards for a given amount and duration
    /// @dev This is a theoretical calculation; actual rewards subject to MAX_SUPPLY constraint
    function calculatePotentialReward(uint256 amount, uint256 durationSeconds) external view returns (uint256) {
        return (amount * apr * durationSeconds) / (10000 * 365 days);
    }

    /// @notice Returns time remaining until a user can unstake normally
    /// @dev Based on initialStakeTime, which never resets on subsequent stakes
    function getTimeUntilUnstake(address user) external view returns (uint256) {
        StakeInfo storage s = stakes[user];

        if (s.initialStakeTime == 0) return 0;
        if (emergencyMode) return 0;

        uint256 unlockTime = s.initialStakeTime + MIN_STAKE_PERIOD;
        if (block.timestamp >= unlockTime) return 0;

        return unlockTime - block.timestamp;
    }

    /// @notice Returns global configuration parameters
    function getContractConfig() external view returns (
        uint256 currentAPR,
        uint256 maxSupply,
        uint256 minStakePeriod,
        uint256 minStakeAmount,
        uint256 maxAPR,
        uint256 minAPRChangeInterval,
        bool isStakingPaused,
        bool isEmergencyMode
    ) {
        currentAPR = apr;
        maxSupply = MAX_SUPPLY;
        minStakePeriod = MIN_STAKE_PERIOD;
        minStakeAmount = MIN_STAKE_AMOUNT;
        maxAPR = MAX_APR;
        minAPRChangeInterval = MIN_APR_CHANGE_INTERVAL;
        isStakingPaused = stakingPaused;
        isEmergencyMode = emergencyMode;
    }

    /// @notice Returns comprehensive stats for a user
    /// @return stakedAmount Current staked balance (principal + compounded rewards)
    /// @return pendingRewards Reward ready to claim
    /// @return stakingDuration Time since INITIAL stake (seconds)
    /// @return estimatedYearlyReward Approx yearly reward at current APR and stake
    /// @return canUnstake Whether unstake is allowed now (considering lock and emergency)
    function getUserStats(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingRewards,
        uint256 stakingDuration,
        uint256 estimatedYearlyReward,
        bool canUnstake
    ) {
        StakeInfo storage s = stakes[user];
        stakedAmount = s.amount;
        pendingRewards = pendingReward(user);
        stakingDuration = s.amount == 0 ? 0 : block.timestamp - s.initialStakeTime;
        estimatedYearlyReward = (s.amount * apr) / 10000;
        uint256 unlockTime = s.initialStakeTime + MIN_STAKE_PERIOD;
        canUnstake = s.amount > 0 && (emergencyMode || block.timestamp >= unlockTime);
    }

    /// @notice Returns global statistics
    /// @dev totalRewardsDistributed now tracks actual distributed rewards
    /// @return totalValueLocked Total amount staked (TVL)
    /// @return totalRewards Total rewards distributed historically
    /// @return currentTotalSupply Current total supply of tokens
    function getGlobalStats() external view returns (
        uint256 totalValueLocked,
        uint256 totalRewards,
        uint256 currentTotalSupply
    ) {
        totalValueLocked = totalStaked;
        totalRewards = totalRewardsDistributed;
        currentTotalSupply = totalSupply();
    }
}
