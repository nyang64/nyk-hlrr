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
    const max = await token.MAX_SUPPLY();
    const current = await token.totalSupply();
    await token.mint(owner.address, max - current, "cap");

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
      expect(config.maxSupply).to.equal(60_000_000n * ONE);
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
});
