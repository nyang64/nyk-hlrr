// Stake HLRR tokens
// Usage: npx hardhat run scripts/stake.cjs --network <network-name>
//
// Configure these values before running:

const hre = require("hardhat");
const { ethers } = require("hardhat");

// ====== CONFIGURATION ======
const TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // Replace with your deployed contract address
const STAKE_AMOUNT = 1000; // Amount in tokens (will be multiplied by decimals)
// ===========================

async function main() {
  console.log("📈 Staking HLRR Tokens...\n");

  if (TOKEN_ADDRESS === "0x...") {
    console.error("❌ Error: Please set TOKEN_ADDRESS in the script!");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log("Staking from account:", signer.address);
  console.log("");

  // Connect to contract
  const token = await ethers.getContractAt("HashLierre", TOKEN_ADDRESS);
  console.log("Contract Address:", token.address);
  console.log("");

  // Get decimals
  const decimals = await token.decimals();
  const amount = ethers.BigNumber.from(STAKE_AMOUNT).mul(
    ethers.BigNumber.from(10).pow(decimals)
  );

  console.log("Amount to stake:", STAKE_AMOUNT, "HLRR");
  console.log("");

  // Check balances before staking
  const balance = await token.balanceOf(signer.address);
  const stakeInfo = await token.stakes(signer.address);
  const pending = await token.pendingReward(signer.address);

  console.log("Before Staking:");
  console.log("  Wallet Balance:", ethers.utils.formatUnits(balance, decimals), "HLRR");
  console.log("  Currently Staked:", ethers.utils.formatUnits(stakeInfo.amount, decimals), "HLRR");
  console.log("  Pending Rewards:", ethers.utils.formatUnits(pending, decimals), "HLRR");
  console.log("");

  // Check if we have enough balance
  if (balance.lt(amount)) {
    console.error("❌ Error: Insufficient balance!");
    console.error(`   Need: ${STAKE_AMOUNT} HLRR`);
    console.error(`   Have: ${ethers.utils.formatUnits(balance, decimals)} HLRR`);
    process.exit(1);
  }

  // Step 1: Approve contract to spend tokens
  console.log("🔄 Step 1: Approving tokens...");
  const approveTx = await token.approve(token.address, amount);
  console.log("  Transaction hash:", approveTx.hash);
  await approveTx.wait();
  console.log("  ✅ Approved");
  console.log("");

  // Step 2: Stake tokens
  console.log("🔄 Step 2: Staking tokens...");
  const stakeTx = await token.stake(amount);
  console.log("  Transaction hash:", stakeTx.hash);
  
  console.log("⏳ Waiting for confirmation...");
  const receipt = await stakeTx.wait();
  console.log("  ✅ Confirmed in block:", receipt.blockNumber);
  console.log("");

  // Check balances after staking
  const balanceAfter = await token.balanceOf(signer.address);
  const stakeInfoAfter = await token.stakes(signer.address);
  const tvl = await token.getTotalValueLocked();

  console.log("After Staking:");
  console.log("  Wallet Balance:", ethers.utils.formatUnits(balanceAfter, decimals), "HLRR");
  console.log("  Currently Staked:", ethers.utils.formatUnits(stakeInfoAfter.amount, decimals), "HLRR");
  console.log("  Total Value Locked:", ethers.utils.formatUnits(tvl, decimals), "HLRR");
  console.log("");

  // Show lock information
  const timeUntilUnstake = await token.getTimeUntilUnstake(signer.address);
  if (timeUntilUnstake.gt(0)) {
    const days = timeUntilUnstake.div(86400);
    const hours = timeUntilUnstake.mod(86400).div(3600);
    console.log("🔒 Lock Information:");
    console.log(`   Time until unstake: ${days} days, ${hours} hours`);
    console.log("");
  }

  console.log("✨ Staking Complete!");
  console.log(`   Staked ${STAKE_AMOUNT} HLRR successfully`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
