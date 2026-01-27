// Unstake HLRR tokens
// Usage: npx hardhat run scripts/unstake.js --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x..."; // Replace with your deployed contract address
const UNSTAKE_AMOUNT = 500; // Amount in tokens (will be multiplied by decimals)
// ===========================

async function main() {
  console.log("📉 Unstaking HLRR Tokens...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Unstaking from account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Get decimals
  const decimals = await token.decimals();
  const amount = ethers.BigNumber.from(UNSTAKE_AMOUNT).mul(
    ethers.BigNumber.from(10).pow(decimals)
  );

  console.log("Amount to unstake:", UNSTAKE_AMOUNT, "HLRR");
  console.log("");

  // Check current status
  const stakeInfo = await token.stakes(signer.address);
  const pending = await token.pendingReward(signer.address);
  const balance = await token.balanceOf(signer.address);

  console.log("Before Unstaking:");
  console.log("  Wallet Balance:", ethers.utils.formatUnits(balance, decimals), "HLRR");
  console.log("  Currently Staked:", ethers.utils.formatUnits(stakeInfo.amount, decimals), "HLRR");
  console.log("  Pending Rewards:", ethers.utils.formatUnits(pending, decimals), "HLRR");
  console.log("");

  // Check if we have enough staked
  if (stakeInfo.amount.lt(amount)) {
    console.error("❌ Error: Insufficient staked amount!");
    console.error(`   Want to unstake: ${UNSTAKE_AMOUNT} HLRR`);
    console.error(`   Currently staked: ${ethers.utils.formatUnits(stakeInfo.amount, decimals)} HLRR`);
    process.exit(1);
  }

  // Check lock period
  const timeUntilUnstake = await token.getTimeUntilUnstake(signer.address);
  const emergencyMode = await token.emergencyMode();
  
  if (timeUntilUnstake.gt(0) && !emergencyMode) {
    const days = timeUntilUnstake.div(86400);
    const hours = timeUntilUnstake.mod(86400).div(3600);
    console.error("❌ Error: Tokens are still locked!");
    console.error(`   Time remaining: ${days} days, ${hours} hours`);
    console.error("");
    console.error("   Options:");
    console.error("   1. Wait for lock period to expire");
    console.error("   2. Use emergencyUnstake (forfeits rewards)");
    console.log("");
    process.exit(1);
  }

  // Execute unstake
  console.log("🔄 Unstaking tokens...");
  const tx = await token.unstake(amount);
  console.log("  Transaction hash:", tx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await tx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Check status after unstake
  const balanceAfter = await token.balanceOf(signer.address);
  const stakeInfoAfter = await token.stakes(signer.address);
  const tvl = await token.getTotalValueLocked();

  console.log("After Unstaking:");
  console.log("  Wallet Balance:", ethers.utils.formatUnits(balanceAfter, decimals), "HLRR");
  console.log("  Currently Staked:", ethers.utils.formatUnits(stakeInfoAfter.amount, decimals), "HLRR");
  console.log("  Total Value Locked:", ethers.utils.formatUnits(tvl, decimals), "HLRR");
  console.log("");

  console.log("✨ Unstake Complete!");
  console.log(`   Unstaked ${UNSTAKE_AMOUNT} HLRR successfully`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
