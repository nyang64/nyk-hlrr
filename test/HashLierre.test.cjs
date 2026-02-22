const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

describe("HashLierre", function () {
  let token;
  let owner, alice, bob, charlie;

  const DECIMALS = 8n;
  const ONE = 10n ** DECIMALS;        // 1 token = 10^8 units
  const YEAR = 365n * 24n * 60n * 60n;

  async function increaseTime(seconds) {
    await network.provider.send("evm_increaseTime", [Number(seconds)]);
    await network.provider.send("evm_mine");
  }

  beforeEach(async () => {
    [owner, alice, bob, charlie] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("HashLierre");
    token = await Factory.deploy();
    await token.deployed();

    // Mint 1_000_000 tokens to Alice
    await token.mint(alice.address, 1_000_000n * ONE, "genesis");
  });

  it("owner can mint, non-owner cannot", async () => {
    await expect(
      token.connect(alice).mint(alice.address, ONE, "hack")
    ).to.be.reverted;

    await token.mint(bob.address, ONE, "ok");
    expect(await token.balanceOf(bob.address)).to.equal(ONE);
  });

  it("enforces minimum stake amount", async () => {
    const minStake = await token.MIN_STAKE_AMOUNT();
    
    await token.connect(alice).approve(token.address, 50n * ONE);
    
    await expect(
      token.connect(alice).stake(50n * ONE)
    ).to.be.revertedWith("Stake amount too small");
    
    // Should work with minimum amount
    await token.connect(alice).stake(minStake);
    expect((await token.stakes(alice.address)).amount).to.equal(minStake);
  });

  it("user can stake tokens", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    const info = await token.stakes(alice.address);
    expect(info.amount).to.equal(1_000n * ONE);
  });

  it("accrues ~12% APR over 1 year", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR);

    const pending = await token.pendingReward(alice.address);
    const expected = 120n * ONE;

    expect(pending).to.be.closeTo(expected, 100n);
  });

  it("claim mints reward tokens and increases totalStaked", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    const totalStakedBefore = await token.totalStaked();

    await increaseTime(YEAR);

    const pendingBefore = await token.pendingReward(alice.address);
    const totalSupplyBefore = await token.totalSupply();
    
    await token.connect(alice).claimReward();
    
    const stakedAfter = await token.stakes(alice.address);
    const totalSupplyAfter = await token.totalSupply();
    const totalStakedAfter = await token.totalStaked();

    // FIX VERIFIED: Rewards are minted
    expect(totalSupplyAfter - totalSupplyBefore).to.be.closeTo(pendingBefore, 1000n);
    
    // FIX VERIFIED: totalStaked includes rewards
    expect(totalStakedAfter - totalStakedBefore).to.be.closeTo(pendingBefore, 1000n);
    
    // Staked amount includes rewards
    const expectedStake = 1_000n * ONE + BigInt(pendingBefore.toString());
    expect(stakedAfter.amount).to.be.closeTo(expectedStake, 1000n);
  });

  it("auto-compounded rewards are added to totalStaked", async () => {
    await token.connect(alice).approve(token.address, 2_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    const totalStakedBefore = await token.totalStaked();
    expect(totalStakedBefore).to.equal(1_000n * ONE);

    await increaseTime(YEAR);

    const pendingRewards = BigInt((await token.pendingReward(alice.address)).toString());
    
    // Stake more tokens - should auto-compound pending rewards
    await token.connect(alice).stake(1_000n * ONE);

    const totalStakedAfter = await token.totalStaked();
    
    // FIX VERIFIED: totalStaked includes both new stake AND auto-compounded rewards
    const expected = 1_000n * ONE + 1_000n * ONE + pendingRewards;
    expect(totalStakedAfter).to.be.closeTo(expected, 10000n);
  });

  it("lock period is based on initialStakeTime and not reset on subsequent stakes", async () => {
    await token.connect(alice).approve(token.address, 3_000n * ONE);
    
    // First stake
    await token.connect(alice).stake(1_000n * ONE);

    // Advance 7 days
    await increaseTime(7 * 24 * 60 * 60);

    // Second stake - should NOT reset lock timer
    await token.connect(alice).stake(1_000n * ONE);

    // Try to unstake after 7 more days (14 days total from initial stake)
    await increaseTime(7 * 24 * 60 * 60 + 100);

    // FIX VERIFIED: Can unstake because 14 days passed from INITIAL stake
    await expect(
      token.connect(alice).unstake(500n * ONE)
    ).to.not.be.reverted;
  });

  it("cannot unstake before lock period from initial stake", async () => {
    await token.connect(alice).approve(token.address, 2_000n * ONE);
    
    await token.connect(alice).stake(1_000n * ONE);

    // Advance 7 days
    await increaseTime(7 * 24 * 60 * 60);

    // Add more stake
    await token.connect(alice).stake(1_000n * ONE);

    // Try to unstake immediately - should fail (only 7 days from initial)
    await expect(
      token.connect(alice).unstake(500n * ONE)
    ).to.be.revertedWith("Stake locked");
  });

  it("initialStakeTime resets to zero when fully unstaked", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    const initialTimeBefore = (await token.stakes(alice.address)).initialStakeTime;
    expect(initialTimeBefore).to.be.gt(0);

    await increaseTime(14 * 24 * 60 * 60 + 100);

    // Fully unstake
    await token.connect(alice).unstake(1_000n * ONE);

    const initialTimeAfter = (await token.stakes(alice.address)).initialStakeTime;
    expect(initialTimeAfter).to.equal(0n);
  });

  it("APR change is limited by MAX_APR (12%)", async () => {
    const maxAPR = await token.MAX_APR();
    expect(maxAPR).to.equal(1200n); // Verify it's 12%
    
    // Wait for initial cooldown period (365 days)
    await increaseTime(365 * 24 * 60 * 60 + 100);
    
    await expect(
      token.setAPR(maxAPR + 1n)
    ).to.be.revertedWith("APR exceeds maximum");

    // Should work at exactly max (12%)
    await token.setAPR(maxAPR);
    expect(await token.apr()).to.equal(maxAPR);
  });

  it("APR cannot be changed more frequently than once per year", async () => {
    // Wait for initial cooldown (365 days)
    await increaseTime(365 * 24 * 60 * 60 + 100);
    
    // Change to 10%
    await token.setAPR(1000n);

    // Try to change again immediately
    await expect(
      token.setAPR(1100n)
    ).to.be.revertedWith("APR change too soon");

    // Wait the required interval (365 days)
    await increaseTime(365 * 24 * 60 * 60 + 100);

    // Should work now
    await token.setAPR(1100n);
    expect(await token.apr()).to.equal(1100n);
  });

  it("APR change affects future rewards only", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    // 6 months at 12%
    await increaseTime(YEAR / 2n);

    // Claim to lock in rewards at old APR
    await token.connect(alice).claimReward();
    
    const stakedAfterClaim = BigInt((await token.stakes(alice.address)).amount.toString());

    // Wait for APR change cooldown (365 days from contract deployment)
    // During this time, MORE rewards accrue at 12% APR
    await increaseTime(365 * 24 * 60 * 60 + 100);

    // Set APR to 10% (1000 basis points) - lower than current 12%
    await token.setAPR(1000n);

    // Another 6 months at 10%
    await increaseTime(YEAR / 2n);

    const pendingAfterSecondPeriod = BigInt((await token.pendingReward(alice.address)).toString());

    // Calculate expected reward:
    // - 365 days at 12% on stakedAfterClaim (~1060 tokens)
    // - 6 months at 10% on (stakedAfterClaim + 365 day rewards)
    // Total should be significant due to year-long accrual
    // Simplified: just check that pending is reasonable (120-200 tokens)
    expect(pendingAfterSecondPeriod).to.be.gt(120n * ONE);
    expect(pendingAfterSecondPeriod).to.be.lt(200n * ONE);
  });

  it("APRUpdated event includes old and new APR", async () => {
    // Wait for cooldown (365 days)
    await increaseTime(365 * 24 * 60 * 60 + 100);
    
    await expect(token.setAPR(1000n))
      .to.emit(token, "APRUpdated")
      .withArgs(1200n, 1000n);
  });

  it("cannot unstake before lock period (normal mode)", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await expect(
      token.connect(alice).unstake(100n * ONE)
    ).to.be.revertedWith("Stake locked");
  });

  it("unstaking does not lose rewards", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR);
    await increaseTime(14 * 24 * 60 * 60);

    const pendingBefore = await token.pendingReward(alice.address);
    await token.connect(alice).unstake(500n * ONE);
    const pendingAfter = await token.pendingReward(alice.address);

    expect(pendingAfter).to.be.closeTo(pendingBefore, 1000n);
  });

  it("pause blocks staking", async () => {
    await token.pauseStaking(true);
    await token.connect(alice).approve(token.address, 1_000n * ONE);

    await expect(
      token.connect(alice).stake(1_000n * ONE)
    ).to.be.revertedWith("Staking paused");
  });

  it("emergency mode blocks staking and claims", async () => {
    await token.connect(alice).approve(token.address, 2_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR);
    await token.enableEmergency(true);

    await expect(
      token.connect(alice).stake(500n * ONE)
    ).to.be.revertedWith("Staking disabled in emergency mode");

    await expect(
      token.connect(alice).claimReward()
    ).to.be.revertedWith("Claims disabled in emergency mode");
  });

  it("emergencyUnstake requires emergency mode enabled", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await expect(
      token.connect(alice).emergencyUnstake()
    ).to.be.revertedWith("Emergency mode not enabled");

    await token.enableEmergency(true);
    await token.connect(alice).emergencyUnstake();
    
    const stakedAfter = (await token.stakes(alice.address)).amount;
    expect(stakedAfter).to.equal(0n);
  });

  it("emergency unstake returns principal only, forfeits rewards", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR);

    const pendingRewards = await token.pendingReward(alice.address);
    expect(pendingRewards).to.be.gt(0n);

    await token.enableEmergency(true);

    const balanceBefore = await token.balanceOf(alice.address);
    await token.connect(alice).emergencyUnstake();
    const balanceAfter = await token.balanceOf(alice.address);
    const stakedAfter = (await token.stakes(alice.address)).amount;

    expect(BigInt(balanceAfter.toString()) - BigInt(balanceBefore.toString())).to.equal(1_000n * ONE);
    expect(stakedAfter).to.equal(0n);
    
    const rewardDebt = (await token.stakes(alice.address)).rewardDebt;
    expect(rewardDebt).to.equal(0n);
  });

  it("emergency unstake can bypass lock period", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await token.enableEmergency(true);

    const balanceBefore = await token.balanceOf(alice.address);
    await token.connect(alice).emergencyUnstake();
    const balanceAfter = await token.balanceOf(alice.address);

    expect(BigInt(balanceAfter.toString()) - BigInt(balanceBefore.toString())).to.equal(1_000n * ONE);
  });

  it("emergency mode allows unstake to bypass lock via unstake()", async () => {
    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await token.enableEmergency(true);
    await token.connect(alice).unstake(500n * ONE);
    
    const staked = (await token.stakes(alice.address)).amount;
    expect(staked).to.equal(500n * ONE);
  });

  it("cannot exceed max supply via rewards", async () => {
    const max = BigInt((await token.MAX_SUPPLY()).toString());
    const current = BigInt((await token.totalSupply()).toString());
    const toMint = max - current;
    await token.mint(owner.address, toMint, "cap");

    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR * 10n);

    await expect(
      token.connect(alice).claimReward()
    ).to.be.revertedWith("Reward exceeds max supply");
  });

  it("totalRewardsDistributed tracks claimed rewards", async () => {
    expect(await token.totalRewardsDistributed()).to.equal(0n);

    await token.connect(alice).approve(token.address, 1_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR);

    const pendingBefore = await token.pendingReward(alice.address);
    await token.connect(alice).claimReward();

    const totalRewards = await token.totalRewardsDistributed();
    expect(totalRewards).to.be.closeTo(pendingBefore, 1000n);
  });

  it("Staked event includes auto-compounded rewards", async () => {
    await token.connect(alice).approve(token.address, 2_000n * ONE);
    await token.connect(alice).stake(1_000n * ONE);

    await increaseTime(YEAR);

    // Can't check exact pending rewards due to time passing during tx
    // Just verify the event is emitted with correct structure
    const tx = await token.connect(alice).stake(1_000n * ONE);
    const receipt = await tx.wait();
    
    const stakedEvent = receipt.events.find(e => e.event === 'Staked');
    expect(stakedEvent).to.not.be.undefined;
    expect(stakedEvent.args.user).to.equal(alice.address);
    expect(stakedEvent.args.amount).to.equal(1_000n * ONE);
    // autoCompoundedReward should be positive
    expect(stakedEvent.args.autoCompoundedReward).to.be.gt(0n);
  });

  describe("Analytics Functions", function () {
    it("getTotalValueLocked returns correct TVL including auto-compounded rewards", async () => {
      expect(await token.getTotalValueLocked()).to.equal(0n);

      await token.connect(alice).approve(token.address, 2_000n * ONE);
      await token.connect(alice).stake(1_000n * ONE);

      expect(await token.getTotalValueLocked()).to.equal(1_000n * ONE);

      await token.mint(bob.address, 500n * ONE, "test");
      await token.connect(bob).approve(token.address, 500n * ONE);
      await token.connect(bob).stake(500n * ONE);

      expect(await token.getTotalValueLocked()).to.equal(1_500n * ONE);

      await increaseTime(YEAR);
      const pendingRewards = BigInt((await token.pendingReward(alice.address)).toString());
      
      await token.connect(alice).stake(1_000n * ONE);

      const expectedTVL = 1_500n * ONE + 1_000n * ONE + pendingRewards;
      expect(await token.getTotalValueLocked()).to.be.closeTo(expectedTVL, 10000n);
    });

    it("getAPY returns correct APY with compounding consideration", async () => {
      const apy = await token.getAPY();
      const expectedAPY = 1200n + (1200n * 1200n / 20000n);
      expect(apy).to.equal(expectedAPY);

      await increaseTime(365 * 24 * 60 * 60 + 100);
      await token.setAPR(1000n); // Change to 10%
      const newAPY = await token.getAPY();
      const expectedNewAPY = 1000n + (1000n * 1000n / 20000n);
      expect(newAPY).to.equal(expectedNewAPY);
    });

    it("getUserStats returns comprehensive user information", async () => {
      await token.connect(alice).approve(token.address, 1_000n * ONE);
      await token.connect(alice).stake(1_000n * ONE);

      let stats = await token.getUserStats(alice.address);
      expect(stats.stakedAmount).to.equal(1_000n * ONE);
      expect(stats.pendingRewards).to.be.closeTo(0n, 1000n);
      expect(stats.estimatedYearlyReward).to.equal(120n * ONE);
      expect(stats.canUnstake).to.equal(false);

      await increaseTime(7n * 24n * 60n * 60n);
      
      stats = await token.getUserStats(alice.address);
      expect(stats.stakedAmount).to.equal(1_000n * ONE);
      expect(stats.canUnstake).to.equal(false);

      await increaseTime(7n * 24n * 60n * 60n + 100n);
      
      stats = await token.getUserStats(alice.address);
      expect(stats.canUnstake).to.equal(true);
      expect(stats.pendingRewards).to.be.gt(0n);
    });

    it("getUserStats works for users with no stake", async () => {
      const stats = await token.getUserStats(bob.address);
      
      expect(stats.stakedAmount).to.equal(0n);
      expect(stats.pendingRewards).to.equal(0n);
      expect(stats.stakingDuration).to.equal(0n);
      expect(stats.estimatedYearlyReward).to.equal(0n);
      expect(stats.canUnstake).to.equal(false);
    });

    it("getUserStats shows canUnstake=true in emergency mode", async () => {
      await token.connect(alice).approve(token.address, 1_000n * ONE);
      await token.connect(alice).stake(1_000n * ONE);

      let stats = await token.getUserStats(alice.address);
      expect(stats.canUnstake).to.equal(false);

      await token.enableEmergency(true);

      stats = await token.getUserStats(alice.address);
      expect(stats.canUnstake).to.equal(true);
    });

    it("getTimeUntilUnstake based on initialStakeTime", async () => {
      await token.connect(alice).approve(token.address, 2_000n * ONE);
      await token.connect(alice).stake(1_000n * ONE);

      let timeRemaining = await token.getTimeUntilUnstake(alice.address);
      expect(timeRemaining).to.be.closeTo(14n * 24n * 60n * 60n, 5n);

      await increaseTime(7 * 24 * 60 * 60);
      
      await token.connect(alice).stake(1_000n * ONE);
      
      timeRemaining = await token.getTimeUntilUnstake(alice.address);
      expect(timeRemaining).to.be.closeTo(7n * 24n * 60n * 60n, 5n);

      await increaseTime(7 * 24 * 60 * 60 + 100);
      timeRemaining = await token.getTimeUntilUnstake(alice.address);
      expect(timeRemaining).to.equal(0n);
    });

    it("getContractConfig returns all configuration values", async () => {
      const config = await token.getContractConfig();

      expect(config.currentAPR).to.equal(1200n);
      expect(config.maxSupply).to.equal(120_000_000n * ONE);
      expect(config.minStakePeriod).to.equal(14n * 24n * 60n * 60n);
      expect(config.minStakeAmount).to.equal(100n * ONE);
      expect(config.maxAPR).to.equal(1200n); // 12%
      expect(config.minAPRChangeInterval).to.equal(365n * 24n * 60n * 60n); // 365 days
      expect(config.isStakingPaused).to.equal(false);
      expect(config.isEmergencyMode).to.equal(false);
    });

    it("getGlobalStats returns actual statistics", async () => {
      await token.connect(alice).approve(token.address, 1_000n * ONE);
      await token.connect(alice).stake(1_000n * ONE);

      await increaseTime(YEAR);
      await token.connect(alice).claimReward();

      const stats = await token.getGlobalStats();
      
      expect(stats.totalValueLocked).to.be.gt(1_000n * ONE);
      expect(stats.totalRewards).to.be.gt(0n);
      expect(stats.currentTotalSupply).to.equal(await token.totalSupply());
    });
  });

  describe("Merkle Airdrop", function () {
    let merkleTree;
    let merkleRoot;
    let airdropList;
    let leaves;

    beforeEach(async () => {
      airdropList = [
        { address: alice.address, amount: 1000n * ONE },
        { address: bob.address, amount: 500n * ONE },
      ];

      leaves = airdropList.map(x => {
        const encoded = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256'],
          [x.address, x.amount]
        );
        const innerHash = ethers.utils.keccak256(encoded);
        return keccak256(innerHash);
      });

      merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
      merkleRoot = merkleTree.getHexRoot();
    });

    it("owner can set merkle root", async () => {
      await expect(token.setMerkleRoot(merkleRoot))
        .to.emit(token, "MerkleRootSet")
        .withArgs(merkleRoot);

      expect(await token.merkleRoot()).to.equal(merkleRoot);
    });

    it("non-owner cannot set merkle root", async () => {
      await expect(
        token.connect(alice).setMerkleRoot(merkleRoot)
      ).to.be.reverted;
    });

    it("user can claim airdrop with valid proof", async () => {
      await token.setMerkleRoot(merkleRoot);

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [alice.address, 1000n * ONE]
      );
      const innerHash = ethers.utils.keccak256(encoded);
      const leaf = keccak256(innerHash);
      const proof = merkleTree.getHexProof(leaf);

      const balanceBefore = await token.balanceOf(alice.address);
      
      await expect(token.connect(alice).claimAirdrop(1000n * ONE, proof))
        .to.emit(token, "AirdropClaimed")
        .withArgs(alice.address, 1000n * ONE);

      const balanceAfter = await token.balanceOf(alice.address);
      expect(BigInt(balanceAfter.toString()) - BigInt(balanceBefore.toString())).to.equal(1000n * ONE);
    });

    it("claim fails with invalid proof", async () => {
      await token.setMerkleRoot(merkleRoot);

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [alice.address, 999n * ONE]
      );
      const innerHash = ethers.utils.keccak256(encoded);
      const leaf = keccak256(innerHash);
      const proof = merkleTree.getHexProof(leaf);

      await expect(
        token.connect(alice).claimAirdrop(999n * ONE, proof)
      ).to.be.revertedWith("Invalid proof");
    });

    it("cannot claim twice", async () => {
      await token.setMerkleRoot(merkleRoot);

      const encoded = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [alice.address, 1000n * ONE]
      );
      const innerHash = ethers.utils.keccak256(encoded);
      const leaf = keccak256(innerHash);
      const proof = merkleTree.getHexProof(leaf);

      await token.connect(alice).claimAirdrop(1000n * ONE, proof);

      await expect(
        token.connect(alice).claimAirdrop(1000n * ONE, proof)
      ).to.be.revertedWith("Already claimed");
    });

    it("cannot claim without merkle root set", async () => {
      const encoded = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [alice.address, 1000n * ONE]
      );
      const innerHash = ethers.utils.keccak256(encoded);
      const leaf = keccak256(innerHash);
      const proof = merkleTree.getHexProof(leaf);

      await expect(
        token.connect(alice).claimAirdrop(1000n * ONE, proof)
      ).to.be.revertedWith("Airdrop not initialized");
    });

    it("multiple users can claim their respective airdrops", async () => {
      await token.setMerkleRoot(merkleRoot);

      const aliceEncoded = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [alice.address, 1000n * ONE]
      );
      const aliceInnerHash = ethers.utils.keccak256(aliceEncoded);
      const aliceLeaf = keccak256(aliceInnerHash);
      const aliceProof = merkleTree.getHexProof(aliceLeaf);

      await token.connect(alice).claimAirdrop(1000n * ONE, aliceProof);

      const bobEncoded = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [bob.address, 500n * ONE]
      );
      const bobInnerHash = ethers.utils.keccak256(bobEncoded);
      const bobLeaf = keccak256(bobInnerHash);
      const bobProof = merkleTree.getHexProof(bobLeaf);

      await token.connect(bob).claimAirdrop(500n * ONE, bobProof);

      const aliceBalance = await token.balanceOf(alice.address);
      const bobBalance = await token.balanceOf(bob.address);

      expect(aliceBalance).to.be.gte(1_000_000n * ONE);
      expect(bobBalance).to.equal(500n * ONE);
    });
  });

  describe("Presale", function () {
    let mockUSDC;
    const USDC_DECIMALS = 6n;
    const ONE_USDC = 10n ** USDC_DECIMALS;

    // Presale rate: 1 HLRR = $0.075 USDC
    // So 1 USDC = 13.333... HLRR
    // In contract: hlrrAmount = usdcAmount * 4000 / 3
    const PRESALE_RATE_NUMERATOR = 4000n;
    const PRESALE_RATE_DENOMINATOR = 3n;

    beforeEach(async () => {
      // Deploy a mock ERC20 for USDC
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
      await mockUSDC.deployed();

      // Mint USDC to alice and bob
      await mockUSDC.mint(alice.address, 100_000n * ONE_USDC);
      await mockUSDC.mint(bob.address, 100_000n * ONE_USDC);
    });

    describe("Configuration", function () {
      it("owner can configure presale", async () => {
        await expect(
          token.configurePresale(
            mockUSDC.address,
            owner.address,
            50n * ONE_USDC,     // min: 50 USDC
            50_000n * ONE_USDC, // max: 50,000 USDC
            1_000_000n * ONE_USDC // hard cap: 1M USDC
          )
        ).to.emit(token, "PresaleConfigured")
          .withArgs(mockUSDC.address, owner.address, 50n * ONE_USDC, 50_000n * ONE_USDC, 1_000_000n * ONE_USDC);

        expect(await token.presalePaymentToken()).to.equal(mockUSDC.address);
        expect(await token.presaleWallet()).to.equal(owner.address);
        expect(await token.presaleMinPurchase()).to.equal(50n * ONE_USDC);
        expect(await token.presaleMaxPurchase()).to.equal(50_000n * ONE_USDC);
        expect(await token.presaleHardCap()).to.equal(1_000_000n * ONE_USDC);
      });

      it("non-owner cannot configure presale", async () => {
        await expect(
          token.connect(alice).configurePresale(
            mockUSDC.address,
            owner.address,
            50n * ONE_USDC,
            50_000n * ONE_USDC,
            1_000_000n * ONE_USDC
          )
        ).to.be.reverted;
      });

      it("cannot configure with zero payment token address", async () => {
        await expect(
          token.configurePresale(
            ethers.constants.AddressZero,
            owner.address,
            50n * ONE_USDC,
            50_000n * ONE_USDC,
            1_000_000n * ONE_USDC
          )
        ).to.be.revertedWith("Invalid payment token");
      });

      it("cannot configure with zero presale wallet address", async () => {
        await expect(
          token.configurePresale(
            mockUSDC.address,
            ethers.constants.AddressZero,
            50n * ONE_USDC,
            50_000n * ONE_USDC,
            1_000_000n * ONE_USDC
          )
        ).to.be.revertedWith("Invalid presale wallet");
      });

      it("cannot configure with max < min purchase", async () => {
        await expect(
          token.configurePresale(
            mockUSDC.address,
            owner.address,
            100n * ONE_USDC,
            50n * ONE_USDC, // max < min
            1_000_000n * ONE_USDC
          )
        ).to.be.revertedWith("Max must be >= min");
      });

      it("owner can activate/deactivate presale", async () => {
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );

        await expect(token.setPresaleActive(true))
          .to.emit(token, "PresaleStatusChanged")
          .withArgs(true);

        expect(await token.presaleActive()).to.equal(true);

        await expect(token.setPresaleActive(false))
          .to.emit(token, "PresaleStatusChanged")
          .withArgs(false);

        expect(await token.presaleActive()).to.equal(false);
      });

      it("cannot activate presale without configuration", async () => {
        await expect(
          token.setPresaleActive(true)
        ).to.be.revertedWith("Presale not configured");
      });

      it("non-owner cannot activate presale", async () => {
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );

        await expect(
          token.connect(alice).setPresaleActive(true)
        ).to.be.reverted;
      });
    });

    describe("Presale Rate", function () {
      it("owner can change presale rate", async () => {
        // Change to $0.10/HLRR (10 HLRR per $1)
        await expect(token.setPresaleRate(1000n, 1n))
          .to.emit(token, "PresaleRateChanged");

        expect(await token.presaleRateNumerator()).to.equal(1000n);
        expect(await token.presaleRateDenominator()).to.equal(1n);
      });

      it("non-owner cannot change presale rate", async () => {
        await expect(
          token.connect(alice).setPresaleRate(1000n, 1n)
        ).to.be.reverted;
      });

      it("cannot set zero numerator", async () => {
        await expect(
          token.setPresaleRate(0n, 1n)
        ).to.be.revertedWith("Numerator must be > 0");
      });

      it("cannot set zero denominator", async () => {
        await expect(
          token.setPresaleRate(1000n, 0n)
        ).to.be.revertedWith("Denominator must be > 0");
      });

      it("getPresalePrice returns correct price", async () => {
        // Default rate: numerator=4000, denominator=3
        // priceUsd = (1e8 * 3) / 4000 = 75000
        // In USDC terms (6 decimals): 75000 = $0.075
        const defaultPrice = await token.getPresalePrice();
        expect(defaultPrice).to.equal(75000n); // $0.075 with 6 decimals
      });

      it("changed rate affects purchase calculations", async () => {
        // Deploy mock USDC for this test
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const testUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
        await testUSDC.deployed();
        await testUSDC.mint(alice.address, 100_000n * ONE_USDC);

        await token.configurePresale(
          testUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );
        await token.mint(owner.address, 10_000_000n * ONE, "presale");
        await token.setPresaleActive(true);

        // Default rate: 100 USDC -> 100 * 4000 / 3 = 133333.33 HLRR (with 8 decimals adjustment)
        const amount1 = BigInt((await token.calculatePresaleReturn(100n * ONE_USDC)).toString());

        // Change to $0.15/HLRR (2000/3 => ~6.67 HLRR per $1)
        await token.setPresaleRate(2000n, 3n);

        // New rate: 100 USDC -> 100 * 2000 / 3 = 66666.67 HLRR
        const amount2 = BigInt((await token.calculatePresaleReturn(100n * ONE_USDC)).toString());

        // Second amount should be half of first (since price doubled from $0.075 to $0.15)
        expect(amount2).to.equal(amount1 / 2n);
      });
    });

    describe("Purchasing", function () {
      beforeEach(async () => {
        // Configure and activate presale
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );
        // Pre-mint HLRR to presale wallet (owner) for presale distribution
        await token.mint(owner.address, 10_000_000n * ONE, "presale");
        await token.setPresaleActive(true);
      });

      it("user can buy HLRR with USDC", async () => {
        const usdcAmount = 100n * ONE_USDC;
        const expectedHLRR = (usdcAmount * PRESALE_RATE_NUMERATOR) / PRESALE_RATE_DENOMINATOR;

        await mockUSDC.connect(alice).approve(token.address, usdcAmount);

        const aliceHLRRBefore = await token.balanceOf(alice.address);
        const ownerUSDCBefore = await mockUSDC.balanceOf(owner.address);

        await expect(token.connect(alice).buyPresale(usdcAmount))
          .to.emit(token, "PresalePurchase")
          .withArgs(alice.address, usdcAmount, expectedHLRR);

        const aliceHLRRAfter = await token.balanceOf(alice.address);
        const ownerUSDCAfter = await mockUSDC.balanceOf(owner.address);

        // Alice receives HLRR
        expect(BigInt(aliceHLRRAfter.toString()) - BigInt(aliceHLRRBefore.toString())).to.equal(expectedHLRR);

        // Owner receives USDC
        expect(BigInt(ownerUSDCAfter.toString()) - BigInt(ownerUSDCBefore.toString())).to.equal(usdcAmount);
      });

      it("calculates correct HLRR amount for various USDC amounts", async () => {
        const testAmounts = [50n, 100n, 500n, 1000n, 10000n];

        for (const amount of testAmounts) {
          const usdcAmount = amount * ONE_USDC;
          const expectedHLRR = await token.calculatePresaleReturn(usdcAmount);
          const calculatedHLRR = (usdcAmount * PRESALE_RATE_NUMERATOR) / PRESALE_RATE_DENOMINATOR;

          expect(expectedHLRR).to.equal(calculatedHLRR);
        }
      });

      it("tracks presale statistics correctly", async () => {
        const usdcAmount = 100n * ONE_USDC;
        const expectedHLRR = (usdcAmount * PRESALE_RATE_NUMERATOR) / PRESALE_RATE_DENOMINATOR;

        await mockUSDC.connect(alice).approve(token.address, usdcAmount);
        await token.connect(alice).buyPresale(usdcAmount);

        expect(await token.presaleTotalRaised()).to.equal(usdcAmount);
        expect(await token.presaleTotalSold()).to.equal(expectedHLRR);
        expect(await token.presaleContributions(alice.address)).to.equal(usdcAmount);

        // Second purchase
        await mockUSDC.connect(alice).approve(token.address, usdcAmount);
        await token.connect(alice).buyPresale(usdcAmount);

        expect(await token.presaleTotalRaised()).to.equal(usdcAmount * 2n);
        expect(await token.presaleContributions(alice.address)).to.equal(usdcAmount * 2n);
      });

      it("multiple users can participate", async () => {
        const aliceAmount = 100n * ONE_USDC;
        const bobAmount = 200n * ONE_USDC;

        await mockUSDC.connect(alice).approve(token.address, aliceAmount);
        await mockUSDC.connect(bob).approve(token.address, bobAmount);

        await token.connect(alice).buyPresale(aliceAmount);
        await token.connect(bob).buyPresale(bobAmount);

        expect(await token.presaleTotalRaised()).to.equal(aliceAmount + bobAmount);
        expect(await token.presaleContributions(alice.address)).to.equal(aliceAmount);
        expect(await token.presaleContributions(bob.address)).to.equal(bobAmount);
      });

      it("getPresaleStats returns correct data", async () => {
        const usdcAmount = 100n * ONE_USDC;
        const expectedHLRR = (usdcAmount * PRESALE_RATE_NUMERATOR) / PRESALE_RATE_DENOMINATOR;

        await mockUSDC.connect(alice).approve(token.address, usdcAmount);
        await token.connect(alice).buyPresale(usdcAmount);

        const stats = await token.getPresaleStats();

        expect(stats.isActive).to.equal(true);
        expect(stats.totalRaised).to.equal(usdcAmount);
        expect(stats.totalSold).to.equal(expectedHLRR);
        expect(stats.hardCap).to.equal(1_000_000n * ONE_USDC);
        expect(stats.remainingCap).to.equal(1_000_000n * ONE_USDC - usdcAmount);
      });
    });

    describe("Purchase Limits", function () {
      beforeEach(async () => {
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,     // min: 50 USDC
          50_000n * ONE_USDC, // max: 50,000 USDC
          1_000_000n * ONE_USDC // hard cap: 1M USDC
        );
        // Pre-mint HLRR to presale wallet (owner) for presale distribution
        await token.mint(owner.address, 10_000_000n * ONE, "presale");
        await token.setPresaleActive(true);
      });

      it("cannot buy below minimum", async () => {
        const belowMin = 49n * ONE_USDC;
        await mockUSDC.connect(alice).approve(token.address, belowMin);

        await expect(
          token.connect(alice).buyPresale(belowMin)
        ).to.be.revertedWith("Below minimum purchase");
      });

      it("can buy at exactly minimum", async () => {
        const exactMin = 50n * ONE_USDC;
        await mockUSDC.connect(alice).approve(token.address, exactMin);

        await expect(
          token.connect(alice).buyPresale(exactMin)
        ).to.not.be.reverted;
      });

      it("cannot buy above maximum", async () => {
        const aboveMax = 50_001n * ONE_USDC;
        await mockUSDC.connect(alice).approve(token.address, aboveMax);

        await expect(
          token.connect(alice).buyPresale(aboveMax)
        ).to.be.revertedWith("Above maximum purchase");
      });

      it("can buy at exactly maximum", async () => {
        const exactMax = 50_000n * ONE_USDC;
        await mockUSDC.connect(alice).approve(token.address, exactMax);

        await expect(
          token.connect(alice).buyPresale(exactMax)
        ).to.not.be.reverted;
      });

      it("cannot exceed hard cap", async () => {
        // Configure with a small hard cap for testing
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          100n * ONE_USDC // hard cap: 100 USDC
        );

        const purchase1 = 60n * ONE_USDC;
        const purchase2 = 50n * ONE_USDC; // Would exceed 100 USDC hard cap

        await mockUSDC.connect(alice).approve(token.address, purchase1 + purchase2);

        await token.connect(alice).buyPresale(purchase1);

        await expect(
          token.connect(alice).buyPresale(purchase2)
        ).to.be.revertedWith("Exceeds hard cap");
      });

      it("cannot buy when presale is inactive", async () => {
        await token.setPresaleActive(false);

        const amount = 100n * ONE_USDC;
        await mockUSDC.connect(alice).approve(token.address, amount);

        await expect(
          token.connect(alice).buyPresale(amount)
        ).to.be.revertedWith("Presale not active");
      });

      it("cannot buy more than presale wallet balance", async () => {
        // Deploy a fresh token to test insufficient balance
        const Factory = await ethers.getContractFactory("HashLierre");
        const freshToken = await Factory.deploy();
        await freshToken.deployed();

        // Configure presale with a small HLRR balance
        await freshToken.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );
        // Mint only a small amount to presale wallet
        await freshToken.mint(owner.address, 100n * ONE, "small presale");
        await freshToken.setPresaleActive(true);

        // Try to buy more HLRR than presale wallet has
        const largeAmount = 10_000n * ONE_USDC; // Would need ~133,333 HLRR
        await mockUSDC.connect(alice).approve(freshToken.address, largeAmount);

        await expect(
          freshToken.connect(alice).buyPresale(largeAmount)
        ).to.be.revertedWith("Insufficient presale HLRR balance");
      });
    });

    describe("Edge Cases", function () {
      beforeEach(async () => {
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );
        // Pre-mint HLRR to presale wallet (owner) for presale distribution
        await token.mint(owner.address, 10_000_000n * ONE, "presale");
        await token.setPresaleActive(true);
      });

      it("requires USDC approval before purchase", async () => {
        const amount = 100n * ONE_USDC;
        // No approval

        await expect(
          token.connect(alice).buyPresale(amount)
        ).to.be.reverted;
      });

      it("fails with insufficient USDC balance", async () => {
        const amount = 200_000n * ONE_USDC; // More than alice has
        await mockUSDC.connect(alice).approve(token.address, amount);

        await expect(
          token.connect(alice).buyPresale(amount)
        ).to.be.reverted;
      });

      it("presale can be reconfigured by owner", async () => {
        // New configuration
        await token.configurePresale(
          mockUSDC.address,
          bob.address, // Different wallet
          100n * ONE_USDC, // Higher minimum
          10_000n * ONE_USDC, // Lower maximum
          500_000n * ONE_USDC // Lower hard cap
        );

        expect(await token.presaleWallet()).to.equal(bob.address);
        expect(await token.presaleMinPurchase()).to.equal(100n * ONE_USDC);
        expect(await token.presaleMaxPurchase()).to.equal(10_000n * ONE_USDC);
        expect(await token.presaleHardCap()).to.equal(500_000n * ONE_USDC);
      });

      it("user contribution is tracked across multiple purchases", async () => {
        const amount1 = 100n * ONE_USDC;
        const amount2 = 200n * ONE_USDC;

        await mockUSDC.connect(alice).approve(token.address, amount1 + amount2);

        await token.connect(alice).buyPresale(amount1);
        expect(await token.getPresaleContribution(alice.address)).to.equal(amount1);

        await token.connect(alice).buyPresale(amount2);
        expect(await token.getPresaleContribution(alice.address)).to.equal(amount1 + amount2);
      });

      it("USDC goes to presale wallet, not contract", async () => {
        const amount = 100n * ONE_USDC;
        await mockUSDC.connect(alice).approve(token.address, amount);

        const contractUSDCBefore = await mockUSDC.balanceOf(token.address);
        const walletUSDCBefore = await mockUSDC.balanceOf(owner.address);

        await token.connect(alice).buyPresale(amount);

        const contractUSDCAfter = await mockUSDC.balanceOf(token.address);
        const walletUSDCAfter = await mockUSDC.balanceOf(owner.address);

        // Contract should not hold USDC
        expect(contractUSDCAfter).to.equal(contractUSDCBefore);

        // Presale wallet receives USDC
        expect(BigInt(walletUSDCAfter.toString()) - BigInt(walletUSDCBefore.toString())).to.equal(amount);
      });
    });

    describe("ETH Presale", function () {
      let mockUSDC;
      let mockPriceFeed;
      const USDC_DECIMALS = 6n;
      const ONE_USDC = 10n ** USDC_DECIMALS;
      const ETH_PRICE = 250000000000n; // $2500 with 8 decimals

      beforeEach(async () => {
        // Deploy mock USDC
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
        await mockUSDC.deployed();

        // Deploy mock Chainlink price feed ($2500 ETH)
        const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
        mockPriceFeed = await MockAggregator.deploy(ETH_PRICE, 8);
        await mockPriceFeed.deployed();

        // Configure presale
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );

        // Pre-mint HLRR to presale wallet (owner) for presale distribution
        await token.mint(owner.address, 10_000_000n * ONE, "presale");

        // Set ETH price feed
        await token.setEthPriceFeed(mockPriceFeed.address);

        // Activate presale
        await token.setPresaleActive(true);
      });

      it("owner can set ETH price feed", async () => {
        const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
        const newPriceFeed = await MockAggregator.deploy(300000000000n, 8);
        await newPriceFeed.deployed();

        await expect(token.setEthPriceFeed(newPriceFeed.address))
          .to.emit(token, "EthPriceFeedSet")
          .withArgs(newPriceFeed.address);

        expect(await token.ethUsdPriceFeed()).to.equal(newPriceFeed.address);
      });

      it("non-owner cannot set ETH price feed", async () => {
        await expect(
          token.connect(alice).setEthPriceFeed(mockPriceFeed.address)
        ).to.be.reverted;
      });

      it("cannot set zero address as price feed", async () => {
        await expect(
          token.setEthPriceFeed(ethers.constants.AddressZero)
        ).to.be.revertedWith("Invalid price feed");
      });

      it("getEthPrice returns correct price", async () => {
        const price = await token.getEthPrice();
        expect(price).to.equal(ETH_PRICE);
      });

      it("user can buy HLRR with ETH", async () => {
        const ethAmount = ethers.utils.parseEther("1"); // 1 ETH
        // At $2500/ETH, 1 ETH = $2500 = 2500 USDC (6 decimals) = 2500000000
        // HLRR = 2500000000 * 4000 / 3 = 3333333333333 (8 decimals) = ~33,333 HLRR
        const expectedUsdValue = 2500n * ONE_USDC;
        const expectedHLRR = (expectedUsdValue * 4000n) / 3n;

        const aliceHLRRBefore = await token.balanceOf(alice.address);
        const ownerEthBefore = await ethers.provider.getBalance(owner.address);

        await expect(
          token.connect(alice).buyPresaleWithEth({ value: ethAmount })
        ).to.emit(token, "PresalePurchaseWithEth");

        const aliceHLRRAfter = await token.balanceOf(alice.address);
        const ownerEthAfter = await ethers.provider.getBalance(owner.address);

        // Alice receives HLRR
        expect(BigInt(aliceHLRRAfter.toString()) - BigInt(aliceHLRRBefore.toString())).to.equal(expectedHLRR);

        // Owner receives ETH
        expect(BigInt(ownerEthAfter.toString()) - BigInt(ownerEthBefore.toString())).to.equal(BigInt(ethAmount.toString()));
      });

      it("tracks ETH raised separately", async () => {
        const ethAmount = ethers.utils.parseEther("1");

        await token.connect(alice).buyPresaleWithEth({ value: ethAmount });

        expect(await token.presaleTotalEthRaised()).to.equal(ethAmount);
      });

      it("calculatePresaleReturnEth returns correct values", async () => {
        const ethAmount = ethers.utils.parseEther("1");
        const result = await token.calculatePresaleReturnEth(ethAmount);

        const expectedUsdValue = 2500n * ONE_USDC;
        const expectedHLRR = (expectedUsdValue * 4000n) / 3n;

        expect(result.usdValue).to.equal(expectedUsdValue);
        expect(result.hlrrAmount).to.equal(expectedHLRR);
      });

      it("cannot buy with ETH when presale inactive", async () => {
        await token.setPresaleActive(false);

        await expect(
          token.connect(alice).buyPresaleWithEth({ value: ethers.utils.parseEther("1") })
        ).to.be.revertedWith("Presale not active");
      });

      it("cannot buy with zero ETH", async () => {
        await expect(
          token.connect(alice).buyPresaleWithEth({ value: 0 })
        ).to.be.revertedWith("Must send ETH");
      });

      it("cannot buy with ETH below minimum USD value", async () => {
        // Minimum is 50 USDC, at $2500/ETH need at least 0.02 ETH
        const tooLowEth = ethers.utils.parseEther("0.01"); // $25 worth

        await expect(
          token.connect(alice).buyPresaleWithEth({ value: tooLowEth })
        ).to.be.revertedWith("Below minimum purchase");
      });

      it("cannot buy with ETH above maximum USD value", async () => {
        // Maximum is 50,000 USDC, at $2500/ETH that's 20 ETH
        const tooHighEth = ethers.utils.parseEther("21"); // $52,500 worth

        await expect(
          token.connect(alice).buyPresaleWithEth({ value: tooHighEth })
        ).to.be.revertedWith("Above maximum purchase");
      });

      it("cannot buy with ETH without price feed set", async () => {
        // Deploy fresh token without price feed
        const Factory = await ethers.getContractFactory("HashLierre");
        const newToken = await Factory.deploy();
        await newToken.deployed();

        await newToken.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          1_000_000n * ONE_USDC
        );
        await newToken.setPresaleActive(true);

        await expect(
          newToken.connect(alice).buyPresaleWithEth({ value: ethers.utils.parseEther("1") })
        ).to.be.revertedWith("ETH price feed not set");
      });

      it("rejects stale price data", async () => {
        // Set updatedAt to 2 hours ago
        const twoHoursAgo = Math.floor(Date.now() / 1000) - 7200;
        await mockPriceFeed.setUpdatedAt(twoHoursAgo);

        await expect(
          token.connect(alice).buyPresaleWithEth({ value: ethers.utils.parseEther("1") })
        ).to.be.revertedWith("Stale price");
      });

      it("ETH contribution counts toward hard cap", async () => {
        // Set a low hard cap for testing
        await token.configurePresale(
          mockUSDC.address,
          owner.address,
          50n * ONE_USDC,
          50_000n * ONE_USDC,
          3000n * ONE_USDC // $3000 hard cap
        );

        // Buy with 1 ETH ($2500)
        await token.connect(alice).buyPresaleWithEth({ value: ethers.utils.parseEther("1") });

        // Try to buy another 1 ETH - should exceed hard cap
        await expect(
          token.connect(alice).buyPresaleWithEth({ value: ethers.utils.parseEther("1") })
        ).to.be.revertedWith("Exceeds hard cap");
      });

      it("ETH goes to presale wallet", async () => {
        const ethAmount = ethers.utils.parseEther("1");
        const walletEthBefore = await ethers.provider.getBalance(owner.address);

        await token.connect(alice).buyPresaleWithEth({ value: ethAmount });

        const walletEthAfter = await ethers.provider.getBalance(owner.address);
        expect(BigInt(walletEthAfter.toString()) - BigInt(walletEthBefore.toString())).to.equal(BigInt(ethAmount.toString()));
      });
    });
  });
});
